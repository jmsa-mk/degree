import serviceConfig from '../electron/service-config.cjs';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const run=promisify(execFile);
export async function createMember(){
 const email=`qa-${randomUUID()}@example.test`,password=`Quality-${randomUUID()}`;
 const response=await fetch(serviceConfig.apiUrl+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,displayName:'QA Member',acceptSync:true,leaderboard:false})});
 const data=await response.json();if(!response.ok)throw new Error(data.error);
 return {...data,email,password};
}
export async function setMembership(member,status='active',seconds=3600){
 await run('C:\\xampp\\php\\php.exe',[path.resolve('scripts/subscription-fixture.php'),member.user.id,status,String(seconds)],{windowsHide:true});
}
export async function signInMember(page,member){
 await page.waitForFunction(()=>!!window.degreebee);
 await page.evaluate(async m=>{await window.degreebee.accountAuth('login',{email:m.email,password:m.password});},member);
}
export async function waitForState(page,predicate,timeout=15000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){const state=await page.evaluate(()=>window.degreebee.state());if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,100));}
 throw new Error('Timed out waiting for account/session state');
}
export async function removeMember(member){
 if(!member)return;
 const response=await fetch(serviceConfig.apiUrl+'/account',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+member.token},body:JSON.stringify({password:member.password})});
 if(![200,401].includes(response.status))throw new Error('QA account cleanup failed.');
}
