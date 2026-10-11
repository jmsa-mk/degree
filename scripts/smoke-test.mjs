import { _electron as electron } from "playwright";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {createMember,setMembership,signInMember,removeMember} from './member-fixture.mjs';

const output = path.resolve("test-output");
await mkdir(output, { recursive: true });
const dataDirectory = path.join(output, `smoke-${Date.now()}`);
const env = { ...process.env, DEGREEBEE_TEST_DATA: dataDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const args = [
  ".",
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
];
let app,member,reportDirectory;
try {
  member=await createMember();await setMembership(member);
  app = await electron.launch({ args, env });
  let page = await app.firstWindow();
  await signInMember(page,member);reportDirectory=(await page.evaluate(()=>window.degreebee.state())).folder;
  await page.getByRole('button', {name:'Reports',exact:true}).click();
  await page.getByRole('button', {name:'Monitoring',exact:true}).click();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.getByRole("heading", { name: "Time to focus." }).waitFor();
  await page.screenshot({ path: path.join(output, "monitoring.png") });
  await page.getByRole("button", { name: "Dark Mode", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.screenshot({ path: path.join(output, "monitoring-dark.png") });
  await page.getByRole("button", { name: "Light Mode", exact: true }).click();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await page.locator("#session-name").fill("Cross-app desktop test");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.getByText("Camera active · local").waitFor({ timeout: 60000 });
  await page
    .locator(".status")
    .filter({ hasText: "Face not visible" })
    .waitFor({ timeout: 20000 });
  console.log("Camera model ready; testing minimized window.");
  for (const icon of ['face','eye','head']) await page.locator(`[data-testid="indicator-${icon}"][data-state="bad"]`).waitFor();
  const notification = app.windows().find(window => window.url().endsWith('/alert.html'));
  assert.ok(notification, 'A desktop notification window should open for an absent face');
  await notification.getByRole('heading', {name:'Face not visible'}).waitFor();
  await notification.waitForFunction(() => {
    const audio = document.getElementById('alert-sound');
    return audio.ended && audio.currentTime > 0 && !audio.error;
  });
  assert.equal(await page.locator('.detection-alert').count(), 0, 'Detection notifications must be outside the main app');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/alert.html')).isFocusable()),false);
  const before = await page.evaluate(() => window.degreebee.state());
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").minimize(),
  );
  await page.waitForTimeout(5500);
  const minimized = await page.evaluate(() => window.degreebee.state());
  console.log(
    "Minimized delta:",
    minimized.active.totalMs - before.active.totalMs,
    "camera:",
    minimized.active.counts.no_face - before.active.counts.no_face,
  );
  assert.ok(
    minimized.active.totalMs - before.active.totalMs >= 4500,
    "Timer must continue minimized",
  );
  assert.ok(
    minimized.active.counts.no_face - before.active.counts.no_face >= 4500,
    "Camera detection must continue minimized",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").restore(),
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("video").srcObject === null,
  );
  const paused = await page.evaluate(() => window.degreebee.state());
  await page.waitForTimeout(1300);
  const pausedLater = await page.evaluate(() => window.degreebee.state());
  assert.equal(pausedLater.active.totalMs, paused.active.totalMs);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByText("Camera active · local").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Mini mode", exact: true }).click();
  await page.waitForFunction(() => innerWidth <= 420);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").isAlwaysOnTop(),
    ),
    true,
  );
  const miniBefore = await page.evaluate(() => window.degreebee.state());
  await page.waitForTimeout(6000);
  const miniAfter = await page.evaluate(() => window.degreebee.state());
  assert.equal(
    miniAfter.active.status,
    "running",
    "Visible preview in mini mode must keep camera alive",
  );
  assert.ok(
    miniAfter.active.counts.no_face - miniBefore.active.counts.no_face >= 2500,
  );
  await page.screenshot({ path: path.join(output, "mini.png") });
  assert.equal(await page.locator('.camera-preview').isVisible(),true,'Mini mode must show the camera');
  const previewBounds = await page.locator('.camera-preview').boundingBox();
  assert.ok(previewBounds.height >= 100 && previewBounds.y + previewBounds.height < (await page.evaluate(()=>innerHeight)), 'Mini camera must fit in the visible window');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").hide(),
  );
  const hiddenBefore = await page.evaluate(() => window.degreebee.state());
  await page.waitForTimeout(5000);
  const hiddenAfter = await page.evaluate(() => window.degreebee.state());
  assert.ok(
    hiddenAfter.active.counts.no_face - hiddenBefore.active.counts.no_face >=
      4500,
    "Tray-hidden camera must keep observing",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === "degreebee://app/").show(),
  );
  await page
    .getByRole("button", { name: "Finish & save", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Report details" }).waitFor();
  await page.screenshot({ path: path.join(output, "report.png") });
  const report = (await page.evaluate(() => window.degreebee.history()))
    .sessions[0];
  assert.equal(report.status, "completed");
  assert.ok(report.counts.no_face > 4000);
  const pdfPath = path.join(output, "report.pdf");
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, pdfPath);
  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  await page.getByRole("dialog", {name:"Report details"}).getByRole("status").filter({hasText:"Saved to"}).waitFor();
  assert.equal((await readFile(pdfPath)).subarray(0,5).toString(), "%PDF-");
  await page.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("button", { name: "Report history", exact: true })
    .click();
  await page.screenshot({ path: path.join(output, "history.png") });
  assert.deepEqual(errors, [], `Renderer errors: ${errors.join(", ")}`);
  await app.evaluate(({ app }) => app.exit(0));
  app = null;
  app = await electron.launch({ args, env });
  page = await app.firstWindow();
  await page.getByRole("heading", { name: "Time to focus." }).waitFor();
  const reloaded = await page.evaluate(() => window.degreebee.history());
  assert.equal(reloaded.sessions[0].id, report.id);
  assert.equal(reloaded.sessions[0].totalMs, report.totalMs);
  assert.ok(
    (await readdir(reportDirectory)).some((name) =>
      name.endsWith(".json.bak"),
    ),
  );
  await page.locator("#session-name").fill("Camera failure recovery");
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await page.getByText("Camera active · local").waitFor({ timeout: 60000 });
  await page.evaluate(() =>
    document
      .querySelector("video")
      .srcObject.getTracks()
      .forEach((track) => track.stop()),
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Camera frames stopped" })
    .waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  assert.equal(
    (await page.evaluate(() => window.degreebee.state())).active.status,
    "paused",
  );
  await page
    .getByRole("button", { name: "Finish & save", exact: true })
    .click();
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await page.locator('#session-name').fill('Detection and deletion regression');
  await page.getByRole('button',{name:'Start focus',exact:true}).click();
  await page.getByText('Camera active · local').waitFor({timeout:60000});
  // Test-only scripted observations exercise the real IPC handler, notification
  // window, report persistence, and UI without accessing a physical webcam.
  await app.evaluate(({ipcMain,BrowserWindow})=>{
    const handler = ipcMain.listeners('focus:observation')[0];
    ipcMain.removeAllListeners('focus:observation');
    const win = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='degreebee://app/');
    globalThis.__observation = {facePresent:true,eyesOpen:true,eyesForward:true,headForward:true};
    globalThis.__observationTimer = setInterval(()=>handler({sender:win.webContents,senderFrame:win.webContents.mainFrame},globalThis.__observation),100);
  });
  for (const icon of ['face','eye','head']) await page.locator(`[data-testid="indicator-${icon}"][data-state="good"]`).waitFor();
  await page.screenshot({path:path.join(output,'indicators-green.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='degreebee://app/').minimize());
  await app.evaluate(()=>{globalThis.__observation={facePresent:true,eyesOpen:false,eyesForward:false,headForward:false};});
  for (const icon of ['eye','head']) await page.locator(`[data-testid="indicator-${icon}"][data-state="bad"]`).waitFor();
  await page.locator('[data-testid="indicator-face"][data-state="good"]').waitFor();
  const detection = (await page.evaluate(()=>window.degreebee.state())).active;
  assert.ok(detection.alerts.some(a=>a.issue==='eyes_closed'));
  assert.ok(detection.alerts.some(a=>a.issue==='head_turned'));
  const popup = app.windows().find(window=>window.url().endsWith('/alert.html'));
  await popup.getByRole('heading').filter({hasText:'Head turned away'}).waitFor();
  await popup.waitForFunction(() => {
    const audio = document.getElementById('alert-sound');
    return audio.ended && audio.currentTime > 0 && !audio.error;
  });
  const desktopStatus = await app.evaluate(({BrowserWindow,screen})=>{
    const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='degreebee://app/');
    const popup=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/alert.html'));
    const bounds=popup.getBounds(), work=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    return { minimized:main.isMinimized(), visible:popup.isVisible(), onTop:popup.isAlwaysOnTop(), focused:popup.isFocused(), onCurrentDisplay:bounds.x>=work.x && bounds.y>=work.y && bounds.x+bounds.width<=work.x+work.width && bounds.y+bounds.height<=work.y+work.height };
  });
  assert.deepEqual(desktopStatus,{minimized:true,visible:true,onTop:true,focused:false,onCurrentDisplay:true});
  await popup.screenshot({path:path.join(output,'desktop-alert.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='degreebee://app/').restore());
  await page.screenshot({path:path.join(output,'detection-alerts.png')});
  await page.getByRole('button',{name:'Delete session',exact:true}).click();
  await page.getByRole('button',{name:'Keep session',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.degreebee.state())).active.id,detection.id);
  await page.getByRole('button',{name:'Delete session',exact:true}).click();
  await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await page.getByRole('button',{name:'Start focus',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('video').srcObject===null);
  assert.equal((await page.evaluate(()=>window.degreebee.state())).active,null);
  assert.ok((await readdir(reportDirectory)).every(name=>!name.startsWith(detection.id)));
  await app.evaluate(()=>clearInterval(globalThis.__observationTimer));
  await app.evaluate(({app})=>app.exit(0)); app=null;
  app=await electron.launch({args,env});page=await app.firstWindow();
  await page.getByRole('heading',{name:'Time to focus.'}).waitFor();
  const finalHistory=await page.evaluate(()=>window.degreebee.history());
  assert.ok(finalHistory.sessions.every(s=>s.id!==detection.id));
  assert.ok(finalHistory.sessions.some(s=>s.id===report.id));
  console.log(
    "PASS: offline model + simulated camera, background monitoring, visible mini camera, reports/PDF/restart, camera failure, three indicators, independent eye/head alerts, separate always-on-top desktop popup and chime playback while minimized, cancel/confirm deletion and recovery-copy removal.",
  );
} catch (error) {
  console.error(error);
  if (app) {
    const page = await app.firstWindow();
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await removeMember(member);
}


