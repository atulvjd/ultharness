import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import os from 'node:os';import path from 'node:path';
import { createApp, commandArgs } from '../server.mjs';
import { routingEnvironment } from '../routing.mjs';
test('OpenRouter uses a separate process credential, a pinned endpoint and the Responses wire protocol',()=>{
 const route={provider:'openrouter',baseUrl:'https://openrouter.ai/api/v1',model:'vendor/tool-model'};
 const args=commandArgs('codex','edit',route);assert.ok(args.includes('model_provider="ultharness_openrouter"'));assert.ok(args.includes('model_providers.ultharness_openrouter.wire_api="responses"'));assert.ok(args.includes('model_providers.ultharness_openrouter.env_key="ULTHARNESS_OPENROUTER_KEY"'));assert.ok(!args.some(v=>v.includes('fixture-secret')));
 const env=routingEnvironment('codex',route,'fixture-secret',{});assert.equal(env.ULTHARNESS_OPENROUTER_KEY,'fixture-secret');assert.equal(env.ULTHARNESS_OMNIROUTE_KEY,undefined);
});
test('OpenRouter configuration gates missing keys and unsupported runners and never serializes secrets',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'uh-integrations-')),bin=path.join(dir,'bin');mkdirSync(bin);for(const name of ['codex','claude']){const file=path.join(bin,name);writeFileSync(file,`#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Provider fixture ready'}})));`);chmodSync(file,0o755);}
 const previousPath=process.env.PATH;process.env.PATH=bin+path.delimiter+previousPath;const app=createApp({root:dir,dataDir:path.join(dir,'data')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}/api/`;
 t.after(async()=>{await app.close();process.env.PATH=previousPath;rmSync(dir,{recursive:true,force:true})});
 const request=async(name,body)=>{const res=await fetch(base+name,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:res.status,body:await res.json()}};
 await request('routing',{provider:'openrouter',baseUrl:'https://openrouter.ai/api/v1',defaultModel:'vendor/tool-model'});
 const task={title:'Router fixture',projectId:'project_home',agentId:'agent_codex',route:'openrouter',runNow:true};assert.equal((await request('tasks',task)).status,400);
 assert.equal((await request('routing',{provider:'openrouter',apiKey:'fixture-secret'})).body.keyConfigured,true);assert.equal((await request('tasks',{...task,agentId:'agent_claude'})).status,400);
 const created=await request('tasks',task);assert.equal(created.status,201);assert.equal(created.body.routeSnapshot.baseUrl,'https://openrouter.ai/api/v1');
 await request('routing',{provider:'omniroute',baseUrl:'http://127.0.0.1:20128/v1'});const state=(await request('state')).body;assert.equal(state.tasks[0].routeSnapshot.provider,'openrouter');assert.ok(!JSON.stringify(state).includes('fixture-secret'));
});
test('restarting with OpenRouter selected never treats an OmniRoute environment key as an OpenRouter key',async t=>{
 const { DatabaseSync }=await import('node:sqlite');
 const dir=mkdtempSync(path.join(os.tmpdir(),'uh-router-restart-'));let app=createApp({root:dir,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${app.server.address().port}`;
 await fetch(base+'/api/routing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'openrouter',baseUrl:'https://openrouter.ai/api/v1'})});await app.close();
 const previousOmni=process.env.OMNIROUTE_API_KEY,previousRouter=process.env.OPENROUTER_API_KEY;process.env.OMNIROUTE_API_KEY='fixture-omni-only';delete process.env.OPENROUTER_API_KEY;
 app=createApp({root:dir,dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
 t.after(async()=>{await app.close();if(previousOmni===undefined)delete process.env.OMNIROUTE_API_KEY;else process.env.OMNIROUTE_API_KEY=previousOmni;if(previousRouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previousRouter;rmSync(dir,{recursive:true,force:true});});
 assert.equal((await(await fetch(base+'/api/state')).json()).routing.keyConfigured,false);
 const db=new DatabaseSync(path.join(dir,'workspace.sqlite'),{readOnly:true});assert.ok(!db.prepare('SELECT body FROM state').get().body.includes('fixture-omni-only'));db.close();
});
