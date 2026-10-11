import React, { useEffect, useState } from 'react';
import { localRewards } from './rewards.mjs';

function RewardIcon({kind}) {
  const paths={spark:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z',clock:'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',flame:'M12 3c1 5 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 1 4 2 4 2-3 2-6 1-9Z',award:'m8 14-2 7 6-3 6 3-2-7 M18 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0',check:'m5 12 4 4L19 6'};
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.spark}/></svg>;
}

export function ProgressPage({ account, reports, onAccount, onStart, onRefresh, busy }) {
  const stats=account?.dashboard?.stats || localRewards(reports);
  const board=account?.dashboard?.leaderboard;
  const [tab,setTab]=useState('journey');
  const badgeTargets=[1,60,3,10],badgeUnits=['session','minutes','days','sessions'];
  const badgeValues=[Math.min(1,stats.sessions),Math.min(60,stats.activeMinutes),Math.min(3,stats.streak),Math.min(10,stats.sessions)];
  const nextBadge=stats.badges.find(b=>!b.earned);
  return <>
    <div className="page-title"><div><span className="eyebrow">YOUR PERSONAL JOURNEY</span><h1>Small steps. Steady progress.</h1><p>Build a study habit at your own pace.</p></div><button className="primary" onClick={onStart}>Start a session</button></div>
    <div className="community-tabs"><button className={tab==='journey'?'selected':''} onClick={()=>setTab('journey')}>My progress</button><button className={tab==='board'?'selected':''} onClick={()=>setTab('board')}>Weekly leaderboard</button></div>
    {tab==='journey'?<>
      <section className="journey-hero"><div><span className="eyebrow">{account?.user?`WELCOME, ${account.user.displayName}`:'YOUR PROGRESS'}</span><h2>Level {stats.level}</h2><p>{120-stats.levelProgress} XP to your next level</p><progress aria-label="Level progress" max="120" value={stats.levelProgress}/><p className="small">Every study minute counts. Earn up to 180 XP a day.</p></div><div className="journey-symbol"><RewardIcon kind="award"/><span>{stats.todayMinutes} min today</span></div></section>
      <section className="progress-stats" aria-label="Study statistics">
        {[['spark','Total XP',stats.xp,'XP','Your effort, one minute at a time'],['flame','Current streak',stats.streak,stats.streak===1?'day':'days','Study 10 minutes a day to build your streak'],['clock','Study time',stats.activeMinutes,'min',`${stats.sessions} completed ${stats.sessions===1?'session':'sessions'} of at least 1 minute`]].map(([icon,label,value,unit,hint])=><article className={`progress-stat ${icon}`} key={label}><div className="stat-heading"><span>{label}</span><span className="reward-icon"><RewardIcon kind={icon}/></span></div><div className="stat-value">{value}<span>{unit}</span></div><p>{hint}</p></article>)}
      </section>
      <section className="community-card badge-collection" aria-label="Your badges"><div className="section-top"><div><span className="eyebrow">MILESTONES</span><h3>Your badges</h3><p>Small wins worth coming back for.</p></div><span className="badge-count">{stats.badges.filter(x=>x.earned).length} / {stats.badges.length} unlocked</span></div>
        <div className="badge-grid">{stats.badges.map((badge,i)=>{const value=badge.earned?badgeTargets[i]:badgeValues[i];return <article key={badge.name} className={`achievement ${badge.earned?'earned':''}`}><div className="achievement-top"><span className={`badge-emblem badge-${i}`}><RewardIcon kind={['spark','clock','flame','award'][i]}/></span><span className="badge-state">{badge.earned?<><RewardIcon kind="check"/>Unlocked</>:'In progress'}</span></div><h4>{badge.name}</h4><p>{badge.description}</p><div className="badge-progress"><progress aria-label={`${badge.name} progress`} max={badgeTargets[i]} value={value}/><span>{value} / {badgeTargets[i]} {badgeUnits[i]}</span></div></article>;})}</div>
        {nextBadge&&<div className="next-milestone"><span className="reward-icon"><RewardIcon kind="spark"/></span><div><strong>{stats.sessions===0?'Your first win is one session away.':`Up next: ${nextBadge.name}`}</strong><p>{nextBadge.description}. Finish and save your session to update your progress.</p></div><button className="secondary" onClick={onStart}>Let’s focus</button></div>}
      </section>
      <p className="progress-footnote">Updates after your sessions sync · Breaks excluded · Daily rewards follow Jakarta time</p>
      {!account?.user&&<section className="community-card invite"><div><h3>Study alongside others</h3><p>Create an account to sync your progress and optionally join the weekly leaderboard.</p></div><button className="secondary" onClick={onAccount}>Create an account</button></section>}
    </>:<section className="community-card">
      <div className="section-top"><div><span className="eyebrow">A FRESH START EVERY MONDAY</span><h2>Weekly study league</h2></div>{account?.user&&<button className="secondary" disabled={busy||account.syncing} onClick={onRefresh}>{account.syncing?'Syncing...':'Refresh progress'}</button>}</div>
      <p>Earn XP for showing up, regardless of which camera checks you use. This is a friendly, self-recorded study challenge.</p>
      {!account?.user?<div className="empty"><h3>Your next chapter starts here.</h3><p>Sign in to see the league. Joining the ranking is optional.</p><button className="primary" onClick={onAccount}>Sign in</button></div>:<>
        {!account.user.leaderboard&&<div className="notice"><span>You are not listed. Join from Account when you are ready to share your display name and weekly XP.</span><button className="text-button" onClick={onAccount}>Account</button></div>}
        {board?<><p className="muted small">Week of {board.weekStart} · {board.timezone} · {board.participants} {board.participants===1?'participant':'participants'} with XP</p>{board.entries.length?<div className="table-wrap"><table><thead><tr><th>Rank</th><th>Member</th><th>Weekly XP</th></tr></thead><tbody>{board.entries.map((row,i)=><tr key={i} className={row.isMe?'my-ranking':''}><td>#{row.rank}</td><td>{row.name}{row.isMe&&<span className="score-pill">You</span>}</td><td>{row.xp}</td></tr>)}</tbody></table></div>:<div className="empty"><h3>A new week, a clean slate.</h3><p>No ranked study minutes yet. Finish a session of at least one minute and sync to get started.</p></div>}{board.me&&board.me.rank>50&&<p>Your rank: #{board.me.rank} · {board.me.xp} XP</p>}</>:<div className="empty"><p>Refresh to load the leaderboard from your account.</p></div>}
      </>}
      <p className="small muted">Up to 180 XP per day. Equal XP shares the same rank. Camera scores are never uploaded or ranked. These results are not proof of concentration or exam integrity.</p>
    </section>}
  </>;
}


