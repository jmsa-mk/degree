import React, {useEffect, useRef, useState} from 'react';
const api=window.degreebee;
const topics={camera:'Camera & calibration',account:'Account & sign-in',subscription:'Subscription & demo access',reports:'Reports & progress',feedback:'Ideas & feedback',other:'Something else'};
const statuses={open:'Waiting for support',awaiting_customer:'Waiting for you',resolved:'Resolved'};
const faq=[
  ['Get started','How do I start my first session?','Sign in and activate your access from Account. In Monitoring, choose Computer work, name your session, and select Start focus. Keep your face visible, then use Calibrate while looking straight ahead with your eyes open.'],
  ['Camera & calibration','My eyes are open, but I keep getting alerts.','Use even lighting and reduce reflections on your glasses. Keep the camera around eye level. Pause to choose Gentle sensitivity or adjust individual checks, then resume and calibrate again. Calibration needs a steady, clear view of your open eyes.'],
  ['Camera & calibration','Can I read a book or write notes?','Choose Reading / notes before starting. Head checking starts off in this mode so looking down is expected. You can also pause for breaks or use timer-only mode. Camera observations describe visible behavior, not your thoughts or mental concentration.'],
  ['Camera & calibration','Why is my camera unavailable?','Close other apps that may be using the camera, check Windows camera permissions for desktop apps, and reconnect an external webcam if needed. Start or resume a monitoring session to turn the preview on. The camera stays off while paused.'],
  ['Subscription & demo access','How does the monthly demo work?','The monthly plan is Rp50,000. In this prototype, Get monthly access opens a clearly labeled demo QR. Confirm demo payment activates one month per account without charging money. Scanning the QR is not required. Real billing and automatic renewal are not enabled.'],
  ['Reports & progress','Where are my reports, and can I share them?','Finish & save keeps your report on this device. Open Report history, choose a session, then Save PDF or Save progress image. Full camera reports are not cloud backups. Account progress syncs study time; it does not upload camera footage or report titles.'],
  ['Account & sign-in','How do I change my password?','If you are signed in, open Account and choose Change password. If you cannot sign in, double-check your email and password. Email password recovery is not available in this prototype; contact the person running your demo for account help. Never include your password in a support message.'],
  ['Get started','Will monitoring work while I use other apps?','Yes. Keep your session running while using Word, PDFs, or a browser. Mini mode keeps the camera and session controls visible. Desktop reminders and sound can alert you while DegreeBee is in the background. Pause when taking a break.'],
];
const cleanError=e=>(e.message||'Something went wrong. Please try again.').replace(/^Error invoking remote method '[^']+': Error: /,'');
const when=value=>new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});
function SupportIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3ZM19 18c0 3-3 3-6 3"/><path d="M10 21h3"/></svg>;}
export function HelpSupport({user,info,onSummary,onSignIn,onNavigate}) {
  const [tab,setTab]=useState('help'),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(0);
  const [listing,setListing]=useState({tickets:[],total:0,hasMore:false}),[selected,setSelected]=useState(null),[thread,setThread]=useState(null);
  const [compose,setCompose]=useState(false),[form,setForm]=useState({category:'camera',subject:'',message:''}),[reply,setReply]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
  const scope=tab==='desk'?'desk':'mine';
  const generation=useRef(0),mounted=useRef(true),working=useRef(false),requestKeys=useRef({}),drafts=useRef({});
  // Drafts live only in this account's mounted component, never in shared storage.
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
  const keyFor=(kind,body)=>{const signature=JSON.stringify(body);if(requestKeys.current[kind]?.signature!==signature)requestKeys.current[kind]={signature,id:crypto.randomUUID()};return requestKeys.current[kind].id;};
  async function summary(){try{const data=await api.support('summary');if(mounted.current)onSummary(data);}catch{/* List requests show actionable errors. */}}
  async function load(silent=false){
    if(!user||tab==='help')return;
    const gen=++generation.current;if(!silent)setLoading(true);
    try{
      const data=await api.support('list',{scope,status:filter,page});
      const detail=selected?await api.support('detail',{scope,id:selected}):null;
      if(!mounted.current||gen!==generation.current)return;
      setListing(data);if(detail)setThread(previous=>previous?.ticket.id===detail.ticket.id?{...detail,hasEarlier:previous.hasEarlier&&detail.hasEarlier,messages:[...previous.messages.filter(m=>Number(m.id)<Number(detail.messages[0]?.id||0)),...detail.messages]}:detail);setError('');
      if(detail&&scope==='mine'&&detail.messages.length){await api.support('read',{id:selected,messageId:detail.messages.at(-1).id});await summary();}
    }catch(e){if(mounted.current&&gen===generation.current)setError(cleanError(e));}
    finally{if(mounted.current&&gen===generation.current)setLoading(false);}
  }
  useEffect(()=>{load();const timer=setInterval(()=>{if(!working.current&&!document.hidden)load(true);},15000);return()=>{clearInterval(timer);generation.current++;};},[tab,filter,page,selected]);
  function switchTab(next){if(busy)return;setTab(next);setSelected(null);setThread(null);setCompose(false);setError('');setNotice('');setFilter('all');setPage(0);setReply('');}
  function selectTicket(id){if(busy)return;setSelected(id);setThread(null);setReply(drafts.current[id]||'');setCompose(false);setNotice('');setError('');}
  async function mutate(fn){
    if(working.current)return;working.current=true;generation.current++;setBusy(true);setError('');setNotice('');
    try{await fn();}catch(e){if(mounted.current)setError(cleanError(e));}
    finally{working.current=false;if(mounted.current){setBusy(false);setLoading(false);}}
  }
  async function create(e){e.preventDefault();await mutate(async()=>{
    const data=await api.support('create',{...form,requestId:keyFor('create',form)});
    if(!mounted.current)return;delete requestKeys.current.create;setForm({category:'camera',subject:'',message:''});setCompose(false);setTab('mine');setFilter('all');setPage(0);setSelected(data.ticket.id);setThread(data);setReply('');
    setNotice(`${data.ticket.reference} saved. Your request is in the support inbox. Check back here for a reply.`);await summary();
  });}
  async function send(e){e.preventDefault();const id=selected;await mutate(async()=>{
    const data=await api.support('reply',{id,scope,message:reply,requestId:keyFor('reply',{id,scope,message:reply})});
    if(!mounted.current)return;delete requestKeys.current.reply;delete drafts.current[id];setThread(data);setReply('');setNotice('Reply sent.');await load(true);await summary();
  });}
  async function changeStatus(){await mutate(async()=>{
    const status=thread.ticket.status==='resolved'?'open':'resolved';
    const data=await api.support('status',{id:selected,scope,status,requestId:keyFor('status',{id:selected,scope,status})});
    if(!mounted.current)return;delete requestKeys.current.status;setThread(data);setNotice(status==='resolved'?'Request marked as resolved.':'Request reopened.');await load(true);
  });}
  async function earlier(){await mutate(async()=>{
    const data=await api.support('detail',{id:selected,scope,before:thread.messages[0].id});
    if(mounted.current)setThread(old=>({...old,hasEarlier:data.hasEarlier,messages:[...data.messages,...old.messages]}));
  });}
  const matches=faq.filter(row=>row.join(' ').toLowerCase().includes(search.toLowerCase()));
  return <div className="support-page">
    <div className="page-title"><div><span className="eyebrow">A LITTLE HELP, A BETTER SESSION</span><h1>Help & support</h1><p>Find your answer, share an idea, or talk to our team.</p></div><span className="support-emblem"><SupportIcon/></span></div>
    <div className="support-tabs" aria-label="Support navigation"><button className={tab==='help'?'selected':''} onClick={()=>switchTab('help')} disabled={busy}>Help center</button>{user&&<button className={tab==='mine'?'selected':''} onClick={()=>switchTab('mine')} disabled={busy}>My requests {info?.unread>0&&<span className="support-count">{info.unread}</span>}</button>}{user&&info?.staff&&<button className={tab==='desk'?'selected':''} onClick={()=>switchTab('desk')} disabled={busy}>Support inbox</button>}</div>
    {error&&<div className="notice error" role="alert"><span>{error} Your unsent text is kept on this page.</span><button className="text-button" onClick={()=>load()} disabled={busy}>Retry</button></div>}
    {notice&&<div className="notice success" role="status">{notice}</div>}
    {tab==='help'?<>
      <section className="support-hero"><div><span className="eyebrow">HERE TO HELP YOU FOCUS</span><h2>Let’s get you back on track.</h2><p>Practical answers for your camera, account, and study routine.</p><label className="support-search">Search the help center<input type="search" placeholder="Try “camera”, “password”, or “reports”" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><aside><SupportIcon/><h3>Need a hand?</h3><p>Send a private request or product idea. Keep the conversation in one place.</p><button className="primary" onClick={()=>user?(switchTab('mine'),setCompose(true)):onSignIn()}>{user?'Contact support':'Sign in to contact support'}</button><small>Support is included with your account. No active subscription needed.</small></aside></section>
      <section className="support-faq" aria-label="Help articles"><div className="section-top"><h2>Answers to common questions</h2>{user&&<button className="text-button" onClick={()=>onNavigate('guide')}>Detailed guide →</button>}</div><div className="support-faq-grid">{matches.map(([topic,title,body])=><details key={title}><summary><span className="eyebrow">{topic}</span><strong>{title}</strong></summary><p>{body}</p></details>)}</div>{!matches.length&&<div className="empty"><h3>No matching articles</h3><p>Try another word, or contact support for help.</p></div>}</section>
      <p className="support-privacy">You choose what to share. Support requests do not attach camera footage, focus reports, or passwords.</p>
    </>:<>
      <div className="support-toolbar"><div><h2>{scope==='desk'?'Customer requests':'Your conversations'}</h2><p>{scope==='desk'?'Reply as DegreeBee Support and help each customer move forward.':'Follow replies here. This is a support inbox, not a live chat.'}</p></div><div className="support-controls"><button className="secondary" onClick={()=>load()} disabled={busy||loading}>Refresh</button>{scope==='mine'&&<button className="primary" disabled={busy} onClick={()=>{setCompose(true);setSelected(null);setThread(null);setNotice('');}}>New request</button>}</div></div>
      <div className="support-workspace">
        <section className="support-list" aria-label={scope==='desk'?'Customer requests':'Your requests'}><label>Filter requests<select value={filter} disabled={busy} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">All requests</option><option value="open">Waiting for support</option><option value="awaiting_customer">Waiting for customer</option><option value="resolved">Resolved</option></select></label><div className="support-list-meta">{listing.total} {listing.total===1?'request':'requests'} {loading&&' · Updating…'}</div>
        {listing.tickets.map(t=><button key={t.id} disabled={busy} className={`support-ticket ${selected===t.id?'selected':''}`} onClick={()=>selectTicket(t.id)}><span className="support-ticket-top"><span>{t.reference}</span>{scope==='mine'&&t.unread&&<span className="support-unread">New reply</span>}</span><strong>{t.subject}</strong><span>{topics[t.category]}{scope==='desk'&&` · ${t.customerName}`}</span><span className={`support-status ${t.status}`}>{scope==='desk'&&t.status==='awaiting_customer'?'Waiting for customer':statuses[t.status]}</span><time>{when(t.updatedAt)}</time></button>)}
        {!loading&&!listing.tickets.length&&<div className="support-list-empty">{filter==='all'?'No requests yet. Your conversations will appear here.':'No requests with this status.'}</div>}
        <div className="support-pagination"><button className="text-button" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button className="text-button" disabled={busy||!listing.hasMore} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>
        <section className="support-conversation" aria-label="Support conversation">
          {compose?<form className="support-form" onSubmit={create}><span className="eyebrow">WE’RE LISTENING</span><h2>How can we help?</h2><p>Describe what happened and what you expected. Please leave out passwords and payment details.</p><label>Topic<select value={form.category} disabled={busy} onChange={e=>setForm({...form,category:e.target.value})}>{Object.entries(topics).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label><label>Subject<input required minLength="3" maxLength="100" value={form.subject} disabled={busy} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="A short description of your question"/></label><label>Message<textarea aria-label="Message" required minLength="10" maxLength="4000" rows="7" disabled={busy} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Tell us a little more…"/></label><small>{form.message.length} / 4,000 characters · Only your text is sent</small><div className="support-controls"><button className="primary" disabled={busy||form.subject.trim().length<3||form.message.trim().length<10}>{busy?'Sending…':'Send request'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>setCompose(false)}>Keep draft & close</button></div></form>
          :thread?<><div className="support-thread-header"><div><span className="eyebrow">{thread.ticket.reference} · {topics[thread.ticket.category]}</span><h2>{thread.ticket.subject}</h2><span className={`support-status ${thread.ticket.status}`}>{scope==='desk'&&thread.ticket.status==='awaiting_customer'?'Waiting for customer':statuses[thread.ticket.status]}</span></div><button className="secondary" disabled={busy} onClick={changeStatus}>{thread.ticket.status==='resolved'?'Reopen request':'Mark resolved'}</button></div>
          <div className="support-messages" aria-label="Conversation messages">{thread.hasEarlier&&<button className="text-button" disabled={busy} onClick={earlier}>Load earlier messages</button>}{thread.messages.map(m=><article key={m.id} className={`support-message ${m.role}`}><div><strong>{m.role==='support'?'DegreeBee Support':m.role==='system'?'Request update':scope==='desk'?'Customer':'You'}</strong><time>{when(m.createdAt)}</time></div><p>{m.body}</p></article>)}</div>
          {thread.ticket.status==='resolved'?<div className="support-resolved"><strong>All set for now.</strong><p>If you still need help, reopen this request to continue the conversation.</p></div>:<form className="support-reply" onSubmit={send}><label>{scope==='desk'?'Reply to customer':'Your reply'}<textarea aria-label={scope==='desk'?'Reply to customer':'Your reply'} maxLength="4000" rows="3" required disabled={busy} value={reply} onChange={e=>{setReply(e.target.value);drafts.current[selected]=e.target.value;}} placeholder={scope==='desk'?'Write a helpful, personal response…':'Add a detail or reply to support…'}/></label><div className="support-controls"><small>{reply.length} / 4,000 · Never share your password</small><button className="primary" disabled={busy||!reply.trim()}>{busy?'Sending…':'Send reply'}</button></div></form>}</>
          :<div className="support-empty"><SupportIcon/><h2>{selected?'Opening conversation…':'A conversation starts here.'}</h2><p>{scope==='desk'?'Select a customer request to read and respond.':'Choose a request to see its replies, or send us a new question.'}</p>{scope==='mine'&&!selected&&<button className="secondary" onClick={()=>setCompose(true)}>Write a request</button>}</div>}
        </section>
      </div><p className="support-privacy">Requests are saved to your account. Replies update every 15 seconds while this page is visible. Deleting your account also deletes your support requests.</p>
    </>}
  </div>;
}
