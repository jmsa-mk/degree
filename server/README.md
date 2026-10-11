# DegreeBee account service

The Windows EXE handles monitoring, camera inference, local reports and exports. This separate PHP API stores accounts and study-time summaries in the `degree` MySQL database. There is no website to use. The original Laravel project is unchanged.

## Run on this computer

1. Start **Apache and MySQL** in XAMPP.
2. Open `release/DegreeBee-Focus-2.2.1-x64.exe` directly, or use `Start-DegreeBee.cmd`. Apache serves the API at `http://127.0.0.1/degreebee`; no separate PHP server or backend script is needed.
3. In the EXE choose **New here? Create an account**. Use a display name, email and password of 10–72 bytes. No demo password or admin account is pre-created.
4. Accept the account storage notice. Joining the leaderboard is a separate, optional choice.
5. Choose Get monthly access and Confirm demo payment in the EXE, then complete a session of at least one minute, then open **Progress & league**. A successful sync updates your XP. Use **Sync progress now** to retry after a service outage.

The service has already been provisioned on this computer. For a fresh setup, run `C:\xampp\php\php.exe server/setup-local.php` from the Prototype folder. The setup imports the complete schema, creates `degree` if needed, and preserves existing tables/data. The optional `DEGREEBEE_DB_ADMIN_PASSWORD` environment variable supplies a non-empty local root password. It creates a restricted `degreebee_app` database identity; its random password remains in ignored `server/config.local.php`, outside the API public directory and outside the EXE.

## One-file database import

In XAMPP phpMyAdmin, open **Import**, select **server/schema.sql**, and click **Go**. This one file creates `degree`, all nine `db_` tables, the IDR 25,000 monthly plan, and inactive subscriptions for existing users that lack a subscription row. No separate SQL import or migration is required to create the tables. `subscriptions.sql` is retained only as a legacy reference; current setup and migration scripts use the complete schema.

The SQL contains no customer data or database credentials. Repeat imports preserve existing rows, prices, and subscription dates/statuses; they do not alter incompatible existing table definitions. SQL import prepares the database structure; on a fresh machine, run `server/setup-local.php` once to provision the restricted service identity and private configuration, then `scripts/setup-xampp.ps1` once to configure Apache. Do not copy another machine's private credentials into Git. These setup steps are not needed for everyday startup.

Verify the schema with `C:\xampp\php\php.exe scripts/schema-test.php`. It creates a randomly named test database, checks fresh/repeated imports and foreign-key deletion, then removes only that test database. It never writes to `degree`.

The one-time Apache setup is already installed on this computer. For a fresh installation or moved project, run `powershell -ExecutionPolicy Bypass -File scripts/setup-xampp.ps1` and restart Apache once. It backs up the Apache configuration, adds a dedicated Alias, and validates syntax with rollback on failure. Only `server/public` is exposed and access is restricted to this computer (`Require local`); credentials and maintenance scripts stay outside the public directory. Keep the project at its configured path. Apache logs are under `C:/xampp/apache/logs`. Closing DegreeBee does not stop Apache. Do not publish `config.local.php`, logs, or database backups.

The exact local migration from port 8765 to `/degreebee` preserves encrypted sign-in and uses the previous report namespace for the same database. Remote server builds do not accept that old identity. Membership is still verified by the server before monitoring. The old `start-backend.ps1` now only checks Apache health and is not part of startup.

## Product behavior

- **Personal:** daily goals, XP, levels, current streak and four achievement badges. Finishing a session opens personal progress.
- **Reports:** existing session history, camera details, PDF and PNG exports. Report auto-open follows the saved preference. Share files manually with an organization, teacher or parent.
- **Access:** no guest monitoring. Registration creates an inactive subscription. Only a server-verified active membership enables monitoring. Existing guest report files remain on disk; they are not transferred to any account.
- **Signed in:** completed/recovered session dates and non-paused time intervals sync. Camera scores, report titles, photos and videos never reach this API. Full reports remain local and are separated by account and server. Switching accounts requires finishing or deleting the current session.
- **Privacy:** leaderboard membership defaults off unless explicitly selected. Members see only listed display names and weekly XP. Changing this preference does not erase personal progress. Deleting an account removes its server data and tokens, but retains local report files as the UI explains.
- **Credentials:** passwords are hashed with PHP `password_hash`. Random 256-bit bearer tokens are hashed on the server and expire after 30 days. Password changes revoke earlier tokens. Windows-protected storage remembers a sign-in on supported devices; the renderer never receives a token. Without encryption, tokens stay in memory only. Email recovery and verification are not implemented in this prototype.

## Reward rules

One XP per full recorded active minute, calculated after summing the day's intervals, capped at 180 XP per day. Camera-free and reading sessions count; pauses do not. A level takes 120 XP. A streak needs at least 10 minutes per day and remains current until the end of the day after its most recent qualifying day. The streak badge uses the longest streak in saved history, so missing a later day does not remove an earned badge.

Rewards use **Asia/Jakarta** consistently on client and server, including midnight splits. Weekly league resets Monday at 00:00 Jakarta time. Equal weekly XP shares a rank; up to 50 entries are shown, with your own rank separately when needed. New leagues are empty until a consenting member earns a full minute.

The server validates session IDs, chronological intervals, duration bounds, future timestamps, per-user overlaps and immutable duplicate uploads. Sessions up to 24 hours are accepted. Duplicate retries do not award extra XP. Invalid/overlapping sessions stay local and do not block other valid sessions. This is a friendly self-recorded challenge, not tamper-proof proof of work. A modified client can fabricate plausible intervals; do not use rankings or camera scores for exams, employee discipline or prizes that require verified activity.

## Connect other computers

`127.0.0.1` points to the current computer. XAMPP running on this PC is **not a hosted online service**. Deploy the PHP API behind HTTPS with `server/public` as document root and route requests to `index.php`; copy `lib.php` and a private configuration outside the public root. Use a supported, maintained PHP/MySQL environment, a restricted database identity, backups, TLS and operational monitoring. The PHP development server is for local demonstrations only.

Set the HTTPS API URL in developer-only `electron/service-config.cjs`, then rebuild the EXE. Customer UI has no server address controls. Profiles and progress then come from the shared database. Detailed camera reports are not cloud backups. No firewall ports or public hosting were configured as part of the local prototype.

## Verification

`npm run test:accounts` creates temporary unique accounts in the running local API, checks authentication, reward rules and privacy, then deletes those accounts. `npm run test:community` checks the UI with a separate local data directory, temporary accounts and no physical camera. Test accounts are not seeded leaderboard entries. `npm run test:desktop`, `test:feedback` and `test:exports` cover the existing app.

Primary implementation references: [PHP password hashing](https://www.php.net/manual/en/function.password-hash.php), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage/).

## Membership and demo administration

`db_plans` stores `focus_monthly`, IDR 25,000 per calendar month. `db_subscriptions` stores account access status and UTC start/end dates. `db_subscription_events` records operator changes. Existing users are migrated without deleting data and default to inactive. Expired status is derived from server time even if a stored active row is not updated by a scheduled job. Run `php server/migrate-subscriptions.php` once for a pre-v2.1 installation; new setup includes it.

Operator commands (private CLI, never bundled in the EXE):

```powershell
& C:\xampp\php\php.exe server/subscription-admin.php status "registered-email@example.com"
& C:\xampp\php\php.exe server/subscription-admin.php grant-month "registered-email@example.com" "Prototype demonstration"
& C:\xampp\php\php.exe server/subscription-admin.php cancel "registered-email@example.com" "Demo finished"
```

Use the actual registered email or numeric user ID. Granting extends existing unexpired access by one calendar month (clamped at month ends), otherwise begins a month now. No payment is created, simulated or charged. Public API and its restricted database identity cannot update subscriptions or plans. Checkout, billing, payment provider and automated renewal are not implemented.

Start and resume always check the authenticated entitlement endpoint. The Electron main process holds a non-persisted lease of at most 60 seconds, refreshes about every 30 seconds, and pauses monitoring when access expires or verification fails. Saved report viewing/export remains available to signed-in users with inactive memberships. A modified/repacked local executable is outside this prototype access-control guarantee. This build is for an operator-led local XAMPP demonstration.

## Version 2.2 demo QR checkout

The user-facing flow now supports Get monthly access → Confirm demo payment. No scanning, money transfer or operator command is needed. The bundled SVG QR contains only a demo message, no payment destination. POST /demo/activate requires a signed-in account and explicit confirmDemo=true. The server derives the user and plan; price or user IDs supplied by the client are ignored.

Demo access is stored separately in db_demo_access (one month per account), with an audit event demo_activation. Repeated confirmations do not extend access or insert duplicate events. db_subscriptions remains unchanged. API permissions on db_demo_access are SELECT/INSERT only; db_subscriptions still has no UPDATE grant. Setting enabled=false in server/demo-config.php blocks the demo endpoint and excludes demo access from entitlement checks. Real payment processing remains absent.

Run npm run test:demo for the QR, database activation, repeat confirmation, cancellation, camera unlock, restart and disabled-mode checks. The progress dashboard now has separated statistic cards, consistent SVG icons, achievement progress bars and actionable empty states in dark and light themes.
