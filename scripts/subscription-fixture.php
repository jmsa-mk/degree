<?php
// Automated tests only; never packaged. Refuses non-QA accounts.
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/server/lib.php';
[$script,$id,$status,$seconds]=$argv+['','','',''];
if(!ctype_digit($id)||!in_array($status,['active','inactive','canceled','expired'],true)||!preg_match('/^-?\d{1,6}$/',$seconds))exit(1);
$db=new PDO('mysql:host=127.0.0.1;port=3306;dbname=degree;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec("SET time_zone='+00:00'");
$email=query($db,'SELECT email FROM db_users WHERE id=?',[$id])->fetchColumn();
if(!is_string($email)||!preg_match('/^qa-[a-f0-9-]{36}@example\.test$/D',$email)){fwrite(STDERR,"Not a QA account.\n");exit(1);}
query($db,'UPDATE db_subscriptions SET status=?,starts_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE user_id=?',[$status,(int)$seconds,$id]);
echo "QA subscription updated.\n";
