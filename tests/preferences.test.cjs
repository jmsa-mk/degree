const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DEFAULT_SETTINGS, PreferenceStore, normalizeSettings, applySettingsPatch } = require("../electron/preferences.cjs");
const { AttentionTracker, AttentionAlerts } = require("../electron/attention.cjs");
const { FocusSession } = require("../electron/session.cjs");

const FORWARD = { facePresent: true, eyesOpen: true, eyesForward: true, headForward: true };
const MISSING = { facePresent: false, eyesOpen: null, eyesForward: null, headForward: null };
function settle(tracker, input, start = 10000, duration = 2200) {
  let result;
  for (let now = start; now <= start + duration; now += 100) result = tracker.update(input, now);
  return result;
}
function directory(t) {
  const location = fs.mkdtempSync(path.join(os.tmpdir(), "degreebee-settings-"));
  t.after(() => fs.rmSync(location, { recursive: true, force: true }));
  return location;
}
test("local settings persist, merge individual checks, and return detached snapshots", (t) => {
  const location = directory(t), store = new PreferenceStore(location);
  assert.deepEqual(store.snapshot(), DEFAULT_SETTINGS);
  store.patch({ checks: { eyes: false }, sound: false, dailyGoalMinutes: 90 });
  const copy = store.snapshot();
  copy.checks.face = false;
  const restored = new PreferenceStore(location).snapshot();
  assert.deepEqual(restored.checks, { face: true, eyes: false, head: true });
  assert.equal(restored.sound, false);
  assert.equal(restored.dailyGoalMinutes, 90);
  assert.equal(fs.existsSync(path.join(location, "settings.json.tmp")), false);
});
test("invalid settings do not change stored preferences", (t) => {
  const store = new PreferenceStore(directory(t));
  store.patch({ showReport: false });
  const before = fs.readFileSync(store.file, "utf8");
  for (const patch of [null, [], { checks: null }, { checks: { face: "false" } }, { checks: { gaze: true } }, { activity: "game" }, { sensitivity: "instant" }, { sound: 1 }, { showReport: "yes" }, { dailyGoalMinutes: 0 }, { unknown: true }, JSON.parse('{"__proto__":{}}')])
    assert.throws(() => store.patch(patch));
  assert.equal(fs.readFileSync(store.file, "utf8"), before);
  assert.equal(store.snapshot().showReport, false);
});
test("unreadable settings use safe defaults without overwriting the source", (t) => {
  const location = directory(t), file = path.join(location, "settings.json");
  fs.writeFileSync(file, "{broken");
  const store = new PreferenceStore(location);
  assert.deepEqual(store.snapshot(), DEFAULT_SETTINGS);
  assert.match(store.warning, /Default settings/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
  store.patch({ sound: false });
  assert.equal(store.warning, null);
  assert.equal(new PreferenceStore(location).snapshot().sound, false);
});
test("activity presets change head checking while preserving face and eye choices", () => {
  let settings = normalizeSettings({ checks: { face: false, eyes: false } });
  settings = applySettingsPatch(settings, { activity: "reading" });
  assert.deepEqual(settings.checks, { face: false, eyes: false, head: false });
  settings = applySettingsPatch(settings, { checks: { head: true } });
  assert.equal(settings.checks.head, true);
  settings = applySettingsPatch(settings, { activity: "screen" });
  assert.deepEqual(settings.checks, { face: false, eyes: false, head: true });
});
test("all disabled checks produce no alerts and cannot earn a focus score", () => {
  const settings = normalizeSettings({ checks: { face: false, eyes: false, head: false } });
  const tracker = new AttentionTracker(settings), session = new FocusSession("Timer only", 10000, settings);
  for (let now = 10000; now <= 15000; now += 100) {
    const result = tracker.update(FORWARD, now);
    assert.equal(result.signal, "unobserved");
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.checks, { facePresent: null, eyesOpen: null, eyesForward: null, headForward: null });
    session.signal(result.signal, now);
  }
  assert.equal(session.snapshot().score, null);
  assert.equal(session.snapshot().focusMs, 0);
  assert.deepEqual(settle(tracker, MISSING, 15100).issues, []);
});
test("disabled eye or head checks neither distract nor alert", () => {
  const eyesOff = new AttentionTracker({ checks: { eyes: false } });
  const eyeResult = settle(eyesOff, { ...FORWARD, eyesOpen: false, eyesForward: false });
  assert.equal(eyeResult.signal, "focused");
  assert.equal(eyeResult.checks.eyesOpen, null);
  assert.equal(eyeResult.checks.eyesForward, null);
  assert.deepEqual(eyeResult.issues, []);
  const headOff = new AttentionTracker({ checks: { head: false } });
  const headResult = settle(headOff, { ...FORWARD, headForward: false });
  assert.equal(headResult.signal, "focused");
  assert.equal(headResult.checks.headForward, null);
  assert.deepEqual(headResult.issues, []);
});
test("disabled face alert still requires a visible face to observe eyes and head", () => {
  const tracker = new AttentionTracker({ checks: { face: false } });
  assert.equal(settle(tracker, FORWARD).signal, "focused");
  const missing = settle(tracker, MISSING, 12300);
  assert.equal(missing.signal, "unobserved");
  assert.deepEqual(missing.issues, []);
  assert.equal(missing.checks.facePresent, null);
  assert.equal(missing.checks.eyesOpen, null);
  const unknown = settle(tracker, { ...FORWARD, facePresent: null }, 14600);
  assert.equal(unknown.signal, "unobserved");
  assert.deepEqual(unknown.issues, []);
  assert.equal(settle(tracker, { ...FORWARD, eyesOpen: false }, 16900).signal, "eyes_closed");
});
test("face-only monitoring can focus without unavailable eye or head measurements", () => {
  const tracker = new AttentionTracker({ checks: { eyes: false, head: false } });
  assert.equal(settle(tracker, { ...MISSING, facePresent: true }).signal, "focused");
  const missing = settle(tracker, MISSING, 12300);
  assert.equal(missing.signal, "no_face");
  assert.deepEqual(missing.issues, ["no_face"]);
});
test("reading ignores gaze and starts with head checking off, while still detecting closed eyes", () => {
  const tracker = new AttentionTracker({ activity: "reading" });
  const reading = { ...FORWARD, eyesForward: false, headForward: false };
  const result = settle(tracker, reading);
  assert.equal(result.signal, "focused");
  assert.equal(result.checks.eyesForward, null);
  assert.equal(result.checks.headForward, null);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(settle(tracker, { ...reading, eyesOpen: false }, 12300).issues, ["eyes_closed"]);
});
test("gentle sensitivity tolerates brief changes but confirms two seconds of distraction", () => {
  const tracker = new AttentionTracker({ sensitivity: "gentle" });
  settle(tracker, FORWARD, 10000, 300);
  const turned = { ...FORWARD, headForward: false };
  assert.equal(settle(tracker, turned, 10400, 1900).signal, "focused");
  assert.deepEqual(tracker.update(turned, 12400).issues, ["head_turned"]);
});
test("changing tracker configuration discards confirmation from previous settings", () => {
  const tracker = new AttentionTracker();
  assert.equal(settle(tracker, FORWARD).signal, "focused");
  tracker.configure({ checks: { eyes: false } });
  assert.equal(tracker.update(FORWARD, 12300).signal, "unobserved");
  assert.equal(tracker.update(FORWARD, 12500).signal, "focused");
});
test("session configuration changes are paused-only and retain the initial report context", () => {
  const initial = normalizeSettings(), next = applySettingsPatch(initial, { activity: "reading" });
  const session = new FocusSession("Reading", 10000, initial);
  assert.throws(() => session.configure(next, 10100), /Pause the session/);
  session.pause(10200);
  session.configure(next, 10300);
  next.checks.face = false;
  const report = session.snapshot();
  assert.deepEqual(report.settings, initial);
  assert.equal(report.currentSettings.activity, "reading");
  assert.equal(report.currentSettings.checks.face, true);
  assert.deepEqual(report.configurationChanges, [{ at: new Date(10300).toISOString(), settings: report.currentSettings }]);
  session.resume(10400);
  assert.equal(session.snapshot().currentState, "unobserved");
});
test("resuming creates a new alert episode while retaining the per-issue cooldown", () => {
  const alerts = new AttentionAlerts();
  assert.equal(alerts.update(["eyes_closed"], 10000).length, 1);
  alerts.resetEpisode();
  assert.equal(alerts.update(["eyes_closed"], 15000).length, 0);
  alerts.resetEpisode();
  assert.equal(alerts.update(["eyes_closed"], 21000).length, 1);
});
