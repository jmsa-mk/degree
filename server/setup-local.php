<?php
// Run once from a terminal on the database host. Does not drop or reset data.
if(PHP_SAPI!=='cli')exit;
$root=new PDO('mysql:host=127.0.0.1;port=3306;charset=utf8mb4','root',getenv('DEGREEBEE_DB_ADMIN_PASSWORD')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$file=__DIR__.'/config.local.php';
if(!is_file($file)) {
    $password=bin2hex(random_bytes(24));
    $exists=$root->query("SELECT COUNT(*) FROM mysql.user WHERE User='degreebee_app' AND Host='127.0.0.1'")->fetchColumn();
    if($exists)throw new RuntimeException('Database user already exists; configure config.local.php with its existing credentials.');
    $root->exec("CREATE USER 'degreebee_app'@'127.0.0.1' IDENTIFIED BY ".$root->quote($password));
    $config=['host'=>'127.0.0.1','port'=>3306,'database'=>'degree','username'=>'degreebee_app','password'=>$password];
    file_put_contents($file,"<?php\nreturn ".var_export($config,true).";\n");
}
$root->exec(file_get_contents(__DIR__.'/schema.sql'));
foreach(['db_users','db_tokens','db_sessions','db_session_days','db_rate_limits'] as $table)
    $root->exec("GRANT SELECT,INSERT,UPDATE,DELETE ON degree.$table TO 'degreebee_app'@'127.0.0.1'");
echo "DegreeBee tables ready in degree. Existing data preserved.\n";
require __DIR__.'/migrate-subscriptions.php';
