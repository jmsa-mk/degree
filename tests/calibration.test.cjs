const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeFace, ForwardCalibration } = require("../src/face-analysis.mjs");

function face({ ear = 0.09, blink = 0.08, yaw = 0, pitch = 0 } = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const [indices, x] of [
    [[33, 160, 158, 133, 153, 144], 100],
    [[362, 385, 387, 263, 373, 380], 350],
  ]) {
    const h = ear * 100;
    const coordinates = [
      [x, 200], [x + 25, 200 - h / 2], [x + 75, 200 - h / 2],
      [x + 100, 200], [x + 75, 200 + h / 2], [x + 25, 200 + h / 2],
    ];
    indices.forEach((id, index) => {
      points[id] = { x: coordinates[index][0] / 640, y: coordinates[index][1] / 480, z: 0 };
    });
  }
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  const categories = [
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookInLeft", "eyeLookOutRight",
    "eyeLookOutLeft", "eyeLookInRight", "eyeLookUpLeft", "eyeLookUpRight",
    "eyeLookDownLeft", "eyeLookDownRight",
  ].map((categoryName) => ({ categoryName, score: categoryName.includes("Blink") ? blink : 0.05 }));
  return {
    faceLandmarks: [points],
    faceBlendshapes: [{ categories }],
    facialTransformationMatrixes: [{ data: [
      1, 0, 0, 0, 0, 1, 0, 0,
      Math.sin(y) * Math.cos(p), -Math.sin(p), Math.cos(y) * Math.cos(p),
      0, 0, 0, 0, 1,
    ] }],
  };
}

function calibrate(options) {
  const calibration = new ForwardCalibration();
  calibration.start(1000);
  let result;
  for (let index = 0; index < 20; index++)
    result = calibration.add(analyzeFace(face(options)), 1000 + index * 100);
  return result;
}

test("narrow open eyes can calibrate below the default threshold and still detect later closure", () => {
  assert.equal(analyzeFace(face()).eyesOpen, false);
  const { baseline } = calibrate();
  assert.ok(baseline);
  assert.ok(baseline.ear < 0.12);
  const open = analyzeFace(face(), 640, 480, baseline);
  assert.equal(open.eyesOpen, true);
  assert.equal(open.eyesForward, true);
  assert.ok(open.metrics.earThreshold < baseline.ear);
  assert.equal(analyzeFace(face({ ear: 0.04 }), 640, 480, baseline).eyesOpen, false);
  assert.equal(analyzeFace(face({ blink: 0.9 }), 640, 480, baseline).eyesOpen, false);
});

test("blink baseline accommodates a stable open-eye offset without suppressing a clear blink", () => {
  const { baseline } = calibrate({ ear: 0.3, blink: 0.32 });
  assert.ok(baseline);
  const open = analyzeFace(face({ ear: 0.3, blink: 0.46 }), 640, 480, baseline);
  assert.equal(open.eyesOpen, true);
  assert.equal(analyzeFace(face({ ear: 0.3, blink: 0.85 }), 640, 480, baseline).eyesOpen, false);
});

test("clear closure or implausibly small eye geometry cannot become an open-eye baseline", () => {
  for (const options of [{ blink: 0.85 }, { ear: 0.025 }, { ear: 0.1, blink: 0.3 }]) {
    const calibration = new ForwardCalibration();
    calibration.start(0);
    for (let index = 0; index < 30; index++)
      assert.equal(calibration.add(analyzeFace(face(options)), index * 100), null);
    assert.equal(calibration.progress, 0);
    assert.ok(calibration.add(analyzeFace(face(options)), 8100).error);
  }
});

test("missing, non-finite, uneven, or unreliable measurements are not calibrated", () => {
  const invalidObservations = [
    { metrics: { blink: null } },
    { metrics: { pitch: NaN } },
    { metrics: { leftEar: 0.04 } },
    { metrics: { leftEar: 0.07, rightEar: 0.2 } },
    { metrics: { leftBlink: 0.5 } },
    { metrics: { gaze: 0.6 } },
    { facePresent: false },
  ];
  for (const invalid of invalidObservations) {
    const observation = analyzeFace(face());
    const input = { ...observation, ...invalid, metrics: { ...observation.metrics, ...invalid.metrics } };
    const calibration = new ForwardCalibration();
    calibration.start(0);
    for (let index = 0; index < 20; index++)
      assert.equal(calibration.add(input, index * 100), null);
    assert.equal(calibration.progress, 0);
  }
  const noEyes = face();
  noEyes.faceLandmarks[0] = [{ x: 0.5, y: 0.5 }];
  noEyes.faceBlendshapes = [];
  assert.equal(analyzeFace(noEyes).eyesOpen, null);
});

test("unstable eye measurements or head pose must settle before calibration completes", () => {
  for (const kind of ["ear", "yaw", "blink"]) {
    const calibration = new ForwardCalibration();
    calibration.start(0);
    for (let index = 0; index < 30; index++) {
      const options = kind === "ear"
        ? { ear: index % 2 ? 0.09 : 0.17 }
        : kind === "yaw" ? { yaw: index % 2 ? -10 : 10 }
        : { blink: index % 2 ? 0.01 : 0.19 };
      assert.equal(calibration.add(analyzeFace(face(options)), index * 100), null);
    }
    assert.ok(calibration.progress < 1);
    let result;
    for (let index = 30; index < 50; index++)
      result = calibration.add(analyzeFace(face()), index * 100) || result;
    assert.ok(result?.baseline);
    assert.equal(calibration.startedAt, null);
  }
});

test("restarting calibration clears previous progress and an incomplete attempt expires", () => {
  const calibration = new ForwardCalibration();
  calibration.start(0);
  for (let index = 0; index < 10; index++)
    calibration.add(analyzeFace(face()), index * 100);
  assert.equal(calibration.progress, 0.5);
  calibration.start(1000);
  assert.equal(calibration.progress, 0);
  assert.ok(calibration.add(analyzeFace(face()), 9100).error);
  assert.equal(calibration.add(analyzeFace(face()), 9200), null);
});
