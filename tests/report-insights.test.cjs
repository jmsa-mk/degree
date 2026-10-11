const { test } = require("node:test");
const assert = require("node:assert/strict");
const helpers = import("../src/report-insights.mjs");
const minute = 60_000;
const iso = (value) => new Date(value).toISOString();
const entry = (state, at, minutes) => ({ state, startedAt: iso(at), durationMs: minutes * minute });
const screen = { activity: "screen", checks: { face: true, eyes: true, head: true }, sensitivity: "balanced" };
const timer = { ...screen, checks: { face: false, eyes: false, head: false } };
function report(overrides = {}) {
  const start = new Date(2026, 9, 4, 9).getTime();
  return {
    id: "session-1", title: "Write an essay", status: "completed",
    startedAt: iso(start), endedAt: iso(start + 30 * minute),
    settings: screen,
    timeline: [entry("focused", start, 20), entry("looking_away", start + 20 * minute, 5), entry("paused", start + 25 * minute, 5)],
    counts: { focused: 20 * minute, looking_away: 5 * minute, paused: 5 * minute },
    totalMs: 25 * minute, focusMs: 20 * minute, coverage: 100,
    ...overrides,
  };
}

test("a report suggests an actionable adjustment without claiming mental concentration", async () => {
  const { summarizeReport } = await helpers;
  const result = summarizeReport(report({ alerts: [{ issue: "head_turned" }, { issue: "gaze_away" }] }));
  assert.equal(result.longestFocusMs, 20 * minute);
  assert.equal(result.alertCount, 2);
  assert.match(result.headline, /20 minutes matched enabled checks/);
  assert.match(result.detail, /not mental concentration/);
  assert.match(result.nextStep, /Reading mode/);
});

test("low coverage prioritizes camera setup even when the observed score was perfect", async () => {
  const { summarizeReport } = await helpers;
  const result = summarizeReport(report({ coverage: 15, score: 100, focusMs: 3 * minute }));
  assert.match(result.headline, /limited camera coverage/);
  assert.match(result.nextStep, /camera and lighting/);
  assert.doesNotMatch(result.headline, /100|perfect|excellent/i);
});

test("older reports without settings or alerts remain readable", async () => {
  const { summarizeReport, reportText } = await helpers;
  const legacy = report({ settings: undefined, alerts: undefined, coverage: undefined });
  assert.equal(summarizeReport(legacy).alertCount, 0);
  assert.match(summarizeReport(legacy).nextStep, /Reading mode/);
  assert.match(reportText(legacy), /older report did not save its setup/);
  assert.doesNotMatch(reportText(legacy), /undefined|NaN|÷|Score =/);
  assert.equal(summarizeReport(null).longestFocusMs, 0);
});

test("timer-only reports describe session time and never award a camera streak", async () => {
  const { summarizeReport, reportText } = await helpers;
  const result = summarizeReport(report({ settings: timer, coverage: 0 }));
  assert.equal(result.modeLabel, "Timer only");
  assert.equal(result.longestFocusMs, 0);
  assert.match(result.detail, /session time only/);
  assert.doesNotMatch(result.headline, /limited camera|matched enabled/);
  assert.match(reportText(report({ settings: timer })), /none \(timer only\)/);
});

test("settings changes are disclosed and break matching-check streaks", async () => {
  const { summarizeReport, reportText } = await helpers;
  const initial = report();
  const changed = { activity: "reading", checks: { face: true, eyes: false, head: false }, sensitivity: "gentle" };
  const mixed = { ...initial, configurationChanges: [{ at: iso(Date.parse(initial.startedAt) + 10 * minute), settings: changed }] };
  const result = summarizeReport(mixed);
  assert.equal(result.longestFocusMs, 10 * minute);
  assert.match(result.modeLabel, /settings changed/);
  assert.match(result.headline, /updated monitoring settings/);
  const text = reportText(mixed);
  assert.match(text, /Setup changed at/);
  assert.match(text, /Reading; enabled checks: Face visibility; sensitivity: gentle/);
  assert.match(text, /each period used its own enabled checks/);
});

test("changing notification preferences does not break a monitoring streak", async () => {
  const { summarizeReport } = await helpers;
  const initial = report();
  const result = summarizeReport({
    ...initial,
    configurationChanges: [{ at: iso(Date.parse(initial.startedAt) + 10 * minute), settings: { ...screen, sound: false } }],
  });
  assert.equal(result.longestFocusMs, 20 * minute);
  assert.equal(result.modeLabel, "Screen work");
});

test("daily time clips intervals at local midnight and excludes pauses", async () => {
  const { dailyProgress } = await helpers;
  const midnight = new Date(2026, 9, 4, 0).getTime();
  const crossDay = report({
    startedAt: iso(midnight - 20 * minute), endedAt: iso(midnight + 40 * minute),
    timeline: [entry("focused", midnight - 20 * minute, 30), entry("paused", midnight + 10 * minute, 10), entry("unobserved", midnight + 20 * minute, 20)],
  });
  const result = dailyProgress([crossDay], null, 60, midnight + 60 * minute);
  assert.equal(result.activeMs, 30 * minute);
  assert.equal(result.percent, 50);
  assert.equal(result.completedSessions, 1);
  assert.equal(result.goalReached, false);
});

test("the active snapshot replaces history and overlapping intervals count once", async () => {
  const { dailyProgress } = await helpers;
  const saved = report({ status: "running", endedAt: null });
  const start = Date.parse(saved.startedAt);
  const live = { ...saved, timeline: [entry("unobserved", start, 40)], totalMs: 40 * minute };
  const duplicate = { ...report(), id: "overlapping-copy", timeline: [entry("focused", start + 10 * minute, 10)] };
  const result = dailyProgress([saved, saved, duplicate], live, 60, start + 40 * minute);
  assert.equal(result.activeMs, 40 * minute);
  assert.equal(result.completedSessions, 1);
});

test("daily goals count timer-only unobserved time and stop at the saved timestamp", async () => {
  const { dailyProgress } = await helpers;
  const saved = report({ settings: timer, timeline: [], counts: { unobserved: 30 * minute }, totalMs: 30 * minute });
  const start = Date.parse(saved.startedAt);
  saved.timeline = [entry("unobserved", start, 30)];
  const result = dailyProgress([saved], null, 25, start + 3 * 60 * minute);
  assert.equal(result.activeMs, 30 * minute);
  assert.equal(result.percent, 100);
  assert.equal(result.goalReached, true);
  assert.match(result.milestone, /session-time goal reached/);
});

test("mixed activity sessions count time without comparing camera scores", async () => {
  const { dailyProgress } = await helpers;
  const first = report({ score: 5 });
  const nextStart = Date.parse(first.endedAt);
  const reading = report({
    id: "reading", settings: { activity: "reading", checks: { face: true, eyes: false, head: false } },
    startedAt: iso(nextStart), endedAt: iso(nextStart + 15 * minute),
    timeline: [entry("focused", nextStart, 15)], score: 100,
  });
  const result = dailyProgress([first, reading], null, 40, nextStart + 15 * minute);
  assert.equal(result.activeMs, 40 * minute);
  assert.equal(result.completedSessions, 2);
  assert.equal(result.goalReached, true);
  assert.equal("score" in result, false);
});

test("unfinished, future and malformed records cannot fabricate daily time", async () => {
  const { dailyProgress } = await helpers;
  const now = new Date(2026, 9, 4, 12).getTime();
  const invalid = report({ timeline: [entry("focused", now + minute, 30), { state: "focused", startedAt: "invalid", durationMs: Infinity }], endedAt: iso(now + 31 * minute) });
  const result = dailyProgress([null, invalid], null, 25, now);
  assert.equal(result.activeMs, 0);
  assert.equal(result.completedSessions, 0);
  assert.equal(dailyProgress([], null, 0, now).goalReached, false);
});

test("share text names reminders and their limits without the removed score formula", async () => {
  const { reportText } = await helpers;
  const text = reportText(report({ alerts: [{ issue: "eyes_closed" }, { issue: "eyes_closed" }] }));
  assert.match(text, /Eyes appeared closed: 2/);
  assert.match(text, /repeated reminders for ongoing conditions/);
  assert.match(text, /glare on glasses/);
  assert.doesNotMatch(text, /Score =|focused time ÷|Simultaneous distractions/);
});
