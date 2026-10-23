import React, { useEffect, useRef, useState } from 'react';

export function SubscriptionCard({account,busy,onRefresh,onActivate}) {
  const dialog=useRef(null);
  const [confirming,setConfirming]=useState(false),[checkoutError,setCheckoutError]=useState('');
  const subscription=account?.subscription;
  const plan=subscription?.plan;
  const statuses={active:'Active',inactive:'Not subscribed',expired:'Expired',canceled:'Canceled'};
  return <section className="community-card subscription-card" aria-label="Your subscription">
    <div className="section-top"><div><span className="eyebrow">YOUR SUBSCRIPTION</span><h2>{plan?.name||'DegreeBee Focus'}</h2></div><span className={`subscription-status ${subscription?.active?'active':''}`}>{statuses[subscription?.status]||'Checking status'}</span></div>
    {plan?<p className="plan-price">{new Intl.NumberFormat('id-ID',{style:'currency',currency:plan.currency,maximumFractionDigits:0}).format(plan.priceRupiah)}<span> / month</span></p>:<p>Connect to load your plan and subscription status.</p>}
    <p>AI monitoring across your apps, distraction reminders, personal progress and session reports.</p>
    {subscription?.active?<p>Access until <strong>{new Date(subscription.expiresAt).toLocaleString('en-US',{dateStyle:'long',timeStyle:'short'})}</strong>.</p>:<p>An active subscription is required to use AI monitoring. Your saved progress and reports remain available after your subscription ends.</p>}
    {subscription?.active&&subscription.accessSource==='demo'&&<p><span className="demo-label">DEMO ACCESS ACTIVE</span> No real payment was made.</p>}
    {!subscription?.active&&<div className="subscription-coming">{subscription?.demoCheckoutAvailable?<><span className="demo-label">DEMO CHECKOUT</span><p>Try the subscription experience. Confirm the demo QR to unlock one month of AI access. No real payment is required.</p><button className="primary" disabled={busy||account?.syncing} onClick={()=>{setCheckoutError('');dialog.current.showModal();}}>Get monthly access</button></>:<><strong>Subscriptions opening soon</strong><p>Payments are not available yet. You will not be charged.</p></>}</div>}
    <button className="secondary" disabled={busy||account?.syncing} onClick={onRefresh}>Refresh subscription status</button>
    <p className="small muted">An internet connection is required to verify access before and during monitoring.</p>
    <dialog ref={dialog} className="membership-checkout" aria-labelledby="checkout-title" onCancel={e=>{if(confirming)e.preventDefault();}}>
      <div className="checkout-heading"><span className="demo-label">DEMO · NO REAL CHARGE</span><button className="icon-button" aria-label="Close checkout" disabled={confirming} onClick={()=>dialog.current.close()}>×</button></div>
      <h2 id="checkout-title">Your next month of focus.</h2><p>DegreeBee Focus · One month of AI access</p>
      {plan&&<div className="checkout-amount">{new Intl.NumberFormat('id-ID',{style:'currency',currency:plan.currency,maximumFractionDigits:0}).format(plan.priceRupiah)}<span>Demo amount · nothing to pay</span></div>}
      <div className="demo-qr"><img src="./demo-qr.svg" alt="Demo QR code. No payment destination; scanning is optional." width="208" height="208"/><strong>DEMO ONLY</strong></div>
      <p className="checkout-help">This QR is for presentation only. You do not need to scan it or transfer money. Select confirm to activate your demo access.</p>
      {checkoutError&&<div className="notice error" role="alert">{checkoutError}</div>}
      <button className="primary checkout-confirm" disabled={confirming||busy} onClick={async()=>{setConfirming(true);setCheckoutError('');try{await onActivate();dialog.current?.close();}catch(e){setCheckoutError(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setConfirming(false);}}}>{confirming?'Activating access...':'Confirm demo payment'}</button>
      <button className="text-button" disabled={confirming} onClick={()=>dialog.current.close()}>Cancel</button>
    </dialog>
  </section>;
}

export function AccountPage({account,active,busy,run,onChange}) {
  const [register,setRegister]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('');
  const [accept,setAccept]=useState(false),[listed,setListed]=useState(false),[notice,setNotice]=useState('');
  const [deleteOpen,setDeleteOpen]=useState(false),[deletePassword,setDeletePassword]=useState(''),[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState('');
  const api=window.degreebee,locked=busy||account?.syncing;
  useEffect(()=>{setPassword('');setDeletePassword('');setDeleteOpen(false);},[account?.user?.id]);
  async function call(fn,message=''){setNotice('');await onChange(await fn());setNotice(message);}
  const signedIn=account?.user&&!account.authExpired;
  return <>
    <div className="page-title"><div><span className="eyebrow">{signedIn?'YOUR ACCOUNT':'WELCOME TO DEGREEBEE'}</span><h1>{signedIn?'A space of your own.':'Make room for focused study.'}</h1><p>{signedIn?'Manage your membership, privacy and progress.':'Sign in or create an account to get started.'}</p></div></div>
    {notice&&<div className="notice success" role="status">{notice}</div>}
    {active&&<div className="notice">Finish or delete your current session before changing your account.</div>}
    {!signedIn?<section className="community-card auth-card">
      <h2>{register?'Create your account':'Welcome back'}</h2>
      <form onSubmit={e=>{e.preventDefault();run(async()=>{await call(()=>api.accountAuth(register?'register':'login',{email,password,displayName:name,leaderboard:listed,acceptSync:accept}),'You are signed in.');setPassword('');});}}>
        {register&&<label>Display name<input required minLength={2} maxLength={40} value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname"/></label>}
        <label>Email<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>
        <label>Password<input required type="password" minLength={10} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register?'new-password':'current-password'}/></label>
        {register&&<p className="small muted">Use at least 10 characters. Creating an account does not activate a subscription.</p>}
        {register&&<><label className="choice"><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)} required/>I agree to store my account details and study-time summaries with DegreeBee.</label><label className="choice"><input type="checkbox" checked={listed} onChange={e=>setListed(e.target.checked)}/>Join the leaderboard and share my display name and weekly XP with other members.</label></>}
        <button className="primary" disabled={locked||!!active}>{register?'Create account':'Sign in'}</button>
      </form>
      {!account?.user&&<button className="text-button auth-switch" onClick={()=>{setRegister(!register);setPassword('');}}>{register?'Already a member? Sign in':'New here? Create an account'}</button>}
      {account?.authExpired&&<button className="secondary" disabled={locked||!!active} onClick={()=>run(()=>call(()=>api.accountLogout()))}>Use another account</button>}
      <p className="privacy-copy">Camera processing stays on your device. Photos and videos are never saved or uploaded.</p>
    </section>:<>
      <section className="community-card"><div className="section-top"><div><h2>{account.user.displayName}</h2><p>{account.user.email}</p></div><button className="secondary" disabled={locked||!!active} onClick={()=>run(()=>call(()=>api.accountLogout(),'You are signed out.'))}>Sign out</button></div>
        <label className="choice"><input type="checkbox" checked={account.user.leaderboard} disabled={locked} onChange={e=>{const value=e.target.checked;run(()=>call(()=>api.accountVisibility(value),'Leaderboard preference saved.'));}}/>Show my display name and weekly XP on the leaderboard</label>
        <p className="small muted">Your email stays private. You can leave the leaderboard without losing your personal progress.</p>
        <button className="secondary" disabled={locked} onClick={()=>run(()=>call(()=>api.accountSync()))}>{account.syncing?'Syncing...':'Sync progress now'}</button>
        <p className="small muted">{account.lastSync?`Last synced ${new Date(account.lastSync).toLocaleString('en-US')}`:'Your progress will update when you sync.'}</p>
      </section>
      <SubscriptionCard account={account} busy={busy} onRefresh={()=>run(()=>call(()=>api.accountRefresh()))} onActivate={()=>call(()=>api.accountDemoActivate(),'Demo access activated. Open Monitoring to start your session.')}/>
      <section className="community-card"><h3>Your privacy</h3><p>Study dates and active-time summaries sync with your account. Session titles, camera scores, photos and videos are not uploaded. Detailed reports stay on this device, separately for each account.</p></section>
      <section className="community-card"><details><summary>Change password</summary><form className="auth-card" onSubmit={e=>{e.preventDefault();run(async()=>{await call(()=>api.accountPassword({currentPassword,newPassword}),'Password changed. Other sign-in sessions have been revoked.');setCurrentPassword('');setNewPassword('');});}}><label>Current password<input type="password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password"/></label><label>New password<input type="password" required minLength={10} maxLength={72} value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password"/></label><button className="secondary" disabled={locked||!!active}>Update password</button></form></details></section>
      <section className="community-card"><details><summary>Delete account</summary><p>This permanently removes your account, subscription access, synced progress and support requests. Exported files and reports already saved on this device remain on the device.</p>{!deleteOpen?<button className="danger-button" disabled={locked||!!active} onClick={()=>setDeleteOpen(true)}>Delete account</button>:<form onSubmit={e=>{e.preventDefault();run(async()=>{await call(()=>api.accountDelete(deletePassword),'Your account has been deleted.');setDeletePassword('');});}}><label>Confirm your password<input required type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} autoComplete="current-password"/></label><div className="guide-actions"><button className="danger-button" disabled={locked||!!active}>Permanently delete account</button><button type="button" className="secondary" onClick={()=>{setDeleteOpen(false);setDeletePassword('');}}>Cancel</button></div></form>}</details></section>
    </>}
  </>;
}
