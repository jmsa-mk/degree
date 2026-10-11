// MediaPipe's web FaceLandmarker supplies column-major 4x4 transforms.
// Keep each measurement independent: missing blendshapes must not suppress pose.
export const DEFAULT_LIMITS = {
  blink: 0.45,
  ear: 0.19,
  yaw: 18,
  pitch: 22,
  gaze: 0.55,
};

function pointDistance(a, b, width, height) {
  if (!a || !b) return NaN;
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}
function eyeRatio(points, indices, width, height) {
  const [a, b, c, d, e, f] = indices.map((index) => points[index]);
  const horizontal = pointDistance(a, d, width, height);
  const ratio =
    (pointDistance(b, f, width, height) + pointDistance(c, e, width, height)) /
    (2 * horizontal);
  return Number.isFinite(ratio) && horizontal > 1 ? ratio : null;
}
function irisRatio(points, center, a, b, width, height) {
  const p = points[center],
    start = points[a],
    end = points[b];
  if (!p || !start || !end) return null;
  const dx = (end.x - start.x) * width,
    dy = (end.y - start.y) * height;
  const result =
    ((p.x - start.x) * width * dx + (p.y - start.y) * height * dy) /
    (dx * dx + dy * dy);
  return Number.isFinite(result) ? result : null;
}
export function analyzeFace(
  result,
  width = 640,
  height = 480,
  baseline = null,
) {
  const points = result.faceLandmarks?.[0];
  if (!points?.length)
    return {
      facePresent: false,
      eyesOpen: null,
      eyesForward: null,
      headForward: null,
      metrics: {},
    };
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  const score = (name) => {
    const value = categories.find((item) => item.categoryName === name)?.score;
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  };
  const leftBlink = score("eyeBlinkLeft"),
    rightBlink = score("eyeBlinkRight");
  const blink =
    leftBlink != null && rightBlink != null
      ? (leftBlink + rightBlink) / 2
      : null;
  const leftEar = eyeRatio(
    points,
    [33, 160, 158, 133, 153, 144],
    width,
    height,
  );
  const rightEar = eyeRatio(
    points,
    [362, 385, 387, 263, 373, 380],
    width,
    height,
  );
  const ear =
    leftEar != null && rightEar != null ? (leftEar + rightEar) / 2 : null;
  // A fixed minimum would put some people's normal open eyes below the
  // threshold even after calibration. Keep the threshold relative to them.
  const earThreshold =
    Number.isFinite(baseline?.ear) && baseline.ear > 0
      ? Math.min(0.23, baseline.ear * 0.65)
      : DEFAULT_LIMITS.ear;
  const blinkThreshold = Number.isFinite(baseline?.blink)
    ? Math.min(0.75, Math.max(DEFAULT_LIMITS.blink, baseline.blink + 0.3))
    : DEFAULT_LIMITS.blink;
  const eyesOpen =
    blink == null && ear == null
      ? null
      : !(
          (blink != null && blink >= blinkThreshold) ||
          (ear != null && ear < earThreshold)
        );
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  let yaw = null,
    pitch = null;
  if (
    matrix?.length === 16 &&
    Array.from(matrix).every(Number.isFinite) &&
    Math.hypot(matrix[8], matrix[9], matrix[10]) > 0.01
  ) {
    yaw = (Math.atan2(matrix[8], matrix[10]) * 180) / Math.PI;
    pitch =
      (Math.atan2(-matrix[9], Math.hypot(matrix[8], matrix[10])) * 180) /
      Math.PI;
  }
  const relativeYaw = yaw == null ? null : yaw - (baseline?.yaw ?? 0);
  const relativePitch = pitch == null ? null : pitch - (baseline?.pitch ?? 0);
  const headForward =
    yaw == null
      ? null
      : Math.abs(relativeYaw) < DEFAULT_LIMITS.yaw &&
        Math.abs(relativePitch) < DEFAULT_LIMITS.pitch;
  const gazePairs = [
    ["eyeLookInLeft", "eyeLookOutRight"],
    ["eyeLookOutLeft", "eyeLookInRight"],
    ["eyeLookUpLeft", "eyeLookUpRight"],
    ["eyeLookDownLeft", "eyeLookDownRight"],
  ];
  const gazeScores = gazePairs
    .map((pair) => pair.map(score))
    .filter((pair) => pair.every((value) => value != null))
    .map(([a, b]) => (a + b) / 2);
  const gaze = gazeScores.length === 4 ? Math.max(...gazeScores) : null;
  const leftIris = irisRatio(points, 468, 33, 133, width, height),
    rightIris = irisRatio(points, 473, 362, 263, width, height);
  let eyesForward =
    gaze != null
      ? gaze < DEFAULT_LIMITS.gaze
      : leftIris != null && rightIris != null
        ? [leftIris, rightIris].every((value) => value > 0.2 && value < 0.8)
        : null;
  if (eyesOpen === false) eyesForward = false;
  return {
    facePresent: true,
    eyesOpen,
    eyesForward,
    headForward,
    metrics: {
      blink,
      leftBlink,
      rightBlink,
      ear,
      leftEar,
      rightEar,
      earThreshold,
      blinkThreshold,
      yaw,
      pitch,
      relativeYaw,
      relativePitch,
      gaze,
    },
  };
}

export class ForwardCalibration {
  constructor() {
    this.samples = [];
    this.startedAt = null;
  }
  start(now) {
    this.samples = [];
    this.startedAt = now;
  }
  get progress() {
    // Only the successful result should show completion.
    return this.startedAt == null ? 0 : Math.min(0.95, this.samples.length / 20);
  }
  add(observation, now) {
    if (this.startedAt == null) return null;
    if (now - this.startedAt > 8000) {
      this.startedAt = null;
      this.samples = [];
      return {
        error:
          "Calibration could not get a steady reading. Face the camera with both eyes open, reduce glare, and try again.",
      };
    }
    const m = observation.metrics ?? {};
    const complete = [
      "ear",
      "leftEar",
      "rightEar",
      "blink",
      "leftBlink",
      "rightBlink",
      "yaw",
      "pitch",
      "gaze",
    ].every((key) => Number.isFinite(m[key]));
    // Small eye shapes can fail the default EAR threshold. They may still be
    // calibrated when both independent blink scores strongly indicate open
    // eyes; very small/uneven geometry and obvious closure remain invalid.
    const normalOpen =
      observation.eyesOpen === true &&
      Math.max(m.leftBlink, m.rightBlink) < 0.4;
    const narrowOpen = Math.max(m.leftBlink, m.rightBlink) <= 0.2;
    if (
      observation.facePresent !== true ||
      !complete ||
      (!normalOpen && !narrowOpen) ||
      Math.min(m.leftEar, m.rightEar) < 0.06 ||
      Math.max(m.leftEar, m.rightEar) > 0.6 ||
      Math.min(m.leftEar, m.rightEar) / Math.max(m.leftEar, m.rightEar) <
        0.55 ||
      m.gaze > 0.35 ||
      Math.abs(m.yaw) > 30 ||
      Math.abs(m.pitch) > 30
    ) {
      this.samples = [];
      return null;
    }
    this.samples.push(m);
    if (this.samples.length > 20) this.samples.shift();
    if (this.samples.length < 20) return null;
    const median = (key) =>
      this.samples.map((s) => s[key]).sort((a, b) => a - b)[
        Math.floor(this.samples.length / 2)
      ];
    const steady = (key, maxDeviation, maxRange) => {
      const values = this.samples.map((sample) => sample[key]);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const deviation = Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          values.length,
      );
      return (
        deviation <= maxDeviation &&
        Math.max(...values) - Math.min(...values) <= maxRange
      );
    };
    const steadyEye = (key) => steady(
      key,
      Math.max(0.008, median(key) * 0.1),
      Math.max(0.025, median(key) * 0.3),
    );
    if (
      !steadyEye("leftEar") ||
      !steadyEye("rightEar") ||
      !steady("leftBlink", 0.06, 0.18) ||
      !steady("rightBlink", 0.06, 0.18) ||
      !steady("yaw", 2.5, 8) ||
      !steady("pitch", 2.5, 8)
    )
      return null;
    this.startedAt = null;
    return {
      baseline: {
        ear: median("ear"),
        blink: median("blink"),
        yaw: median("yaw"),
        pitch: median("pitch"),
      },
    };
  }
}
