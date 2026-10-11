<?php
// Operator-only maintenance. Not a payment handler and never included in the EXE.
if(PHP_SAPI!=='cli')exit;
require __DIR__.'/lib.php';
$action=$argv[1]??'';$identifier=$argv[2]??'';$note=$argv[3]??'';
if(!in_array($action,['status','grant-month','cancel'],true)||(!ctype_digit($identifier)&&!filter_var($identifier,FILTER_VALIDATE_EMAIL))||($action!=='status'&&(strlen($note)<3||strlen($note)>255))){fwrite(STDERR,"Usage: php subscription-admin.php status|grant-month|cancel USER_ID_OR_EMAIL \"Reason (required for changes; not a payment confirmation)\"\n");exit(1);}
$db=new PDO('mysql:host=127.0.0.1;port=3306;dbname=degree;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$db->exec("SET time_zone='+00:00'");$db->beginTransaction();
$row=query($db,ctype_digit($identifier)?'SELECT id FROM db_users WHERE id=? FOR UPDATE':'SELECT id FROM db_users WHERE email=? FOR UPDATE',[strtolower(trim($identifier))])->fetch();
if(!$row){fwrite(STDERR,"Account does not exist.\n");$db->rollBack();exit(1);}
$id=(string)$row['id'];
if($action==='status'){$result=subscription($db,$id);$db->commit();echo json_encode($result,JSON_PRETTY_PRINT)."\n";exit;}
query($db,'INSERT IGNORE INTO db_subscriptions(user_id) VALUES (?)',[$id]);
if($action==='grant-month') {
    // MySQL DATE_ADD clamps month ends (Jan 31 -> Feb 28/29). Renewal extends unexpired access.
    query($db,"UPDATE db_subscriptions SET starts_at=CASE WHEN status='active' AND expires_at>UTC_TIMESTAMP() THEN starts_at ELSE UTC_TIMESTAMP() END,expires_at=DATE_ADD(CASE WHEN status='active' AND expires_at>UTC_TIMESTAMP() THEN expires_at ELSE UTC_TIMESTAMP() END,INTERVAL 1 MONTH),status='active' WHERE user_id=?",[$id]);
}else query($db,"UPDATE db_subscriptions SET status='canceled' WHERE user_id=?",[$id]);
query($db,'INSERT INTO db_subscription_events(user_id,action,note) VALUES (?,?,?)',[$id,$action,$note]);$db->commit();
echo "Subscription updated by operator. No payment was recorded.\n";
$result=subscription($db,$id);echo 'Status: '.$result['status']."\n".'Access until (UTC): '.($result['expiresAt']??'None')."\n";
