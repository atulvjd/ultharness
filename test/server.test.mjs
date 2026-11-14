import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, commandArgs } from '../server.mjs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { normalizeBaseUrl, routingEnvironment } from '../routing.mjs';
import { execFileSync } from 'node:child_process';

async function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ultharness-test-'));
  const root = path.join(directory, 'project'); mkdirSync(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test-project', scripts: { check: 'echo check' } }));
  writeFileSync(path.join(root, 'hello.js'), 'export const hello = true;');
  const app = createApp({ dataDir: path.join(directory, 'data'), root, tickMs: 100000 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (endpoint, body, extra = {}) => {
    const response = await fetch(`${url}/api/${endpoint}`, { ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), ...extra });
    return { status: response.status, body: await response.json() };
  };
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ...app, directory, root, url, request };
}
const task = (values = {}) => ({ title: 'Inspect project', agentId: 'agent_scout', projectId: 'project_home', lane: 'coding', ...values });
async function until(request, predicate) {
  for (let i = 0; i < 70; i++) {
    const current = (await request('state')).body;
    if (predicate(current)) return current;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Condition did not become true');
}

test('a cancelled runner must stop before the same task can be resubmitted', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, `process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),300));process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'thread.started'}));setInterval(()=>{},1000);});`);
  const created = (await request('tasks', task({ agentId: 'agent_codex', runNow: true }))).body;
  await request(`tasks/${created.id}/approve`, {});
  await until(request, s => s.tasks[0].logs.some(l => l.text === 'thread.started'));
  await request(`tasks/${created.id}/cancel`, {});
  const retry = await request(`tasks/${created.id}/run`, {});
  assert.equal(retry.status, 409, 'retry must wait for the previous process to exit');
  assert.match(retry.body.error, /stopping/i);
  await until(request, s => !s.agents.find(a => a.id === 'agent_codex').activeTaskId);
  const resubmitted = await request(`tasks/${created.id}/run`, {});
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.body.status, 'approval');
});

test('a successful exit without an assistant report fails and holds the workflow', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, `process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'thread.started'}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:3,output_tokens:0}}));});`);
  const workflow = (await request('workflows', { title: 'Empty result', projectId: 'project_home', steps: [
    { title: 'Empty runner', agentId: 'agent_codex' }, { title: 'Must wait', agentId: 'agent_scout' }
  ] })).body;
  await request(`tasks/${workflow.taskIds[0]}/approve`, {});
  const state = await until(request, s => ['done', 'failed'].includes(s.tasks.find(t => t.id === workflow.taskIds[0]).status));
  const first = state.tasks.find(t => t.id === workflow.taskIds[0]);
  assert.equal(first.status, 'failed'); assert.match(first.error, /without.*report/i);
  assert.equal(state.tasks.find(t => t.id === workflow.taskIds[1]).status, 'queued');
});

test('local inspection produces a real downloadable artifact and persistent event history', async t => {
  const { request, url } = await fixture(t);
  const created = await request('tasks', task({ runNow: true }));
  assert.equal(created.status, 201);
  const state = await until(request, s => s.tasks[0].status === 'done');
  assert.equal(state.artifacts.length, 1);
  assert.match(state.artifacts[0].content, /test-project/);
  assert.match(state.artifacts[0].content, /hello\.js/);
  assert.match(state.artifacts[0].content, /not an AI code review/);
  assert.ok(state.tasks[0].logs.length >= 2);
  const download = await fetch(`${url}/api/artifacts/${state.artifacts[0].id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.match(await download.text(), /Workspace inspection/);
});

test('dependency blocks execution until the preceding task succeeds', async t => {
  const { request } = await fixture(t);
  const parent = (await request('tasks', task())).body;
  const child = (await request('tasks', task({ title: 'Follow-up', parentId: parent.id, dependsOnId: parent.id }))).body;
  assert.equal((await request(`tasks/${child.id}/run`, {})).status, 409);
  await request(`tasks/${parent.id}/run`, {});
  await until(request, s => s.tasks.find(t => t.id === parent.id).status === 'done');
  assert.equal((await request(`tasks/${child.id}/run`, {})).status, 200);
  const state = await until(request, s => s.tasks.find(t => t.id === child.id).status === 'done');
  assert.equal(state.tasks.find(t => t.id === child.id).parentId, parent.id);
  assert.equal((await request(`tasks/${child.id}/cancel`, {})).status, 409);
});

test('routines run real checks, pause, and persist across application instances', async t => {
  const { request, directory, root } = await fixture(t);
  const routine = (await request('routines', { title: 'Health check', agentId: 'agent_pulse', projectId: 'project_home', intervalMinutes: 60 })).body;
  assert.ok(routine.nextRunAt);
  assert.equal((await request(`routines/${routine.id}/run`, {})).status, 201);
  const state = await until(request, s => s.tasks[0]?.status === 'done');
  assert.equal(state.tasks[0].lane, 'operations');
  assert.match(state.artifacts[0].content, /Available to this user/);
  assert.equal((await request(`routines/${routine.id}/toggle`, {})).body.enabled, false);
  const second = createApp({ dataDir: path.join(directory, 'data'), root, tickMs: 100000 });
  await new Promise(resolve => second.server.listen(0, '127.0.0.1', resolve));
  try {
    const restored = await (await fetch(`http://127.0.0.1:${second.server.address().port}/api/state`)).json();
    assert.equal(restored.tasks[0].status, 'done');
    assert.equal(restored.artifacts.length, 1);
    assert.equal(restored.routines[0].enabled, false);
  } finally { await second.close(); }
});

test('validation, origin checks, pause and cancellation preserve task state', async t => {
  const { request, url } = await fixture(t);
  assert.equal((await request('tasks', task({ title: '' }))).status, 400);
  assert.equal((await request('projects', { name: 'Missing', path: '/this/path/does/not/exist' })).status, 400);
  assert.equal((await request('routines', { title: 'Bad', agentId: 'agent_pulse', projectId: 'project_home', intervalMinutes: 0 })).status, 400);
  assert.equal((await request('state', undefined, { headers: { Origin: 'https://elsewhere.example' } })).status, 403);
  const denied = await fetch(`${url}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(denied.status, 415);
  await request('agents/agent_scout/toggle', {});
  assert.equal((await request('tasks', task())).status, 400);
  await request('agents/agent_scout/toggle', {});
  const created = (await request('tasks', task())).body;
  await request(`tasks/${created.id}/comment`, { text: '<script>this stays plain text</script>' });
  const cancelled = (await request(`tasks/${created.id}/cancel`, {})).body;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.comments[0].text, '<script>this stays plain text</script>');
  assert.equal((await request(`tasks/${created.id}/approve`, {})).status, 409);
});

test('external runner waits for approval and streams provider results without making a model call', async t => {
  const { request, directory } = await fixture(t);
  const bin = path.join(directory, 'bin'); mkdirSync(bin);
  const fake = path.join(bin, 'codex');
  // A local fixture executable stands in for the provider; no real agent is launched.
  writeFileSync(fake, `#!${process.execPath}\nlet input='';process.stdin.on('data', c=>input+=c);process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Fixture result for '+input.slice(0,30)}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:12,output_tokens:8}}));});`);
  chmodSync(fake, 0o755);
  const previous = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${previous}`;
  t.after(() => process.env.PATH = previous);
  const created = (await request('tasks', task({ agentId: 'agent_codex', runNow: true }))).body;
  assert.equal(created.status, 'approval');
  assert.equal(created.logs.length, 0);
  assert.equal((await request('state')).body.artifacts.length, 0);
  await request(`tasks/${created.id}/approve`, {});
  const state = await until(request, s => s.tasks[0].status === 'done');
  assert.equal(state.tasks[0].approval.decision, 'approved');
  assert.match(state.artifacts[0].content, /Fixture result/);
  assert.equal(state.tasks[0].usage.output_tokens, 8);
  const rejected = (await request('tasks', task({ agentId: 'agent_codex', runNow: true }))).body;
  assert.equal((await request(`tasks/${rejected.id}/reject`, {})).body.status, 'cancelled');
  assert.equal((await request(`tasks/${rejected.id}/approve`, {})).status, 409);
});

test('CLI arguments retain permission boundaries for review and edit modes', () => {
  assert.ok(commandArgs('codex', 'review').includes('read-only'));
  assert.ok(commandArgs('codex', 'edit').includes('workspace-write'));
  assert.ok(!commandArgs('codex', 'edit').some(arg => arg.includes('bypass')));
  assert.ok(!commandArgs('claude', 'edit').join(' ').includes('Bash'));
  assert.ok(commandArgs('claude', 'review').includes('Read,Glob,Grep'));
});

test('the installed local Llama model disables unsupported thinking without changing other routes', () => {
  const local = commandArgs('codex', 'review', { provider: 'omniroute', baseUrl: 'http://127.0.0.1:20128/v1', model: 'ollama-local/llama3.2:3b' });
  assert.ok(local.includes('model_reasoning_effort="none"'));
  assert.ok(local.includes('model_reasoning_summary="none"'));
  assert.ok(local.includes('read-only'));
  const combo = commandArgs('codex', 'review', { provider: 'omniroute', baseUrl: 'http://127.0.0.1:20128/v1', model: 'ultharness-free' });
  assert.ok(!combo.some(arg => arg.startsWith('model_reasoning_effort=')));
  assert.ok(!commandArgs('codex', 'review').some(arg => arg.startsWith('model_reasoning_effort=')));
});

test('provider-reported errors fail the task even when the CLI exits successfully', async t => {
  const { request, directory } = await fixture(t);
  const bin = path.join(directory, 'bin'); mkdirSync(bin);
  const fake = path.join(bin, 'claude');
  writeFileSync(fake, `#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'result',is_error:true,result:'Fixture authentication failure'})));`);
  chmodSync(fake, 0o755);
  const previous = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${previous}`;
  t.after(() => process.env.PATH = previous);
  const created = (await request('tasks', task({ agentId: 'agent_claude', runNow: true }))).body;
  await request(`tasks/${created.id}/approve`, {});
  const state = await until(request, s => s.tasks[0].status === 'failed');
  assert.match(state.tasks[0].error, /authentication failure/);
});

test('same-project CLI runs serialize and cancellation releases the project lock', async t => {
  const { request, directory } = await fixture(t);
  const bin = path.join(directory, 'bin'); mkdirSync(bin);
  for (const kind of ['claude', 'codex']) {
    const fake = path.join(bin, kind);
    writeFileSync(fake, `#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{console.log(JSON.stringify({type:'result',result:'Fixture finished'}));},10000));`);
    chmodSync(fake, 0o755);
  }
  const previous = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${previous}`;
  t.after(() => process.env.PATH = previous);
  const first = (await request('tasks', task({ agentId: 'agent_claude', runNow: true }))).body;
  const second = (await request('tasks', task({ agentId: 'agent_codex', runNow: true }))).body;
  await request(`tasks/${first.id}/approve`, {});
  await request(`tasks/${second.id}/approve`, {});
  let state = (await request('state')).body;
  assert.equal(state.tasks.find(t => t.id === first.id).status, 'running');
  assert.equal(state.tasks.find(t => t.id === second.id).status, 'ready');
  await request(`tasks/${first.id}/cancel`, {});
  state = await until(request, s => s.tasks.find(t => t.id === second.id).status === 'running');
  assert.equal(state.tasks.find(t => t.id === first.id).status, 'cancelled');
  assert.equal(state.tasks.find(t => t.id === second.id).status, 'running');
  await request(`tasks/${second.id}/cancel`, {});
});

test('OmniRoute normalizes gateway URLs and isolates CLI routing credentials', () => {
  assert.equal(normalizeBaseUrl('http://localhost:20128/'), 'http://localhost:20128/v1');
  assert.equal(normalizeBaseUrl('https://gateway.example/prefix/v1/'), 'https://gateway.example/prefix/v1');
  assert.throws(() => normalizeBaseUrl('http://public.example/v1'), /HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://key:secret@gateway.example/v1'), /credentials/);
  assert.throws(() => normalizeBaseUrl('file:///tmp/gateway'), /HTTP/);
  const route = { provider: 'omniroute', baseUrl: 'http://localhost:20128/v1', model: 'test/model' };
  const args = commandArgs('codex', 'review', route);
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('test/model'));
  assert.ok(args.includes('model_providers.ultharness_omniroute.requires_openai_auth=false'));
  const env = routingEnvironment('claude', route, 'fixture-secret', { ANTHROPIC_API_KEY: 'old-secret', CLAUDE_CODE_USE_BEDROCK: '1' });
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://localhost:20128');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'fixture-secret');
  assert.equal(env.ANTHROPIC_API_KEY, '');
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, '0');
  assert.equal(env.ANTHROPIC_MODEL, 'test/model');
  assert.equal(routingEnvironment('codex', route, '', {}).ULTHARNESS_OMNIROUTE_KEY, 'local');
  assert.equal(routingEnvironment('claude', { provider: 'direct' }, '', { SENTINEL: 'unchanged' }).SENTINEL, 'unchanged');
});

test('OmniRoute discovers real catalog responses without persisting or returning the gateway key', async t => {
  const { request, directory } = await fixture(t);
  let requests = 0;
  const gateway = http.createServer((req, res) => {
    requests++;
    assert.equal(req.url, '/v1/models');
    if (req.headers.authorization !== 'Bearer fixture-router-secret') { res.writeHead(401); return res.end('{}'); }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'test/model-b' }, { id: 'test/model-a' }, { id: 'test/model-a' }] }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => gateway.close(resolve)));
  const baseUrl = `http://127.0.0.1:${gateway.address().port}/v1`;
  assert.equal((await request('routing', { baseUrl })).status, 200);
  assert.equal((await request('routing/test', {})).status, 502);
  const saved = await request('routing', { apiKey: 'fixture-router-secret', defaultModel: 'test/model-a' });
  assert.equal(saved.body.keyConfigured, true);
  const checked = await request('routing/test', {});
  assert.equal(checked.status, 200);
  assert.deepEqual(checked.body.models, ['test/model-a', 'test/model-b']);
  assert.equal(checked.body.status, 'connected');
  const state = (await request('state')).body;
  assert.ok(!JSON.stringify(state).includes('fixture-router-secret'));
  const db = new DatabaseSync(path.join(directory, 'data', 'workspace.sqlite'));
  assert.ok(!db.prepare('SELECT body FROM state WHERE id=1').get().body.includes('fixture-router-secret'));
  db.close();
  assert.equal(requests, 2);
  assert.equal((await request('routing', { baseUrl: 'https://different.example/v1' })).body.keyConfigured, false);
  assert.equal((await request('routing', { baseUrl: 'http://remote.example/v1' })).status, 400);
});

test('routed task approval pins its endpoint and injects only per-process CLI configuration', async t => {
  const { request, directory } = await fixture(t);
  const bin = path.join(directory, 'bin'); mkdirSync(bin);
  const fake = path.join(bin, 'codex');
  writeFileSync(fake, `#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({args:process.argv.slice(2),key:process.env.ULTHARNESS_OMNIROUTE_KEY})}}));});`);
  chmodSync(fake, 0o755);
  const previous = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${previous}`;
  t.after(() => process.env.PATH = previous);
  await request('routing', { baseUrl: 'http://127.0.0.1:20128/v1', defaultModel: 'fixture/model', apiKey: 'fixture-sensitive-token' });
  const created = (await request('tasks', task({ agentId: 'agent_codex', route: 'omniroute', runNow: true }))).body;
  assert.equal(created.status, 'approval');
  assert.equal(created.routeSnapshot.baseUrl, 'http://127.0.0.1:20128/v1');
  await request('routing', { baseUrl: 'http://127.0.0.1:20129/v1' });
  await request(`tasks/${created.id}/approve`, {});
  const state = await until(request, s => s.tasks[0].status === 'done');
  const output = JSON.parse(state.artifacts[0].content.trim());
  assert.equal(output.key, '[gateway key redacted]');
  assert.ok(output.args.includes('model_providers.ultharness_omniroute.base_url="http://127.0.0.1:20128/v1"'));
  assert.ok(output.args.includes('fixture/model'));
  assert.ok(!JSON.stringify(state).includes('fixture-sensitive-token'));
  assert.ok(!output.args.some(arg => arg.includes('fixture-sensitive-token')));
});

test('OmniRoute routines retain their model and every run still requires approval', async t => {
  const { request, directory } = await fixture(t);
  const bin = path.join(directory, 'bin'); mkdirSync(bin);
  const fake = path.join(bin, 'codex'); writeFileSync(fake, `#!${process.execPath}\n`); chmodSync(fake, 0o755);
  const previous = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${previous}`;
  t.after(() => process.env.PATH = previous);
  const invalid = await request('tasks', task({ agentId: 'agent_codex', route: 'omniroute', model: '' }));
  assert.equal(invalid.status, 400);
  const r = (await request('routines', { title: 'Routed review', agentId: 'agent_codex', projectId: 'project_home', route: 'omniroute', model: 'fixture/review', intervalMinutes: 60 })).body;
  const run = await request(`routines/${r.id}/run`, {});
  assert.equal(run.body.status, 'approval');
  assert.equal(run.body.routing.model, 'fixture/review');
  assert.equal(run.body.routeSnapshot.model, 'fixture/review');
  assert.equal((await request(`routines/${r.id}/run`, {})).status, 409);
  const local = (await request('tasks', task({ route: 'omniroute' }))).body;
  assert.equal(local.routing.provider, 'direct');
});

function installFixtureRunner(t, directory, script, kind = 'codex') {
  const bin = path.join(directory, `bin-${kind}`); mkdirSync(bin);
  const executable = path.join(bin, kind);
  writeFileSync(executable, `#!${process.execPath}\n${script}`); chmodSync(executable, 0o755);
  const previous = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${previous}`;
  t.after(() => process.env.PATH = previous);
}

test('ready tasks honor changed priority and preserve submission order within a priority', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, `import {existsSync} from 'node:fs';let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const title=input.match(/Task: (.*)/)[1];const timer=setInterval(()=>{if(existsSync(${JSON.stringify(directory)}+'/'+title)){clearInterval(timer);console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:title}}));}},10);});`);
  const submit = async (title, priority) => {
    const created = (await request('tasks', task({ title, priority, agentId: 'agent_codex', runNow: true }))).body;
    assert.equal((await request(`tasks/${created.id}/approve`, {})).status, 200);
    return created;
  };
  const gate = await submit('gate', 'normal');
  const low = await submit('low', 'low');
  const promoted = await submit('promoted', 'normal');
  const high = await submit('high', 'high');
  const later = await submit('later', 'high');
  assert.equal((await request(`tasks/${promoted.id}/priority`, { priority: 'high' })).status, 200);
  assert.equal((await request(`tasks/${low.id}/priority`, { priority: 'urgent' })).status, 400);
  let state = (await request('state')).body;
  assert.match(state.tasks.find(t => t.id === high.id).waitReason, /another task/);
  writeFileSync(path.join(directory, 'gate'), 'release');
  for (const current of [promoted, high, later, low]) {
    state = await until(request, s => s.tasks.find(t => t.id === current.id).status === 'running');
    const othersRunning = state.tasks.filter(t => t.status === 'running');
    assert.equal(othersRunning.length, 1);
    writeFileSync(path.join(directory, current.title), 'release');
    await until(request, s => s.tasks.find(t => t.id === current.id).status === 'done');
  }
  assert.equal((await request(`tasks/${gate.id}/priority`, { priority: 'high' })).status, 409);
});

test('workflows hand off real reports, pause ready steps, and approve each AI run', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, `let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:input.includes('Parent task report:\\n# Workspace inspection')?'Inspection received':'Missing context'}})));`);
  const created = await request('workflows', { title: 'Inspect, review, check', projectId: 'project_home', steps: [
    { title: 'Inspect', agentId: 'agent_scout' }, { title: 'Review', agentId: 'agent_codex' }, { title: 'Health', agentId: 'agent_pulse' }
  ] });
  assert.equal(created.status, 201);
  const w = created.body;
  let state = await until(request, s => s.tasks.find(t => t.id === w.taskIds[1]).status === 'approval');
  assert.equal(state.workflows[0].completedSteps, 1);
  assert.equal(state.tasks.find(t => t.id === w.taskIds[1]).runs, 0);
  assert.equal(state.tasks.find(t => t.id === w.taskIds[2]).status, 'queued');
  await request(`workflows/${w.id}/toggle`, {});
  await request(`tasks/${w.taskIds[1]}/approve`, {});
  state = (await request('state')).body;
  assert.equal(state.tasks.find(t => t.id === w.taskIds[1]).status, 'ready');
  assert.equal(state.workflows[0].status, 'paused');
  await request(`workflows/${w.id}/toggle`, {});
  state = await until(request, s => s.workflows[0].status === 'done');
  assert.equal(state.workflows[0].completedSteps, 3);
  assert.match(state.artifacts.find(a => a.taskId === w.taskIds[1]).content, /Inspection received/);
  assert.match(state.artifacts.find(a => a.taskId === w.taskIds[2]).content, /Local system health/);
});

test('invalid workflow recipes are atomic and draft workflows wait until resumed', async t => {
  const { request } = await fixture(t);
  const invalid = await request('workflows', { title: 'Invalid', projectId: 'project_home', steps: [
    { title: 'Valid', agentId: 'agent_scout' }, { title: 'Invalid', agentId: 'no-such-agent' }
  ] });
  assert.equal(invalid.status, 404);
  let state = (await request('state')).body;
  assert.equal(state.tasks.length, 0); assert.equal(state.counter, 0); assert.equal(state.workflows.length, 0);
  const w = (await request('workflows', { title: 'Local workflow', projectId: 'project_home', startNow: false, steps: [
    { title: 'Health', agentId: 'agent_pulse' }, { title: 'Inspect', agentId: 'agent_scout' }
  ] })).body;
  state = (await request('state')).body;
  assert.ok(state.tasks.every(t => t.status === 'queued'));
  assert.equal(state.workflows[0].status, 'paused');
  await request(`workflows/${w.id}/toggle`, {});
  state = await until(request, s => s.workflows[0].status === 'done');
  assert.equal(state.artifacts.length, 2);
});

test('failed workflow steps hold successors and a successful approved retry continues the workflow', async t => {
  const { request, directory } = await fixture(t);
  const retryFlag = path.join(directory, 'retry');
  installFixtureRunner(t, directory, `import {existsSync} from 'node:fs';process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify(existsSync(${JSON.stringify(retryFlag)})?{type:'item.completed',item:{type:'agent_message',text:'Recovered'}}:{type:'turn.failed',error:{message:'Fixture outage'}})));`);
  const w = (await request('workflows', { title: 'Recoverable', projectId: 'project_home', steps: [
    { title: 'AI first', agentId: 'agent_codex' }, { title: 'Local successor', agentId: 'agent_scout' }
  ] })).body;
  await request(`tasks/${w.taskIds[0]}/approve`, {});
  let state = await until(request, s => s.workflows[0].status === 'blocked');
  assert.equal(state.tasks.find(t => t.id === w.taskIds[1]).status, 'queued');
  writeFileSync(retryFlag, 'retry');
  await request(`tasks/${w.taskIds[0]}/run`, {});
  state = (await request('state')).body;
  assert.equal(state.tasks.find(t => t.id === w.taskIds[0]).status, 'approval');
  await request(`tasks/${w.taskIds[0]}/approve`, {});
  state = await until(request, s => s.workflows[0].status === 'done');
  assert.equal(state.tasks.find(t => t.id === w.taskIds[0]).runs, 2);
});

test('editing routines preserves history and pending approvals while applying new settings to future runs', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, 'process.stdin.resume();');
  const routine = (await request('routines', { title: 'Daily review', description: 'Old instructions', projectId: 'project_home', agentId: 'agent_codex', route: 'omniroute', model: 'fixture/old', intervalMinutes: 1440 })).body;
  const pending = (await request(`routines/${routine.id}/run`, {})).body;
  const updated = await request(`routines/${routine.id}/update`, { title: 'Every 90 minutes', description: 'New instructions', model: 'fixture/new', intervalMinutes: 90, mode: 'edit' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.routing.model, 'fixture/new');
  assert.ok(Math.abs(Date.parse(updated.body.nextRunAt) - Date.now() - 90 * 60000) < 5000);
  assert.equal((await request(`routines/${routine.id}/update`, { intervalMinutes: 0 })).status, 400);
  let state = (await request('state')).body;
  assert.equal(state.tasks.find(t => t.id === pending.id).description, 'Old instructions');
  assert.equal(state.tasks.find(t => t.id === pending.id).routeSnapshot.model, 'fixture/old');
  assert.equal((await request(`routines/${routine.id}/run`, {})).status, 409);
  await request(`tasks/${pending.id}/reject`, {});
  const next = (await request(`routines/${routine.id}/run`, {})).body;
  assert.equal(next.routeSnapshot.model, 'fixture/new'); assert.equal(next.mode, 'edit');
  assert.equal(next.description, 'New instructions'); assert.equal(next.status, 'approval');
});

test('reconnecting projects keeps task history and invalidates approvals for the old folder', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, 'process.stdin.resume();');
  const pending = (await request('tasks', task({ agentId: 'agent_codex', runNow: true }))).body;
  const moved = path.join(directory, 'moved'); mkdirSync(moved);
  writeFileSync(path.join(moved, 'moved.txt'), 'Moved project');
  assert.equal((await request('projects/project_home/update', { path: '/no/such/folder' })).status, 400);
  const updated = await request('projects/project_home/update', { name: 'Moved workspace', path: moved });
  assert.equal(updated.status, 200);
  let state = (await request('state')).body;
  assert.equal(state.projects[0].available, true); assert.equal(state.projects[0].path, moved);
  assert.equal(state.tasks.find(t => t.id === pending.id).status, 'queued');
  assert.equal(state.tasks.find(t => t.id === pending.id).approval, null);
  assert.equal((await request(`tasks/${pending.id}/approve`, {})).status, 409);
  const inspection = (await request('tasks', task({ runNow: true }))).body;
  state = await until(request, s => s.tasks.find(t => t.id === inspection.id).status === 'done');
  assert.match(state.artifacts.find(a => a.taskId === inspection.id).content, /moved\.txt/);
});

test('gateway startup excludes the project client credentials and dotenv directory', async t => {
  const { directory, root } = await fixture(t);
  const bin = path.join(directory, 'gateway-bin'); mkdirSync(bin);
  const binary = path.join(bin, 'omniroute');
  writeFileSync(binary, `#!${process.execPath}\nconsole.log(JSON.stringify({cwd:process.cwd(),keyPresent:'OMNIROUTE_API_KEY' in process.env,basePresent:'OMNIROUTE_BASE_URL' in process.env,host:process.env.OMNIROUTE_SERVER_HOST,args:process.argv.slice(2)}));`);
  chmodSync(binary, 0o755);
  const output = execFileSync(process.execPath, [new URL('../scripts/start-omniroute.mjs', import.meta.url).pathname], {
    cwd: root, encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OMNIROUTE_API_KEY: 'fixture-client-key', OMNIROUTE_BASE_URL: 'http://127.0.0.1:20128/v1' }
  });
  const result = JSON.parse(output.trim());
  assert.equal(result.cwd, os.homedir()); assert.equal(result.keyPresent, false); assert.equal(result.basePresent, false);
  assert.equal(result.host, '127.0.0.1'); assert.deepEqual(result.args, ['serve', '--no-open', '--no-tray']);
});

test('every AI workflow step requests a separate approval', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Step report'}})));`);
  const w = (await request('workflows', { title: 'Two approvals', projectId: 'project_home', steps: [
    { title: 'First review', agentId: 'agent_codex' }, { title: 'Second review', agentId: 'agent_codex' }
  ] })).body;
  assert.equal((await request(`tasks/${w.taskIds[1]}/approve`, {})).status, 409);
  await request(`tasks/${w.taskIds[0]}/approve`, {});
  const state = await until(request, s => s.tasks.find(t => t.id === w.taskIds[1]).status === 'approval');
  assert.equal(state.tasks.find(t => t.id === w.taskIds[1]).runs, 0);
  assert.equal(state.tasks.find(t => t.id === w.taskIds[1]).approval.decision, null);
  assert.equal(state.workflows[0].completedSteps, 1);
});

test('required tool activity rejects invented reports and lets actual structured tool events advance a workflow', async t => {
  const { request, directory } = await fixture(t);
  const evidence = path.join(directory, 'use-tools');
  installFixtureRunner(t, directory, `import {existsSync} from 'node:fs';process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:'Metadata warning is not tool activity'}}));if(existsSync(${JSON.stringify(evidence)}))console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'cat hello.js',aggregated_output:'export const hello = true;',exit_code:0}}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'I inspected hello.js'}}));});`);
  const w = (await request('workflows', { title: 'Evidence required', projectId: 'project_home', steps: [
    { title: 'Inspect code', agentId: 'agent_codex', requireTools: true }, { title: 'Successor', agentId: 'agent_scout' }
  ] })).body;
  assert.equal((await request(`tasks/${w.taskIds[0]}/requirements`, { requireTools: false })).status, 409);
  await request(`tasks/${w.taskIds[0]}/approve`, {});
  let state = await until(request, s => s.workflows[0].status === 'blocked');
  let first = state.tasks.find(t => t.id === w.taskIds[0]);
  assert.match(first.error, /without recorded tool activity/); assert.equal(first.toolActivityCount, 0);
  assert.equal(state.tasks.find(t => t.id === w.taskIds[1]).status, 'queued');
  assert.match(state.artifacts.find(a => a.taskId === first.id).content, /I inspected/);
  writeFileSync(evidence, 'emit a tool event');
  await request(`tasks/${first.id}/run`, {}); await request(`tasks/${first.id}/approve`, {});
  state = await until(request, s => s.workflows[0].status === 'done');
  first = state.tasks.find(t => t.id === first.id);
  assert.equal(first.toolActivityCount, 1); assert.equal(first.requireTools, true);
  assert.equal((await request(`tasks/${first.id}/requirements`, { requireTools: 'yes' })).status, 400);
  assert.equal((await request(`tasks/${first.id}/requirements`, { requireTools: false })).body.requireTools, false);
});

test('Claude structured tool calls satisfy the tool activity requirement', async t => {
  const { request, directory } = await fixture(t);
  installFixtureRunner(t, directory, `process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',name:'Read',input:{file_path:'hello.js'}}]}}));console.log(JSON.stringify({type:'result',result:'Read hello.js',is_error:false}));});`, 'claude');
  const created = (await request('tasks', task({ agentId: 'agent_claude', requireTools: true, runNow: true }))).body;
  await request(`tasks/${created.id}/approve`, {});
  const state = await until(request, s => s.tasks[0].status === 'done');
  assert.equal(state.tasks[0].toolActivityCount, 1);
});
