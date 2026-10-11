<?php
if(PHP_SAPI!=='cli')exit;
$db=new PDO('mysql:host=127.0.0.1;port=3306;dbname=degree;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec(file_get_contents(__DIR__.'/schema.sql'));
$db->exec("GRANT SELECT ON degree.db_plans TO 'degreebee_app'@'127.0.0.1'");
$db->exec("GRANT SELECT,INSERT ON degree.db_subscriptions TO 'degreebee_app'@'127.0.0.1'");
require_once __DIR__.'/lib.php';
if(demoCheckoutEnabled()) {
    $db->exec("GRANT SELECT,INSERT ON degree.db_demo_access TO 'degreebee_app'@'127.0.0.1'");
    $db->exec("GRANT INSERT ON degree.db_subscription_events TO 'degreebee_app'@'127.0.0.1'");
}
echo "Monthly IDR 25000 plan and subscription tables ready. Existing accounts preserved; missing subscriptions default to inactive.\n";
