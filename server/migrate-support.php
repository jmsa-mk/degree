<?php
// One-time local upgrade. Does not grant any account the support role.
if(PHP_SAPI!=='cli')exit;
$db=new PDO('mysql:host=127.0.0.1;port=3306;dbname=degree;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec(file_get_contents(__DIR__.'/schema.sql'));
$db->exec("GRANT SELECT ON degree.db_support_staff TO 'degreebee_app'@'127.0.0.1'");
$db->exec("GRANT SELECT,INSERT,UPDATE ON degree.db_support_tickets TO 'degreebee_app'@'127.0.0.1'");
$db->exec("GRANT SELECT,INSERT ON degree.db_support_messages TO 'degreebee_app'@'127.0.0.1'");
echo "Customer service tables and restricted API permissions ready. Existing data preserved.\n";
