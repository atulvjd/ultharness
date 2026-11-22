import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createDeliveryManager } from '../delivery.mjs';
function harness(saved) {
 const state = saved || { deliveries: [], tasks: [], artifacts: [], connections: [], routing: { baseUrl: 'http://127.0.0.1:20128/v1' } };
 const active = new Map(); const cancelled = [];
 const manager = createDeliveryManager({state, active, getProject:()=>({id:'p',path:os.tmpdir()}),getAgent:()=>({id:'a',kind:'codex',enabled:true}), executable:()=>'/mock/codex', prepareTask:body=>({...body,id:'t'+(state.tasks.length+1),routing:{provider:'direct'},status:'queued'}),insertTask:t=>state.tasks.push(t),submitTask:t=>{t.status='ready'},change:()=>{},event:()=>{},cancelTask:t=>{t.status='cancelled';cancelled.push(t.id)}});
 const create = (overrides={}) => manager.create({ title:'Goal',brief:'Complete goal',projectId:'p',builderId:'a',reviewerId:'a',criteria:['Works'],checks:[{kind:'file',file:'index.html'}],runPolicy:'persistent',...overrides});
 return { state,manager,create,active,cancelled };
}
test('persistent missions retain the original scope, checkpoint phases and use explicit budgets',()=>{
 const f=harness();const d=f.create();f.manager.approve(d);assert.equal(d.maxRepairs,100);assert.equal(d.maxMinutes,720);assert.equal(d.approval.maxAgentRuns,205);assert.equal(d.checkpoints.length,1);assert.equal(d.checkpoints[0].phase,'building');assert.ok(Date.parse(d.deadlineAt)>Date.now());
 const task=f.state.tasks[0];task.status='done';f.state.artifacts.push({taskId:task.id,content:'Built'});f.manager.advance();assert.equal(d.status,'checking');assert.equal(d.checkpoints.length,2);assert.match(f.state.tasks[1].description,/Complete goal/);
});
test('transient failures back off within the approval, and Stop prevents a scheduled retry',()=>{
 const f=harness();const d=f.create();f.manager.approve(d);f.state.tasks[0].status='failed';f.state.tasks[0].error='HTTP 503 temporarily overloaded';f.manager.advance();assert.equal(d.status,'building');assert.equal(d.recoveryAttempts,1);assert.ok(Date.parse(d.retryAt)>Date.now());f.manager.advance();assert.equal(f.state.tasks.length,1);
 d.retryAt=new Date(0).toISOString();f.manager.advance();assert.equal(f.state.tasks.length,2);assert.equal(d.checkpoints.length,2);assert.equal(d.approval.agentRuns,2);
 f.state.tasks[1].status='failed';f.state.tasks[1].error='429 rate limit';f.manager.advance();f.manager.pause(d);d.retryAt=new Date(0).toISOString();f.manager.advance();assert.equal(d.status,'paused');assert.equal(f.state.tasks.length,2);
});
test('authentication and exhausted recovery attempts block without blind retries',()=>{
 for(const error of ['401 authentication failed','403 permission denied','429 quota exceeded']){const f=harness();const d=f.create();f.manager.approve(d);Object.assign(f.state.tasks[0],{status:'failed',error});f.manager.advance();assert.equal(d.status,'blocked');assert.equal(d.recoveryAttempts,0);}
 const f=harness();const d=f.create();f.manager.approve(d);d.recoveryAttempts=3;Object.assign(f.state.tasks[0],{status:'failed',error:'503 overloaded'});f.manager.advance();assert.equal(d.status,'blocked');assert.equal(f.state.tasks.length,1);
});
test('time budget cancels running work and prevents restart from silently refreshing its budget',()=>{
 const f=harness();const d=f.create();f.manager.approve(d);d.deadlineAt=new Date(0).toISOString();f.manager.advance();assert.equal(d.status,'blocked');assert.deepEqual(f.cancelled,['t1']);assert.throws(()=>f.manager.approve(d),/time budget exhausted/);
});
test('restart recovers a persistent mission within its saved budget and does not auto-resume bounded work',()=>{
 const f=harness();const d=f.create();f.manager.approve(d);Object.assign(f.state.tasks[0],{status:'failed',error:'Server stopped during this run. Review logs and run again.'});const g=harness(structuredClone(f.state));g.manager.advance();assert.equal(g.state.deliveries[0].status,'building');assert.ok(g.state.deliveries[0].retryAt);assert.equal(g.state.deliveries[0].deadlineAt,d.deadlineAt);
 const b=harness();const bounded=b.create({runPolicy:'bounded'});b.manager.approve(bounded);const c=harness(structuredClone(b.state));assert.equal(c.state.deliveries[0].status,'blocked');
});
test('same failing criteria over five reviews stop a persistent loop with evidence intact',()=>{
 const f=harness();const d=f.create();f.manager.approve(d);d.status='reviewing';const review={verdict:'reject',summary:'Still missing',criteria:[{id:'AC-1',status:'fail',evidence:'index.html missing section'}]};d.attempts=Array.from({length:4},()=>review);const task=f.state.tasks[0];task.deliveryPhase='reviewing';task.status='done';f.state.artifacts.push({taskId:task.id,content:JSON.stringify(review)});f.manager.advance();assert.equal(d.status,'blocked');assert.match(d.error,/Five reviews/);assert.equal(d.attempts.length,5);
});
