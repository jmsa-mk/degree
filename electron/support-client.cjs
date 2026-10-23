// Fixed IPC actions only; the renderer cannot supply an arbitrary service URL.
function supportRoute(action, input = {}) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid support request.');
  const scope=input.scope==='desk'?'desk':'mine';
  const query=new URLSearchParams({scope});
  if(action==='summary')return ['/support/summary','GET'];
  if(action==='list') {
    query.set('status',String(input.status||'all'));query.set('page',String(input.page||0));
    return ['/support/tickets?'+query,'GET'];
  }
  if(action==='create')return ['/support/tickets','POST',{subject:input.subject,category:input.category,message:input.message,requestId:input.requestId}];
  if(!/^[1-9][0-9]{0,19}$/.test(input.id))throw new Error('Invalid support request reference.');
  const route='/support/tickets/'+input.id;
  if(action==='detail'){if(input.before)query.set('before',String(input.before));return [route+'?'+query,'GET'];}
  if(action==='reply')return [route+'/messages?'+query,'POST',{message:input.message,requestId:input.requestId}];
  if(action==='status')return [route+'/status?'+query,'POST',{status:input.status,requestId:input.requestId}];
  if(action==='read')return [route+'/read','POST',{messageId:input.messageId}];
  throw new Error('Unknown support action.');
}
async function supportRequest(account, action, input) {
  if(!account.user||!account.token||account.authExpired)throw new Error('Please sign in to contact support.');
  const identity=account.token;
  const result=await account.request(...supportRoute(action,input));
  if(identity!==account.token)throw new Error('Your account changed. Open support again.');
  return result;
}
module.exports={supportRoute,supportRequest};
