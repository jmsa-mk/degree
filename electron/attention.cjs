const { normalizeSettings } = require("./preferences.cjs");
const KEYS = ["facePresent", "eyesOpen", "eyesForward", "headForward"];
const HOLD_MS = {
  facePresent: 700,
  eyesOpen: 650,
  eyesForward: 900,
  headForward: 900,
};
const TEXT = {
  no_face: {
    title: "Face not visible",
    body: "Move back into the camera frame so focus monitoring can see your face.",
  },
  eyes_closed: {
    title: "Eyes closed",
    body: "Your eyes appear closed. Open your eyes or pause your session for a break.",
  },
  head_turned: {
    title: "Head turned away",
    body: "Your head is turned away from your forward position.",
  },
  gaze_away: {
    title: "Eyes looking away",
    body: "Your eyes appear to be looking away from the screen.",
  },
};
class AttentionTracker {
  constructor(settings) {
    this.configure(settings);
  }
  configure(settings) {
    this.settings = normalizeSettings(settings);
    this.reset();
  }
  reset() {
    this.samples = {};
    this.lastAt = null;
  }
  update(input, now = Date.now()) {
    if (!input || typeof input !== "object") return null;
    if (
      !KEYS.every(
        (key) => input[key] === null || typeof input[key] === "boolean",
      )
    )
      return null;
    if (this.lastAt != null && now - this.lastAt > 2500) this.reset();
    this.lastAt = now;
    const measured = {};
    const enabled = {
      facePresent: this.settings.checks.face,
      eyesOpen: this.settings.checks.eyes,
      eyesForward:
        this.settings.checks.eyes && this.settings.activity === "screen",
      headForward: this.settings.checks.head,
    };
    for (const key of KEYS) {
      const value =
        key !== "facePresent" && (input.facePresent !== true || !enabled[key])
          ? null
          : input[key];
      let sample = this.samples[key];
      if (!sample)
        sample = this.samples[key] = {
          candidate: value,
          since: now,
          confirmed: null,
        };
      if (sample.candidate !== value) {
        sample.candidate = value;
        sample.since = now;
      }
      const hold = value
        ? 200
        : this.settings.sensitivity === "gentle"
          ? 2000
          : HOLD_MS[key];
      if (value === null) sample.confirmed = null;
      else if (now - sample.since >= hold)
        sample.confirmed = value;
      measured[key] = sample.confirmed;
    }
    const checks = Object.fromEntries(
      KEYS.map((key) => [key, enabled[key] ? measured[key] : null]),
    );
    const issues = [];
    if (checks.facePresent === false) issues.push("no_face");
    else if (measured.facePresent === true) {
      if (checks.eyesOpen === false) issues.push("eyes_closed");
      if (checks.headForward === false) issues.push("head_turned");
      if (checks.eyesOpen === true && checks.eyesForward === false)
        issues.push("gaze_away");
    }
    const focused =
      Object.values(enabled).some(Boolean) &&
      measured.facePresent === true &&
      KEYS.every((key) => !enabled[key] || checks[key] === true);
    const signal = issues.includes("no_face")
      ? "no_face"
      : issues.includes("eyes_closed")
        ? "eyes_closed"
        : issues.length
          ? "looking_away"
          : focused
            ? "focused"
            : "unobserved";
    return { signal, checks, issues };
  }
}
class AttentionAlerts {
  constructor() {
    this.lastSent = new Map();
    this.previous = new Set();
  }
  resetEpisode() {
    // A break starts a new episode, while the existing per-condition cooldown
    // still prevents rapid pause/resume from replaying the same sound.
    this.previous.clear();
  }
  update(issues, now = Date.now()) {
    const events = [];
    for (const issue of issues) {
      const last = this.lastSent.get(issue);
      if (
        TEXT[issue] &&
        ((!this.previous.has(issue) && (last == null || now - last >= 10000)) ||
          (last != null && now - last >= 30000))
      ) {
        this.lastSent.set(issue, now);
        events.push({ issue, ...TEXT[issue], at: new Date(now).toISOString() });
      }
    }
    this.previous = new Set(issues);
    return events;
  }
}
module.exports = { AttentionTracker, AttentionAlerts };
