<?php
// Import verification in a uniquely named disposable database; never writes to degree.
if (PHP_SAPI !== 'cli') exit;
$db = new PDO('mysql:host=127.0.0.1;port=3306;charset=utf8mb4', 'root', getenv('DEGREEBEE_DB_ADMIN_PASSWORD') ?: '', [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$name = 'degreebee_schema_test_'.bin2hex(random_bytes(6));
$sql = file_get_contents(dirname(__DIR__).'/server/schema.sql');
$sql = str_replace(['CREATE DATABASE IF NOT EXISTS degree', 'USE degree;'], ["CREATE DATABASE IF NOT EXISTS `$name`", "USE `$name`;"], $sql, $replaced);
if ($replaced !== 2 || !preg_match('/^degreebee_schema_test_[a-f0-9]{12}$/D', $name)) throw new RuntimeException('Unsafe test database target.');
$existing = $db->prepare('SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?');
$existing->execute([$name]);
if ($existing->fetchColumn()) throw new RuntimeException('Test database already exists.');
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
try {
    $db->exec($sql);
    $tables=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    sort($tables);
    $expected=['db_demo_access','db_plans','db_rate_limits','db_session_days','db_sessions','db_subscription_events','db_subscriptions','db_support_messages','db_support_staff','db_support_tickets','db_tokens','db_users'];
    check($tables===$expected, 'Incomplete schema.');
    check((int)$db->query("SELECT price_rupiah FROM db_plans WHERE code='focus_monthly'")->fetchColumn()===50000, 'Missing monthly plan seed.');
    check((int)$db->query('SELECT COUNT(*) FROM db_users')->fetchColumn()===0, 'Schema must not contain user data.');
    $db->exec("INSERT INTO db_users(id,email,display_name,password_hash) VALUES (1,'schema-test@example.test','Schema test','test-only'),(2,'schema-second@example.test','Second test','test-only')");
    $db->exec("INSERT INTO db_subscriptions(user_id,status,starts_at,expires_at) VALUES (1,'active','2026-01-01','2027-01-01')");
    $db->exec("INSERT INTO db_tokens(token_hash,user_id,expires_at) VALUES (REPEAT('a',64),1,'2027-01-01')");
    $db->exec("INSERT INTO db_sessions(id,user_id,client_id,payload_hash,started_ms,ended_ms,active_ms) VALUES (1,1,'00000000-0000-4000-8000-000000000001',REPEAT('b',64),1000,61000,60000)");
    $db->exec("INSERT INTO db_session_days(session_id,study_day,active_ms) VALUES (1,'2026-01-01',60000)");
    $db->exec("INSERT INTO db_demo_access(user_id,starts_at,expires_at) VALUES (1,'2026-01-01','2026-02-01')");
    $db->exec("INSERT INTO db_subscription_events(user_id,action,note) VALUES (1,'demo_activation','Test only')");
    $db->exec("UPDATE db_plans SET price_rupiah=27000 WHERE code='focus_monthly'");
    $db->exec($sql);
    check((int)$db->query('SELECT COUNT(*) FROM db_users')->fetchColumn()===2, 'Re-import changed users.');
    check($db->query('SELECT status FROM db_subscriptions WHERE user_id=1')->fetchColumn()==='active', 'Re-import reset existing access.');
    check($db->query('SELECT status FROM db_subscriptions WHERE user_id=2')->fetchColumn()==='inactive', 'Missing inactive subscription backfill.');
    check((int)$db->query("SELECT price_rupiah FROM db_plans WHERE code='focus_monthly'")->fetchColumn()===27000, 'Re-import overwrote configured pricing.');
    foreach (['db_tokens','db_sessions','db_session_days','db_demo_access','db_subscription_events'] as $table) check((int)$db->query("SELECT COUNT(*) FROM $table")->fetchColumn()===1, 'Re-import changed saved records.');
    $db->exec('DELETE FROM db_users WHERE id=1');
    foreach (['db_tokens','db_sessions','db_session_days','db_demo_access','db_subscription_events'] as $table) check((int)$db->query("SELECT COUNT(*) FROM $table")->fetchColumn()===0, 'Missing delete cascade.');
    echo "PASS: one-file import, all 12 tables, IDR 50000 seed, repeat-import data/access/price preservation, inactive backfill, and foreign-key cascades.\n";
} finally {
    // Only the random test database checked above is removed.
    $db->exec("DROP DATABASE IF EXISTS `$name`");
}
