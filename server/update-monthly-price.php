<?php
// Local operator migration: changes only the monthly catalog price.
if(PHP_SAPI!=='cli')exit;
$db=new PDO('mysql:host=127.0.0.1;port=3306;dbname=degree;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->beginTransaction();
try {
    $q=$db->query("SELECT code FROM db_plans WHERE code='focus_monthly' FOR UPDATE");
    if(!$q->fetchColumn())throw new RuntimeException('Monthly plan is missing. Import the schema first.');
    $db->exec("UPDATE db_plans SET price_rupiah=50000 WHERE code='focus_monthly'");
    $db->commit();
    echo "Monthly catalog price updated to IDR 50000. Membership dates and access are unchanged.\n";
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
