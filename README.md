# DegreeBee Focus 2.2.1 — Windows desktop app

AI focus monitoring, local reports and personal study rewards in one portable `.exe`. Sign-in and an active database-backed membership are required for monitoring. The monthly plan is IDR 25,000; real payments are deferred; a clearly labeled QR demo activates one month of access. Accounts connect to the local PHP/MySQL API for access checks, progress and a weekly leaderboard. The UI keeps the AoL bee logo and rounded cards, with a calm neutral background and light/dark themes. The original Laravel web project is unchanged. See `server/README.md` for account setup and deployment limits.

## Run the app

For a fresh database, import the complete [`server/schema.sql`](server/schema.sql) once. See [`GITHUB.md`](GITHUB.md) for source upload instructions and [`server/README.md`](server/README.md) for one-time service setup on a new computer.

1. Start **Apache and MySQL** in XAMPP, then open `release/DegreeBee-Focus-2.2.1-x64.exe` directly (or `Start-DegreeBee.cmd`). No separate backend script is needed. Register or sign in; choose Get monthly access and Confirm demo payment to unlock one month through the simulated QR checkout. See `PANDUAN-MULAI.md`. Close an older app version first.
2. Choose **Computer work** or **Reading / notes**, name your session, and click **Start focus**. The camera starts only during a running session with at least one detection check enabled.
3. Work in Word, a PDF reader, a browser, or any other app. You can minimize the window or use **Mini mode**, which stays on top and includes the live camera, indicators, and session controls.
4. **Pause** stops the camera and reminders for breaks. **Resume** continues the session. **Finish & save** saves the report. Personal workspace opens progress; Reports workspace optionally opens report details.
5. **Delete session** opens a confirmation. **Delete permanently** stops monitoring and removes only that session, including its checkpoint and recovery copies. **Keep session** cancels deletion.

Closing a running session offers **Save & quit**, **Keep running** in the system tray, or **Cancel**. Double-click the tray icon to return. Windows lock/sleep pauses the session; resume manually when you return.

## Live indicators and detection

Open **Detection & reminders** before starting, or pause to adjust settings:

- Turn **Face visibility**, **Eye checks**, and **Head direction** on or off independently. Disabled checks are labeled off and do not affect alerts or scoring. Turning every check off gives a camera-free timer, with no inferred focus score.
- **Computer work** checks gaze when Eye checks are enabled. **Reading / notes** always ignores gaze and starts with head reminders off; face visibility and eye closure remain optional. A book or glasses can hide the eyes, so disable Eye checks if necessary. This preset does not determine whether someone is actually reading.
- **Gentle** waits two seconds before confirming an adverse signal; **Balanced** uses the existing shorter delays.
- **Notification sound** controls the chime; desktop popups remain enabled. **Open report after finishing** can be turned off while automatic saving continues.
- Settings live in `%APPDATA%\DegreeBee Focus\settings.json`. Session reports record their initial settings and any changes made while paused. Monitoring preferences remain local; account progress uses the account API.

| Indicator | Green | Red | Gray |
| --- | --- | --- | --- |
| Face visibility | Face visible | Face not visible | No confirmed observation |
| Eye attention | Eyes open and looking forward | Eyes closed, looking away, or face absent | Eye information unavailable |
| Head direction | Facing forward | Turned/tilted away, or face absent | Head information unavailable |

Checks are independent. Closing your eyes while turning your head can produce both alerts. Red indicators mean confirmed adverse camera signals, not a judgment about concentration.

- MediaPipe Face Landmarker runs locally at approximately 10 frames/second using the CPU.
- Eye closure is detected when the average blink score is at least **0.45**, or the eye aspect ratio is below **0.19**. Eye geometry accounts for the camera image's aspect ratio. Either available measurement can identify closure even if pose or blendshape data is missing.
- Head pose uses the column-major facial transformation matrix. Default limits are **18° yaw** and **22° pitch** relative to the calibrated forward position, or the camera's forward axis before calibration.
- Eye direction uses binocular look blendshapes (threshold **0.55**) with an iris-position fallback when blendshapes are unavailable. This is an approximate camera-facing indicator, not calibrated screen-point eye tracking.
- Each check has its own temporal filter: closed eyes **650 ms**, missing face **700 ms**, head/gaze away **900 ms**; recovery takes **200 ms**. Ordinary short blinks do not create distraction events. A stale camera resets the checks to unknown.
- Switching applications and reading without mouse movement do not count as distraction.

### Calibration

If normal posture is incorrectly marked red, click **Calibrate forward position** while looking straight at the screen with both eyes open. Hold still for 2 seconds. The app uses 20 stable valid samples to establish the head-angle baseline and an eye-closure threshold at 65% of normal eye openness (without a fixed minimum that overrides naturally narrow eyes). It also personalizes the blink threshold. During calibration, eye/head checks stay unknown to prevent false reminders. A progress bar and Reset calibration control are available. Calibration is kept until the app exits. **Detection details** exposes the measured blink score, eye openness, and head angles.

Calibration does not prove model accuracy. Lighting, glasses, camera placement, looking at a second monitor, or looking down at notes can affect results. The app never reads screen contents, other app names, or keyboard input.

## Notifications

Confirmed **Face not visible**, **Eyes closed**, **Head turned away**, and **Eyes looking away** conditions create a separate desktop popup with a two-tone chime, including while the main window is minimized or hidden in the tray. Notifications are outside the monitoring interface. The popup appears on the screen containing the pointer, stays above ordinary application windows for 10 seconds, and does not steal keyboard focus. Click **Open monitoring** to return or × to dismiss.

The chime is bundled locally and plays without needing a click in the app. Alerts arriving within 1.5 seconds share one chime to prevent overlapping sounds. If audio playback fails, the app requests the Windows system beep. Windows output volume, mute, and the selected speaker/headphone device still apply.

Desktop popups are provided by the application itself, so the portable build does not depend on Windows Start Menu registration for native toast notifications. A condition is limited to one notification per 10 seconds; a persistent condition repeats every 30 seconds. Different conditions are tracked independently. Alert events are saved locally; PDF and PNG show the reminder count.

## Reports and storage

Reports lead with a readable takeaway, the next suggested adjustment, active duration, longest period matching the enabled checks, and reminder count. Detailed camera metrics sit behind an expandable section. **Save PDF** saves a readable A4 session report. **Save progress image** saves a PNG progress card (1080 pixels wide) for sharing manually. Each button opens a save-location dialog; nothing is sent automatically. JSON/CSV and clipboard export controls have been removed.

**Today's study goal** provides local personal progress at 30, 60, 90, or 120 minutes. It counts active session time, including camera-free timer sessions, excludes pauses, and splits sessions correctly at local midnight. Different monitoring modes do not compete on a shared score. The account-based weekly league uses separately capped XP rather than camera scores. Direct friend invitations, subscriptions and online exams are not included.

Reports contain session title, start/end times, status, focused/distraction/paused/unobserved durations, distraction breakdown, score, coverage, timeline, and alert history. PDF includes the session summary, enabled-check context, duration breakdown, and next-step suggestion. PNG shows the key session numbers and daily-goal progress without any camera images.

**Score = focused time / (focused + distracted time) × 100.** Paused and unobserved time are excluded. Simultaneous conditions count only once in duration buckets (face absent, then eyes closed, then looking away), while every independently confirmed alert is recorded separately.

Legacy guest files remain on disk, but there is no guest UI or guest monitoring. Signed-in reports are isolated under `accounts/<server hash>/<user ID>/reports` in the same app-data directory. Use **Open report folder** in the app. Each session uses one JSON file, an atomic temporary-file replacement, and one previous `.bak` checkpoint. Sessions are saved every 5 seconds, on pause, on alerts, and on completion.

After an unexpected exit, a session is **Recovered** to its last saved checkpoint; approximately the last 5 seconds may be missing. Downtime is not added. Write failures are displayed so you can fix disk space/permissions and retry. No photos or videos are stored.

Reports from version 1.0 remain readable. Existing user-provided session titles are preserved. Moving the executable alone does not move history. To transfer editable app history, copy the `reports` folder while both apps are closed. PDF and PNG are readable copies, not importable backups. Detailed reports have no cloud backup or in-app import. Signed-in study-time summaries sync separately to the account API.

## Development

Windows x64, Node.js 22.12+ (tested with Node 24), and npm are required to build. Users of the executable do not need Node.js.

```powershell
cd 'D:\Coding\Venture Creation\Prototype'
npm ci
npm start
npm test
npm run test:desktop
npm run test:feedback
npm run test:exports
npm run test:accounts
npm run test:community
npm run dist
node scripts/verify-release.mjs
```

The first build downloads dependencies, Electron, packaging tools, and the pinned official MediaPipe model. Subsequent runs bundle the local model and WASM for local inference; membership verification still requires the account service. The model SHA-256 is checked by the build script. Distribute `release/DegreeBee-Focus-2.2.1-x64.exe`; `release/win-unpacked` is an internal build output. The executable is not code-signed.

| Source | Responsibility |
| --- | --- |
| `src/face-analysis.mjs` | Independent eye/head measurements and calibration |
| `src/useCamera.js` | Camera/model lifecycle and inference loop |
| `src/main.jsx`, `src/styles.css` | English UI, indicators, mini camera, reports, deletion confirmation |
| `electron/attention.cjs` | Per-check temporal filtering and notification policy |
| `electron/session.cjs` | Durations, scoring, timeline, session state |
| `electron/store.cjs` | Atomic local storage, recovery, deletion |
| `electron/main.cjs` | App lifecycle, desktop popups, tray, IPC, export |
| `electron/report-export.cjs` | PDF reports and PNG progress cards |
| `public/alert.*`, `electron/alert-preload.cjs` | Isolated desktop notification window |
| `tests/attention.test.cjs`, `tests/session.test.cjs` | Signal fixtures, filtering, accounting, alerts, persistence, deletion |
| `scripts/smoke-test.mjs` | Real Electron UI with simulated camera and scripted observations |

Renderer processes are sandboxed with context isolation, no Node integration, a local-only content policy, and narrow IPC bridges. Navigation and popup creation from renderer content are blocked.

## Manual camera check

Automated tests do not access your physical webcam. Before regular use: confirm all three indicators turn green while facing forward; close your eyes for 1–2 seconds; turn your head for 1–2 seconds; step out of frame; check each alert and indicator. Calibrate in a well-lit position if needed. Confirm the preview stays visible in mini mode and finish the session to inspect the report.

## References

- [MediaPipe Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [MediaPipe matrix format](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto)
- [Electron background window behavior](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron notification platform requirements](https://www.electronjs.org/docs/latest/tutorial/notifications)
- Model: official Google MediaPipe Face Landmarker float16 v1. SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.




## PDF and progress-image exports

Open **Report history**, choose a saved session, then **Save PDF** or **Save progress image**. Choose the destination in the Windows save dialog. Export works offline, includes the original DegreeBee logo, and never includes camera frames. Session names are treated as literal text, including special characters.

The daily-goal panel uses the target saved with the session (60 minutes for older reports without one), and computes progress at the end of that session from history currently on this device. Deleting older sessions can change this historical progress. Active session time includes timer-only sessions and excludes pauses. Recovered sessions are labeled.

Exports are rendered by a temporary hidden, sandboxed Electron window, which is destroyed on success or failure. No browser window appears. Cancel leaves files untouched; failed saves show a message inside the report. Session storage remains local JSON for compatibility.


