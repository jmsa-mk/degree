import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// Portable NSIS launchers do not forward the inspector's stderr pipe. Attach
// to Chromium's local test port instead of the Electron launcher transport.
await mkdir("test-output", { recursive: true });
let port = Number(process.env.DEGREEBEE_ATTACH_PORT || 0);
if (!port) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(
    path.resolve("release/DegreeBee-Focus-2.3.1-x64.exe"),
    [`--remote-debugging-port=${port}`],
    { env, windowsHide: true, stdio: "ignore" },
  );
}
const endpoint = `http://127.0.0.1:${port}`;
let browser;
try {
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${endpoint}/json/version`)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for extraction. */
    }
    await delay(500);
  }
  assert.ok(ready, "Portable app did not start within 60 seconds.");
  browser = await chromium.connectOverCDP(endpoint);
  const page = browser
    .contexts()[0]
    .pages()
    .find((page) => page.url().startsWith("degreebee://app"));
  assert.ok(page, "Packaged DegreeBee window not found.");
  await page.waitForFunction(()=>!!window.degreebee);
  const initial=await page.evaluate(()=>window.degreebee.state());
  if(!initial.account.user||initial.account.authExpired)await page.getByRole('heading',{name:'Welcome back',exact:true}).waitFor();
  else {await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('region',{name:'Your subscription',exact:true}).waitFor();}
  const assets = await page.evaluate(async () => {
    const model = await fetch("degreebee://app/models/face_landmarker.task");
    const sound = new Uint8Array(await (await fetch("degreebee://app/alert.wav")).arrayBuffer());
    return {
      modelBytes: (await model.arrayBuffer()).byteLength,
      soundHeader: String.fromCharCode(...sound.slice(0,4)),
      soundBytes: sound.length,
      logoReady: document.querySelector(".brand img").naturalWidth > 0,
      cameraOff: !document.querySelector("video")?.srcObject,
      state: await window.degreebee.state(),
    };
  });
  assert.ok(assets.modelBytes > 1_000_000);
  assert.equal(assets.soundHeader, 'RIFF');
  assert.ok(assets.soundBytes > 40000);
  assert.equal(assets.logoReady, true);
  assert.equal(assets.cameraOff, true);
  assert.equal(assets.state.active, null);
  assert.equal(typeof assets.state.settings.showReport, "boolean");
  assert.equal(typeof assets.state.settings.checks.eyes, "boolean");
  assert.equal(Object.hasOwn(assets.state.account,'server'),false);
  assert.equal(Object.hasOwn(assets.state.account,'token'),false);
  assert.equal(assets.state.account.canMonitor,false);
  assert.equal(await page.evaluate(()=>typeof window.degreebee.accountServer),'undefined');
  assert.ok(!/XAMPP|Server URL|Account server|Guest|localhost|127\.0\.0\.1/.test(await page.locator('body').innerText()));
  await page.screenshot({ path: path.resolve("test-output/release.png") });
  await page.getByRole('button',{name:/^Help & support/}).click();
  await page.getByRole('heading',{name:'Let’s get you back on track.'}).waitFor();
  await page.getByLabel('Search the help center').fill('glasses');
  assert.equal(await page.locator('.support-faq details').count(),1);
  await page.screenshot({path:path.resolve('test-output/release-support.png'),fullPage:true});
  console.log(
    "PASS: portable v2.3.1 EXE launched directly; bundled Help & support/search, sign-in/membership screen, no guest/server controls or tokens, default AI access denied, bundled model/audio/logo, and camera-off default verified.",
  );
  await page.close();
} finally {
  if (browser) await browser.close().catch(() => {});
}



