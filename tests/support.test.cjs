const test=require('node:test'),assert=require('node:assert/strict');
const {supportRoute,supportRequest}=require('../electron/support-client.cjs');
test('support IPC exposes only fixed authenticated routes and strips injected identity/role',()=>{
  const [route,method,body]=supportRoute('create',{subject:'A question',category:'camera',message:'What happened',requestId:'test',user_id:'99',author_role:'support',token:'secret'});
  assert.equal(route,'/support/tickets');assert.equal(method,'POST');assert.deepEqual(Object.keys(body),['subject','category','message','requestId']);
  assert.throws(()=>supportRoute('detail',{id:'../../profile'}));assert.throws(()=>supportRoute('deleteEverything',{id:'1'}));
  assert.equal(supportRoute('detail',{id:'1',scope:'desk',before:'3'})[0],'/support/tickets/1?scope=desk&before=3');
});
test('support cannot be used while signed out or return another identity’s pending response',async()=>{
  await assert.rejects(supportRequest({user:null},'summary'),/sign in/);
  const client={user:{id:'1'},token:'a',authExpired:false,request:async()=>({staff:false})};
  assert.deepEqual(await supportRequest(client,'summary'),{staff:false});
  client.request=async()=>{client.token='b';return {private:'reply'};};
  await assert.rejects(supportRequest(client,'summary'),/account changed/);
});
