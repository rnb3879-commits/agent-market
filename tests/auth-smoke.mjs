import assert from 'node:assert/strict';
import {generateKeyPairSigner} from '@solana/kit';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const key=await generateKeyPairSigner();let cookie='';
async function req(body){const r=await fetch(base+'/api/market',{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
await req();const {data:{message}}=await req({action:'challenge',wallet:key.address});
const signature=Buffer.from(await crypto.subtle.sign('Ed25519',key.keyPair.privateKey,new TextEncoder().encode(message))).toString('base64');
assert.equal((await req({action:'login',wallet:key.address,signature:Buffer.alloc(64).toString('base64')})).status,400);
assert.equal((await req({action:'login',wallet:key.address,signature})).status,200);
assert.equal((await req()).data.wallet,key.address);
assert.equal((await req({action:'login',wallet:key.address,signature})).status,400);
assert.equal((await req({action:'logout'})).status,200);
assert.equal((await req()).data.wallet,null);
console.log('6 wallet authentication checks passed; no funds or existing wallets used.');
