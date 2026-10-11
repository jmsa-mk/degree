const MINUTE = 60_000;
const SIGNAL_STATES = ["focused", "no_face", "eyes_closed", "looking_away"];
const ISSUE_LABELS = {
  no_face: "Face not visible",
  eyes_closed: "Eyes appeared closed",
  head_turned: "Head turned away",
  gaze_away: "Eyes looking away",
};

const duration = (value) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const instant = (value) => {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const list = (value) => (Array.isArray(value) ? value : []);

function timeLabel(ms) {
  if (ms < 1000) return "0 seconds";
  if (ms < MINUTE) {
    const seconds = Math.floor(ms / 1000);
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.floor(ms / MINUTE);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function settingsOf(settings) {
  return {
    activity: settings?.activity === "reading" ? "reading" : "screen",
    checks: {
      face: settings?.checks?.face !== false,
      eyes: settings?.checks?.eyes !== false,
      head: settings?.checks?.head !== false,
    },
    sensitivity: settings?.sensitivity || "balanced",
  };
}

function configuration(report) {
  const initial = settingsOf(report.settings);
  const changes = list(report.configurationChanges).filter(
    (change) => change?.settings && typeof change.settings === "object",
  );
  const versions = [initial, ...changes.map((change) => settingsOf(change.settings))];
  const monitoringChanges = changes.filter(
    (_, index) => JSON.stringify(versions[index + 1]) !== JSON.stringify(versions[index]),
  );
  const changed = monitoringChanges.length > 0;
  const timerOnly = versions.every((settings) =>
    Object.values(settings.checks).every((enabled) => !enabled),
  );
  const label = timerOnly
    ? "Timer only"
    : initial.activity === "reading"
      ? "Reading"
      : "Screen work";
  return { initial, changes, monitoringChanges, changed, timerOnly, label };
}

function timelineOf(report) {
  return list(report.timeline)
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      state: entry.state,
      start: instant(entry.startedAt),
      ms: duration(entry.durationMs),
    }))
    .filter((entry) => entry.start !== null && entry.ms > 0)
    .map((entry) => ({ ...entry, end: entry.start + entry.ms }))
    .sort((left, right) => left.start - right.start);
}

function mergedIntervals(intervals) {
  const merged = [];
  for (const interval of intervals.sort((left, right) => left[0] - right[0])) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1])
      previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged;
}

function activeDuration(report) {
  if (Number.isFinite(report.totalMs)) return duration(report.totalMs);
  if (report.counts && typeof report.counts === "object")
    return Object.entries(report.counts).reduce(
      (sum, [state, ms]) => sum + (state === "paused" ? 0 : duration(ms)),
      0,
    );
  return mergedIntervals(
    timelineOf(report)
      .filter((entry) => entry.state !== "paused")
      .map((entry) => [entry.start, entry.end]),
  ).reduce((sum, [start, end]) => sum + end - start, 0);
}

function longestMatchingPeriod(report, config) {
  // Settings changes start a new period; differing checks must not earn one streak.
  const boundaries = config.monitoringChanges
    .map((change) => instant(change.at))
    .filter((value) => value !== null);
  const periods = mergedIntervals(
    timelineOf(report)
      .filter((entry) => entry.state === "focused")
      .map((entry) => [entry.start, entry.end]),
  );
  let longest = 0;
  for (const [start, end] of periods) {
    const points = [start, ...boundaries.filter((at) => at > start && at < end), end]
      .sort((left, right) => left - right);
    for (let index = 1; index < points.length; index++)
      longest = Math.max(longest, points[index] - points[index - 1]);
  }
  return config.timerOnly ? 0 : longest;
}

function reportFacts(report) {
  const config = configuration(report);
  const totalMs = activeDuration(report);
  const focusMs = Math.min(
    totalMs,
    duration(report.focusMs ?? report.counts?.focused),
  );
  const observedMs = SIGNAL_STATES.reduce(
    (sum, state) => sum + duration(report.counts?.[state]),
    0,
  );
  const rawCoverage = Number.isFinite(report.coverage)
    ? report.coverage
    : totalMs > 0
      ? (observedMs / totalMs) * 100
      : 0;
  const coverage = Math.round(Math.max(0, Math.min(100, rawCoverage)));
  const alerts = list(report.alerts).filter(
    (alert) => alert && typeof alert === "object" && ISSUE_LABELS[alert.issue],
  );
  return { config, totalMs, focusMs, coverage, alerts };
}

function suggestion(report, facts) {
  if (facts.totalMs === 0)
    return "Start a short session and pause whenever you take a break.";
  if (facts.config.timerOnly)
    return "Use your session time to plan your next work block. Enable camera checks only when they fit your activity.";
  if (facts.coverage < 60)
    return "Check your camera and lighting, then calibrate in a comfortable position. You can turn off checks that do not suit your activity.";
  const tally = new Map();
  for (const alert of facts.alerts)
    tally.set(alert.issue, (tally.get(alert.issue) || 0) + 1);
  let topIssue = [...tally].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!topIssue) {
    const buckets = ["no_face", "eyes_closed", "looking_away"]
      .map((state) => [state, duration(report.counts?.[state])])
      .sort((left, right) => right[1] - left[1]);
    if (buckets[0][1] > 0) topIssue = buckets[0][0];
  }
  if (topIssue === "no_face")
    return "Keep your face inside the camera frame and use Pause for breaks, including stepping away from your desk.";
  if (topIssue === "eyes_closed")
    return "Try even front lighting, reduce glare on glasses, and recalibrate with your eyes open. If reminders remain inaccurate, turn off the eye check.";
  if (["head_turned", "gaze_away", "looking_away"].includes(topIssue))
    return facts.config.initial.activity === "reading"
      ? "Adjust enabled checks to match your reading posture. Looking at a book or notes does not by itself mean you lost concentration."
      : "If you were reading a book or taking notes, try Reading mode or turn off eye and head checks. For screen work, recalibrate while facing the screen.";
  return "Choose one task for your next session and take a planned break when you need it.";
}

export function summarizeReport(report = {}) {
  report ||= {};
  const facts = reportFacts(report);
  const { config, totalMs, focusMs, coverage, alerts } = facts;
  const longestFocusMs = longestMatchingPeriod(report, config);
  let headline;
  if (!totalMs) headline = "No active session time recorded";
  else if (config.timerOnly) headline = `${timeLabel(totalMs)} of session time logged`;
  else if (coverage < 60)
    headline = `${timeLabel(totalMs)} logged with limited camera coverage`;
  else if (config.changed)
    headline = `${timeLabel(totalMs)} logged with updated monitoring settings`;
  else headline = `${timeLabel(totalMs)} logged; ${timeLabel(focusMs)} matched enabled checks`;

  const details = config.timerOnly
    ? ["Camera checks were off. This report records session time only."]
    : [
        `${coverage}% of active session time had usable camera signals.`,
        longestFocusMs > 0
          ? `Longest period matching enabled checks: ${timeLabel(longestFocusMs)}.`
          : "No continuous period matching enabled checks was recorded.",
        `${alerts.length} reminder${alerts.length === 1 ? " was" : "s were"} recorded.`,
      ];
  if (config.changed)
    details.push("Settings changed during this session; each period used its own enabled checks.");
  if (!config.timerOnly)
    details.push("Camera signals describe visible behaviour, not mental concentration.");
  return {
    headline,
    detail: details.join(" "),
    nextStep: suggestion(report, facts),
    longestFocusMs,
    alertCount: alerts.length,
    modeLabel: config.label + (config.changed ? " · settings changed" : ""),
  };
}

export function dailyProgress(reports = [], active = null, goalMinutes = 25, now = Date.now()) {
  const currentTime = instant(now) ?? Date.now();
  const today = new Date(currentTime);
  today.setHours(0, 0, 0, 0);
  const dayStart = today.getTime();
  const records = new Map();
  const revision = (report) =>
    instant(report.updatedAt) ?? instant(report.endedAt) ?? instant(report.startedAt) ?? 0;
  for (const [index, report] of list(reports).entries()) {
    if (!report || typeof report !== "object") continue;
    const key = report.id || `anonymous-${index}`;
    if (!records.has(key) || revision(report) >= revision(records.get(key)))
      records.set(key, report);
  }
  // The live snapshot is authoritative over its saved checkpoint.
  if (active && typeof active === "object") records.set(active.id || "active", active);
  const intervals = [];
  let completedSessions = 0;
  for (const report of records.values()) {
    const ended = instant(report.endedAt);
    if (report.status === "completed" && ended !== null && ended >= dayStart && ended <= currentTime)
      completedSessions++;
    const timeline = timelineOf(report);
    for (const entry of timeline) {
      if (entry.state === "paused") continue;
      const start = Math.max(dayStart, entry.start);
      const end = Math.min(currentTime, entry.end);
      if (end > start) intervals.push([start, end]);
    }
    // Old summaries without a timeline are safe to credit only when wholly in today.
    // Their pause placement is unknown, so never distribute them across midnight.
    if (!timeline.length) {
      const start = instant(report.startedAt);
      const end = ended ?? instant(report.updatedAt);
      if (start !== null && end !== null && start >= dayStart && end <= currentTime && end >= start) {
        const ms = Math.min(activeDuration(report), end - start);
        if (ms > 0) intervals.push([start, start + ms]);
      }
    }
  }
  // Union intervals also protects against duplicated or overlapping imported records.
  const activeMs = mergedIntervals(intervals).reduce((sum, [start, end]) => sum + end - start, 0);
  const goalMs = duration(goalMinutes) * MINUTE;
  const goalReached = goalMs > 0 && activeMs >= goalMs;
  const percent = goalMs > 0 ? Math.min(100, Math.floor((activeMs / goalMs) * 100)) : 0;
  const milestone = goalReached
    ? "Daily session-time goal reached"
    : goalMs === 0
      ? "Set a daily session-time goal"
      : activeMs === 0
        ? "Ready for your first session"
        : percent >= 50
          ? "Halfway to your daily session-time goal"
          : "Your session time is adding up";
  return { activeMs, goalMs, percent, completedSessions, goalReached, milestone };
}

function settingsLabel(settings) {
  const normalized = settingsOf(settings);
  const enabled = Object.entries(normalized.checks)
    .filter(([, value]) => value)
    .map(([key]) => ({ face: "Face visibility", eyes: "Eyes", head: "Head direction" })[key]);
  return `${normalized.activity === "reading" ? "Reading" : "Screen work"}; enabled checks: ${enabled.join(", ") || "none (timer only)"}; sensitivity: ${normalized.sensitivity}`;
}

export function reportText(report = {}) {
  report ||= {};
  const summary = summarizeReport(report);
  const facts = reportFacts(report);
  const timestamp = (value) => {
    const parsed = instant(value);
    return parsed === null
      ? "Not recorded"
      : new Date(parsed).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  };
  const lines = [
    "DegreeBee session summary",
    String(report.title || "Study session"),
    `Started: ${timestamp(report.startedAt)}`,
    `Status: ${report.status || "Not recorded"}`,
    `Session time: ${timeLabel(facts.totalMs)}`,
    `Paused time: ${timeLabel(duration(report.counts?.paused))}`,
    `Mode: ${summary.modeLabel}`,
    `Initial setup: ${settingsLabel(report.settings)}`,
  ];
  if (report.endedAt) lines.push(`Ended: ${timestamp(report.endedAt)}`);
  if (!report.settings)
    lines.push("This older report did not save its setup; standard checks are assumed.");
  for (const change of facts.config.changes)
    lines.push(`Setup changed at ${timestamp(change.at)}: ${settingsLabel(change.settings)}`);
  lines.push("", summary.headline, summary.detail, "", `Try next: ${summary.nextStep}`);
  if (facts.alerts.length) {
    const totals = new Map();
    for (const alert of facts.alerts)
      totals.set(alert.issue, (totals.get(alert.issue) || 0) + 1);
    lines.push("", "Recorded reminders:");
    for (const [issue, count] of totals) lines.push(`- ${ISSUE_LABELS[issue]}: ${count}`);
    lines.push("Reminder counts include repeated reminders for ongoing conditions.");
  }
  lines.push("", "Created from session data saved on this device.");
  return lines.join("\n");
}
