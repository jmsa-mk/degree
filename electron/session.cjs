const { randomUUID } = require("node:crypto");
const { normalizeSettings } = require("./preferences.cjs");

const SIGNALS = [
  "focused",
  "no_face",
  "eyes_closed",
  "looking_away",
  "unobserved",
];

class FocusSession {
  constructor(title, now = Date.now(), settings) {
    this.data = {
      schema: 1,
      id: randomUUID(),
      title:
        String(title || "Study session")
          .trim()
          .slice(0, 120) || "Study session",
      startedAt: new Date(now).toISOString(),
      endedAt: null,
      updatedAt: new Date(now).toISOString(),
      status: "running",
      endReason: null,
      counts: Object.fromEntries([...SIGNALS, "paused"].map((s) => [s, 0])),
      timeline: [],
      alerts: [],
      settings: normalizeSettings(settings),
      currentSettings: normalizeSettings(settings),
      configurationChanges: [],
    };
    this.lastTick = now;
    this.lastSignalAt = 0;
    this.raw = "unobserved";
    this.checks = null;
    this.issues = [];
    this.state = "unobserved";
  }

  signal(value, now = Date.now()) {
    if (!SIGNALS.includes(value) || this.data.status !== "running") return;
    this.tick(now);
    this.raw = value;
    this.lastSignalAt = now;
  }

  tick(now = Date.now()) {
    if (this.data.status === "completed" || this.data.status === "interrupted")
      return;
    const elapsed = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    let state;
    if (this.data.status === "paused") state = "paused";
    // A delayed timer or stale camera must never invent focused time.
    else if (
      elapsed > 2500 ||
      now - this.lastSignalAt > 2500 ||
      this.raw === "unobserved"
    )
      state = "unobserved";
    // Temporal filtering happens independently for each check in AttentionTracker.
    else state = this.raw;
    this.state = state;
    this.data.counts[state] += elapsed;
    if (elapsed > 0) {
      const previous = this.data.timeline.at(-1);
      if (previous?.state === state) previous.durationMs += elapsed;
      else
        this.data.timeline.push({
          state,
          startedAt: new Date(now - elapsed).toISOString(),
          durationMs: elapsed,
        });
    }
    this.data.updatedAt = new Date(now).toISOString();
  }

  pause(now = Date.now()) {
    if (this.data.status !== "running") return;
    this.tick(now);
    this.data.status = "paused";
    this.state = "paused";
  }

  resume(now = Date.now()) {
    if (this.data.status !== "paused") return;
    this.tick(now);
    this.data.status = "running";
    this.raw = "unobserved";
    this.lastSignalAt = 0;
    this.state = "unobserved";
  }

  configure(settings, now = Date.now()) {
    if (this.data.status !== "paused")
      throw new Error("Pause the session before changing monitoring settings.");
    const next = normalizeSettings(settings);
    if (JSON.stringify(next) === JSON.stringify(this.data.currentSettings)) return;
    this.tick(now);
    this.data.currentSettings = next;
    this.data.configurationChanges.push({
      at: new Date(now).toISOString(),
      settings: structuredClone(next),
    });
    this.raw = "unobserved";
    this.lastSignalAt = 0;
    this.checks = null;
    this.issues = [];
  }

  finish(reason = "finished", now = Date.now()) {
    this.tick(now);
    this.data.status = reason === "recovered" ? "interrupted" : "completed";
    this.data.endReason = reason;
    this.data.endedAt = new Date(now).toISOString();
    return this.snapshot();
  }

  snapshot() {
    const fresh =
      this.data.status === "running" &&
      this.lastTick - this.lastSignalAt <= 2500;
    return summarize({
      ...this.data,
      currentState: this.state,
      checks: fresh ? this.checks : null,
      issues: fresh ? this.issues : [],
    });
  }
}

function summarize(data) {
  const counts = data.counts;
  const focusMs = counts.focused;
  const distractedMs =
    counts.no_face + counts.eyes_closed + counts.looking_away;
  const observedMs = focusMs + distractedMs;
  const totalMs = observedMs + counts.unobserved;
  return structuredClone({
    ...data,
    focusMs,
    distractedMs,
    observedMs,
    totalMs,
    score: observedMs ? Math.round((focusMs / observedMs) * 100) : null,
    coverage: totalMs ? Math.round((observedMs / totalMs) * 100) : 0,
  });
}

module.exports = { FocusSession, summarize, SIGNALS };
