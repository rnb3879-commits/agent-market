import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';let cookie='';
async function request(body){const r=await fetch(base+'/api/market',{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
await request();const {data:{order}}=await request({action:'create',agentId:'author',brief:'Проверка возврата по истечении срока заказа',mode:'demo'});
assert.equal((await request({action:'refund',id:order.id})).status,400);
console.log('Early refund rejected; waiting for the real 2-minute demo deadline.');
await new Promise(r=>setTimeout(r,Math.max(0,order.deadline-Date.now()+1100)));
assert.equal((await request({action:'refund',id:order.id})).status,200);
assert.equal((await request({action:'refund',id:order.id})).status,400);
const resumed=await request({action:'execute',id:order.id});assert.equal(resumed.data.order.status,'refunded');assert.equal(resumed.data.order.result,'');
console.log('5 refund checks passed: early refund blocked, deadline refund succeeds, double refund blocked, execution cannot settle refunded order.');
