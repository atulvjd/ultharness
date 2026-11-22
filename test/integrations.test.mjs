import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import os from 'node:os';import path from 'node:path';
import { createApp, commandArgs } from '../server.mjs';
import { connectionSettings } from '../delivery.mjs';
import { routingEnvironment } from '../routing.mjs';
import { openClawSettings, openClawArguments } from '../openclaw.mjs';
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
 const c=await request('connections',{kind:'openclaw',name:'Research',url:'http://127.0.0.1:18789',apiKey:'fixture-claw-token',tools:['web_fetch']});assert.equal(c.status,201);assert.equal(c.body.integration,'openclaw');assert.ok(!JSON.stringify((await request('state')).body).includes('fixture-claw-token'));
});
test('OpenClaw bridge validates endpoints and tools and excludes messages, shell and personal browser profiles',()=>{
 assert.throws(()=>openClawSettings({url:'https://remote.example'}),/local OpenClaw/);assert.throws(()=>openClawSettings({tools:['exec']}),/inspection tools/);assert.throws(()=>openClawArguments('messages_send',{}),/not allowed/);assert.throws(()=>openClawArguments('browser',{action:'act'}),/Browser supports/);assert.throws(()=>openClawArguments('browser',{action:'snapshot',profile:'user'}),/dedicated/);assert.throws(()=>openClawArguments('browser',{action:'navigate',url:'file:///etc/passwd'}),/HTTP/);
 const c=connectionSettings({kind:'openclaw',name:'Research',url:'http://127.0.0.1:18789',tools:['web_fetch','browser']});assert.equal(c.kind,'mcp');assert.ok(c.args[0].endsWith('/scripts/openclaw-mcp.mjs'));assert.deepEqual(c.env_vars,['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD']);assert.ok(commandArgs('codex','review',null,[{...c,id:'connection_claw'}]).some(v=>v.includes('.env_vars=')));
});
test('real stdio MCP bridge authenticates to a mock OpenClaw gateway and reports policy denials honestly',async t=>{
 const calls=[];const gateway=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({auth:req.headers.authorization,path:req.url,body:JSON.parse(body)});res.setHeader('Content-Type','application/json');if(JSON.parse(body).tool==='memory_search'){res.writeHead(404);res.end('{}');return;}res.end(JSON.stringify({ok:true,result:{content:JSON.parse(body).tool==='browser'?[{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='}]:[{type:'text',text:'ACTUAL_GATEWAY_FIXTURE'}]}}));});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,[new URL('../scripts/openclaw-mcp.mjs',import.meta.url).pathname,`http://127.0.0.1:${gateway.address().port}`,JSON.stringify(['web_fetch','browser','memory_search'])],{env:{...process.env,OPENCLAW_GATEWAY_TOKEN:'fixture-secret'},stdio:['pipe','pipe','pipe']});
 const waiting=new Map();let counter=0;const lines=createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line);waiting.get(r.id)?.(r);waiting.delete(r.id)});t.after(async()=>{child.kill();lines.close();await new Promise(r=>gateway.close(r));});
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++counter;const timeout=setTimeout(()=>reject(Error('MCP response timeout')),3000);waiting.set(id,r=>{clearTimeout(timeout);resolve(r)});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
 assert.equal((await rpc('initialize',{})).result.serverInfo.name,'ultharness-openclaw');assert.equal((await rpc('tools/list')).result.tools.length,3);
 const result=await rpc('tools/call',{name:'web_fetch',arguments:{args:{url:'https://example.com'}}});assert.match(result.result.content[0].text,/ACTUAL_GATEWAY_FIXTURE/);assert.equal(calls[0].auth,'Bearer fixture-secret');assert.equal(calls[0].path,'/tools/invoke');assert.equal(calls[0].body.tool,'web_fetch');
 const denied=await rpc('tools/call',{name:'exec',arguments:{args:{command:'echo NO'}}});assert.equal(denied.result.isError,true);assert.equal(calls.length,1);
 const unavailable=await rpc('tools/call',{name:'memory_search',arguments:{args:{query:'fixture'}}});assert.equal(unavailable.result.isError,true);assert.match(unavailable.result.content[0].text,/unavailable or denied/);
 const browser=await rpc('tools/call',{name:'browser',arguments:{args:{action:'snapshot'}}});assert.equal(browser.result.isError,undefined);assert.equal(browser.result.content[0].type,'image');assert.equal(browser.result.content[0].mimeType,'image/png');assert.equal(calls.at(-1).body.args.profile,'openclaw');
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
