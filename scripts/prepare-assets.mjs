import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

await mkdir("public/models", { recursive: true });
await mkdir("build", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/vision", {
  recursive: true,
});
const modelPath = "public/models/face_landmarker.task";
let model;
try {
  model = await readFile(modelPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!model) {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  );
  if (!response.ok)
    throw new Error(`Model download failed: ${response.status}`);
  model = Buffer.from(await response.arrayBuffer());
  if (model.length < 1_000_000) throw new Error("Incomplete model.");
  await writeFile(modelPath, model);
}
const modelHash = createHash("sha256").update(model).digest("hex");
if (
  modelHash !==
  "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
) {
  throw new Error(
    "Model checksum mismatch. Remove the local model and build again.",
  );
}
console.log(`Face model verified: ${modelHash}`);

// Reuse the original DegreeBee logo from the AoL project for the Windows icon.
const require = createRequire(import.meta.url);
const iconEnvironment = { ...process.env };
delete iconEnvironment.ELECTRON_RUN_AS_NODE;
execFileSync(require("electron"), ["scripts/create-icon.cjs"], {
  env: iconEnvironment,
  windowsHide: true,
  stdio: "inherit",
});
