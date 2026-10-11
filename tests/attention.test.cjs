const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeFace, ForwardCalibration } = require("../src/face-analysis.mjs");
const {
  AttentionTracker,
  AttentionAlerts,
} = require("../electron/attention.cjs");

function face({
  ear = 0.3,
  blink = 0.05,
  yaw = 0,
  pitch = 0,
  gaze = 0.05,
  matrix = true,
  blends = true,
} = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const eye = (indices, x) => {
    const h = ear * 100,
      coords = [
        [x, 200],
        [x + 25, 200 - h / 2],
        [x + 75, 200 - h / 2],
        [x + 100, 200],
        [x + 75, 200 + h / 2],
        [x + 25, 200 + h / 2],
      ];
    indices.forEach((id, i) => {
      points[id] = { x: coords[i][0] / 640, y: coords[i][1] / 480, z: 0 };
    });
  };
  eye([33, 160, 158, 133, 153, 144], 100);
  eye([362, 385, 387, 263, 373, 380], 350);
  points[468] = { x: 150 / 640, y: 200 / 480, z: 0 };
  points[473] = { x: 400 / 640, y: 200 / 480, z: 0 };
  const y = (yaw * Math.PI) / 180,
    p = (pitch * Math.PI) / 180;
  const transform = [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    Math.sin(y) * Math.cos(p),
    -Math.sin(p),
    Math.cos(y) * Math.cos(p),
    0,
    0,
    0,
    0,
    1,
  ];
  const categories = [
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeLookInLeft",
    "eyeLookOutRight",
    "eyeLookOutLeft",
    "eyeLookInRight",
    "eyeLookUpLeft",
    "eyeLookUpRight",
    "eyeLookDownLeft",
    "eyeLookDownRight",
  ].map((name) => ({
    categoryName: name,
    score: name.includes("Blink") ? blink : gaze,
  }));
  return {
    faceLandmarks: [points],
    faceBlendshapes: blends ? [{ categories }] : [],
    facialTransformationMatrixes: matrix ? [{ data: transform }] : [],
  };
}
function settle(tracker, input, start = 10000, ms = 1200) {
  let out;
  for (let at = start; at <= start + ms; at += 100)
    out = tracker.update(input, at);
  return out;
}

test("open forward-facing face produces three healthy independent checks", () => {
  const raw = analyzeFace(face());
  assert.equal(raw.facePresent, true);
  assert.equal(raw.eyesOpen, true);
  assert.equal(raw.eyesForward, true);
  assert.equal(raw.headForward, true);
  assert.equal(settle(new AttentionTracker(), raw).signal, "focused");
});
test("eye geometry detects closure when model blink scores stay low", () => {
  const raw = analyzeFace(face({ ear: 0.1, blink: 0.1 }));
  assert.equal(raw.eyesOpen, false);
  assert.equal(raw.headForward, true);
  assert.ok(Math.abs(raw.metrics.ear - 0.1) < 0.00001);
  assert.equal(settle(new AttentionTracker(), raw).signal, "eyes_closed");
});
test("blink score detects closure independently of head pose availability", () => {
  const raw = analyzeFace(face({ blink: 0.7, matrix: false }));
  assert.equal(raw.eyesOpen, false);
  assert.equal(raw.headForward, null);
  assert.equal(settle(new AttentionTracker(), raw).signal, "eyes_closed");
});
test("head rotation is detected left, right, up, and down without requiring blendshapes", () => {
  for (const options of [
    { yaw: 28 },
    { yaw: -28 },
    { pitch: 28 },
    { pitch: -28 },
  ]) {
    const raw = analyzeFace(face({ ...options, blends: false }));
    assert.equal(raw.headForward, false);
    assert.equal(raw.eyesOpen, true);
    assert.equal(settle(new AttentionTracker(), raw).signal, "looking_away");
  }
});
test("eye gaze can be distracted even with a forward-facing head", () => {
  const raw = analyzeFace(face({ gaze: 0.7 }));
  assert.equal(raw.headForward, true);
  assert.equal(raw.eyesForward, false);
  assert.deepEqual(settle(new AttentionTracker(), raw).issues, ["gaze_away"]);
});
test("simultaneous eye closure and head turning are both reported", () => {
  const raw = analyzeFace(face({ ear: 0.1, yaw: 32 }));
  const out = settle(new AttentionTracker(), raw);
  assert.deepEqual(out.issues, ["eyes_closed", "head_turned"]);
  assert.equal(out.checks.facePresent, true);
});
test("changing head signals does not reset sustained eye-closure detection", () => {
  const tracker = new AttentionTracker();
  let out;
  for (let at = 10000; at <= 11400; at += 100)
    out = tracker.update(
      {
        facePresent: true,
        eyesOpen: false,
        eyesForward: false,
        headForward: at % 200 === 0,
      },
      at,
    );
  assert.ok(out.issues.includes("eyes_closed"));
});
test("short blinks stay focused, missing data stays unknown, and stale states reset", () => {
  const tracker = new AttentionTracker(),
    open = analyzeFace(face());
  settle(tracker, open);
  const blink = analyzeFace(face({ blink: 0.9 }));
  assert.equal(tracker.update(blink, 11300).signal, "focused");
  assert.equal(tracker.update(blink, 11500).signal, "focused");
  assert.equal(tracker.update(open, 11600).signal, "focused");
  assert.equal(tracker.update(open, 15000).signal, "unobserved");
  assert.equal(
    tracker.update(
      {
        facePresent: true,
        eyesOpen: null,
        eyesForward: null,
        headForward: null,
      },
      15100,
    ).signal,
    "unobserved",
  );
});
test("calibration learns open-eye baseline and forward head pose, rejects closed eyes", () => {
  const c = new ForwardCalibration();
  c.start(10000);
  let out;
  for (let now = 10000; now < 12000; now += 100)
    out = c.add(analyzeFace(face({ ear: 0.26, yaw: 10, pitch: 8 })), now);
  assert.ok(out.baseline);
  const calibrated = analyzeFace(
    face({ ear: 0.26, yaw: 10, pitch: 8 }),
    640,
    480,
    out.baseline,
  );
  assert.equal(calibrated.metrics.relativeYaw, 0);
  assert.equal(calibrated.headForward, true);
  assert.equal(
    analyzeFace(face({ ear: 0.13, yaw: 10, pitch: 8 }), 640, 480, out.baseline)
      .eyesOpen,
    false,
  );
  c.start(20000);
  for (let now = 20000; now <= 28000; now += 100)
    assert.equal(c.add(analyzeFace(face({ blink: 0.9 })), now), null);
  assert.ok(c.add(analyzeFace(face()), 28100).error);
});
test("alerts fire on each new condition, throttle repeat episodes, and remind after 30 seconds", () => {
  const alerts = new AttentionAlerts();
  assert.equal(alerts.update(["eyes_closed"], 10000)[0].title, "Eyes closed");
  assert.equal(
    alerts.update(["eyes_closed", "head_turned"], 11000)[0].title,
    "Head turned away",
  );
  assert.equal(alerts.update(["eyes_closed", "head_turned"], 12000).length, 0);
  alerts.update([], 13000);
  assert.equal(alerts.update(["eyes_closed"], 14000).length, 0);
  alerts.update([], 20000);
  assert.equal(alerts.update(["eyes_closed"], 21000).length, 1);
  assert.equal(alerts.update(["eyes_closed"], 51000).length, 1);
  assert.equal(alerts.update(["no_face"], 51100)[0].title, "Face not visible");
});
