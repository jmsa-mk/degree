import { _electron as electron } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {createMember,setMembership,signInMember,removeMember} from './member-fixture.mjs';

const output = path.resolve("test-output");
await mkdir(output, { recursive: true });
const dataDirectory = path.join(output, `feedback-${Date.now()}`);
const env = { ...process.env, DEGREEBEE_TEST_DATA: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const args = [".", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const title = "Feedback improvements regression";
const errors = [];
let app, page,member;

async function launch() {
  app = await electron.launch({ args, env });
  page = await app.firstWindow();
  await page.waitForFunction(()=>!!window.degreebee);
  if(!(await page.evaluate(()=>window.degreebee.state())).account.user)await signInMember(page,member);
  await page.getByRole('button', {name:'Reports',exact:true}).click();
  await page.getByRole('button', {name:'Monitoring',exact:true}).click();
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("heading", { name: "Time to focus." }).waitFor();
}
async function state() {
  return page.evaluate(() => window.degreebee.state());
}
async function waitForState(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate(await state())) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for desktop session state');
}
async function stop() {
  if (!app) return;
  await app.evaluate(({ app, clipboard, ipcMain }) => {
    clearInterval(globalThis.__feedbackTimer);
    if (globalThis.__feedbackOriginalWriteText)
      clipboard.writeText = globalThis.__feedbackOriginalWriteText;
    if (globalThis.__feedbackObservationHandler) {
      ipcMain.removeAllListeners("focus:observation");
      ipcMain.on("focus:observation", globalThis.__feedbackObservationHandler);
    }
    app.exit(0);
  }).catch(() => {});
  app = null;
}

try {
  member=await createMember();await setMembership(member);
  await launch();
  await page.getByRole("button", { name: "Reading / notes", exact: true }).click();
  await waitForState(state => {
    const s = state.settings;
    return s.activity === "reading" && !s.checks.head;
  });
  await page.locator(".setup-details > summary").click();
  assert.equal(await page.getByRole("checkbox", { name: /^Head direction/ }).isChecked(), false);
  await page.getByRole("checkbox", { name: /^Eye checks/ }).uncheck();
  await page.getByLabel("Reminder sensitivity").selectOption("gentle");
  await page.getByRole("checkbox", { name: /^Notification sound/ }).uncheck();
  await page.getByRole("checkbox", { name: /^Open report after finishing/ }).uncheck();
  await page.getByLabel("Daily goal", { exact: true }).selectOption("30");
  const expectedSettings = {
    activity: "reading",
    checks: { face: true, eyes: false, head: false },
    sensitivity: "gentle", sound: false, showReport: false, dailyGoalMinutes: 30,
  };
  assert.deepEqual((await state()).settings, expectedSettings);
  assert.deepEqual(JSON.parse(await readFile(path.join(dataDirectory, "settings.json"), "utf8")), expectedSettings);
  await page.locator(".study-settings").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "feedback-settings.png"), fullPage: true });
  await stop();
  await launch();
  assert.deepEqual((await state()).settings, expectedSettings, "Preferences must survive app restart");

  await page.locator(".setup-details > summary").click();
  await page.getByRole("checkbox", { name: /^Face visibility/ }).uncheck();
  await page.locator("#session-name").fill(title);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await waitForState(state => state.active?.totalMs >= 1500);
  const timerOnly = (await state()).active;
  assert.deepEqual(timerOnly.settings.checks, { face: false, eyes: false, head: false });
  assert.equal(timerOnly.score, null);
  assert.equal(timerOnly.focusMs, 0);
  assert.ok(timerOnly.counts.unobserved >= 1500);
  assert.equal(await page.locator("video").evaluate(video => video.srcObject), null);
  for (const check of ["face", "eye", "head"])
    await page.locator(`[data-testid="indicator-${check}"][data-state="off"]`).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /^Face visibility/ }).isDisabled(), true);
  const rejection = await page.evaluate(async () => {
    try { await window.degreebee.settings({ sound: true }); return null; }
    catch (error) { return error.message; }
  });
  assert.match(rejection, /Pause the session/);
  assert.equal((await state()).settings.sound, false);
  await page.getByRole("region", { name: "Daily study goal" }).getByText("Your session time is adding up").waitFor();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = (await state()).active;
  await page.waitForTimeout(1100);
  assert.equal((await state()).active.totalMs, paused.totalMs, "Breaks must not count as active study time");
  await page.getByRole("checkbox", { name: /^Face visibility/ }).check();
  const adjusted = (await state()).active;
  assert.deepEqual(adjusted.settings.checks, { face: false, eyes: false, head: false });
  assert.deepEqual(adjusted.currentSettings.checks, { face: true, eyes: false, head: false });
  assert.equal(adjusted.configurationChanges.length, 1);
  assert.ok(Number.isFinite(Date.parse(adjusted.configurationChanges[0].at)));

  // Replace camera observations in the test process only. This exercises the
  // production trusted IPC handler without needing a person or physical camera.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const handler = ipcMain.listeners("focus:observation")[0];
    globalThis.__feedbackObservationHandler = handler;
    ipcMain.removeAllListeners("focus:observation");
    const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/");
    globalThis.__feedbackObservation = { facePresent: true, eyesOpen: false, eyesForward: false, headForward: false };
    globalThis.__feedbackTimer = setInterval(() => handler({ sender: main.webContents, senderFrame: main.webContents.mainFrame }, globalThis.__feedbackObservation), 100);
  });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByText("Camera active · local").waitFor({ timeout: 60000 });
  await page.locator('[data-testid="indicator-face"][data-state="good"]').waitFor();
  for (const check of ["eye", "head"])
    await page.locator(`[data-testid="indicator-${check}"][data-state="off"]`).waitFor();
  assert.equal((await state()).active.currentState, "focused", "Disabled eye and head measurements must not distract");
  assert.deepEqual((await state()).active.alerts, []);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").minimize();
    globalThis.__feedbackObservation = { facePresent: false, eyesOpen: null, eyesForward: null, headForward: null };
  });
  await waitForState(state => state.active.alerts.some(event => event.issue === "no_face"));
  let popup;
  const popupDeadline = Date.now() + 10000;
  while (!popup && Date.now() < popupDeadline) {
    popup = app.windows().find(window => window.url().endsWith("/alert.html"));
    if (!popup) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(popup, "Face reminders must open a separate desktop window");
  await popup.getByRole("heading", { name: "Face not visible" }).waitFor();
  await popup.waitForTimeout(1500);
  const audio = await popup.locator("#alert-sound").evaluate(element => ({ paused: element.paused, currentTime: element.currentTime, error: element.error?.message ?? null }));
  assert.deepEqual(audio, { paused: true, currentTime: 0, error: null }, "Sound off must prevent chime playback");
  const desktop = await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/");
    const popup = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith("/alert.html"));
    return { minimized: main.isMinimized(), visible: popup.isVisible(), onTop: popup.isAlwaysOnTop(), focusable: popup.isFocusable() };
  });
  assert.deepEqual(desktop, { minimized: true, visible: true, onTop: true, focusable: false });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").restore());
  await page.getByRole("button", { name: "Finish & save", exact: true }).click();
  const notice = page.getByRole("status").filter({ hasText: "Session report saved on this device." });
  await notice.waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Report details" }).count(), 0, "Report auto-open preference must be respected");
  await notice.getByRole("button", { name: "View report", exact: true }).waitFor();
  const layout = await notice.evaluate(element => {
    const outer = element.getBoundingClientRect();
    const text = element.querySelector("span").getBoundingClientRect();
    const view = element.querySelector(".notice-link").getBoundingClientRect();
    const close = element.querySelector('[aria-label="Dismiss message"]').getBoundingClientRect();
    return { within: close.right <= outer.right && close.bottom <= outer.bottom && close.top >= outer.top, aligned: Math.abs((text.top + text.bottom) / 2 - (close.top + close.bottom) / 2) <= 4, separated: text.right <= view.left && view.right <= close.left };
  });
  assert.deepEqual(layout, { within: true, aligned: true, separated: true }, "Saved notice text and dismissal button must align without overlap");
  await notice.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "feedback-notice.png"), fullPage: true });

  const history = await page.evaluate(() => window.degreebee.history());
  const report = history.sessions.find(session => session.id === timerOnly.id);
  assert.equal(report.status, "completed");
  assert.equal(report.settings.checks.face, false);
  assert.equal(report.currentSettings.checks.face, true);
  assert.equal(report.configurationChanges.length, 1);
  assert.ok(report.counts.paused >= 1000);
  assert.ok(report.alerts.length > 0 && report.alerts.every(event => event.issue === "no_face"));
  const persisted = JSON.parse(await readFile(path.join((await state()).folder, `${report.id}.json`), "utf8"));
  assert.deepEqual(persisted.configurationChanges, report.configurationChanges);
  const goal = page.getByRole("region", { name: "Daily study goal" });
  await goal.getByText(/1 completed session/).waitFor();
  assert.equal(await goal.getByRole("progressbar", { name: "Daily study progress" }).getAttribute("value"), String(Math.min(100, Math.floor(report.totalMs / (30 * 60000) * 100))));

  await notice.getByRole("button", { name: "View report", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "Report details" });
  await detail.waitFor();
  await detail.getByRole("heading", { name: title, exact: true }).waitFor();
  await detail.getByRole("button", { name: "Save PDF", exact: true }).waitFor();
  await detail.getByRole("button", { name: "Save progress image", exact: true }).waitFor();
  assert.equal(await detail.getByRole("button", {name: /CSV|JSON|Copy summary/}).count(), 0);
  await detail.screenshot({ path: path.join(output, "feedback-report.png") });
  await detail.getByRole("button", { name: "Done", exact: true }).click();
  assert.deepEqual(errors, [], `Renderer errors: ${errors.join(", ")}`);
  await stop();
  await launch();
  const restartedHistory = await page.evaluate(() => window.degreebee.history());
  assert.equal(restartedHistory.sessions.find(session => session.id === report.id).configurationChanges.length, 1);
  assert.deepEqual((await state()).settings, expectedSettings);
  console.log("PASS: activity/toggle UI, persisted local preferences, timer-only sessions, paused-only settings, face-only classification, quiet desktop popup while minimized, report context/history, optional report opening, aligned saved notice, PDF/image export controls, and daily study progress. User clipboard unchanged.");
} catch (error) {
  console.error(error);
  if (page) await page.screenshot({ path: path.join(output, "feedback-failure.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await stop();
  await removeMember(member);
}

