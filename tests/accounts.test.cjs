const test=require('node:test');const assert=require('node:assert/strict');
const {serverUrl,sessionSummary,AccountClient}=require('../electron/accounts.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('account endpoints require HTTPS outside loopback and cannot contain credentials',()=>{
  assert.equal(serverUrl('http://127.0.0.1:8765/'),'http://127.0.0.1:8765');
  assert.equal(serverUrl('https://example.test/api/'),'https://example.test/api');
  for(const url of ['http://example.test','file:///etc/passwd','https://user:pass@example.test','https://example.test?a=1'])assert.throws(()=>serverUrl(url));
});
test('upload strips report identity and camera information; removes paused intervals',()=>{
  const summary=sessionSummary({id:'abc',title:'Private assignment',score:77,startedAt:'2026-10-01T00:00:00.000Z',endedAt:'2026-10-01T00:00:04.000Z',timeline:[
    {state:'focused',startedAt:'2026-10-01T00:00:00.000Z',durationMs:1000},
    {state:'looking_away',startedAt:'2026-10-01T00:00:01.000Z',durationMs:1000},
    {state:'paused',startedAt:'2026-10-01T00:00:02.000Z',durationMs:1000},
    {state:'unobserved',startedAt:'2026-10-01T00:00:03.000Z',durationMs:1000}]});
  assert.deepEqual(Object.keys(summary),['id','startedAt','endedAt','segments']);assert.equal(summary.segments.length,2);assert.equal(summary.segments[0].durationMs,2000);
});
test('local reward days split at Jakarta midnight and exclude pause',async()=>{
  const {localRewards}=await import('../src/rewards.mjs');
  const result=localRewards([{status:'completed',timeline:[{state:'unobserved',startedAt:'2026-10-01T16:50:00.000Z',durationMs:1200000},{state:'paused',startedAt:'2026-10-01T17:10:00.000Z',durationMs:600000}]}],Date.parse('2026-10-02T05:00:00.000Z'));
  assert.equal(result.xp,20);assert.equal(result.streak,2);assert.equal(result.todayMinutes,10);assert.equal(result.sessions,1);
});

function membershipClient(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'degreebee-membership-'));
  const client=new AccountClient(dir,{isEncryptionAvailable:()=>false});client.user={id:'22'};client.token='a'.repeat(64);
  return client;
}
function entitlement(seconds=3600){return {subscription:{status:'active',active:true,serverNow:'2026-10-11T00:00:00Z',expiresAt:new Date(Date.parse('2026-10-11T00:00:00Z')+seconds*1000).toISOString()}};}
test('Apache migration preserves protected sign-in and existing reports without granting cached access',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'degreebee-migration-'));
  const encryption={isEncryptionAvailable:()=>true,decryptString:b=>b.toString(),encryptString:s=>Buffer.from(s)};
  try {
    const saved={server:'http://127.0.0.1:8765',user:{id:'42'},token:'c'.repeat(64)};
    fs.writeFileSync(path.join(dir,'account.secure'),JSON.stringify(saved));
    const reports=path.join(dir,'accounts',require('node:crypto').createHash('sha256').update(saved.server).digest('hex').slice(0,20),'42');
    fs.mkdirSync(reports,{recursive:true});fs.writeFileSync(path.join(reports,'preserved.json'),'existing report');
    const client=new AccountClient(dir,encryption);
    assert.equal(client.base,'http://127.0.0.1/degreebee');assert.equal(client.user.id,'42');assert.equal(client.token,saved.token);
    assert.equal(client.profileDirectory(),reports);assert.equal(fs.readFileSync(path.join(client.profileDirectory(),'preserved.json'),'utf8'),'existing report');
    assert.equal(client.hasAccess(),false);client.persist();
    const restored=new AccountClient(dir,encryption);assert.equal(restored.user.id,'42');assert.equal(restored.profileDirectory(),reports);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'account.secure'))).server,client.base);
    for(const server of ['https://another.example.test','http://localhost:8765']){
      fs.writeFileSync(path.join(dir,'account.secure'),JSON.stringify({...saved,server}));
      assert.equal(new AccountClient(dir,encryption).user,null);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('monitoring requires a fresh server entitlement; cached profile and settings never grant access',async()=>{
  const c=membershipClient();c.subscription=entitlement().subscription;
  assert.equal(c.hasAccess(),false);
  let calls=0;c.request=async route=>{calls++;assert.equal(route,'/entitlement');return entitlement();};
  await c.checkAccess();assert.equal(c.hasAccess(),true);assert.ok(c.accessUntil<=performance.now()+60000);assert.equal(calls,1);
  assert.equal('server' in c.snapshot(),false);assert.equal('token' in c.snapshot(),false);
  c.user=null;await assert.rejects(c.checkAccess(),/sign in/);assert.equal(c.hasAccess(),false);assert.equal(calls,1);
});
test('inactive, canceled, expired and malformed server responses all revoke monitoring',async()=>{
  const c=membershipClient();
  for(const response of [entitlement(-1),entitlement(0),{subscription:{active:true,status:'active'}},{subscription:{...entitlement().subscription,status:'canceled'}},{subscription:{...entitlement().subscription,active:false}},{}]){
    c.accessUntil=performance.now()+60000;c.request=async()=>response;
    await assert.rejects(c.checkAccess(),/subscription/);assert.equal(c.hasAccess(),false);assert.equal(c.accessUntil,0);
  }
});
test('periodic verification keeps the current valid lease while pending but revokes it on connection failure',async()=>{
  const c=membershipClient();c.request=async()=>entitlement();await c.checkAccess();
  let rejectRequest;c.request=()=>new Promise((resolve,reject)=>{rejectRequest=reject;});
  const checking=c.checkAccess();assert.equal(c.hasAccess(),true);
  rejectRequest(new Error('Service unavailable'));await assert.rejects(checking,/unavailable/);assert.equal(c.hasAccess(),false);
});
test('short memberships cannot receive a lease beyond the server expiration',async()=>{
  const c=membershipClient();c.request=async()=>entitlement(1);await c.checkAccess();
  assert.ok(c.accessUntil-performance.now()<=1000);
  c.accessUntil=performance.now()-1;assert.equal(c.hasAccess(),false);
  c.authExpired=true;await assert.rejects(c.checkAccess(),/sign in/);
});
test('daily XP is capped and a missing day breaks the streak',async()=>{
  const {localRewards}=await import('../src/rewards.mjs');const r=localRewards([{status:'completed',timeline:[{state:'unobserved',startedAt:'2026-10-01T00:00:00.000Z',durationMs:14400000}]}],Date.parse('2026-10-03T05:00:00.000Z'));
  assert.equal(r.xp,180);assert.equal(r.streak,0);assert.equal(r.level,2);
});
test('network failure keeps local identity and reports available',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'degreebee-account-'));
  const client=new AccountClient(dir,{isEncryptionAvailable:()=>false});client.user={id:'5',email:'one@example.test'};client.token='a'.repeat(64);
  client.request=async()=>{throw new Error('Network unavailable');};
  const r=await client.sync([]);assert.equal(r.user.id,'5');assert.equal(r.syncing,false);assert.match(r.error,/Network/);assert.equal(client.profileDirectory().endsWith(path.join('accounts',require('node:crypto').createHash('sha256').update(client.profileNamespace).digest('hex').slice(0,20),'5')),true);
});
test('an earned streak badge survives a later missed day',async()=>{
  const {localRewards}=await import('../src/rewards.mjs');
  const reports=[1,2,3].map(day=>({status:'completed',timeline:[{state:'unobserved',startedAt:`2026-10-0${day}T00:00:00.000Z`,durationMs:600000}]}));
  const result=localRewards(reports,Date.parse('2026-10-06T00:00:00.000Z'));
  assert.equal(result.streak,0);assert.equal(result.badges.find(b=>b.name==='Steady rhythm').earned,true);
});
test('invalid session sync cannot block valid sessions in the queue',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'degreebee-queue-'));const client=new AccountClient(dir,{isEncryptionAvailable:()=>false});client.user={id:'6'};
  const submitted=[];
  client.request=async(route,method,body)=>{if(route==='/profile')return {user:{id:'6'},stats:{}};submitted.push(body.id);if(body.id==='bad'){const error=new Error('Overlap');error.status=409;throw error;}return {ok:true};};
  const reports=['bad','good'].map(id=>({id,status:'completed',startedAt:'2026-10-01T00:00:00.000Z',endedAt:'2026-10-01T00:00:01.000Z',timeline:[]}));
  const result=await client.sync(reports);assert.deepEqual(submitted,['bad','good']);assert.match(result.error,/1 session/);
  const synced=JSON.parse(fs.readFileSync(path.join(client.profileDirectory(),'synced.json'),'utf8'));assert.equal(synced.good,true);assert.equal(synced.bad,undefined);
});
test('failed credential writes cannot silently switch the selected identity',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'degreebee-identity-'));const client=new AccountClient(dir,{isEncryptionAvailable:()=>false});
  client.user={id:'8'};client.token='old';client.persist=()=>{throw new Error('Disk unavailable');};
  client.request=async()=>({user:{id:'9'},token:'b'.repeat(64)});
  await assert.rejects(client.authenticate('login',{}),/Disk/);assert.equal(client.user.id,'8');assert.equal(client.token,'old');
  assert.throws(()=>client.clear(),/Disk/);assert.equal(client.user.id,'8');
});
