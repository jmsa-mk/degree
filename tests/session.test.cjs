const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { FocusSession } = require("../electron/session.cjs");
const { SessionStore, toCsv } = require("../electron/store.cjs");
const { AttentionTracker } = require("../electron/attention.cjs");

function feed(session, signal, start, end) {
  for (let at = start; at <= end; at += 100) session.signal(signal, at);
  session.tick(end);
}

test("camera loading and stale or missing frames are never scored as focus", () => {
  const session = new FocusSession("Test", 10000);
  session.tick(11000);
  assert.equal(session.snapshot().score, null);
  assert.equal(session.snapshot().counts.unobserved, 1000);
  feed(session, "focused", 11000, 13000);
  session.tick(18000);
  const report = session.snapshot();
  assert.equal(report.counts.unobserved, 6000);
  assert.equal(report.focusMs, 2000);
  assert.equal(report.coverage, 25);
});

test("short blinks are tolerated but sustained closure becomes distraction", () => {
  const session = new FocusSession("Test", 10000);
  const tracker = new AttentionTracker();
  const observe = (open, start, end) => {
    for (let now = start; now <= end; now += 100)
      session.signal(
        tracker.update(
          {
            facePresent: true,
            eyesOpen: open,
            eyesForward: open,
            headForward: true,
          },
          now,
        ).signal,
        now,
      );
  };
  observe(true, 10000, 11000);
  observe(false, 11100, 11400);
  observe(true, 11500, 12500);
  assert.equal(session.snapshot().distractedMs, 0);
  observe(false, 12600, 18000);
  assert.ok(session.snapshot().counts.eyes_closed >= 2300);
  assert.equal(session.snapshot().counts.no_face, 0);
});

test("an empty camera at startup never earns focus during the grace period", () => {
  const session = new FocusSession("Empty room", 10000);
  const tracker = new AttentionTracker();
  for (let now = 10000; now <= 15000; now += 100)
    session.signal(
      tracker.update(
        {
          facePresent: false,
          eyesOpen: null,
          eyesForward: null,
          headForward: null,
        },
        now,
      ).signal,
      now,
    );
  const report = session.snapshot();
  assert.equal(report.focusMs, 0);
  assert.equal(report.score, 0);
  assert.ok(report.counts.unobserved >= 700);
  assert.ok(report.counts.no_face >= 2000);
});

test("deleting a session removes its checkpoint and recovery copies without touching other reports", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "degreebee-delete-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SessionStore(directory),
    session = new FocusSession("Delete me"),
    kept = new FocusSession("Keep me");
  store.save(session.snapshot());
  store.save(session.snapshot());
  store.save(kept.finish());
  fs.writeFileSync(
    path.join(directory, session.data.id + ".json.tmp"),
    JSON.stringify(session.snapshot()),
  );
  store.remove(session.data.id);
  store.recover();
  assert.equal(store.list().sessions.length, 1);
  assert.equal(store.list().sessions[0].id, kept.data.id);
  assert.ok(
    fs
      .readdirSync(directory)
      .every((file) => !file.startsWith(session.data.id)),
  );
  assert.throws(() => store.remove("../outside"), /Invalid session ID/);
});

test("pause and sleep do not inflate focus and resume needs fresh camera data", () => {
  const session = new FocusSession("Test", 10000);
  feed(session, "focused", 10000, 11000);
  session.pause(11000);
  session.tick(311000);
  session.resume(311000);
  session.tick(312000);
  const report = session.finish("finished", 312000);
  assert.equal(report.counts.paused, 300000);
  assert.equal(report.focusMs, 1000);
  assert.equal(report.counts.unobserved, 1000);
  assert.equal(report.score, 100);
  assert.equal(report.coverage, 50);
});

test("timeline and buckets account for the same time with a bounded score", () => {
  const session = new FocusSession("Test", 10000);
  feed(session, "focused", 10000, 16000);
  feed(session, "no_face", 16100, 26000);
  feed(session, "looking_away", 26100, 32000);
  session.pause(32000);
  session.resume(34000);
  feed(session, "focused", 34000, 36000);
  const report = session.finish("finished", 36000);
  assert.equal(
    Object.values(report.counts).reduce((a, b) => a + b, 0),
    26000,
  );
  assert.equal(
    report.timeline.reduce((sum, item) => sum + item.durationMs, 0),
    26000,
  );
  assert.equal(report.totalMs + report.counts.paused, 26000);
  assert.ok(report.score >= 0 && report.score <= 100);
  session.tick(50000);
  assert.equal(session.snapshot().totalMs, report.totalMs);
});

test("saved reports survive restart and recover at checkpoint without adding downtime", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "degreebee-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SessionStore(directory);
  const session = new FocusSession("Belajar Laravel", 10000);
  feed(session, "focused", 10000, 12000);
  store.save(session.snapshot());
  const reopened = new SessionStore(directory);
  reopened.recover();
  const report = reopened.list().sessions[0];
  assert.equal(report.status, "interrupted");
  assert.equal(report.endedAt, new Date(12000).toISOString());
  assert.equal(report.focusMs, 2000);
  assert.equal(reopened.list().sessions.length, 1);
});

test("damaged report falls back to backup and never silently replaces it", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "degreebee-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SessionStore(directory);
  const session = new FocusSession("Test", 10000);
  store.save(session.snapshot());
  feed(session, "focused", 10000, 12000);
  store.save(session.snapshot());
  const file = path.join(directory, `${session.data.id}.json`);
  fs.writeFileSync(file, "{broken");
  const result = store.list();
  assert.equal(result.sessions.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
});

test("CSV escapes quotes, line breaks, and spreadsheet formula prefixes", () => {
  const session = new FocusSession('=SUM(1,2) "quoted"\nname', 10000);
  const csv = toCsv([session.finish("finished", 11000)]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"\'=SUM(1,2) ""quoted""\nname"'));
  assert.ok(csv.includes("Unobserved (seconds)"));
});

test("invalid signal cannot add an arbitrary count bucket", () => {
  const session = new FocusSession("Test", 10000);
  session.signal("__proto__", 11000);
  assert.equal(session.raw, "unobserved");
  assert.equal(session.snapshot().counts.focused, 0);
});
