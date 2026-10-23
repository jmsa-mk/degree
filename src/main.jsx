import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useCamera } from "./useCamera";
import { StudySettings, DailyGoal, DEFAULT_UI_SETTINGS } from "./StudySettings";
import { summarizeReport, dailyProgress } from "./report-insights.mjs";
import { ProgressPage } from "./Community";
import { HelpSupport } from "./HelpSupport";
import { AccountPage, SubscriptionCard } from "./CustomerAccount";
import "./styles.css";

const api = window.degreebee;
const labels = {
  focused: "Focused",
  no_face: "Face not visible",
  eyes_closed: "Eyes closed",
  looking_away: "Looking away",
  unobserved: "Unobserved",
  paused: "Paused",
};
const statuses = {
  completed: "Completed",
  interrupted: "Recovered",
  running: "Running",
  paused: "Paused",
};
function duration(ms = 0) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
function short(ms = 0) {
  return ms >= 3600000
    ? `${(ms / 3600000).toFixed(1)} hr`
    : `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
}
function date(value) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function Icon({ name, size = 20 }) {
  const paths = {
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="3" />
        <path d="M8 21h8M12 17v4M8 11l3 2 5-5" />
      </>
    ),
    report: (
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 17v-3M12 17v-5M16 17v-2" />
    ),
    camera: (
      <>
        <path d="m15 8 6-3v14l-6-3" />
        <rect x="2" y="6" width="13" height="12" rx="3" />
      </>
    ),
    face: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="7" />
        <path d="M9 9v1m6-1v1M9 15q3 3 6 0" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    head: (
      <>
        <path d="M8 21v-4a7 7 0 1 1 11-6l2 3h-3v4h-5v3M3 12H1m3-5L2 5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" />,
    folder: <path d="M3 7V5h6l2 2h10v13H3z" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
    compact: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <rect x="12" y="12" width="9" height="8" rx="1" />
      </>
    ),
    shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.info}
    </svg>
  );
}
function Checks({ checks, settings }) {
  const face = checks?.facePresent ?? null;
  const eyes =
    face === false
      ? false
      : checks?.eyesOpen === false || checks?.eyesForward === false
        ? false
        : checks?.eyesOpen === true && (settings.activity === "reading" || checks?.eyesForward === true)
          ? true
          : null;
  const head = face === false ? false : (checks?.headForward ?? null);
  const items = [
    [
      "face",
      "Face visibility",
      face,
      face === false ? "Face not visible" : "Face visible",
    ],
    [
      "eye",
      "Eye attention",
      eyes,
      face === false
        ? "Eyes not visible"
        : checks?.eyesOpen === false
          ? "Eyes closed"
          : eyes === false
            ? "Eyes looking away"
            : settings.activity === "reading" ? "Eyes open" : "Eyes open · forward",
    ],
    [
      "head",
      "Head direction",
      head,
      face === false
        ? "Head not visible"
        : head === false
          ? "Head turned away"
          : "Facing forward",
    ],
  ];
  return (
    <div className="checks-grid" aria-label="Live camera indicators">
      {items.map(([icon, label, good, text]) => {
        const enabled = settings.checks[icon === "eye" ? "eyes" : icon];
        const status = !enabled ? "off" : good === null ? "unknown" : good ? "good" : "bad";
        return (
        <div
          key={icon}
          data-testid={`indicator-${icon}`}
          data-state={status}
          className={`check-card ${status}`}
        >
          <span className="check-icon">
            <Icon name={icon} size={24} />
          </span>
          <div>
            <strong>{label}</strong>
            <span>{!enabled ? "Check turned off" : good === null ? "Waiting for observation" : text}</span>
          </div>
          <span className="check-state">
            {!enabled || good === null ? "—" : good ? "✓" : "!"}
          </span>
        </div>
      );})}
    </div>
  );
}
function Metrics({ report }) {
  return (
    <div className="metrics">
      <div>
        <span>Focused time</span>
        <strong>{duration(report?.focusMs)}</strong>
        <small>
          <i className="dot focused" />
          Observed focus
        </small>
      </div>
      <div>
        <span>Distraction</span>
        <strong>{duration(report?.distractedMs)}</strong>
        <small>
          <i className="dot looking_away" />
          From camera signals
        </small>
      </div>
      <div>
        <span>Focus score</span>
        <strong>
          {report?.score == null ? "—" : report.score}
          <em>{report?.score == null ? "" : "%"}</em>
        </strong>
        <small>Based on observed time</small>
      </div>
    </div>
  );
}
function ReportDetail({ report, onExport, onClose }) {
  const wallMs = Object.values(report.counts).reduce((a, b) => a + b, 0);
  const insight = summarizeReport(report);
  const [saving, setSaving] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  async function save(format) {
    setSaving(true); setExportMessage("");
    try { const file = await onExport(format, report.id); if (file) setExportMessage(`Saved to ${file}`); }
    catch (error) { setExportMessage(`Could not save: ${error.message}`); }
    finally { setSaving(false); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Report details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-top">
          <span className="eyebrow">SESSION REPORT</span>
          <button
            className="icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2>{report.title}</h2>
        <p className="muted">
          {date(report.startedAt)} · {statuses[report.status]}
        </p>
        {report.status === "interrupted" && (
          <div className="notice">
            Recovered up to the last saved checkpoint. Time after the app
            stopped was not added.
          </div>
        )}
        <div className="report-takeaway">
          <span className="eyebrow">{insight.modeLabel}</span>
          <h3>{insight.headline}</h3><p>{insight.detail}</p>
          <div className="next-step"><Icon name="info" size={18} /><span>{insight.nextStep}</span></div>
        </div>
        <div className="report-highlights">
          <div><span>Active session</span><strong>{short(report.totalMs)}</strong></div>
          <div><span>Longest observed focus</span><strong>{short(insight.longestFocusMs)}</strong></div>
          <div><span>Reminders</span><strong>{insight.alertCount}</strong></div>
        </div>
        <details className="report-technical"><summary>Camera details & timeline</summary>
        <Metrics report={report} />
        <div className="detail-summary">
          <span>
            Active duration <b>{duration(report.totalMs)}</b>
          </span>
          <span>
            Camera coverage <b>{report.coverage}%</b>
          </span>
          <span>
            Unobserved <b>{short(report.counts.unobserved)}</b>
          </span>
          <span>
            Paused <b>{short(report.counts.paused)}</b>
          </span>
        </div>
        <h3>Focus timeline</h3>
        <div className="timeline">
          {report.timeline
            .filter((s) => s.durationMs > 0)
            .map((s, i) => (
              <span
                key={i}
                className={s.state}
                style={{ flexGrow: s.durationMs / Math.max(1, wallMs) }}
                title={`${labels[s.state]} · ${short(s.durationMs)}`}
              />
            ))}
        </div>
        <div className="legend">
          {Object.entries(labels).map(([key, label]) => (
            <span key={key}>
              <i className={`dot ${key}`} />
              {label}
            </span>
          ))}
        </div>
        <div className="breakdown">
          {["no_face", "eyes_closed", "looking_away"].map((key) => (
            <div key={key}>
              <span>{labels[key]}</span>
              <b>{short(report.counts[key])}</b>
              <div className="bar">
                <i
                  className={key}
                  style={{
                    width: `${report.totalMs ? (report.counts[key] / report.totalMs) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        {!!report.alerts?.length && (
          <details className="alert-history">
            <summary>Detection alerts ({report.alerts.length})</summary>
            <ul>
              {report.alerts.map((alert, i) => (
                <li key={i}>
                  <b>{alert.title}</b>
                  <span>{date(alert.at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        </details>
        <div className="modal-actions report-primary-actions">
          <button className="primary" disabled={saving} onClick={() => save("pdf")}><Icon name="download" />Save PDF</button>
          <button className="secondary" disabled={saving} onClick={() => save("png")}><Icon name="download" />Save progress image</button>
          <button className="text-button" disabled={saving} onClick={onClose}>Done</button>
        </div>
        <p className="share-hint" role="status">{saving ? "Preparing your file..." : exportMessage || "PDF for a readable session report. PNG for a progress card you can share."}</p>
      </section>
    </div>
  );
}
function App() {
  const [experience, setExperience] = useState(() => localStorage.getItem('experience') || 'personal');
  const [page, setPage] = useState("monitor"),
    [state, setState] = useState({
      active: null,
      folder: "",
      compact: false,
    });
  const [title, setTitle] = useState(""),
    [history, setHistory] = useState({ sessions: [], warnings: [] }),
    [detail, setDetail] = useState(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [supportInfo,setSupportInfo] = useState({staff:false,unread:0});
  const [savedReport, setSavedReport] = useState(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light",
  );
  const settings = state.settings || DEFAULT_UI_SETTINGS;
  const signedIn = !!state.account?.user && !state.account?.authExpired;
  const displayError = (error || state.accessError || state.account?.error || '').replace(/^Error invoking remote method '[^']+': Error: /, '');
  const subscribed = state.account?.subscription?.active === true;
  const cameraEnabled = signedIn && state.account?.canMonitor && Object.values(settings.checks).some(Boolean);
  const active = state.active,
    camera = useCamera(active?.status === "running" && cameraEnabled);
  const settingsLocked = active?.status === "running";
  const progress = dailyProgress(history.sessions, active, settings.dailyGoalMinutes);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    const unsubscribe = api.onUpdate(setState);
    api
      .state()
      .then(setState)
      .catch((e) => setError(e.message));
    api
      .history()
      .then(setHistory)
      .catch((e) => setError(e.message));
    return unsubscribe;
  }, []);
  useEffect(() => {
    setDetail(null); setSavedReport(null); setMessage('');
    api.history().then(setHistory).catch(e=>setError(e.message));
  }, [state.account?.user?.id]);
  async function accountChanged(next) { setState(next); setHistory(await api.history()); }
  useEffect(()=>{
    let alive=true;setSupportInfo({staff:false,unread:0});
    const refresh=()=>{if(signedIn)api.support('summary').then(data=>{if(alive)setSupportInfo(data);}).catch(()=>{});};
    refresh();const timer=setInterval(refresh,30000);
    return()=>{alive=false;clearInterval(timer);};
  },[signedIn,state.account?.user?.id]);
  useEffect(() => {
    if (camera.error) {
      setError(camera.error);
      api.pause().catch((e) => setError(e.message));
    }
  }, [camera.error]);
  useEffect(() => {
    if (page === "reports")
      api
        .history()
        .then(setHistory)
        .catch((e) => setError(e.message));
  }, [page, active?.status]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") {
        setDetail(null);
        setDeleteId(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function action(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    const report = await api.finish();
    setHistory(await api.history());
    if (state.compact) await api.compact(false);
    if (settings.showReport && experience === 'reports') setDetail(report);
    setSavedReport(report);
    setMessage(experience === 'personal' ? 'Session saved. Your study journey keeps growing.' : "Session report saved on this device.");
    if (experience === 'personal') setPage('progress');
  }
  async function discard() {
    const id = deleteId;
    setDeleteId(null);
    await action(async () => {
      setState(await api.discard(id));
      setHistory(await api.history());
      setMessage(
        "Session deleted. Its report and recovery copies were removed.",
      );
    });
  }
  async function exportReport(format, id) {
    return api.exportReport(format, id);
  }
  async function changeSettings(patch) {
    await action(async () => {
      const next = { ...settings, ...patch, checks: { ...settings.checks, ...patch.checks } };
      if (patch.activity) next.checks.head = patch.activity === "screen";
      setState(previous => ({ ...previous, settings: next }));
      try { setState(await api.settings(patch)); }
      catch (error) { setState(await api.state()); throw error; }
    });
  }
  const visibleReports = history.sessions.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase()),
  );
  const done = history.sessions.filter((s) =>
      ["completed", "interrupted"].includes(s.status),
    ),
    totalFocus = done.reduce((sum, s) => sum + s.focusMs, 0),
    totalActive = done.reduce((sum, s) => sum + s.totalMs, 0);
  const currentSignal = active?.currentState || "unobserved";
  const metric = (key, digits = 2) =>
    Number.isFinite(camera.metrics[key])
      ? camera.metrics[key].toFixed(digits)
      : "—";
  return (
    <div className={`app ${state.compact ? "compact" : ""}`}>
      <main>
        <header>
          <div className="brand">
            <img src="./brand/logo.png" alt="" />
            <div>
              DegreeBee<span>FOCUS DESKTOP</span>
            </div>
          </div>
          {signedIn && <nav aria-label="Main navigation">
            {[
              ["monitor", "monitor", "Monitoring"],
              ["progress", "check", "Progress & league"],
              ["reports", "report", "Report history"],
              ["account", "shield", "Account"],
              ["support", "info", "Help & support"],
            ].map(([key, icon, label]) => (
              <button
                key={key}
                className={page === key ? "selected" : ""}
                onClick={() => setPage(key)}
              >
                <Icon name={icon} />
                {label}
                {key==='support'&&supportInfo.unread>0&&<span className="support-count">{supportInfo.unread}</span>}
              </button>
            ))}
          </nav>}
          <div className="header-right">
            {!signedIn&&<button className="text-button" onClick={()=>setPage(page==='support'?'monitor':'support')}>{page==='support'?'Back to sign in':'Help & support'}</button>}
            <span className="offline-pill">
              <i className={`dot ${signedIn?'focused':'unobserved'}`} />
              {signedIn ? state.account.syncing ? 'Syncing' : 'Signed in' : 'Sign in required'}
            </span>
            <button
              className="icon-button"
              aria-label={theme === "light" ? "Dark Mode" : "Light Mode"}
              title={theme === "light" ? "Dark Mode" : "Light Mode"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} />
            </button>
            <button
              className="icon-button"
              title={state.compact ? "Full view" : "Mini mode, always on top"}
              aria-label={state.compact ? "Full view" : "Mini mode"}
              onClick={() => action(() => api.compact(!state.compact))}
              disabled={!signedIn || (!state.compact && !state.account?.canMonitor)}
            >
              <Icon name="compact" />
            </button>
          </div>
        </header>
        <div className="content">
          {!signedIn ? <>
            {displayError && <div className="notice error" role="alert">{displayError}</div>}
            {active && <div className="notice"><span>Your session is paused. Save it before signing in again.</span><button className="secondary" onClick={()=>action(finish)}>Finish & save</button></div>}
            {page==='support'?<HelpSupport key="guest-support" info={supportInfo} onSummary={setSupportInfo} onSignIn={()=>setPage('monitor')} onNavigate={setPage}/>:<AccountPage account={state.account} active={active} busy={busy} run={action} onChange={accountChanged}/>}
          </> : <>
          {!state.compact && <div className="experience-bar"><span>Workspace</span><div className="activity-options"><button aria-pressed={experience==='personal'} onClick={()=>{setExperience('personal');localStorage.setItem('experience','personal');setPage('progress');}}>Personal</button><button aria-pressed={experience==='reports'} onClick={()=>{setExperience('reports');localStorage.setItem('experience','reports');setPage('reports');}}>Reports</button></div><span className="muted">{experience==='personal'?'Build your habit with XP, badges and a weekly league.':'Review saved observations and export reports for sharing.'}</span></div>}
          {displayError && (
            <div className="notice error" role="alert">
              <span>{displayError}</span>
              {error && <button aria-label="Dismiss message" onClick={() => setError("")}>
                ×
              </button>}
            </div>
          )}
          {state.saveError && (
            <div className="notice error" role="alert">
              {state.saveError}
            </div>
          )}
          {state.settingsWarning && <div className="notice" role="alert"><span>{state.settingsWarning}</span></div>}
          {message && (
            <div className="notice success" role="status">
              <span>{message}</span>
              {savedReport && message === "Session report saved on this device." && <button className="notice-link" onClick={() => setDetail(savedReport)}>View report</button>}
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {page === 'progress' && !state.compact && <ProgressPage account={state.account} reports={history.sessions} busy={busy} onStart={()=>setPage('monitor')} onAccount={()=>setPage('account')} onRefresh={()=>action(async()=>accountChanged(await api.accountSync()))}/>}
          {page === 'support' && !state.compact && <HelpSupport key={state.account.user.id} user={state.account.user} info={supportInfo} onSummary={setSupportInfo} onSignIn={()=>setPage('account')} onNavigate={setPage}/>}
          {page === 'account' && !state.compact && <AccountPage account={state.account} active={active} busy={busy} run={action} onChange={accountChanged}/>}
          {page === 'monitor' && !subscribed && !active && <SubscriptionCard account={state.account} busy={busy} onRefresh={()=>action(async()=>accountChanged(await api.accountRefresh()))} onActivate={async()=>{await accountChanged(await api.accountDemoActivate());setError('');setMessage('Demo access activated. You can now start your focus session.');}}/>}
          <div hidden={(page !== "monitor" && !state.compact) || (!subscribed && !active)}>
            <div className="page-title">
              <div>
                <span className="eyebrow">Focus better with AI</span>
                <h1>
                  Time to <span className="gradient-text">focus.</span>
                </h1>
                <p>A little support for your next study session.</p>
              </div>
              <div className="today">
                {new Date().toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
            <StudySettings settings={settings} locked={settingsLocked} busy={busy} onChange={changeSettings} />
            <div className="monitor-grid">
              <section className="session-card">
                <div className="section-top">
                  <span className="eyebrow">STUDY SESSION</span>
                  <span className={`status ${active ? currentSignal : ""}`}>
                    <i className={`dot ${active ? currentSignal : "paused"}`} />
                    {active ? active.status === "running" && !cameraEnabled ? "Timer only" : labels[currentSignal] : "Ready to start"}
                  </span>
                </div>
                <label className="session-label" htmlFor="session-name">
                  What would you like to work on?
                </label>
                <input
                  id="session-name"
                  className="session-input"
                  value={active?.title ?? title}
                  disabled={!!active}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="For example: Learn Laravel, read a paper..."
                  maxLength={120}
                />
                <div className="timer">{duration(active?.totalMs)}</div>
                <div className="timer-caption">
                  {active?.status === "paused"
                    ? "Take your break · camera and reminders paused"
                    : active
                      ? "Active session duration"
                      : "One session. One step forward."}
                </div>
                <div className="session-actions">
                  {!active ? (
                    <button
                      className="primary start"
                      disabled={busy}
                      onClick={() => action(() => api.start(title))}
                    >
                      <Icon name="play" />
                      Start focus
                    </button>
                  ) : (
                    <>
                      {["running", "paused"].includes(active.status) && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              active.status === "paused"
                                ? api.resume()
                                : api.pause(),
                            )
                          }
                        >
                          <Icon
                            name={active.status === "paused" ? "play" : "pause"}
                          />
                          {active.status === "paused" ? "Resume" : "Pause"}
                        </button>
                      )}
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => action(finish)}
                      >
                        <Icon name="stop" />
                        Finish & save
                      </button>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => setDeleteId(active.id)}
                      >
                        <Icon name="trash" size={17} />
                        Delete session
                      </button>
                    </>
                  )}
                </div>
                {active && <p className="break-hint">{active.status === "paused" ? "Resume whenever you are ready." : "Need a bathroom, stretch, or drink break? Click Pause."}</p>}
                <div className="autosave">
                  <Icon name="check" size={14} />
                  {active
                    ? "Automatic checkpoint every 5 seconds"
                    : "Reports are saved automatically when you finish"}
                </div>
              </section>
              <section className="camera-card">
                <div className="section-top">
                  <span className="eyebrow">CAMERA OBSERVATION</span>
                  <Icon name="camera" size={18} />
                </div>
                <div
                  className={`camera-preview ${camera.ready ? "ready" : ""}`}
                >
                  <video
                    ref={camera.videoRef}
                    muted
                    autoPlay
                    playsInline
                    aria-label="Camera preview"
                  />
                  {!camera.ready && (
                    <div className="camera-placeholder">
                      <div className="camera-ring">
                        <Icon name="camera" size={28} />
                      </div>
                      <strong>
                        {camera.loading
                          ? "Preparing camera..."
                          : active?.status === "paused"
                            ? "Camera paused"
                            : !cameraEnabled ? "Timer-only session" : "Camera is off"}
                      </strong>
                      <span>
                        {camera.loading
                          ? "Loading the on-device model"
                          : !cameraEnabled ? "All detection checks are off. Your session time is still saved." : "Active only while a session is running"}
                      </span>
                    </div>
                  )}
                  {camera.ready && (
                    <span className="camera-live">
                      <i className="dot focused" />
                      Camera active · local
                    </span>
                  )}
                </div>
                <div className="camera-footer">
                  <Icon name="shield" size={16} />
                  <span>Camera images are never recorded or uploaded.</span>
                </div>
                <div className="calibration-controls">
                  <button
                    className="text-button"
                    disabled={!camera.ready || camera.calibrating}
                    onClick={camera.calibrate}
                  >
                    Calibrate forward position
                  </button>
                  <details>
                    <summary>Detection details</summary>
                    <div className="diagnostics">
                      <span>
                        Eye closure score <b>{metric("blink")}</b>
                      </span>
                      <span>
                        Eye openness <b>{metric("ear")}</b>
                      </span>
                      <span>
                        Closure threshold <b>{metric("earThreshold")}</b>
                      </span>
                      <span>
                        Head turn <b>{metric("relativeYaw", 1)}°</b>
                      </span>
                      <span>
                        Head tilt <b>{metric("relativePitch", 1)}°</b>
                      </span>
                    </div>
                  </details>
                </div>
                {camera.calibrationMessage && (
                  <p className="calibration-message" role="status">
                    {camera.calibrationMessage}
                  </p>
                )}
                {camera.calibrating && <progress className="calibration-progress" aria-label="Calibration progress" value={camera.calibrationProgress || 0} max="1" />}
                {camera.calibrated && !camera.calibrating && <div className="calibration-status"><span>✓ Calibrated for this app session</span><button className="text-button" onClick={camera.resetCalibration}>Reset calibration</button></div>}
                <p className="camera-help">Glasses or unexpected eye alerts? Reduce reflections, face a light source, and calibrate with your eyes comfortably open. You can pause and turn Eye checks off if needed.</p>
              </section>
            </div>
            <Checks checks={active?.checks} settings={settings} />
            <Metrics report={active} />
            <DailyGoal progress={progress} settings={settings} locked={settingsLocked || busy} onChange={changeSettings} />
            <div className="lower-grid">
              <section className="tip-card">
                <span className="tip-icon">
                  <Icon name="monitor" size={25} />
                </span>
                <div>
                  <h3>Open your favorite study app.</h3>
                  <p>
                    Word, PDFs, a browser, or any other app. Monitoring
                    continues when this window is minimized.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => action(() => api.compact(true))}
                  >
                    Use mini mode <Icon name="arrow" size={15} />
                  </button>
                </div>
              </section>
              <section className="observation">
                <h3>Session observation</h3>
                <div>
                  <span>Unobserved</span>
                  <strong>{short(active?.counts.unobserved)}</strong>
                </div>
                <div>
                  <span>Camera coverage</span>
                  <strong>{active?.coverage ?? 0}%</strong>
                </div>
                <p>
                  {cameraEnabled ? settings.sensitivity === "gentle" ? "Gentle reminders allow brief glances before alerting you." : "Balanced reminders ignore brief blinks and react to sustained changes." : "Timer only: no camera observations or focus score. Your active time counts toward your daily goal."}
                </p>
              </section>
            </div>
            <p className="footnote">
              <Icon name="info" size={14} />
              Camera-based estimates of face, eyes, and head direction—not a
              measure of mental concentration.
            </p>
          </div>
          {page === "reports" && !state.compact && (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">SEE YOUR PROGRESS</span>
                  <h1>Every session counts.</h1>
                  <p>Your observations, saved on this device.</p>
                </div>
              </div>
              <div className="metrics history-metrics">
                <div>
                  <span>Saved sessions</span>
                  <strong>{done.length}</strong>
                  <small>Completed and recovered</small>
                </div>
                <div>
                  <span>Total focused time</span>
                  <strong>{short(totalFocus)}</strong>
                  <small>Across finished sessions</small>
                </div>
                <div>
                  <span>Total study time</span>
                  <strong>{short(totalActive)}</strong>
                  <small>Active session time · breaks excluded</small>
                </div>
              </div>
              {history.warnings.map((w) => (
                <div className="notice" key={w}>
                  {w}
                </div>
              ))}
              <section className="history-card">
                <div className="section-top">
                  <h3>Session history</h3>
                  <input
                    className="search"
                    aria-label="Search sessions"
                    placeholder="Search session names..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {!visibleReports.length ? (
                  <div className="empty">
                    <Icon name="report" size={40} />
                    <h3>
                      {query
                        ? "No sessions found"
                        : "Your first report is waiting."}
                    </h3>
                    <p>
                      {query
                        ? "Try another search."
                        : "Start a focus session. Your results will appear here."}
                    </p>
                    {!query && (
                      <button
                        className="primary"
                        onClick={() => setPage("monitor")}
                      >
                        Start your first session
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Session</th>
                          <th>Active duration</th>
                          <th>Focused</th>
                          <th>Score</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleReports.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.title}</strong>
                              <small>{date(r.startedAt)}</small>
                            </td>
                            <td>{short(r.totalMs)}</td>
                            <td>{short(r.focusMs)}</td>
                            <td>
                              <span className="score-pill">
                                {r.score == null ? "—" : `${r.score}%`}
                              </span>
                            </td>
                            <td>{statuses[r.status]}</td>
                            <td>
                              <button
                                className="text-button"
                                aria-label={`View report ${r.title}`}
                                onClick={() => setDetail(r)}
                              >
                                Details <Icon name="arrow" size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <p className="history-export">Open a saved session to save a PDF report or a progress image.</p>
            </>
          )}
          {page === "guide" && !state.compact && (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">ENTIRELY ON YOUR DESKTOP</span>
                  <h1>Your space for focus.</h1>
                  <p>Your guide to monitoring, progress and privacy.</p>
                </div>
              </div>
              <section className="guide-card">
                <h3>Personal progress and shared rankings</h3>
                <p>Personal workspace celebrates completed sessions with XP and badges. Earn 1 XP per active minute, up to 180 per day. A streak needs 10 minutes a day. Days and weeks use Asia/Jakarta; the league starts every Monday. Timer-only and reading sessions count too. Rankings use recorded time, not camera scores.</p>
                <p>Sign in with an active subscription to use monitoring. Internet access is required to verify your subscription. Joining the leaderboard is optional and shares only your display name and weekly XP. Camera data and detailed reports are not uploaded.</p>
                <p>Reports can be shared manually with a teacher, organization or parent. Camera signals describe visible behavior and cannot establish mental concentration or exam integrity.</p>
              </section>
              <section className="guide-card">
                <h3>Start in three steps</h3>
                <ol>
                  <li>
                    Choose <b>Computer work</b> or <b>Reading / notes</b>, name your session and click <b>Start focus</b>. Keep your
                    face well lit and visible.
                  </li>
                  <li>
                    Open any study app. Minimize this window or use mini mode;
                    monitoring continues.
                  </li>
                  <li>
                    Use <b>Pause</b> for a bathroom, stretch, or drink break; the camera and reminders stop until you resume. Click <b>Finish & save</b> when done. Find your saved session in Report history anytime.{" "}
                    <b>Delete session</b> stops and removes the current session,
                    including its recovery copies.
                  </li>
                </ol>
              </section>
              <section className="guide-card">
                <h3>Understand the three indicators</h3>
                <p>
                  <b>Face:</b> green when visible, red when absent. <b>Eyes:</b>{" "}
                  green when open and looking forward, red when closed or
                  looking away. <b>Head:</b> green when facing forward, red when
                  turned or tilted away. Gray means the camera cannot assess
                  that check yet, or you have turned it off in Detection & reminders.
                </p>
                <p>
                  Eye closure uses both eyelid shape and the model's blink
                  score. Brief blinks are ignored; closed eyes lasting about
                  0.65 seconds, an absent face for 0.7 seconds, or a head/gaze
                  shift for 0.9 seconds trigger an alert. The checks run
                  independently, so closed eyes and a turned head can both be
                  reported. Gentle sensitivity waits longer to allow brief glances. Only enabled checks affect your session.
                </p>
                <p><b>Reading a physical book:</b> choose Reading / notes. Gaze checks are off and head reminders start off, so looking down is expected. Eye closure can still be misread when your eyes are obscured; turn Eye checks off if necessary. These signals describe what the camera can see.</p>
                <p><b>Glasses and eye shape:</b> reflections and naturally narrow eyes can affect results. Calibrate with your eyes comfortably open and use even lighting. If your eyes cannot be seen reliably, pause and disable Eye checks. Calibration helps personalize the threshold; it cannot guarantee accuracy.</p>
                <p>
                  Default head limits are 18° horizontally and 22° vertically.
                  If your normal posture is marked red, click{" "}
                  <b>Calibrate forward position</b> while looking at the screen
                  with your eyes open and hold still until calibration completes. Calibration lasts until you
                  close the app. Detection details show the live measurements.
                </p>
                <p>
                  Alerts appear in a separate desktop popup over other apps with
                  an optional audible chime, even when monitoring is minimized. Change Notification sound in Detection & reminders. A new
                  condition is reported after confirmation. The same condition
                  is limited to one notification per 10 seconds and repeated
                  every 30 seconds if it persists.
                  Notifications do not steal focus from the app you are using.
                </p>
              </section>
              <section className="guide-card">
                <h3>Reports and privacy</h3>
                <p>
                  Each session is saved locally with a checkpoint every 5
                  seconds and one previous backup. After an unexpected exit, the
                  last checkpoint is recovered. Paused and unobserved time do
                  not affect the focus score. Photos and video are never saved.
                </p>
                <p>
                  Switching apps or reading without moving the mouse does not
                  count as distraction by themselves. Windows lock or sleep pauses your
                  session; resume manually when you return. Looking at another
                  monitor can still trigger gaze or head checks in Computer work mode.
                  Camera signals cannot establish mental concentration.
                </p>
                <div className="guide-actions">
                  <button
                    className="secondary"
                    onClick={() => action(() => api.openFolder())}
                  >
                    <Icon name="folder" />
                    Open report folder
                  </button>

                </div>
                <p className="small muted">
                  Reports stay with this Windows account. PDF and PNG are readable copies for sharing. Copy the
                  report folder to move them to another computer. Moving only
                  the .exe does not move your history.
                </p>
              </section>
            </>
          )}
          </>}
        </div>
      </main>
      {detail && (
        <ReportDetail
          report={detail}
          onClose={() => setDetail(null)}
          onExport={exportReport}
        />
      )}
      {deleteId && (
        <div className="modal-backdrop">
          <section
            className="modal delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Delete current session"
          >
            <h2>Delete this session?</h2>
            <p>
              This stops monitoring and permanently removes the current session
              and its saved checkpoints. Other sessions are kept.
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                autoFocus
                onClick={() => setDeleteId(null)}
              >
                Keep session
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={discard}
              >
                <Icon name="trash" />
                Delete permanently
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
