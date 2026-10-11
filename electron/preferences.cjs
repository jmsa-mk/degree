const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SETTINGS = Object.freeze({
  activity: "screen",
  checks: Object.freeze({ face: true, eyes: true, head: true }),
  sensitivity: "balanced",
  sound: true,
  showReport: true,
  dailyGoalMinutes: 60,
});
const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);
const CHECK_KEYS = Object.keys(DEFAULT_SETTINGS.checks);
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validatePatch(patch) {
  if (
    !isRecord(patch) ||
    Object.keys(patch).some((key) => !SETTINGS_KEYS.includes(key))
  )
    throw new Error("Invalid monitoring settings.");
  if (
    Object.hasOwn(patch, "activity") &&
    !["screen", "reading"].includes(patch.activity)
  )
    throw new Error("Choose a supported activity.");
  if (
    Object.hasOwn(patch, "sensitivity") &&
    !["balanced", "gentle"].includes(patch.sensitivity)
  )
    throw new Error("Choose a supported alert sensitivity.");
  for (const key of ["sound", "showReport"])
    if (Object.hasOwn(patch, key) && typeof patch[key] !== "boolean")
      throw new Error("Invalid monitoring settings.");
  if (
    Object.hasOwn(patch, "dailyGoalMinutes") &&
    ![30, 60, 90, 120].includes(patch.dailyGoalMinutes)
  )
    throw new Error("Choose a daily goal of 30, 60, 90, or 120 minutes.");
  if (Object.hasOwn(patch, "checks")) {
    if (
      !isRecord(patch.checks) ||
      Object.keys(patch.checks).some(
        (key) => !CHECK_KEYS.includes(key) || typeof patch.checks[key] !== "boolean",
      )
    )
      throw new Error("Invalid detection checks.");
  }
}
function normalizeSettings(value = DEFAULT_SETTINGS) {
  validatePatch(value);
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    checks: {
      ...DEFAULT_SETTINGS.checks,
      ...(value.activity === "reading" ? { head: false } : {}),
      ...value.checks,
    },
  };
}
function applySettingsPatch(previous, patch) {
  validatePatch(patch);
  const next = normalizeSettings({
    ...previous,
    ...patch,
    checks: { ...previous.checks, ...patch.checks },
  });
  // Activity selection supplies a useful starting point. Individual check
  // changes made afterwards remain available in either activity.
  if (Object.hasOwn(patch, "activity")) next.checks.head = patch.activity === "screen";
  return next;
}
class PreferenceStore {
  constructor(directory) {
    this.file = path.join(directory, "settings.json");
    this.value = normalizeSettings();
    this.warning = null;
    try {
      this.value = normalizeSettings(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT")
        this.warning = "Saved settings could not be read. Default settings are in use; your reports are unchanged.";
    }
  }
  snapshot() {
    return structuredClone(this.value);
  }
  patch(patch) {
    const next = applySettingsPatch(this.value, patch);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", "utf8");
    fs.renameSync(temporary, this.file);
    this.value = next;
    this.warning = null;
    return this.snapshot();
  }
}
module.exports = {
  DEFAULT_SETTINGS,
  PreferenceStore,
  normalizeSettings,
  applySettingsPatch,
};
