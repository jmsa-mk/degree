<?php
declare(strict_types=1);
require dirname(__DIR__).'/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'");
try {
    $route=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD'];
    // Apache serves this API under an Alias; the PHP development router uses /.
    $mount=PHP_SAPI==='cli-server'?'':rtrim(str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME']??'/index.php')),'/');
    if($mount!=='' && str_starts_with($route,$mount.'/'))$route=substr($route,strlen($mount));
    if ($route==='/health' && $method==='GET') {database()->query('SELECT 1 FROM db_users LIMIT 1');reply(['service'=>'degreebee','version'=>1]);}
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>524288) fail('Request too large.',413);
    $raw=file_get_contents('php://input',false,null,0,524289);
    if(strlen($raw)>524288)fail('Request too large.',413);
    $body=$raw===''?[]:json_decode($raw,true,32,JSON_THROW_ON_ERROR);
    if(!is_array($body))fail('Invalid request.');
    $db=database();
    if(in_array($route,['/register','/login'],true)&&$method==='POST') {
        rateLimit($db,'auth-ip:'.($_SERVER['REMOTE_ADDR']??''),60);
        $email=strtolower(trim(is_string($body['email']??null)?$body['email']:''));$password=$body['password']??'';
        if(strlen($email)>254||!filter_var($email,FILTER_VALIDATE_EMAIL)||!is_string($password)||strlen($password)>72||strlen($password)<10)fail('Use a valid email and a password of 10 to 72 bytes.');
        rateLimit($db,'auth-email:'.$email,15);
        if($route==='/register') {
            $name=trim(is_string($body['displayName']??null)?$body['displayName']:'');
            if(mb_strlen($name)<2||mb_strlen($name)>40||preg_match('/[\x00-\x1f<>]/u',$name))fail('Display name must be 2 to 40 characters, without angle brackets.');
            if(($body['acceptSync']??false)!==true)fail('Accept the account data notice to create an account.');
            if(!is_bool($body['leaderboard']??null))fail('Choose a leaderboard preference.');
            try {query($db,'INSERT INTO db_users(email,display_name,password_hash,leaderboard) VALUES (?,?,?,?)',[$email,$name,password_hash($password,PASSWORD_DEFAULT),(int)$body['leaderboard']]);}
            catch(PDOException $e){if($e->getCode()==='23000')fail('An account with that email already exists.',409);throw $e;}
            $user=query($db,'SELECT * FROM db_users WHERE email=?',[$email])->fetch();
            query($db,'INSERT IGNORE INTO db_subscriptions(user_id) VALUES (?)',[$user['id']]);
        } else {
            $user=query($db,'SELECT * FROM db_users WHERE email=?',[$email])->fetch();
            $valid=password_verify($password,$user['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
            if(!$user||!$valid)fail('Email or password is incorrect.',401);
        }
        reply(newToken($db,$user));
    }
    $user=tokenUser($db);$id=(string)$user['id'];
    if(str_starts_with($route,'/support/')){require dirname(__DIR__).'/support.php';supportRoutes($db,$user,$route,$method,$body);}
    if($route==='/logout'&&$method==='POST') {query($db,'DELETE FROM db_tokens WHERE token_hash=?',[hash('sha256',substr($_SERVER['HTTP_AUTHORIZATION'],7))]);reply(['ok'=>true]);}
    if($route==='/profile'&&$method==='GET')reply(['user'=>publicUser($user),'subscription'=>subscription($db,$id),'stats'=>stats($db,$id),'leaderboard'=>leaderboard($db,$id)]);
    if($route==='/entitlement'&&$method==='GET')reply(['subscription'=>subscription($db,$id)]);
    if($route==='/demo/activate'&&$method==='POST') {
        if(!demoCheckoutEnabled())fail('Demo checkout is unavailable.',403);
        if(($body['confirmDemo']??false)!==true)fail('Confirm the simulated payment to continue.');
        $db->beginTransaction();
        query($db,'SELECT id FROM db_users WHERE id=? FOR UPDATE',[$id]);
        // A retry or double click must never extend an already active membership.
        if(!subscription($db,$id)['active']) {
            $insert=query($db,'INSERT IGNORE INTO db_demo_access(user_id,starts_at,expires_at) VALUES (?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH))',[$id]);
            if($insert->rowCount())query($db,"INSERT INTO db_subscription_events(user_id,action,note) VALUES (?,'demo_activation','Simulated QR confirmation. One month demo access; no real payment received.')",[$id]);
            elseif(!subscription($db,$id)['active']){$db->rollBack();fail('This account has already used its demo month.',409);}
        }
        $db->commit();reply(['subscription'=>subscription($db,$id),'demo'=>true]);
    }
    if($route==='/profile'&&$method==='PATCH') {
        if(!is_bool($body['leaderboard']??null))fail('Invalid leaderboard preference.');
        query($db,'UPDATE db_users SET leaderboard=? WHERE id=?',[(int)$body['leaderboard'],$id]);$user['leaderboard']=$body['leaderboard'];reply(['user'=>publicUser($user)]);
    }
    if($route==='/sessions'&&$method==='POST') {
        $s=validateSession($body,(int)floor(microtime(true)*1000));
        $db->beginTransaction();
        // Serialize submissions per user, preventing concurrent overlap and duplicate awards.
        query($db,'SELECT id FROM db_users WHERE id=? FOR UPDATE',[$id]);
        $existing=query($db,'SELECT payload_hash FROM db_sessions WHERE user_id=? AND client_id=?',[$id,$s['id']])->fetchColumn();
        if($existing!==false) { $db->rollBack();if(!hash_equals($existing,$s['hash']))fail('A different version of this session is already synced.',409);reply(['ok'=>true,'duplicate'=>true]); }
        if(query($db,'SELECT id FROM db_sessions WHERE user_id=? AND started_ms<? AND ended_ms>? LIMIT 1',[$id,$s['end'],$s['start']])->fetchColumn()!==false){$db->rollBack();fail('This session overlaps another synced session. It remains saved locally.',409);}
        query($db,'INSERT INTO db_sessions(user_id,client_id,payload_hash,started_ms,ended_ms,active_ms) VALUES (?,?,?,?,?,?)',[$id,$s['id'],$s['hash'],$s['start'],$s['end'],$s['total']]);$sid=$db->lastInsertId();
        foreach($s['days'] as $day=>$ms)query($db,'INSERT INTO db_session_days(session_id,study_day,active_ms) VALUES (?,?,?)',[$sid,$day,$ms]);
        $db->commit();reply(['ok'=>true],201);
    }
    if($route==='/password'&&$method==='POST') {
        rateLimit($db,'password:'.$id,10);$old=$body['currentPassword']??'';$next=$body['newPassword']??'';
        if(!is_string($old)||!is_string($next)||strlen($next)<10||strlen($next)>72)fail('Use a new password of 10 to 72 bytes.');
        if(!password_verify($old,$user['password_hash']))fail('Current password is incorrect.',403);
        $db->beginTransaction();query($db,'UPDATE db_users SET password_hash=? WHERE id=?',[password_hash($next,PASSWORD_DEFAULT),$id]);query($db,'DELETE FROM db_tokens WHERE user_id=?',[$id]);$result=newToken($db,$user);$db->commit();reply($result);
    }
    if($route==='/account'&&$method==='DELETE') {
        rateLimit($db,'delete:'.$id,10);
        if(!is_string($body['password']??null)||!password_verify($body['password'],$user['password_hash']))fail('Password is incorrect.',403);
        query($db,'DELETE FROM db_users WHERE id=?',[$id]);reply(['ok'=>true]);
    }
    fail('Endpoint not found.',404);
} catch(InvalidArgumentException|JsonException $e) {fail($e instanceof JsonException?'Invalid JSON.':$e->getMessage());}
catch(Throwable $e) { if(isset($db)&&$db->inTransaction())$db->rollBack();error_log('DegreeBee API: '.$e->getMessage());fail('We could not connect right now. Please try again shortly.',503); }
