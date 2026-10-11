import serviceConfig from '../electron/service-config.cjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=serviceConfig.apiUrl,password='DegreeBee-test-'+randomUUID();
let users=[];
async function req(route,method='GET',body,token,status=200) {
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;
}
function fixture(days,minutes,hour=8) {
  const local=new Date(Date.now()+7*3600000);local.setUTCDate(local.getUTCDate()-days);local.setUTCHours(hour,0,0,0);
  let start=local.getTime()-7*3600000;if(start+minutes*60000>Date.now())start=Date.now()-minutes*60000-60000;
  return {id:randomUUID(),startedAt:new Date(start).toISOString(),endedAt:new Date(start+minutes*60000).toISOString(),segments:[{startedAt:new Date(start).toISOString(),durationMs:minutes*60000}]};
}
try {
  assert.equal((await req('/health')).service,'degreebee');
  await req('/profile','GET',null,null,401);
  for(let i=0;i<2;i++)users.push(await req('/register','POST',{email:`test-${randomUUID()}@example.test`,password,displayName:`QA learner ${i}`,acceptSync:true,leaderboard:i===0}));
  const [a,b]=users;
  await req('/login','POST',{email:a.user.email,password:'wrong-password'},null,401);
  await req('/register','POST',{email:a.user.email,password,displayName:'Duplicate',acceptSync:true,leaderboard:false},null,409);
  await req('/sessions','POST',{id:randomUUID(),startedAt:'nope'},a.token,400);
  const long=fixture(1,240),prior=fixture(2,10),today=fixture(0,10,0);
  await req('/sessions','POST',long,a.token,201);
  assert.equal((await req('/sessions','POST',long,a.token)).duplicate,true);
  await req('/sessions','POST',{...long,id:randomUUID()},a.token,409);
  await req('/sessions','POST',{...long,segments:[{...long.segments[0],durationMs:-1}]},a.token,400);
  await req('/sessions','POST',{...long,segments:[{...long.segments[0],durationMs:60000}]},a.token,409);
  const future=fixture(0,10);future.endedAt=new Date(Date.now()+3600000).toISOString();await req('/sessions','POST',future,a.token,400);
  await req('/sessions','POST',prior,a.token,201);await req('/sessions','POST',today,a.token,201);
  const profile=await req('/profile','GET',null,a.token);
  assert.equal(profile.stats.xp,200);assert.equal(profile.stats.streak,3);assert.equal(profile.stats.level,2);assert.equal(profile.stats.sessions,3);
  assert.ok(profile.stats.badges.find(x=>x.name==='Steady rhythm').earned);
  assert.equal((await req('/profile','GET',null,b.token)).stats.xp,0);
  assert.ok(profile.leaderboard.entries.every(x=>!('email' in x)&&!('id' in x)));
  await req('/profile','PATCH',{leaderboard:false},a.token);
  assert.ok(!(await req('/profile','GET',null,a.token)).leaderboard.me);
  await req('/profile','PATCH',{leaderboard:true},b.token);
  await req('/sessions','POST',long,b.token,201); // Same client UUID is valid in a different account.
  await req('/profile','PATCH',{leaderboard:true},a.token);
  const nextPassword=password+'!';
  const changed=await req('/password','POST',{currentPassword:password,newPassword:nextPassword},b.token);
  await req('/profile','GET',null,b.token,401);b.token=changed.token;b.password=nextPassword;
  await req('/logout','POST',{},b.token);
  await req('/profile','GET',null,b.token,401);
  const signed=await req('/login','POST',{email:b.user.email,password:nextPassword});b.token=signed.token;
  console.log('PASS: MySQL registration/login, duplicate email, authentication, server-calculated XP cap, streaks, badge, private summaries, opt-in/out league, idempotent sync, overlap/future/negative checks, account isolation, password revocation and logout.');
} finally {
  for(const u of users)try{await req('/account','DELETE',{password:u.password||password},u.token);}catch(e){console.error('Test-account cleanup failed:',e.message);process.exitCode=1;}
}
