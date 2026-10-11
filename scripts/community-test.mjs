import serviceConfig from '../electron/service-config.cjs';
import { _electron as electron } from 'playwright';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {setMembership,waitForState} from './member-fixture.mjs';
const data=path.resolve('test-output/community-'+Date.now());await mkdir(data,{recursive:true});
const env={...process.env,DEGREEBEE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const email=`qa-${randomUUID()}@example.test`,password='Community-'+randomUUID();
let app;let cleanupToken;
try {
  app=await electron.launch({args:['.'],env});const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'New here? Create an account',exact:true}).click();
  await page.getByLabel('Display name',{exact:true}).fill('Study Bee');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByLabel('I agree to store my account details',{exact:false}).check();await page.getByLabel('Join the leaderboard',{exact:false}).check();
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  let state=await page.evaluate(()=>window.degreebee.state());assert.equal(state.account.user.email,email);assert.ok(state.folder.startsWith(data));assert.ok(state.folder.includes('accounts'));
  assert.ok(!JSON.stringify(state.account).includes('token'));
  const credential=await readFile(path.join(data,'account.secure'));assert.ok(!credential.includes(Buffer.from(email)));assert.ok(!credential.includes(Buffer.from(password)));
  const end=Date.now()-86400000,start=end-12*60000;
  const report={schema:1,id:randomUUID(),title:'Private study title',startedAt:new Date(start).toISOString(),updatedAt:new Date(end).toISOString(),endedAt:new Date(end).toISOString(),status:'completed',counts:{focused:0,no_face:0,eyes_closed:0,looking_away:0,unobserved:12*60000,paused:0},timeline:[{state:'unobserved',startedAt:new Date(start).toISOString(),durationMs:12*60000}],alerts:[]};
  await writeFile(path.join(state.folder,report.id+'.json'),JSON.stringify(report));
  await page.getByRole('button',{name:'Sync progress now',exact:true}).click();
  await waitForState(page,s=>!s.account.syncing&&s.account.dashboard?.stats.xp===12);
  await page.getByRole('button',{name:'Progress & league',exact:true}).click();await page.getByRole('heading',{name:'Level 1',exact:true}).waitFor();
  await page.screenshot({path:path.resolve('test-output/community-progress.png'),fullPage:true});
  await page.getByRole('button',{name:'Weekly leaderboard',exact:true}).click();await page.getByText('Study Bee',{exact:false}).waitFor();
  await page.screenshot({path:path.resolve('test-output/community-league.png'),fullPage:true});
  await page.getByRole('button',{name:'Account',exact:true}).first().click();await page.getByLabel('Show my display name',{exact:false}).click();
  await waitForState(page,s=>s.account.user.leaderboard===false);
  await page.getByText('Leaderboard preference saved.',{exact:true}).waitFor();
  await page.screenshot({path:path.resolve('test-output/community-account.png'),fullPage:true});
  await setMembership({user:state.account.user});await page.evaluate(()=>window.degreebee.accountRefresh());
  await page.evaluate(async()=>{await window.degreebee.settings({checks:{face:false,eyes:false,head:false}});await window.degreebee.start('Account session');});
  assert.match(await page.evaluate(async()=>{try{await window.degreebee.accountLogout();return '';}catch(e){return e.message;}}),/Finish or delete/);
  await page.getByRole('button',{name:'Monitoring',exact:true}).click();
  await page.getByRole('button',{name:'Finish & save',exact:true}).click();
  await page.getByRole('heading',{name:'Small steps. Steady progress.',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
  await waitForState(page,s=>!s.account.syncing);
  await page.getByRole('button',{name:'Report history',exact:true}).click();await page.getByRole('button',{name:'View report Private study title',exact:true}).click();
  await page.getByRole('button',{name:'Save PDF',exact:true}).waitFor();await page.getByRole('button',{name:'Save progress image',exact:true}).waitFor();await page.getByRole('button',{name:'Close details'}).click();
  // A restart restores only encrypted credentials and the same account-specific history.
  await app.evaluate(({app})=>app.exit(0));app=await electron.launch({args:['.'],env});const reopened=await app.firstWindow();
  await reopened.waitForFunction(()=>!!window.degreebee);await waitForState(reopened,s=>s.account.user&&!s.account.syncing);
  assert.equal((await reopened.evaluate(()=>window.degreebee.state())).account.user.email,email);
  assert.equal((await reopened.evaluate(()=>window.degreebee.history())).sessions.length,2);
  await reopened.getByRole('button',{name:'Account',exact:true}).click();await reopened.getByRole('button',{name:'Sign out',exact:true}).click();
  await reopened.getByRole('heading',{name:'Welcome back',exact:true}).waitFor();assert.equal((await reopened.evaluate(()=>window.degreebee.history())).sessions.length,0);
  await reopened.getByLabel('Email',{exact:true}).fill(email);await reopened.getByLabel('Password',{exact:true}).fill(password);await reopened.getByRole('button',{name:'Sign in',exact:true}).click();await reopened.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  await reopened.locator('summary').filter({hasText:'Delete account'}).click();await reopened.getByRole('button',{name:'Delete account',exact:true}).click();await reopened.getByLabel('Confirm your password',{exact:true}).fill(password);await reopened.getByRole('button',{name:'Permanently delete account',exact:true}).click();await reopened.getByRole('heading',{name:'Welcome back',exact:true}).waitFor();
  assert.equal((await reopened.evaluate(()=>window.degreebee.state())).account.user,null);assert.deepEqual(errors,[]);
  console.log('PASS: real Electron registration, encrypted sign-in persistence, sync/XP/badges, opt-in/out league, personal completion, reports, active-session account guard, account history isolation and server account deletion. No physical camera accessed.');
} finally {
  if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
  // Remove only this unique test account if a test failed before UI deletion.
  const login=await fetch(serviceConfig.apiUrl+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(login.ok){cleanupToken=(await login.json()).token;await fetch(serviceConfig.apiUrl+'/account',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cleanupToken},body:JSON.stringify({password})});}
}


