const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  shell,
  Menu,
  Tray,
  screen,
  powerMonitor,
  protocol,
  net,
  safeStorage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { FocusSession } = require("./session.cjs");
const { SessionStore } = require("./store.cjs");
const { renderReport } = require("./report-export.cjs");
const { AttentionTracker, AttentionAlerts } = require("./attention.cjs");
const { PreferenceStore } = require("./preferences.cjs");
const { AccountClient } = require("./accounts.cjs");
const { supportRequest } = require("./support-client.cjs");
let account, accountBusy = false, monitorBusy = false, verificationBusy = false, nextVerification = 0, accessError = '';
let attention = new AttentionTracker(),
  alertPolicy = new AttentionAlerts(),
  latestAlerts = [];

protocol.registerSchemesAsPrivileged([
  {
    scheme: "degreebee",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
// A separate data location is accepted only for automated development tests.
if (!app.isPackaged && process.env.DEGREEBEE_TEST_DATA)
  app.setPath("userData", process.env.DEGREEBEE_TEST_DATA);
else
  app.setPath("userData", path.join(app.getPath("appData"), "DegreeBee Focus"));
app.setAppUserModelId("com.degreebee.focus");
const locked = app.requestSingleInstanceLock();
let win,
  store,
  preferences,
  active = null,
  tray,
  timer,
  saveError = null,
  lastSave = 0,
  quitting = false;
let fullBounds,
  isCompact = false;
let alertWindow = null, alertTimer;

function closeAlert() {
  clearTimeout(alertTimer);
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.destroy();
  alertWindow = null;
}
function showDesktopAlert() {
  // Portable apps do not have the Start Menu registration required by Windows
  // toast notifications. Use a local, non-activating popup that works offline.
  // Follow the display being used, even when the monitoring window is elsewhere.
  const work = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const bounds = { width: 370, height: 190, x: work.x + work.width - 386, y: work.y + work.height - 206 };
  if (!alertWindow || alertWindow.isDestroyed()) {
    const popup = alertWindow = new BrowserWindow({ ...bounds,
      show: false, frame: false, resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false,
      backgroundColor: '#111827', webPreferences: { preload: path.join(__dirname,'alert-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
    popup.setAlwaysOnTop(true, 'pop-up-menu');
    alertWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    alertWindow.webContents.on('will-navigate',event=>event.preventDefault());
    alertWindow.once('ready-to-show',()=>{
      if (popup.isDestroyed() || alertWindow !== popup) return;
      popup.webContents.send('alert:content',{ events: latestAlerts, sound: preferences.snapshot().sound });
      popup.showInactive();
    });
    alertWindow.loadURL('degreebee://app/alert.html');
  } else {
    alertWindow.setBounds(bounds);
    alertWindow.webContents.send('alert:content',{ events: latestAlerts, sound: preferences.snapshot().sound });
    alertWindow.showInactive();
  }
  clearTimeout(alertTimer); alertTimer = setTimeout(closeAlert,10000);
}

function current() {
  return {
    active: active?.snapshot() ?? null,
    saveError,
    folder: account?.user ? store.directory : '',
    compact: isCompact,
    settings: preferences.snapshot(),
    settingsWarning: preferences.warning,
    account: account?.snapshot(),
    accessError,
  };
}
function publish() {
  if (win && !win.isDestroyed())
    win.webContents.send("focus:update", current());
}
function checkpoint() {
  if (!active) return true;
  try {
    store.save(active.snapshot());
    saveError = null;
    lastSave = Date.now();
    return true;
  } catch (error) {
    saveError = `Report has not been saved: ${error.message}. Free up disk space or check folder permissions, then try again.`;
    publish();
    return false;
  }
}
function pauseForAccess(message) {
  accessError=active?message:'';
  if(active?.data.status==='running') {
    active.pause();closeAlert();attention.reset();alertPolicy.resetEpisode();latestAlerts=[];checkpoint();updateTray();
  }
  publish();
}
async function requireMonitoringAccess() {
  if(accountBusy||monitorBusy||verificationBusy)throw new Error('Please wait for the current account check to finish.');
  monitorBusy=true;
  try{await account.checkAccess();accessError='';nextVerification=performance.now()+30000;}
  catch(error){pauseForAccess(error.message);throw error;}
  finally{monitorBusy=false;}
}
function finish(reason = "finished") {
  if (!active) return null;
  const result = active.finish(reason);
  if (!checkpoint()) throw new Error(saveError);
  active = null;
  accessError = '';
  latestAlerts = [];
  closeAlert();
  updateTray();
  publish();
  if (account?.user) account.sync(store.list().sessions).catch(() => {});
  return result;
}
function show() {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(
    active
      ? `DegreeBee Focus — ${active.data.status === "running" ? "Monitoring active" : "Session paused"}`
      : "DegreeBee Focus",
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open DegreeBee Focus", click: show },
      {
        label:
          active?.data.status === "paused" ? "Resume session" : "Pause session",
        enabled: !!active && ["running", "paused"].includes(active.data.status),
        click: async () => {
          if (active.data.status === "paused") {try{await requireMonitoringAccess();if(active)active.resume();}catch{return;}}
          else active.pause();
          attention.reset();
          alertPolicy.resetEpisode();
          latestAlerts = [];
          closeAlert();
          checkpoint();
          updateTray();
          publish();
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => win.close() },
    ]),
  );
}
function trusted(event) {
  return (
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame.url.startsWith("degreebee://app/")
  );
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error("Access denied.");
    return callback(...args);
  });
}

if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    if (win) show();
  });
  app
    .whenReady()
    .then(async () => {
      account = new AccountClient(app.getPath("userData"), safeStorage, publish);
      const selectProfile = () => {
        store = new SessionStore(path.join(account.profileDirectory(), "reports"));
        store.recover();
      };
      selectProfile();
      preferences = new PreferenceStore(app.getPath("userData"));
      store.recover();
      const root = path.resolve(__dirname, "../dist");
      protocol.handle("degreebee", (request) => {
        const url = new URL(request.url);
        if (url.host !== "app")
          return new Response("Forbidden", { status: 403 });
        const file = path.resolve(
          root,
          "." +
            decodeURIComponent(
              url.pathname === "/" ? "/index.html" : url.pathname,
            ),
        );
        if (!file.startsWith(root + path.sep))
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(file).href);
      });
      Menu.setApplicationMenu(null);
      win = new BrowserWindow({
        width: 1200,
        height: 840,
        minWidth: 880,
        minHeight: 640,
        title: "DegreeBee Focus",
        backgroundColor: "#f5f6f1",
        icon: path.join(root, "icon.png"),
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler(
        (contents, permission, callback, details) => {
          callback(
            contents === win.webContents &&
              active?.data.status === 'running' && account.hasAccess() &&
              details.requestingUrl?.startsWith("degreebee://app/") &&
              permission === "media" &&
              details.mediaTypes?.length > 0 &&
              details.mediaTypes.every((type) => type === "video"),
          );
        },
      );
      win.webContents.session.setPermissionCheckHandler(
        (contents, permission, origin, details) =>
          contents === win.webContents &&
          active?.data.status === 'running' && account.hasAccess() &&
          origin === "degreebee://app" &&
          permission === "media" &&
          details.mediaType === "video",
      );
      win.once("ready-to-show", () => win.show());
      win.webContents.on("render-process-gone", () => {
        closeAlert();
        if (active) {
          active.pause();
          attention.reset();
          alertPolicy.resetEpisode();
          latestAlerts = [];
          checkpoint();
        }
        dialog.showErrorBox(
          "Monitoring stopped",
          "The app display stopped. The latest checkpoint was saved if disk access was available. Reopen the app to start a new session.",
        );
      });
      win.on("close", (event) => {
        if (quitting) return;
        if (active) {
          const choice = dialog.showMessageBoxSync(win, {
            type: "question",
            title: "Session still open",
            message: "Save your session and quit?",
            detail:
              "Choose Keep running to continue monitoring in the background. Reopen the app from the system tray.",
            buttons: ["Save & quit", "Keep running", "Cancel"],
            defaultId: 1,
            cancelId: 2,
          });
          if (choice !== 0) {
            event.preventDefault();
            if (choice === 1) win.hide();
            return;
          }
          try {
            finish("app_closed");
          } catch {
            event.preventDefault();
            show();
            return;
          }
        }
        quitting = true;
        app.quit();
      });
      tray = new Tray(path.join(root, "icon.png"));
      tray.on("double-click", show);
      updateTray();

      handle("focus:state", current);
      handle('support:request', async (action,input) => {
        if(accountBusy&&!['summary','list','detail','read'].includes(action))throw new Error('Please wait for the account update to finish.');
        try{return await supportRequest(account,action,input);}finally{if(account.authExpired)publish();}
      });
      const accountAction = (callback, changesIdentity = false) => async (...args) => {
        if (accountBusy || account.syncing || monitorBusy || verificationBusy) throw new Error("An account update is in progress. Please wait.");
        if (changesIdentity && active) throw new Error("Finish or delete your session before changing accounts.");
        accountBusy = true;
        try { return await callback(...args); }
        finally { accountBusy = false; publish(); }
      };
      handle("account:auth", accountAction(async (kind, input) => {
        if (account.user && !account.authExpired) throw new Error("Sign out before using another account.");
        if (account.user && String(input?.email).toLowerCase().trim() !== account.user.email)
          throw new Error("Sign out before using another account.");
        await account.authenticate(kind,input); accessError='';selectProfile();
        await account.sync(store.list().sessions); return current();
      }, true));
      handle("account:logout", accountAction(async () => { await account.logout();accessError='';selectProfile();return current(); }, true));
      handle("account:sync", accountAction(async () => {await account.sync(store.list().sessions);return current();}));
      handle("account:refresh", accountAction(async () => {await account.refresh();return current();}));
      handle("account:demo-activate", accountAction(async () => {await account.activateDemo();accessError='';return current();}));
      handle("account:visibility", accountAction(async (value) => {await account.visibility(value);return current();}));
      handle("account:password", accountAction(async (input) => {await account.changePassword(input);return current();}, true));
      handle("account:delete", accountAction(async (password) => {await account.deleteAccount(password);selectProfile();return current();}, true));
      handle("focus:settings", (patch) => {
        if(!account.user || account.authExpired)throw new Error('Please sign in to continue.');
        if (active && active.data.status !== "paused")
          throw new Error("Pause the session before changing monitoring settings.");
        const settings = preferences.patch(patch);
        active?.configure(settings);
        attention.configure(settings);
        alertPolicy.resetEpisode();
        latestAlerts = [];
        closeAlert();
        if (active && !checkpoint()) throw new Error(saveError);
        publish();
        return current();
      });
      handle("focus:copy-summary", (text) => {
        if (typeof text !== "string" || text.length > 20000)
          throw new Error("The summary could not be copied.");
        clipboard.writeText(text);
        return true;
      });
      handle("focus:history", () => account.user ? store.list() : {sessions:[],warnings:[]});
      handle("focus:start", async (title) => {
        if (accountBusy) throw new Error("Please wait for the account update to finish.");
        if (active) throw new Error("Finish the current session first.");
        if (typeof title !== "string") throw new Error("Invalid session name.");
        await requireMonitoringAccess();
        if(active)throw new Error('Finish the current session first.');
        const settings = preferences.snapshot();
        active = new FocusSession(title, Date.now(), settings);
        attention = new AttentionTracker(settings);
        alertPolicy = new AttentionAlerts();
        latestAlerts = [];
        if (!checkpoint()) {
          active = null;
          publish();
          throw new Error(saveError);
        }
        updateTray();
        publish();
        return current();
      });
      handle("focus:pause", () => {
        active?.pause();
        closeAlert();
        attention.reset();
        alertPolicy.resetEpisode();
        latestAlerts = [];
        checkpoint();
        updateTray();
        publish();
        return current();
      });
      handle("focus:resume", async () => {
        if(!active)throw new Error('Start a session first.');
        await requireMonitoringAccess();
        active?.resume();
        attention.reset();
        alertPolicy.resetEpisode();
        latestAlerts = [];
        checkpoint();
        updateTray();
        publish();
        return current();
      });
      handle("focus:finish", () => finish());
      handle("focus:discard", (id) => {
        if (!active || id !== active.data.id)
          throw new Error("The current session has changed. Please try again.");
        store.remove(id);
        active = null;
        saveError = null;
        latestAlerts = [];
        closeAlert();
        attention.reset();
        alertPolicy.resetEpisode();
        updateTray();
        publish();
        return current();
      });
      ipcMain.on("focus:observation", (event, input) => {
        if (!trusted(event) || active?.data.status !== "running") return;
        if(!account.hasAccess()){pauseForAccess('Monitoring paused. Please verify your subscription in Account.');return;}
        const observation = attention.update(input);
        if (!observation) return;
        active.signal(observation.signal);
        active.checks = observation.checks;
        active.issues = observation.issues;
        const events = alertPolicy.update(observation.issues);
        if (events.length) {
          latestAlerts = [
            ...latestAlerts.filter(
              (item) => Date.now() - Date.parse(item.at) < 12000,
            ),
            ...events,
          ].slice(-4);
          active.data.alerts.push(...events);
          showDesktopAlert();
          checkpoint();
          publish();
        }
      });
      handle("focus:folder", () => {if(!account.user)throw new Error('Please sign in to continue.');return shell.openPath(store.directory);});
      for (const channel of ['alert:dismiss','alert:open','alert:sound-fallback']) ipcMain.on(channel,event=>{
        if (!alertWindow || event.sender !== alertWindow.webContents || event.senderFrame !== alertWindow.webContents.mainFrame) return;
        if(channel === 'alert:sound-fallback') { if (preferences.snapshot().sound) shell.beep(); return; }
        if(channel === 'alert:open') show();
        closeAlert();
      });
      handle("focus:compact", (value) => {
        if(value && (!account.user || !account.hasAccess()))throw new Error('Start an active subscription session before using mini mode.');
        if (Boolean(value) === isCompact) return current();
        isCompact = Boolean(value);
        if (isCompact) {
          fullBounds = win.getBounds();
          win.setMinimumSize(400, 580);
          win.setSize(420, 760);
          win.setAlwaysOnTop(true);
        } else {
          win.setAlwaysOnTop(false);
          win.setMinimumSize(880, 640);
          if (fullBounds) win.setBounds(fullBounds);
        }
        publish();
        return current();
      });
      let exporting = false;
      handle("focus:export", async (format, id) => {
        if(!account.user)throw new Error('Please sign in to continue.');
        if (!["pdf", "png"].includes(format)) throw new Error("Unsupported format.");
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("Choose a saved session first.");
        if (exporting) throw new Error("Please wait for the current export to finish.");
        const reports = store.list().sessions;
        const report = reports.find(s => s.id === id);
        if (!report || !["completed", "interrupted"].includes(report.status)) throw new Error("Finish and save this session before exporting.");
        exporting = true;
        try {
          const safeTitle = report.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 60).trim() || "Session";
          const result = await dialog.showSaveDialog(win, {
            title: format === "pdf" ? "Save PDF" : "Save progress image",
            defaultPath: path.join(app.getPath("documents"), `DegreeBee-${safeTitle}-${report.startedAt.slice(0,10)}.${format}`),
            filters: [{ name: format === "pdf" ? "PDF report" : "PNG image", extensions: [format] }],
          });
          if (result.canceled || !result.filePath) return null;
          const content = await renderReport(report, reports, format, root);
          await fs.promises.writeFile(result.filePath, content);
          return result.filePath;
        } finally { exporting = false; }
      });

      for (const event of ["suspend", "lock-screen"])
        powerMonitor.on(event, () => {
          closeAlert();
          active?.pause();
          attention.reset();
          alertPolicy.resetEpisode();
          latestAlerts = [];
          checkpoint();
          updateTray();
          publish();
        });
      powerMonitor.on("shutdown", () => {
        if (active) {
          active.pause();
          attention.reset();
          alertPolicy.resetEpisode();
          latestAlerts = [];
          closeAlert();
          checkpoint();
        }
      });
      timer = setInterval(() => {
        if (!active) return;
        if(active.data.status==='running') {
          if(!account.hasAccess()){pauseForAccess('Monitoring paused. Your subscription needs to be verified.');return;}
          if(performance.now()>=nextVerification&&!verificationBusy&&!accountBusy) {
            verificationBusy=true;nextVerification=performance.now()+30000;
            account.checkAccess().catch(error=>pauseForAccess(error.message)).finally(()=>{verificationBusy=false;});
          }
        }
        active.tick();
        if (Date.now() - lastSave >= 5000) checkpoint();
        publish();
      }, 250);
      await win.loadURL("degreebee://app/");
      if (account.user) account.sync(store.list().sessions).catch(() => {});
    })
    .catch((error) => {
      dialog.showErrorBox("DegreeBee Focus could not start", error.message);
      app.exit(1);
    });
}
app.on("before-quit", () => {
  if (active) checkpoint();
});
app.on("will-quit", () => {
  clearInterval(timer);
  closeAlert();
  tray?.destroy();
});
app.on("window-all-closed", () => app.quit());
