<?php
declare(strict_types=1);
function supportStaff(PDO $db, string $id): bool {
    return (bool)query($db,'SELECT user_id FROM db_support_staff WHERE user_id=?',[$id])->fetchColumn();
}
function supportText(mixed $value, int $min, int $max, string $label): string {
    if(!is_string($value))fail("Enter a valid $label.");
    $value=trim(str_replace(["\r\n","\r"],"\n",$value));
    if(!mb_check_encoding($value,'UTF-8') || mb_strlen($value)<$min || mb_strlen($value)>$max || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u',$value))fail("$label must be $min to $max characters.");
    return $value;
}
function supportRequestId(mixed $value): string {
    if(!is_string($value)||!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$value))fail('Invalid request reference.');
    return $value;
}
function supportTicket(PDO $db, string $ticketId, string $userId, bool $desk, bool $lock=false): array {
    $ticket=query($db,'SELECT * FROM db_support_tickets WHERE id=?'.($desk?'':' AND user_id=?').($lock?' FOR UPDATE':''),$desk?[$ticketId]:[$ticketId,$userId])->fetch();
    if(!$ticket)fail('Support request not found.',404);
    return $ticket;
}
function supportPublicTicket(array $t): array {
    return ['id'=>(string)$t['id'],'reference'=>'DB-'.str_pad((string)$t['id'],6,'0',STR_PAD_LEFT),'subject'=>$t['subject'],'category'=>$t['category'],'status'=>$t['status'],
      'createdAt'=>str_replace(' ','T',$t['created_at']).'Z','updatedAt'=>str_replace(' ','T',$t['updated_at']).'Z','unread'=>(bool)($t['unread']??false),
      'customerName'=>$t['customer_name']??null];
}
function supportDetail(PDO $db, array $ticket, mixed $before=null): array {
    if($before!==null && (!is_string($before)||!ctype_digit($before)))fail('Invalid message page.');
    $args=[$ticket['id']];if($before!==null)$args[]=$before;
    $rows=query($db,'SELECT id,author_role,body,created_at FROM db_support_messages WHERE ticket_id=?'.($before!==null?' AND id<?':'').' ORDER BY id DESC LIMIT 51',$args)->fetchAll();
    $more=count($rows)>50;if($more)array_pop($rows);
    $messages=array_map(fn($m)=>['id'=>(string)$m['id'],'role'=>$m['author_role'],'body'=>$m['body'],'createdAt'=>str_replace(' ','T',$m['created_at']).'Z'],array_reverse($rows));
    return ['ticket'=>supportPublicTicket($ticket),'messages'=>$messages,'hasEarlier'=>$more];
}
function supportRoutes(PDO $db, array $user, string $route, string $method, array $body): void {
    $id=(string)$user['id'];$staff=supportStaff($db,$id);
    $scope=$_GET['scope']??'mine';if(!in_array($scope,['mine','desk'],true))fail('Invalid support workspace.');
    $desk=$scope==='desk';if($desk&&!$staff)fail('Support staff access is required.',403);
    if($route==='/support/summary' && $method==='GET') {
        $unread=query($db,"SELECT COUNT(*) FROM db_support_tickets t WHERE t.user_id=? AND EXISTS (SELECT 1 FROM db_support_messages m WHERE m.ticket_id=t.id AND m.author_role='support' AND m.id>t.last_read_message_id)",[$id])->fetchColumn();
        reply(['staff'=>$staff,'unread'=>(int)$unread]);
    }
    if($route==='/support/tickets' && $method==='GET') {
        $status=$_GET['status']??'all';if(!in_array($status,['all','open','awaiting_customer','resolved'],true))fail('Invalid request status.');
        $page=$_GET['page']??'0';if(!is_string($page)||!ctype_digit($page)||(int)$page>100000)fail('Invalid page.');
        $where=$desk?'1=1':'t.user_id=?';$args=$desk?[]:[$id];if($status!=='all'){$where.=' AND t.status=?';$args[]=$status;}
        $total=(int)query($db,"SELECT COUNT(*) FROM db_support_tickets t WHERE $where",$args)->fetchColumn();
        $rows=query($db,"SELECT t.*,u.display_name AS customer_name,EXISTS (SELECT 1 FROM db_support_messages m WHERE m.ticket_id=t.id AND m.author_role='support' AND m.id>t.last_read_message_id) AS unread FROM db_support_tickets t JOIN db_users u ON u.id=t.user_id WHERE $where ORDER BY t.updated_at DESC,t.id DESC LIMIT 20 OFFSET ".((int)$page*20),$args)->fetchAll();
        reply(['tickets'=>array_map('supportPublicTicket',$rows),'total'=>$total,'page'=>(int)$page,'hasMore'=>((int)$page+1)*20<$total,'staff'=>$staff]);
    }
    if($route==='/support/tickets' && $method==='POST') {
        $request=supportRequestId($body['requestId']??null);$subject=supportText($body['subject']??null,3,100,'Subject');$message=supportText($body['message']??null,10,4000,'Message');
        $category=$body['category']??null;if(!in_array($category,['camera','account','subscription','reports','feedback','other'],true))fail('Select a support topic.');
        rateLimit($db,'support-create:'.$id,20);$db->beginTransaction();
        query($db,'SELECT id FROM db_users WHERE id=? FOR UPDATE',[$id]);
        $existing=query($db,'SELECT * FROM db_support_tickets WHERE user_id=? AND request_id=?',[$id,$request])->fetch();
        if($existing){
            $first=query($db,'SELECT body FROM db_support_messages WHERE ticket_id=? ORDER BY id LIMIT 1',[$existing['id']])->fetchColumn();
            if($existing['subject']!==$subject||$existing['category']!==$category||$first!==$message){$db->rollBack();fail('This request reference was already used. Start a new request.',409);}
            $db->commit();reply(supportDetail($db,$existing));
        }
        query($db,'INSERT INTO db_support_tickets(user_id,request_id,subject,category) VALUES (?,?,?,?)',[$id,$request,$subject,$category]);$ticketId=$db->lastInsertId();
        query($db,"INSERT INTO db_support_messages(ticket_id,author_id,author_role,request_id,body) VALUES (?,?,'customer',?,?)",[$ticketId,$id,$request,$message]);
        $db->commit();reply(supportDetail($db,supportTicket($db,$ticketId,$id,false)),201);
    }
    if(preg_match('#^/support/tickets/([1-9][0-9]{0,19})(/messages|/read|/status)?$#D',$route,$match)) {
        $ticketId=$match[1];$action=$match[2]??'';
        if($method==='GET'&&$action==='')reply(supportDetail($db,supportTicket($db,$ticketId,$id,$desk),$_GET['before']??null));
        if($method==='POST'&&$action==='/read') {
            supportTicket($db,$ticketId,$id,false);
            $seen=$body['messageId']??null;if(!is_string($seen)||!ctype_digit($seen))fail('Invalid message reference.');
            if(!query($db,'SELECT id FROM db_support_messages WHERE ticket_id=? AND id=?',[$ticketId,$seen])->fetchColumn())fail('Message not found.',404);
            query($db,'UPDATE db_support_tickets SET last_read_message_id=GREATEST(last_read_message_id,?) WHERE id=?',[$seen,$ticketId]);reply(['ok'=>true]);
        }
        if($method==='POST'&&in_array($action,['/messages','/status'],true)) {
            $request=supportRequestId($body['requestId']??null);
            $message=$action==='/messages'?supportText($body['message']??null,1,4000,'Message'):null;
            $status=$body['status']??null;if($action==='/status'&&!in_array($status,['open','resolved'],true))fail('Invalid request status.');
            rateLimit($db,'support-reply:'.$id,100);$db->beginTransaction();$ticket=supportTicket($db,$ticketId,$id,$desk,true);
            $role=$action==='/status'?'system':($desk?'support':'customer');
            if($action==='/status')$message=($desk?'Support':'Customer').($status==='resolved'?' marked this request as resolved.':' reopened this request.');
            $existing=query($db,'SELECT author_id,author_role,body FROM db_support_messages WHERE ticket_id=? AND request_id=?',[$ticketId,$request])->fetch();
            if($existing){
                if((string)$existing['author_id']!==$id||$existing['author_role']!==$role||$existing['body']!==$message){$db->rollBack();fail('This message reference was already used.',409);}
                $db->commit();reply(supportDetail($db,$ticket));
            }
            if($action==='/messages'&&$ticket['status']==='resolved'){$db->rollBack();fail('Reopen this request before replying.',409);}
            query($db,'INSERT INTO db_support_messages(ticket_id,author_id,author_role,request_id,body) VALUES (?,?,?,?,?)',[$ticketId,$id,$role,$request,$message]);
            $next=$action==='/status'?$status:($desk?'awaiting_customer':'open');
            query($db,'UPDATE db_support_tickets SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[$next,$ticketId]);$db->commit();
            reply(supportDetail($db,supportTicket($db,$ticketId,$id,$desk)));
        }
    }
    fail('Support endpoint not found.',404);
}
