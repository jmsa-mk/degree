# Validation — DegreeBee Focus 1.1.0

Date: September 27, 2026. Target: Windows x64.

## Automated checks

- `npm test`: **20/20 passed**. Covers independent head and eye signals, eye geometry when blink scores are low, missing pose/blendshape data, head turns in four directions, simultaneous conditions, short-blink tolerance, calibration, independent notification cooldowns, stale camera observations, session accounting, checkpoint recovery, CSV escaping, and deletion of primary/checkpoint/recovery files.
- `npm run test:desktop`: **passed** using real Electron, the bundled local MediaPipe model, a simulated camera, and scripted observations. No physical webcam was accessed.
- Actual main-window minimization and tray hiding: observed camera time continued. Mini mode was checked at its actual narrow width; the live preview remained visible and fitted inside the window.
- Confirmed all three green indicators; independent red eye/head indicators; missing-face indicators; desktop popup content and non-activating window configuration; simultaneous eye-closure/head-turn alert records.
- Pause released the camera. Stopping the simulated stream produced a visible error and paused the session.
- Finish/save, CSV export, history across app restart, cancellation of deletion, confirmed active-session deletion, and absence of deleted sessions after another restart all passed.
- English light/dark screens, mini mode, report/history views, detection alerts, and the desktop popup were inspected in screenshots saved in `test-output`.

## Scope and limitations

Detection tests use synthetic landmarks and scripted observations to check the implementation; they do not establish accuracy for a particular person's face. Lighting, glasses, camera placement, and posture still require a physical-camera check. The app includes forward-position calibration and measurement details for that check.

One earlier desktop smoke run paused because simulated camera frames stopped arriving. A separate diagnostic run and subsequent complete desktop test runs passed, including actual main-window minimization. The error path paused safely rather than recording stale frames as focus.

Windows lock/sleep handlers are implemented but were not exercised by locking or suspending the user's computer. Popups are application-owned desktop windows rather than Windows notification-center toasts. Exclusive full-screen applications may obscure them. The executable is unsigned.

AoL Laravel source was preserved. Its logo and background assets are copied into the independent Prototype project. Existing user-provided session titles are preserved rather than translated.

## Portable release

- Portable executable built successfully: release/DegreeBee-Focus-1.1.0-x64.exe.
- Size: 108000646 bytes.
- SHA-256: 171b149865210d490afeeb430f997989f14da216274d00f284ce7bcf4e4f46d2.
- Direct EXE launch verified the English UI, bundled local model, original AoL logo, desktop bridge, and camera-off default. The verification app was closed afterward.

## Version 1.1.1 update

- Removed the in-app detection toast. Confirmed alerts now use the separate desktop popup, positioned on the display containing the pointer.
- Added a bundled original two-tone WAV chime with autoplay permitted only in the isolated popup window. Closely spaced alerts share one sound; playback errors request a Windows system beep.
- Desktop regression suite passed with the monitoring window minimized: the popup remained visible and always on top, did not take focus, appeared inside the active display work area, and its audio completed playback without an error. This verifies playback, not the user's physical speaker volume or audibility.
- Existing mini camera, background monitoring, reports, CSV/restart, camera failure, indicators, and delete/cancel/recovery-copy checks passed.
- Removed the requested score formula/explanation paragraph from Report details. Score calculations are unchanged.

Version 1.1.1 portable build: DegreeBee-Focus-1.1.1-x64.exe, 108052114 bytes. SHA-256: a3a51bf00462e8bdbafe4a09feac9cc9b9bbc3a476f5df55a6ce42af4b30b57d.

## Version 1.2.0 feedback update — October 5, 2026

- 51/51 unit tests passed. New coverage includes independent enabled checks, reading presets, gentle confirmation, settings persistence/validation, paused configuration changes, natural-eye-shape calibration, unstable/missing measurements, report guidance, and daily-goal midnight/deduplication accounting.
- `npm run test:feedback` passed in real Electron using isolated local data and simulated camera input. It verified activity and checkbox controls, saved preferences after restart, timer-only operation without camera access, disabled indicators, settings locked while running, configuration changes while paused, face-only classification, muted desktop popup while minimized, optional report opening, aligned save message/dismissal button, readable sharing through IPC, and daily progress.
- `npm run test:desktop` passed again: local model/camera, minimized and tray-hidden monitoring, visible mini camera, pause/resume, report/CSV/restart, camera failure handling, indicators, audible desktop popups, and active-session deletion.
- Screenshots for visual review are in `test-output/feedback-settings.png`, `feedback-notice.png`, `feedback-report.png`, and `mini.png`. The original blue background and light/dark branding remain. No subscription, account, database connection, or networked friends feature was introduced.
- Report copying was checked by intercepting only the test process's final clipboard write, preserving the user's real clipboard. Sharing remains a manual copy/paste action.
- All automated camera checks used simulated media or synthetic landmarks; physical-webcam accuracy, glasses, and actual user eye shapes remain unverified. Calibration and optional checks make adjustment possible without claiming guaranteed accuracy.

Version 1.2.0 portable build succeeded: DegreeBee-Focus-1.2.0-x64.exe, 108057263 bytes. SHA-256: 6d64e60603063767837d49d56d37b838e731dd9787d83c70d8f982ad5ccaa5a4.
Direct launch of the compiled v1.2.0 EXE passed: activity controls, daily goal, settings API, bundled model/audio/logo, and camera-off startup verified. The verification app was closed afterward.

## Version 1.3.0 readable exports — October 5, 2026

- Replaced user-facing JSON/CSV and clipboard exports with **Save PDF** and **Save progress image** in report details. Each opens a Windows save dialog. Reports remain stored locally without a database or account.
- 51/51 unit checks passed after moving shared report insights into the packaged Electron directory.
- Desktop regression and feedback suites passed with simulated media, including background monitoring, mini camera, popup/audio, pause, deletion, timer-only settings, persistence, and report controls.
- Final `npm run test:exports` passed: PDF/PNG file signatures, a 1080-pixel PNG, literal special characters in titles, cancellation, rejection of legacy export formats, visible save errors, no renderer errors, and cleanup of hidden export windows.
- Generated PDF inspected with Poppler: one A4 page, expected document title, no embedded JavaScript. Rendered PDF and PNG were visually inspected for readable text and unclipped layout.
- Exports contain summaries and camera-derived counts, never camera frames. Goal progress uses the saved target and report history currently on the device. Physical-camera accuracy is not established by these automated checks.

Version 1.3.0 portable build succeeded: DegreeBee-Focus-1.3.0-x64.exe, 108067422 bytes. SHA-256: b1776fb4020444f2abd334c834111287b78ba14eb7add538b20f5af160a4f078.
Direct launch of the compiled EXE passed: activity controls, daily goal, settings API, bundled model/audio/logo, and camera-off startup verified. The verification app was closed afterward.

## Version 2.0.0 accounts and personal progress — October 11, 2026

- Added an optional account API backed by XAMPP MySQL database `degree`. Provisioning created `db_users`, `db_tokens`, `db_sessions`, `db_session_days`, and `db_rate_limits` without touching the Laravel project. Application database permissions are limited to DML on those tables. Credentials stay outside the public root and executable.
- Added registration, sign-in/out, Windows-encrypted token persistence, password changes with revocation, account deletion, explicit optional leaderboard membership, and per-account local report directories. Guest history is preserved separately. No real/demo account was seeded; temporary QA accounts were deleted.
- Personal workspace has XP, levels, current streak, persistent history-derived badges, and a weekly leaderboard. Reports workspace retains PDF/PNG and optional report auto-opening. The background is now neutral in both themes.
- Reward calculations use Jakarta day/week boundaries, a 180-XP daily cap, server validation of intervals/overlaps, and idempotent session uploads. Rankings use recorded active minutes rather than camera scores. This is not tamper-proof exam monitoring.
- All 51 prior logic checks and 8 account/reward checks passed (59 total across the full suite and final account rerun). API integration passed with the actual MySQL service, including account isolation, invalid/future/overlapping sessions, duplicate retries, daily cap, streaks, privacy preference changes and token revocation.
- Real Electron community integration passed: registration, encrypted credential file, sync/XP/badges, personal completion, optional ranking, report controls, restart persistence, active-session account guard, logout history isolation and account deletion.
- Desktop monitoring regression, feedback regression and PDF/PNG export regression all passed. Camera tests used simulated media; physical-webcam accuracy and real speakers remain unverified.
- Shared account progress has no camera scores, images, videos or session titles. Detailed reports remain local. Account service is loopback-only on port 8765; public hosting, email recovery, parent accounts, online exams and automatic low-score flags are not implemented.

Version 2.0.0 portable build succeeded: DegreeBee-Focus-2.0.0-x64.exe, 108073745 bytes. SHA-256: b79d6b599b3410da92781d88428debb46703a1ef783395f7180552d54150120c.
Direct EXE launch passed: progress/league UI, account bridge without exposed tokens, offline assets and camera-off default. ASAR inspection confirmed server credentials and schema are excluded. Light/dark and minimum-width account/progress screenshots were visually inspected. The verification app was closed afterward.


## Version 2.1.0 customer-demo access update — October 11, 2026

- XAMPP remains the intentional local demonstration backend. Customer UI is English, requires sign-in, and no longer contains guest access, Account server, URL settings, localhost or XAMPP instructions. Sign-in and membership screenshots were visually reviewed; duplicate access messages and raw IPC error prefixes were removed.
- Main-process start/resume and camera permissions require a freshly authenticated server entitlement. Periodic verification renews a non-persisted lease capped at 60 seconds; expiry or failed verification pauses the session. No client self-activation or checkout exists.
- Additive migration created the IDR 25,000 monthly plan, per-user subscriptions and operator audit records in degree. Existing real account count remains 1, inactive by default. All temporary QA accounts were removed. Restricted API identity has SELECT-only plan access and SELECT/INSERT subscription access, without UPDATE privileges.
- 63 unit tests passed, including fresh entitlement requirements, malformed/inactive/canceled/expired responses, pending renewal continuity, network failure revocation and lease expiration bounds.
- Subscription integration passed using real Electron and MySQL: guest denied at UI and IPC, inactive denied, attempted self-activation rejected, database-derived price, active start/resume, live expiration pause, cancellation denial and logout relock.
- Desktop regression passed with bundled MediaPipe and simulated media: minimized/tray-hidden detection, visible mini camera, independent indicators and alerts, desktop popup/chime playback, pause/recovery, persistence, PDF export and active-session deletion.
- Feedback/settings regression, PDF/PNG export regression, account API integration and account/community UI integration all passed. Actual camera accuracy and physical speaker output still need a person to check them on the demonstration computer.
- Private operator CLI tested on a disposable QA account: lookup by email, one-calendar-month grant, renewal extension, cancellation and status display. It records no payment. Instructions are in PANDUAN-MULAI.md.
- PHP source lint passed. Public deployment, payment processing, automatic billing and email recovery remain outside this local demo build.

Portable 2.1.0 build completed and direct EXE launch passed: customer sign-in/membership gate, no guest/server controls or exposed tokens, AI access off until verified, bundled model/audio/logo, camera off by default. The verification app was closed. ASAR inspection confirmed private server files, operator scripts and test fixtures are excluded.

Artifact: release/DegreeBee-Focus-2.1.0-x64.exe — 108072254 bytes.
SHA-256: 035910e77a61aafcdc6eb8b7ad0662c23ef1759342720c5687bbe4bb5322fd11.

## Version 2.2.0 — Demo QR and progress redesign (October 11, 2026)

- Replaced operator-only activation as the presentation path with Get monthly access → demo QR → Confirm demo payment. The QR encodes only a non-payment demo message, needs no scan, and is bundled locally. UI clearly states no real charge.
- Authenticated confirmation grants one calendar month in the separate db_demo_access table and writes a demo_activation audit event. Real db_subscriptions records remain unchanged. SELECT/INSERT-only permissions are used for demo access; no UPDATE permission was granted on db_subscriptions. Every test account and its demo access was removed afterward; the existing real account remains intact.
- Duplicate confirmation preserves the same expiration. Cancellation does not activate. Arbitrary user/amount fields are ignored. Missing authentication or confirmation is rejected. Disabling server/demo-config.php blocks the endpoint and removes demo entitlement.
- Real Electron integration passed: QR shown in both themes, cancel, confirm, API-verified access, simulated camera/model start, session save, restart persistence, disabled-mode behavior and no renderer errors. Price remains IDR 25,000 from the database.
- Progress redesign includes separated statistic cards, consistent SVG icons, progress bars for all badges, unlocked/in-progress states, next milestone guidance, improved dark-theme contrast and responsive card grids. Dark/light and narrow-window screenshots were inspected; layout tests verified no horizontal overflow and at least 20px between statistics and badges.
- 63 unit checks, subscription integration and account/community integration passed. PHP lint passed. Full desktop/export regressions from 2.1 remain documented above; this revision additionally exercised monitoring through the new demo checkout.
- Real payment processing remains unimplemented. The old 2.1 operator-only checkout guidance is superseded by PANDUAN-MULAI.md for 2.2.

Version 2.2 portable EXE compiled and opened successfully. Packaged QR and activation bridge are present; private server/configuration/test files are excluded.
Artifact: release/DegreeBee-Focus-2.2.0-x64.exe, 108078518 bytes. SHA-256: 27a7b8af3d574ce57681e18ba4fc46dd466f3beaaf670a4f5feb2580dd125bfc.


## Version 2.2.1 — Direct XAMPP startup (October 11, 2026)

- Apache serves the account API at http://127.0.0.1/degreebee through a local-only Alias to server/public. Apache syntax validation passed. Existing XAMPP routes were preserved.
- The old DegreeBee PHP development servers were stopped before validation. The launcher now only opens the EXE; start-backend.ps1 is an optional health check and never starts a server. Daily startup requires only XAMPP Apache + MySQL and the EXE.
- Preserves protected sign-in and the original per-account report directory for this exact local endpoint migration. New unit coverage checks report preservation, credential rewrite, rejection of unrelated endpoints, and no cached entitlement grant.
- Passed all 64 unit tests. Passed API authentication/progress/privacy tests, Electron demo QR activation/restart/disabled-mode tests, subscription gating/expiry tests, and community progress/report/account-isolation tests through Apache. Temporary QA accounts were removed by test cleanup.
- A normal sandbox test run encountered Windows temporary-file rename restrictions; the same suite passed with filesystem access suitable for Electron testing.
- Apache health passed while port 8765 was offline. Private configuration/library/setup files were not served; the existing XAMPP dashboard remained available.
- Portable v2.2.1 EXE launched directly and passed packaged UI/assets/startup checks, then was closed. Packaged configuration points to Apache and contains no private server configuration or account credentials.
- Artifact: release/DegreeBee-Focus-2.2.1-x64.exe, 108078909 bytes. SHA-256: 832c7d640b2fdcd7e45ba8d027bfb1d5f64febfef806df7aa857ec982e969e29.


## GitHub source preparation and complete SQL schema (October 11, 2026)

- server/schema.sql imports all nine tables and the IDR 25,000 monthly plan in one pass; no real customer data or credentials included.
- Disposable-database verification passed for fresh import, repeat import preserving rows/pricing/access, missing inactive subscription backfill, and foreign-key cascades. Existing degree data was not changed.
- Git ignore checks verified private credentials, reports, backups, model downloads, dependencies, binaries and QA artifacts are excluded while required source/schema/example configuration remain included. Upload candidates were scanned for the live database password without printing it; none contained it.
- PHP syntax checks passed for setup-local.php and migrate-subscriptions.php. No commit, push, or repository creation was performed in the project root.
