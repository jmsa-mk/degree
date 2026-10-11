const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {apiUrl: DEFAULT_SERVER, localMigration} = require('./service-config.cjs');
function serverUrl(value) {
  let url; try { url = new URL(value); } catch { throw new Error('Enter a valid account server URL.'); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))))
    throw new Error('Use HTTPS for a shared server, or HTTP on localhost for XAMPP.');
  return url.href.replace(/\/+$/, '');
}
function sessionSummary(report) {
  const segments=[];
  for (const item of report.timeline) {
    if (item.state==='paused'||item.durationMs<=0) continue;
    const last=segments.at(-1);
    if(last && Date.parse(last.startedAt)+last.durationMs===Date.parse(item.startedAt)) last.durationMs+=item.durationMs;
    else segments.push({startedAt:item.startedAt,durationMs:item.durationMs});
  }
  return {id:report.id,startedAt:report.startedAt,endedAt:report.endedAt,segments};
}
class AccountClient {
  constructor(directory, encryption, changed=()=>{}) {
    this.directory=directory;this.encryption=encryption;this.changed=changed;
    this.base=serverUrl(DEFAULT_SERVER);this.user=null;this.token=null;this.dashboard=null;this.error='';this.syncing=false;this.lastSync=null;this.authExpired=false;this.subscription=null;this.accessUntil=0;
    this.legacyBase=this.base===localMigration?.to ? localMigration.from : null;
    this.profileNamespace=this.legacyBase || this.base;
    this.file=path.join(directory,'account.json');this.credentialFile=path.join(directory,'account.secure');
    try {
      if(encryption.isEncryptionAvailable()) {
        const saved=JSON.parse(encryption.decryptString(fs.readFileSync(this.credentialFile)));
        if((saved.server===this.base || saved.server===this.legacyBase) && /^[0-9]+$/.test(saved.user?.id) && /^[a-f0-9]{64}$/.test(saved.token)) {this.user=saved.user;this.token=saved.token;}
      }
    }catch(error){if(error.code!=='ENOENT')this.error='Saved sign-in could not be restored. Please sign in again.';}
  }
  hasAccess(){return !!this.user && !this.authExpired && this.subscription?.active===true && performance.now()<this.accessUntil;}
  snapshot(){return {user:this.user,dashboard:this.dashboard,subscription:this.subscription,canMonitor:this.hasAccess(),error:this.error,syncing:this.syncing,lastSync:this.lastSync,authExpired:this.authExpired,remembered:this.encryption.isEncryptionAvailable()};}
  profileDirectory(){return this.user ? path.join(this.directory,'accounts',createHash('sha256').update(this.profileNamespace).digest('hex').slice(0,20),this.user.id) : this.directory;}
  persist(){
    fs.mkdirSync(this.directory,{recursive:true});
    if(this.user && this.token && this.encryption.isEncryptionAvailable()) {
      const temp=this.credentialFile+'.tmp';fs.writeFileSync(temp,this.encryption.encryptString(JSON.stringify({server:this.base,user:this.user,token:this.token})));fs.renameSync(temp,this.credentialFile);
    }else{try{fs.unlinkSync(this.credentialFile);}catch(e){if(e.code!=='ENOENT')throw e;}}
  }
  async request(route, method='GET', body, authenticated=true){
    let response;
    try { response=await fetch(this.base+route,{method,redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(authenticated&&this.token?{Authorization:'Bearer '+this.token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)}); }
    catch {throw new Error('Unable to connect to the DegreeBee account service. Please try again shortly.');}
    let result;try{result=await response.json();}catch{throw new Error('DegreeBee is temporarily unavailable. Please try again shortly.');}
    if(!response.ok){if(response.status===401&&authenticated){this.authExpired=true;this.accessUntil=0;}const error=new Error(result.error || 'The account request failed.');error.status=response.status;throw error;}
    return result;
  }
  async authenticate(kind,input){
    if(!['login','register'].includes(kind)||!input||typeof input!=='object')throw new Error('Invalid sign-in request.');
    const result=await this.request('/'+kind,'POST',input,false);
    if(!/^[0-9]+$/.test(result.user?.id)||!/^[a-f0-9]{64}$/.test(result.token))throw new Error('Invalid account service response.');
    const previous={user:this.user,token:this.token};
    this.user=result.user;this.token=result.token;
    try{this.persist();}catch(error){Object.assign(this,previous);throw error;}
    this.dashboard=null;this.subscription=null;this.accessUntil=0;this.authExpired=false;this.error='';this.lastSync=null;
  }
  async refresh(){
    if(!this.user)return this.snapshot();
    try{const result=await this.request('/profile');this.user=result.user;this.dashboard=result;this.subscription=result.subscription||null;if(!this.subscription?.active)this.accessUntil=0;this.error='';this.authExpired=false;this.persist();}
    catch(e){this.accessUntil=0;this.error=e.message;throw e;}
    finally{this.changed();}
    return this.snapshot();
  }
  async sync(reports){
    if(!this.user||this.syncing)return this.snapshot();
    this.syncing=true;this.error='';this.changed();
    const syncFile=path.join(this.profileDirectory(),'synced.json');let synced={};
    try{synced=JSON.parse(fs.readFileSync(syncFile,'utf8'));}catch{}
    const skipped=[];
    try{
      for(const report of reports.filter(r=>['completed','interrupted'].includes(r.status)).sort((a,b)=>a.startedAt.localeCompare(b.startedAt))) {
        if(synced[report.id])continue;
        try { await this.request('/sessions','POST',sessionSummary(report)); }
        catch(error) { if([400,409].includes(error.status)){skipped.push(`${report.startedAt.slice(0,10)}: ${error.message}`);continue;}throw error; }
        synced[report.id]=true;fs.mkdirSync(path.dirname(syncFile),{recursive:true});fs.writeFileSync(syncFile+'.tmp',JSON.stringify(synced));fs.renameSync(syncFile+'.tmp',syncFile);
      }
      await this.refresh();this.lastSync=new Date().toISOString();
      if(skipped.length)this.error=`${skipped.length} session(s) remain local and were not counted. ${skipped[0]}`;
    }catch(e){this.error=e.message;}
    finally{this.syncing=false;this.changed();}
    return this.snapshot();
  }
  async visibility(value){if(typeof value!=='boolean')throw new Error('Invalid preference.');const r=await this.request('/profile','PATCH',{leaderboard:value});this.user=r.user;this.persist();return this.refresh();}
  async activateDemo(){
    if(!this.user||this.authExpired)throw new Error('Please sign in to continue.');
    await this.request('/demo/activate','POST',{confirmDemo:true});
    return this.refresh();
  }
  async checkAccess(){
    if(!this.user||!this.token||this.authExpired){this.accessUntil=0;throw new Error('Please sign in to use AI monitoring.');}
    const began=performance.now();
    try {
      const result=await this.request('/entitlement');this.subscription=result.subscription;
      const remaining=Date.parse(this.subscription?.expiresAt)-Date.parse(this.subscription?.serverNow);
      const lease=Math.min(60000,remaining)-(performance.now()-began);
      if(this.subscription?.active!==true||this.subscription.status!=='active'||!Number.isFinite(lease)||lease<=0)throw new Error('An active DegreeBee subscription is required to start monitoring.');
      this.accessUntil=performance.now()+lease;this.error='';return this.snapshot();
    }catch(e){this.accessUntil=0;this.error=e.message;throw e;}
    finally{this.changed();}
  }
  async logout(){
    let warning='';try{if(this.token)await this.request('/logout','POST',{});}catch{warning='Signed out on this device. The server could not be reached to revoke this session; it will expire automatically.';}
    this.clear();this.error=warning;
  }
  clear(){const previous={user:this.user,token:this.token};this.user=null;this.token=null;try{this.persist();}catch(error){Object.assign(this,previous);throw error;}this.dashboard=null;this.subscription=null;this.accessUntil=0;this.error='';this.authExpired=false;this.lastSync=null;}
  async changePassword(input){const r=await this.request('/password','POST',input);this.token=r.token;this.user=r.user;this.persist();return this.snapshot();}
  async deleteAccount(password){await this.request('/account','DELETE',{password});this.clear();}
}
module.exports={AccountClient,serverUrl,sessionSummary};
