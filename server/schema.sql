-- DegreeBee Focus: complete schema for MySQL / MariaDB (XAMPP).
-- Import this ONE file through phpMyAdmin > Import, or the mysql client.
-- Creates degree if absent, all 12 tables, and the IDR 50,000 monthly plan.
-- Contains no real users, passwords, tokens, reports, or payment records.
-- Re-import preserves existing rows, plan prices, and subscription access.
-- CREATE TABLE IF NOT EXISTS does not repair incompatible existing table layouts.
-- Database credentials are configured separately; no shared DB password is seeded.

CREATE DATABASE IF NOT EXISTS degree
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE degree;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS db_users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(254) NOT NULL UNIQUE,
 display_name VARCHAR(40) NOT NULL,
 password_hash VARCHAR(255) NOT NULL,
 leaderboard TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_tokens (
 token_hash CHAR(64) PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (user_id) REFERENCES db_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_sessions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 client_id CHAR(36) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 started_ms BIGINT NOT NULL,
 ended_ms BIGINT NOT NULL,
 active_ms BIGINT NOT NULL,
 UNIQUE KEY session_identity(user_id,client_id),
 INDEX session_dates(user_id,started_ms,ended_ms),
 FOREIGN KEY (user_id) REFERENCES db_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_session_days (
 session_id BIGINT UNSIGNED NOT NULL,
 study_day DATE NOT NULL,
 active_ms BIGINT NOT NULL,
 PRIMARY KEY(session_id,study_day),
 FOREIGN KEY(session_id) REFERENCES db_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_rate_limits (
 bucket CHAR(64) PRIMARY KEY,
 attempts INT NOT NULL DEFAULT 1,
 expires_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Monthly membership and its audit history.
CREATE TABLE IF NOT EXISTS db_plans (
 code VARCHAR(40) PRIMARY KEY,
 name VARCHAR(80) NOT NULL,
 price_rupiah INT UNSIGNED NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'IDR',
 billing_interval VARCHAR(10) NOT NULL DEFAULT 'month'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO db_plans(code,name,price_rupiah,currency,billing_interval)
VALUES ('focus_monthly','DegreeBee Focus',50000,'IDR','month')
ON DUPLICATE KEY UPDATE code=VALUES(code);
CREATE TABLE IF NOT EXISTS db_subscriptions (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 plan_code VARCHAR(40) NOT NULL DEFAULT 'focus_monthly',
 status ENUM('inactive','active','expired','canceled') NOT NULL DEFAULT 'inactive',
 starts_at DATETIME NULL,
 expires_at DATETIME NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES db_users(id) ON DELETE CASCADE,
 FOREIGN KEY(plan_code) REFERENCES db_plans(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_subscription_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 action VARCHAR(30) NOT NULL,
 note VARCHAR(255) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES db_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO db_subscriptions(user_id) SELECT id FROM db_users;

-- Demo checkout is separate from paid subscriptions and records no real payment.
CREATE TABLE IF NOT EXISTS db_demo_access (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 starts_at DATETIME NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY(user_id) REFERENCES db_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Support access is granted by an operator, never by registration or the public API.
CREATE TABLE IF NOT EXISTS db_support_staff (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES db_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_support_tickets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 request_id CHAR(36) NOT NULL,
 subject VARCHAR(100) NOT NULL,
 category ENUM('camera','account','subscription','reports','feedback','other') NOT NULL,
 status ENUM('open','awaiting_customer','resolved') NOT NULL DEFAULT 'open',
 last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY support_request(user_id,request_id),
 INDEX support_owner(user_id,updated_at,id),
 INDEX support_queue(status,updated_at,id),
 FOREIGN KEY(user_id) REFERENCES db_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS db_support_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ticket_id BIGINT UNSIGNED NOT NULL,
 author_id BIGINT UNSIGNED NULL,
 author_role ENUM('customer','support','system') NOT NULL,
 request_id CHAR(36) NOT NULL,
 body TEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY support_message_request(ticket_id,request_id),
 INDEX support_conversation(ticket_id,id),
 FOREIGN KEY(ticket_id) REFERENCES db_support_tickets(id) ON DELETE CASCADE,
 FOREIGN KEY(author_id) REFERENCES db_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
