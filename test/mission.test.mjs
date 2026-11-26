import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync,symlinkSync } from 'node:fs';
import os from 'node:os';import path from 'node:path';
import { createApp } from '../server.mjs';
async function fixture(t,{badPlan=false,slow=false}={}) {
 const dir=mkdtempSync(path.join(os.tmpdir(),'uh-mission-')),root=path.join(dir,'project'),bin=path.join(dir,'bin');mkdirSync(root);mkdirSync(bin);
 writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{check:`node -e "require('fs').accessSync('index.html');console.log('ACTUAL_CHECK')"`}}));
 writeFileSync(path.join(root,'reference.md'),'Use Home and Contact with labelled fields.');
 const source=`#!${process.execPath}\nimport fs from 'node:fs';let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{fs.appendFileSync('prompts.jsonl',JSON.stringify(input)+'\\n');const planning=input.includes('Task: Plan:');const review=input.includes('Task: Review:');let result;if(planning){fs.readFileSync('reference.md','utf8');result=${badPlan}?'Not JSON':JSON.stringify({summary:'Build the Home and Contact website against the reference.',criteria:['Home exists','Contact exists'],checks:[{kind:'file',file:'index.html'},{kind:'npm',script:'check'}]});}else if(review){const good=fs.readFileSync('index.html','utf8').includes('Contact');const ids=[...input.matchAll(/"id": "(AC-\\d+)"/g)].map(m=>m[1]);result=JSON.stringify({verdict:good?'pass':'reject',summary:good?'Read actual file; Contact now exists.':'Contact missing: add the required section.',criteria:ids.map(id=>({id,status:good?'pass':'fail',evidence:good?'Fixture read actual index.html containing Contact':'Fixture found no Contact in index.html'}))});}else{let n=0;try{n=Number(fs.readFileSync('count','utf8'))}catch{};fs.writeFileSync('count',String(++n));fs.writeFileSync('index.html','<html><body><h1>Home</h1>'+(n>1?'<label>Contact</label>':'')+'</body></html>');result='Built implementation.';}console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'fixture inspected project',aggregated_output:'Local fixture evidence'}}));${slow ? "if(planning){process.on('SIGTERM',()=>setTimeout(()=>process.exit(1),250));setInterval(()=>{},1000);return;}" : ''}console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:result}}));});`;
 for(const kind of ['codex','claude']){writeFileSync(path.join(bin,kind),source);chmodSync(path.join(bin,kind),0o755);}
 const oldPath=process.env.PATH;process.env.PATH=bin+path.delimiter+oldPath;
 const app=createApp({root,dataDir:path.join(dir,'data'),tickMs:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=async(endpoint,body)=>{const r=await fetch(base+'/api/'+endpoint,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
 const until=async f=>{for(let i=0;i<250;i++){const state=(await request('state')).body;if(f(state))return state;await new Promise(r=>setTimeout(r,20));}throw Error('State timed out '+JSON.stringify((await request('state')).body.deliveries));};
 t.after(async()=>{await app.close();process.env.PATH=oldPath;rmSync(dir,{recursive:true,force:true});});
 return{dir,root,base,request,until};
}
test('one aim plans, builds, streams, rejects, repairs, checks again, and waits for acceptance',async t=>{
 const f=await fixture(t);const result=await f.request('missions',{aim:'Make Home and Contact for my client',references:['reference.md','https://example.com/design'],projectId:'project_home',maxRepairs:2});assert.equal(result.status,201);assert.equal(result.body.status,'planning');assert.deepEqual(result.body.checks,[], 'planner must derive paths instead of inheriting an index.html assumption');
 const d=(await f.until(s=>s.deliveries[0]?.status==='awaiting_acceptance')).deliveries[0];assert.equal(d.mission,true);assert.equal(d.criteria.length,5);assert.equal(d.checks.length,2);assert.equal(d.repairs,1);assert.equal(d.attempts.length,2);assert.equal(d.taskIds.length,7);assert.equal(d.approval.agentRuns,5);assert.equal(d.approval.maxAgentRuns,7);
 const s=(await f.request('state')).body;assert.ok(s.tasks.every(t=>t.status==='done'));assert.ok(s.tasks.every(t=>t.status!=='approval'));assert.ok(s.tasks.some(t=>t.logs.some(l=>l.text.includes('ACTUAL_CHECK'))));assert.equal(d.connections.length,2);assert.match(d.criteria[1].text,/390px.*1440px/);const prompts=readFileSync(path.join(f.root,'prompts.jsonl'),'utf8');assert.match(prompts,/Make Home and Contact/);assert.match(prompts,/reference.md/);assert.match(prompts,/Contact missing/);assert.match(prompts,/IMPLEMENTATION PLAN/);
 const stream=await fetch(f.base+'/api/events');assert.equal(stream.headers.get('content-type'),'text/event-stream');await stream.body.cancel();assert.equal((await f.request(`deliveries/${d.id}/accept`,{})).body.status,'accepted');
});
test('bad plans block before project edits and bad references leave no partial mission',async t=>{
 const f=await fixture(t,{badPlan:true});assert.equal((await f.request('missions',{aim:'Build a site',projectId:'project_home',references:['../secret.md']})).status,400);assert.equal((await f.request('state')).body.deliveries.length,0);
 const result=await f.request('missions',{aim:'Build a site',projectId:'project_home'});assert.equal(result.status,201);const s=await f.until(s=>s.deliveries[0].status==='blocked');assert.match(s.deliveries[0].error,/valid JSON plan/);assert.equal(s.tasks.length,1);assert.equal((await f.request(`deliveries/${result.body.id}/accept`,{})).status,409);
});
test('planning respects project locks, stop controls, and process-exit ordering',async t=>{
 const f=await fixture(t,{slow:true});const d=(await f.request('missions',{aim:'Build the site',projectId:'project_home'})).body;await f.until(s=>s.tasks[0]?.logs.some(l=>l.text.includes('fixture inspected')));assert.equal((await f.request('missions',{aim:'Other aim',projectId:'project_home'})).status,409);assert.equal((await f.request('projects/project_home/update',{path:f.dir})).status,409);assert.equal((await f.request(`deliveries/${d.id}/pause`,{})).body.status,'paused');assert.equal((await f.request(`deliveries/${d.id}/approve`,{})).status,409);await f.until(s=>s.tasks.every(t=>!t.stopping));
});
test('preview serves real output, notices changes, and rejects private files and escaping symlinks',async t=>{
 const f=await fixture(t);const d=(await f.request('deliveries',{title:'Preview',brief:'Preview files',projectId:'project_home',builderId:'agent_codex',reviewerId:'agent_codex',criteria:['Home'],checks:[{kind:'file',file:'index.html'}]})).body;
 writeFileSync(path.join(f.root,'index.html'),'<html><h1>Home preview</h1></html>');writeFileSync(path.join(f.root,'.env'),'SECRET');writeFileSync(path.join(f.dir,'outside.html'),'PRIVATE');symlinkSync(path.join(f.dir,'outside.html'),path.join(f.root,'escape.html'));
 const preview=await f.request(`deliveries/${d.id}/preview`);assert.equal(preview.status,200);const html=await fetch(preview.body.url);assert.match(await html.text(),/Home preview/);assert.match(html.headers.get('content-security-policy'),/sandbox allow-scripts/);const before=await(await fetch(preview.body.url+'/__revision')).json();writeFileSync(path.join(f.root,'index.html'),'<h1>Changed live preview</h1>');const after=await(await fetch(preview.body.url+'/__revision')).json();assert.notEqual(before.revision,after.revision);assert.equal((await fetch(preview.body.url+'/.env')).status,403);assert.equal((await fetch(preview.body.url+'/escape.html')).status,404);assert.equal((await fetch(preview.body.url+'/package.json')).status,404);
});

test('Newt reuses only the saved project settings and keeps references specific to the current aim', async t => {
  const f = await fixture(t);
  const initial = await f.request('newt/missions', { aim: 'A spoken aim' });
  assert.equal(initial.status, 409);
  const connection = await f.request('connections', { kind: 'reference', name: 'Shared brief', file: 'reference.md' });
  const first = await f.request('missions', {
    projectId: 'project_home', aim: 'Build the first site', references: ['https://example.com/first'],
    connectionIds: [connection.body.id], runPolicy: 'persistent', maxRepairs: 3, maxMinutes: 45, rememberNewt: true
  });
  assert.equal(first.status, 201);
  await f.until(s => s.deliveries[0].status === 'awaiting_acceptance');
  await f.request('deliveries/' + first.body.id + '/accept', {});
  const next = await f.request('newt/missions', { aim: 'Build another site', projectId: 'wrong', route: 'openrouter' });
  assert.equal(next.status, 201);
  assert.equal(next.body.projectId, 'project_home');
  assert.equal(next.body.brief, 'Build another site');
  assert.equal(next.body.maxMinutes, 45);
  assert.deepEqual(next.body.routing, first.body.routing);
  assert.deepEqual(next.body.connections.map(c => c.id), [connection.body.id]);
  const stopped = await f.request('newt/stop-all', {});
  assert.equal(stopped.body.deliveries, 1);
  const state = (await f.request('state')).body;
  assert.equal(state.deliveries[0].status, 'paused');
  await f.request('connections/' + connection.body.id + '/toggle', {});
  assert.equal((await f.request('newt/missions', { aim: 'A third aim' })).status, 409);
  assert.equal((await f.request('state')).body.deliveries.length, 2);
  await f.request('newt/forget', {});
  assert.equal((await f.request('newt/missions', { aim: 'A fourth aim' })).status, 409);
});
