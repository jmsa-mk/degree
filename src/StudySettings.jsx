import React from "react";

export const DEFAULT_UI_SETTINGS = {
  activity: "screen", checks: { face: true, eyes: true, head: true },
  sensitivity: "balanced", sound: true, showReport: true, dailyGoalMinutes: 60,
};

export function StudySettings({ settings, locked, busy, onChange }) {
  return <section className="study-settings" aria-label="Study setup">
    <div className="setup-top">
      <div><span className="eyebrow">YOUR ACTIVITY</span><p>Choose what you are working on.</p></div>
      <div className="activity-options" aria-label="Activity mode">
        {[["screen", "Computer work"], ["reading", "Reading / notes"]].map(([value, label]) =>
          <button key={value} aria-pressed={settings.activity === value} disabled={locked || busy}
            onClick={() => onChange({ activity: value })}>{label}</button>)}
      </div>
    </div>
    <p className="setup-hint">{settings.activity === "reading"
      ? "Looking down at a book or notes is expected. Gaze checks are off; head reminders start off. Keep your face visible for the checks you leave on."
      : "For work on your computer. Pause or switch activity when you need to read a book or take handwritten notes."}</p>
    <details className="setup-details">
      <summary>Detection & reminders <span>{locked ? "Pause to adjust" : "Customize"}</span></summary>
      <fieldset disabled={locked || busy}>
        <legend className="sr-only">Monitoring preferences</legend>
        <div className="detection-toggles">
          {[["face", "Face visibility", "Remind me when my face leaves the frame."],
            ["eyes", "Eye checks", settings.activity === "reading" ? "Check eye closure; looking down is allowed." : "Check eye closure and looking away."],
            ["head", "Head direction", "Remind me when my head turns away."]].map(([key, label, help]) =>
            <label className="toggle-row" key={key}><span><strong>{label}</strong><small>{help}</small></span>
              <input type="checkbox" checked={settings.checks[key]} onChange={e => onChange({ checks: { [key]: e.target.checked } })} /></label>)}
        </div>
        <div className="preference-grid">
          <label className="select-preference"><span>Reminder sensitivity</span><select value={settings.sensitivity} onChange={e => onChange({ sensitivity: e.target.value })}>
            <option value="balanced">Balanced · brief blinks allowed</option><option value="gentle">Gentle · allow brief glances</option>
          </select></label>
          <label className="toggle-row"><span><strong>Notification sound</strong><small>Desktop popups stay on when sound is off.</small></span>
            <input type="checkbox" checked={settings.sound} onChange={e => onChange({ sound: e.target.checked })} /></label>
          <label className="toggle-row"><span><strong>Open report after finishing</strong><small>In Reports workspace. Personal opens your progress instead.</small></span>
            <input type="checkbox" checked={settings.showReport} onChange={e => onChange({ showReport: e.target.checked })} /></label>
        </div>
      </fieldset>
      <p className="setup-hint">{locked ? "Pause your session to change these settings, then resume when ready." : "Settings are saved on this device. Turn every check off for a camera-free timer."}</p>
    </details>
  </section>;
}

export function DailyGoal({ progress, settings, locked, onChange }) {
  return <section className={`daily-goal ${progress.goalReached ? "reached" : ""}`} aria-label="Daily study goal">
    <div className="goal-heading"><div><span className="eyebrow">ONE STEP EVERY DAY</span><h3>Today's study goal</h3></div>
      <label><span className="sr-only">Daily goal</span><select aria-label="Daily goal" value={settings.dailyGoalMinutes} disabled={locked}
        onChange={e => onChange({ dailyGoalMinutes: Number(e.target.value) })}>
        {[30, 60, 90, 120].map(n => <option value={n} key={n}>{n} minutes</option>)}
      </select></label></div>
    <div className="goal-numbers"><strong>{Math.floor(progress.activeMs / 60000)} <small>/ {settings.dailyGoalMinutes} min</small></strong>
      <span>{progress.goalReached ? "✓ Goal reached" : progress.milestone}</span></div>
    <progress value={progress.percent} max="100" aria-label="Daily study progress" />
    <p>Active session time today · breaks excluded. {progress.completedSessions} completed {progress.completedSessions === 1 ? "session" : "sessions"}.</p>
  </section>;
}
