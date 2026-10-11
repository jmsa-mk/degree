const { BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const minutes = ms => `${Math.floor(Math.max(0, ms || 0) / 60000)}m ${Math.floor(Math.max(0, ms || 0) / 1000) % 60}s`;

async function reportHtml(report, reports, format, root) {
  const { summarizeReport, dailyProgress } = await import("./report-insights.mjs");
  const insight = summarizeReport(report);
  const settings = report.currentSettings || report.settings;
  const goal = settings?.dailyGoalMinutes || 60;
  const ended = Date.parse(report.endedAt || report.updatedAt);
  const progress = dailyProgress(reports, null, goal, Number.isFinite(ended) ? ended : Date.now());
  const logo = (await fs.readFile(path.join(root, "brand/logo.png"))).toString("base64");
  const date = new Date(report.startedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const enabled = Object.entries(settings?.checks || {face:true,eyes:true,head:true}).filter(([,v]) => v)
    .map(([k]) => ({face:"Face visibility",eyes:"Eye checks",head:"Head direction"}[k])).filter(Boolean).join(" / ") || "Camera off - timer only";
  const rows = [["Face not visible",report.counts.no_face],["Eyes appeared closed",report.counts.eyes_closed],
    ["Looking away",report.counts.looking_away],["Not observed",report.counts.unobserved],["Breaks",report.counts.paused]];
  const image = format === "png";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DegreeBee Session Report</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; object-src 'none'"><style>
  *{box-sizing:border-box}html,body{margin:0;color:#182337;font-family:'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:0}body{width:${image ? 1080 : 794}px;background:#fff}.page{width:100%;min-height:${image ? 1350 : 1122}px;padding:${image ? '58px' : '32px'};position:relative;background:linear-gradient(150deg,#e5ffff 0%,#fff 38%,#f1efff 100%);display:flex;flex-direction:column;gap:${image ? 32 : 14}px}
  header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid #dce8eb}.brand{display:flex;align-items:center;gap:12px;font-size:${image ? 29 : 23}px;font-weight:750}.brand img{width:${image ? 38 : 29}px;height:auto}.badge{color:#087f9b;letter-spacing:2px;font-size:${image ? 14 : 10}px;font-weight:700;text-transform:uppercase}
  h1{font-size:${image ? 48 : 30}px;line-height:1.22;letter-spacing:-1px;margin:10px 0 12px;overflow-wrap:anywhere}p{margin:0;font-size:${image ? 20 : 13}px;line-height:1.65;color:#586679}.date{font-size:${image ? 17 : 12}px}.mode{display:inline-block;color:#4b47ac;background:#eeedff;border-radius:30px;padding:7px 13px;font-size:${image ? 14 : 11}px;font-weight:600;margin-top:14px}
  .hero{background:linear-gradient(110deg,#06a8ca,#7272e6);border-radius:24px;padding:${image ? 36 : 25}px;color:#fff}.hero .label{font-size:${image ? 17 : 12}px;letter-spacing:1.5px;text-transform:uppercase;color:#f0fdff}.hero strong{display:block;font-size:${image ? 80 : 53}px;line-height:1.2;letter-spacing:-2px;margin:6px 0}.hero p{color:#f5faff;font-size:${image ? 18 : 12}px}
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:18px}.stat{background:#ffffffd9;border:1px solid #dce8eb;border-radius:17px;padding:${image ? 26 : 18}px}.stat span{display:block;color:#637188;font-size:${image ? 17 : 12}px}.stat strong{display:block;font-size:${image ? 36 : 27}px;margin-top:8px}
  h2{font-size:${image ? 24 : 17}px;margin:0 0 12px}.goal{background:#ffffffd9;border:1px solid #dce8eb;border-radius:17px;padding:${image ? 27 : 19}px}.goal-line{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.goal-line b{font-size:${image ? 32 : 23}px;color:#076a80}.track{height:12px;border-radius:99px;background:#e2eaf0;margin:16px 0 11px;overflow:hidden}.fill{height:100%;width:${progress.percent}%;background:linear-gradient(90deg,#05bdcd,#7979ef)}.goal p{font-size:${image ? 16 : 11}px}
  .next{border-left:4px solid #09acbd;padding:5px 0 5px 18px}.next p{color:#33445a;font-size:${image ? 20 : 13}px}.breakdown{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.breakdown div{border-top:1px solid #dce8eb;padding-top:12px}.breakdown span{display:block;font-size:10px;color:#637188}.breakdown b{display:block;font-size:16px;margin-top:6px}.setup{font-size:11px;line-height:1.6;color:#637188}.footer{margin-top:auto;padding-top:18px;border-top:1px solid #dce8eb;display:flex;justify-content:space-between;gap:15px;align-items:flex-end}.footer p{font-size:${image ? 15 : 10}px;max-width:85%}.footer b{font-size:${image ? 17 : 12}px;color:#087f9b;white-space:nowrap}
  </style></head><body><main class="page">
  <header><div class="brand"><img alt="" src="data:image/png;base64,${logo}">DegreeBee</div><span class="badge">${image ? 'Study progress' : 'Session report'}</span></header>
  <section><h1>${escape(report.title)}</h1><p class="date">${escape(date)} · ${report.status === 'interrupted' ? 'Recovered session' : 'Completed session'}</p><span class="mode">${escape(insight.modeLabel)}</span></section>
  <section class="hero"><div class="label">Time you set aside to study</div><strong>${minutes(report.totalMs)}</strong><p>Active session time, with breaks excluded.</p></section>
  <div class="stats"><div class="stat"><span>Longest observed focus</span><strong>${minutes(insight.longestFocusMs)}</strong></div><div class="stat"><span>Recorded reminders</span><strong>${insight.alertCount}</strong></div></div>
  <section class="goal"><div class="goal-line"><h2>Daily study goal</h2><b>${progress.percent}%</b></div><div class="track"><div class="fill"></div></div><p>${minutes(progress.activeMs)} of ${goal} minutes · ${progress.goalReached ? 'Goal reached' : 'Every session counts'}</p><p>Progress at this session's end, using history currently saved on this device.</p></section>
  ${image ? '' : `<section><h2>Your session at a glance</h2><p>${escape(insight.detail)}</p></section><div class="breakdown">${rows.map(([label,time])=>`<div><span>${label}</span><b>${minutes(time)}</b></div>`).join('')}</div>`}
  <section class="next"><h2>Try next time</h2><p>${escape(insight.nextStep)}</p></section>
  ${image ? '' : `<p class="setup">Checks at session end: ${escape(enabled)}.${report.configurationChanges?.length ? ' Monitoring settings changed during this session.' : ''}</p>`}
  <footer class="footer"><p>Camera observations describe visible signals, not mental concentration. ${image ? 'Your camera images are never included.' : 'Reminders may repeat for an ongoing condition. No camera images are included.'}</p><b>Made for your focus.</b></footer>
  </main></body></html>`;
}

async function renderReport(report, reports, format, root) {
  const html = await reportHtml(report, reports, format, root);
  const width = format === "png" ? 1080 : 794;
  const height = format === "png" ? 1350 : 1123;
  const view = new BrowserWindow({ width, height, useContentSize: true, show: false,
    skipTaskbar: true, backgroundColor: '#ffffff', webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    }});
  try {
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await view.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await view.webContents.executeJavaScript(`Promise.all([document.fonts.ready, ...Array.from(document.images).map(image => image.decode())])`);
    const size = await view.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)');
    if (format === 'pdf') return await view.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4', scale: Math.min(1, 1122 / size), margins: { top:0, right:0, bottom:0, left:0 } });
    if (size > height) view.setContentSize(width, size);
    const capture = await view.webContents.capturePage({ x:0, y:0, width, height:Math.max(height,size) }, { stayHidden:true, stayAwake:true });
    return capture.resize({ width:1080, quality:'best' }).toPNG();
  } finally { if (!view.isDestroyed()) view.destroy(); }
}
module.exports = { renderReport, reportHtml };

