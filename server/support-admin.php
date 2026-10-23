<?php
// Local operator only. Public registration and profile updates cannot grant roles.
if(PHP_SAPI!=='cli')exit;
[$script,$action,$email]=$argv+['','',''];
if(!in_array($action,['create','grant','revoke','status'],true)||!filter_var($email,FILTER_VALIDATE_EMAIL)){fwrite(STDERR,"Usage: php server/support-admin.php create|grant|revoke|status EMAIL\n");exit(1);}
$db=new PDO('mysql:host=127.0.0.1;port=3306;dbname=degree;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$q=$db->prepare('SELECT id FROM db_users WHERE email=?');$q->execute([strtolower(trim($email))]);$id=$q->fetchColumn();
if($action==='create'){
    if($id){fwrite(STDERR,"Account already exists. Use grant; existing passwords are never reset here.\n");exit(1);}
    $file=__DIR__.'/admin-access.local.txt';
    if(file_exists($file)){fwrite(STDERR,"Private access file already exists; preserve it before creating another account.\n");exit(1);}
    $password=bin2hex(random_bytes(16));$db->beginTransaction();
    try{
        $q=$db->prepare('INSERT INTO db_users(email,display_name,password_hash) VALUES (?,?,?)');$q->execute([strtolower(trim($email)),'DegreeBee Support',password_hash($password,PASSWORD_DEFAULT)]);$id=$db->lastInsertId();
        $q=$db->prepare('INSERT INTO db_subscriptions(user_id) VALUES (?)');$q->execute([$id]);
        $q=$db->prepare('INSERT INTO db_support_staff(user_id) VALUES (?)');$q->execute([$id]);
        $out=fopen($file,'x');if(!$out)throw new RuntimeException('Cannot create private access file.');
        $text="DegreeBee local support account\nEmail: $email\nInitial password: $password\n\nSign in in the EXE, open Help & support > Support inbox.\nChange your password in Account after signing in. This file is private and excluded from Git.\nSupport access does not activate an AI subscription.\n";
        if(fwrite($out,$text)!==strlen($text)){fclose($out);throw new RuntimeException('Cannot save access details.');}fclose($out);$db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    echo "Local support account created. Initial sign-in details saved privately in server/admin-access.local.txt.\n";
}
if(!$id){fwrite(STDERR,"Account not found. Register this email in DegreeBee first.\n");exit(2);}
if($action==='grant'){$q=$db->prepare('INSERT IGNORE INTO db_support_staff(user_id) VALUES (?)');$q->execute([$id]);}
if($action==='revoke'){$q=$db->prepare('DELETE FROM db_support_staff WHERE user_id=?');$q->execute([$id]);}
$q=$db->prepare('SELECT user_id FROM db_support_staff WHERE user_id=?');$q->execute([$id]);echo $q->fetchColumn()?"Support role active. Open Help & support > Support inbox.\n":"Standard customer account.\n";
