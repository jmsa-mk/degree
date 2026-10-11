<?php
declare(strict_types=1);
function database(): PDO {
    $file = __DIR__.'/config.local.php';
    if (!is_file($file)) throw new RuntimeException('API configuration is missing.');
    $c = require $file;
    $db = new PDO("mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4",$c['username'],$c['password'],[
        PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES=>false]);
    $db->exec("SET time_zone = '+00:00'");
    return $db;
}
function query(PDO $db, string $sql, array $args=[]): PDOStatement { $s=$db->prepare($sql);$s->execute($args);return $s; }
function reply(array $data, int $status=200): never {
    http_response_code($status);echo json_encode($data,JSON_UNESCAPED_SLASHES);exit;
}
function fail(string $message, int $status=400): never { reply(['error'=>$message],$status); }
function publicUser(array $u): array {return ['id'=>(string)$u['id'],'email'=>$u['email'],'displayName'=>$u['display_name'],'leaderboard'=>(bool)$u['leaderboard']];}
function demoCheckoutEnabled(): bool {
    $file=__DIR__.'/demo-config.php';
    return is_file($file) && (require $file)['enabled']===true;
}
function subscription(PDO $db, string $id): array {
    $plan=query($db,"SELECT code,name,price_rupiah,currency,billing_interval FROM db_plans WHERE code='focus_monthly'")->fetch();
    if(!$plan)throw new RuntimeException('Subscription plan is not configured.');
    $row=query($db,"SELECT status,starts_at,expires_at,starts_at<=UTC_TIMESTAMP() AND expires_at>UTC_TIMESTAMP() AS in_period FROM db_subscriptions WHERE user_id=?",[$id])->fetch();
    $status=$row['status']??'inactive';
    if($status==='active'&&!$row['in_period'])$status=($row['expires_at']&&strtotime($row['expires_at'].' UTC')<=time())?'expired':'inactive';
    $source='subscription';
    if(demoCheckoutEnabled()&&$status!=='active') {
        $demo=query($db,'SELECT starts_at,expires_at,expires_at>UTC_TIMESTAMP() AND starts_at<=UTC_TIMESTAMP() AS in_period FROM db_demo_access WHERE user_id=?',[$id])->fetch();
        if($demo){$row=$demo;$status=$demo['in_period']?'active':'expired';$source='demo';}
    }
    return ['plan'=>['code'=>$plan['code'],'name'=>$plan['name'],'priceRupiah'=>(int)$plan['price_rupiah'],'currency'=>$plan['currency'],'interval'=>$plan['billing_interval']],
      'status'=>$status,'active'=>$status==='active','startsAt'=>empty($row['starts_at'])?null:gmdate('Y-m-d\TH:i:s\Z',strtotime($row['starts_at'].' UTC')),
      'expiresAt'=>empty($row['expires_at'])?null:gmdate('Y-m-d\TH:i:s\Z',strtotime($row['expires_at'].' UTC')),
      'serverNow'=>gmdate('Y-m-d\TH:i:s\Z'),'paymentAvailable'=>false,'demoCheckoutAvailable'=>demoCheckoutEnabled(),'accessSource'=>$source];
}
function rateLimit(PDO $db, string $key, int $limit): void {
    $bucket=hash('sha256',$key);
    query($db,'DELETE FROM db_rate_limits WHERE expires_at < UTC_TIMESTAMP()');
    query($db,'INSERT INTO db_rate_limits(bucket,expires_at) VALUES (?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=attempts+1',[$bucket]);
    if ((int)query($db,'SELECT attempts FROM db_rate_limits WHERE bucket=?',[$bucket])->fetchColumn()>$limit) fail('Too many attempts. Please try again in 15 minutes.',429);
}
function tokenUser(PDO $db): array {
    $auth=$_SERVER['HTTP_AUTHORIZATION']??'';
    if (!preg_match('/^Bearer ([a-f0-9]{64})$/D',$auth,$m)) fail('Sign in to continue.',401);
    $u=query($db,'SELECT u.* FROM db_users u JOIN db_tokens t ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP()',[hash('sha256',$m[1])])->fetch();
    if (!$u) fail('Your sign-in has expired. Please sign in again.',401);
    return $u;
}
function newToken(PDO $db, array $user): array {
    $token=bin2hex(random_bytes(32));
    query($db,'DELETE FROM db_tokens WHERE expires_at < UTC_TIMESTAMP()');
    query($db,'INSERT INTO db_tokens(token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY))',[hash('sha256',$token),$user['id']]);
    return ['user'=>publicUser($user),'token'=>$token];
}
function timestampMs(mixed $value): int {
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/D',$value)) throw new InvalidArgumentException('Invalid session timestamp.');
    $d=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.v\Z',$value,new DateTimeZone('UTC'));
    if (!$d || $d->format('Y-m-d\TH:i:s.v\Z')!==$value) throw new InvalidArgumentException('Invalid session timestamp.');
    return (int)$d->format('Uv');
}
// Award time, never camera accuracy. Split at Jakarta midnight before applying daily limits.
function validateSession(array $body, int $now): array {
    $id=$body['id']??'';
    if (!is_string($id)||!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$id)) throw new InvalidArgumentException('Invalid session ID.');
    $start=timestampMs($body['startedAt']??null);$end=timestampMs($body['endedAt']??null);
    if ($start<1577836800000||$end<$start||$end-$start>86400000||$end>$now+60000) throw new InvalidArgumentException('Session must end in the past and span no more than 24 hours.');
    $segments=$body['segments']??null;
    if (!is_array($segments)||!array_is_list($segments)||count($segments)>2000) throw new InvalidArgumentException('Invalid activity segments.');
    $last=$start;$total=0;$days=[];$tz=new DateTimeZone('Asia/Jakarta');
    foreach($segments as $segment) {
        if (!is_array($segment)) throw new InvalidArgumentException('Invalid activity segment.');
        $at=timestampMs($segment['startedAt']??null);$ms=$segment['durationMs']??null;
        if (!is_int($ms)||$ms<=0||$at<$last||$at+$ms>$end) throw new InvalidArgumentException('Activity intervals must be positive, ordered and inside the session.');
        $last=$at+$ms;$total+=$ms;
        while($at<$last) {
            $date=(new DateTimeImmutable('@'.intdiv($at,1000)))->setTimezone($tz);
            $key=$date->format('Y-m-d');$midnight=$date->modify('tomorrow')->setTime(0,0)->getTimestamp()*1000;
            $part=min($last,$midnight)-$at;$days[$key]=($days[$key]??0)+$part;$at+=$part;
        }
    }
    return ['id'=>$id,'start'=>$start,'end'=>$end,'total'=>$total,'days'=>$days,'hash'=>hash('sha256',json_encode([$start,$end,$segments]))];
}
function stats(PDO $db, string $id): array {
    $rows=query($db,'SELECT d.study_day,SUM(d.active_ms) ms FROM db_session_days d JOIN db_sessions s ON s.id=d.session_id WHERE s.user_id=? GROUP BY d.study_day ORDER BY d.study_day',[$id])->fetchAll();
    $xp=0;$days=[];$active=0;$best=0;$run=0;$previousDay=null;
    foreach($rows as $r) { $minutes=(int)floor((int)$r['ms']/60000);$xp+=min(180,$minutes);$active+=(int)$r['ms'];$days[$r['study_day']]=$minutes;
        $date=new DateTimeImmutable($r['study_day'],new DateTimeZone('Asia/Jakarta'));
        if($minutes>=10){$run=$previousDay===$date->modify('-1 day')->format('Y-m-d')?$run+1:1;$best=max($best,$run);$previousDay=$r['study_day'];}else{$run=0;$previousDay=null;}
    }
    $today=new DateTimeImmutable('today',new DateTimeZone('Asia/Jakarta'));$cursor=$today;
    if (($days[$cursor->format('Y-m-d')]??0)<10) $cursor=$cursor->modify('-1 day');
    $streak=0;while(($days[$cursor->format('Y-m-d')]??0)>=10) {$streak++;$cursor=$cursor->modify('-1 day');}
    $count=(int)query($db,'SELECT COUNT(*) FROM db_sessions WHERE user_id=? AND active_ms>=60000',[$id])->fetchColumn();
    return ['xp'=>$xp,'level'=>1+intdiv($xp,120),'levelProgress'=>$xp%120,'streak'=>$streak,'sessions'=>$count,
        'activeMinutes'=>(int)floor($active/60000),'todayMinutes'=>$days[$today->format('Y-m-d')]??0,
        'badges'=>[['name'=>'First steps','description'=>'Save a session of at least 1 minute','earned'=>$count>=1],
        ['name'=>'One hour in','description'=>'Record 60 study minutes','earned'=>$active>=3600000],
        ['name'=>'Steady rhythm','description'=>'Reach a 3-day streak','earned'=>$best>=3],
        ['name'=>'Study regular','description'=>'Complete 10 study sessions','earned'=>$count>=10]]];
}
function leaderboard(PDO $db, string $id): array {
    $today=new DateTimeImmutable('today',new DateTimeZone('Asia/Jakarta'));$week=$today->modify('monday this week')->format('Y-m-d');
    $rows=query($db,'SELECT u.id,u.display_name,SUM(LEAST(180,FLOOR(d.ms/60000))) xp FROM db_users u JOIN (SELECT s.user_id,d.study_day,SUM(d.active_ms) ms FROM db_session_days d JOIN db_sessions s ON s.id=d.session_id WHERE d.study_day>=? AND d.study_day<=? GROUP BY s.user_id,d.study_day) d ON d.user_id=u.id WHERE u.leaderboard=1 GROUP BY u.id,u.display_name HAVING xp>0 ORDER BY xp DESC,u.id ASC',[$week,$today->format('Y-m-d')])->fetchAll();
    $entries=[];$mine=null;$rank=0;$previous=null;
    foreach($rows as $i=>$r) { $xp=(int)$r['xp'];if($xp!==$previous)$rank=$i+1;$previous=$xp;
        $entry=['rank'=>$rank,'name'=>$r['display_name'],'xp'=>$xp,'isMe'=>(string)$r['id']===$id];
        if($i<50)$entries[]=$entry;if($entry['isMe'])$mine=$entry;
    }
    return ['weekStart'=>$week,'timezone'=>'Asia/Jakarta','entries'=>$entries,'me'=>$mine,'participants'=>count($rows)];
}
