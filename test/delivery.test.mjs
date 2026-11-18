import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp, commandArgs } from '../server.mjs';
import { connectionSettings, parseReview } from '../delivery.mjs';

async function setup(t, { alwaysReject = false, malformed = false, noTools = false, checkFailure = false, slow = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'uh-delivery-test-'));
  const root = path.join(directory, 'project'), bin = path.join(directory, 'bin'); mkdirSync(root); mkdirSync(bin);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { check: slow ? `node -e "console.log('CHECK_STARTED');process.on('SIGTERM',()=>setTimeout(()=>process.exit(1),200));setInterval(()=>{},1000)"` : checkFailure ? `node -e "if(!require('fs').readFileSync('index.html','utf8').includes('Contact'))process.exit(1)"` : `node -e "require('fs').accessSync('index.html');console.log('CHECK_OK')"` } }));
  const runner = path.join(bin, 'codex');
  writeFileSync(runner, `#!${process.execPath}\nimport fs from 'node:fs';\nlet input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{\nconst reviewing=input.includes('Task: Review:');\nfs.appendFileSync('prompts.jsonl',JSON.stringify({reviewing,input,args:process.argv.slice(2)})+'\\n');\nif(!reviewing){let n=0;try{n=Number(fs.readFileSync('build-count','utf8'))}catch{};n++;fs.writeFileSync('build-count',String(n));fs.writeFileSync('index.html','<h1>Home</h1>'+(n>1?'<p>Contact</p>':''));}\nconst html=fs.readFileSync('index.html','utf8');\n${noTools ? '' : "console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'fixture: inspect index.html',aggregated_output:html}}));"}\nconst verdict=${alwaysReject}||!html.includes('Contact')?'reject':'pass';\nconst report=reviewing?(${malformed}?'I think it is fine.':JSON.stringify({verdict,summary:verdict==='pass'?'Read index.html and checked Contact':'Contact is missing',criteria:[{id:'AC-1',status:'pass',evidence:'index.html contains Home'},{id:'AC-2',status:verdict==='pass'?'pass':'fail',evidence:verdict==='pass'?'index.html contains Contact':'Contact not found in index.html'}]})):'Implemented the project; inspect files and run the actual checks.';\nsetTimeout(()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:report}}));},40);\n});\n`);
  chmodSync(runner, 0o755);
  const oldPath = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
  let app = createApp({ dataDir: path.join(directory, 'data'), root, tickMs: 100000 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  let url = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (endpoint, body) => { const response = await fetch(`${url}/api/${endpoint}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  t.after(async () => { await app.close(); process.env.PATH = oldPath; rmSync(directory, { recursive: true, force: true }); });
  const brief = overrides => ({ title: 'Client website', client: 'Synthetic test client', brief: 'Build Home and Contact with accurate working navigation.', criteria: ['Home exists', 'Contact exists'], projectId: 'project_home', builderId: 'agent_codex', reviewerId: 'agent_codex', checks: [{ kind: 'file', file: 'index.html' }, { kind: 'npm', script: 'check' }], maxRepairs: 1, ...overrides });
  const create = async overrides => { const result = await request('deliveries', brief(overrides)); assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body; };
  const until = async predicate => { for (let i = 0; i < 250; i++) { const s = (await request('state')).body; if (predicate(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Delivery condition did not become true: '+JSON.stringify((await request('state')).body.deliveries)); };
  return { request, create, until, root, directory, get url() { return url; }, restart: async () => { await app.close(); app = createApp({ dataDir: path.join(directory, 'data'), root, tickMs: 100000 }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${app.server.address().port}`; } };
}

test('client delivery repairs a rejected review, reruns real checks, and requires owner acceptance', async t => {
  const f = await setup(t);
  const draft = await f.create(); assert.equal(draft.status, 'draft'); assert.equal((await f.request('state')).body.tasks.length, 0);
  assert.equal((await f.request(`deliveries/${draft.id}/accept`, {})).status, 409);
  assert.equal((await f.request(`deliveries/${draft.id}/approve`, {})).status, 200);
  const state = await f.until(s => s.deliveries[0].status === 'awaiting_acceptance');
  const d = state.deliveries[0]; assert.equal(d.repairs, 1); assert.equal(d.attempts.length, 2); assert.equal(d.attempts[0].verdict, 'reject'); assert.equal(d.attempts[1].verdict, 'pass');
  assert.equal(d.taskIds.length, 6); assert.equal(d.approval.agentRuns, 4); assert.ok(state.tasks.every(t => t.status === 'done'));
  assert.equal(state.tasks.filter(t => t.deliveryPhase === 'checking').length, 2);
  assert.ok(state.tasks.filter(t => t.deliveryPhase === 'checking').every(t => t.checkResults.every(r => r.passed)));
  const prompts = readFileSync(path.join(f.root, 'prompts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(prompts.length, 4); assert.ok(prompts.every(p => p.input.includes('AC-2: Contact exists')));
  assert.ok(prompts.filter(p => p.reviewing).every(p => p.args.includes('read-only')));
  assert.match(prompts[2].input, /Contact is missing/);
  assert.equal((await f.request(`tasks/${d.currentTaskId}/run`, {})).status, 409, 'managed tasks cannot bypass delivery controls');
  const report = await fetch(`${f.url}/api/deliveries/${d.id}/report`); assert.equal(report.status, 200); const content = await report.text(); assert.match(content, /CHECK_OK/); assert.match(content, /reject/); assert.match(content, /pass/);
  const unrelated = (await f.request('tasks', { title: 'Unrelated edit', description: 'Wait until delivery is accepted.', agentId: 'agent_codex', projectId: 'project_home', mode: 'edit', runNow: true })).body;
  await f.request(`tasks/${unrelated.id}/approve`, {});
  const held = (await f.request('state')).body.tasks.find(t => t.id === unrelated.id); assert.equal(held.runs, 0); assert.match(held.waitReason, /reserved this project/);
  assert.equal((await f.request(`deliveries/${d.id}/accept`, {})).body.status, 'accepted');
  await f.until(s => s.tasks.find(t => t.id === unrelated.id).status === 'done');
  await f.restart(); assert.equal((await f.request('state')).body.deliveries[0].status, 'accepted');
});

test('failed deterministic check is repaired before a reviewer can approve', async t => {
  const f = await setup(t, { checkFailure: true }); const d = await f.create(); await f.request(`deliveries/${d.id}/approve`, {});
  const s = await f.until(s => s.deliveries[0].status === 'awaiting_acceptance');
  assert.equal(s.deliveries[0].attempts.length, 1); assert.equal(s.deliveries[0].repairs, 1);
  const checks = s.tasks.filter(t => t.deliveryPhase === 'checking'); assert.equal(checks.length, 2); assert.equal(checks.find(t => t.status === 'failed').checkResults[1].exitCode, 1);
  assert.match(readFileSync(path.join(f.root, 'prompts.jsonl'), 'utf8'), /Recorded verification/);
});

test('repair exhaustion and malformed verdicts cannot become accepted deliveries', async t => {
  const f = await setup(t, { alwaysReject: true }); const d = await f.create({ maxRepairs: 0 }); await f.request(`deliveries/${d.id}/approve`, {});
  const s = await f.until(s => s.deliveries[0].status === 'blocked'); assert.equal(s.deliveries[0].repairLimitReached, true); assert.equal(s.deliveries[0].attempts[0].verdict, 'reject');
  assert.equal((await f.request(`deliveries/${d.id}/approve`, {})).status, 409); assert.equal((await f.request(`deliveries/${d.id}/accept`, {})).status, 409);
  assert.throws(() => parseReview('Looks fine', [{ id: 'AC-1' }]), /valid JSON/);
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'pass', criteria: [{ id: 'AC-1', status: 'fail', evidence: 'missing' }] }), [{ id: 'AC-1' }]), /cannot contain failed/);
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'pass', criteria: [{ id: 'AC-2', status: 'pass', evidence: 'made up' }] }), [{ id: 'AC-1' }]), /unique ID/);
});

test('a model report without tool use blocks the delivery before checks or review', async t => {
  const f = await setup(t, { noTools: true }); const d = await f.create(); await f.request(`deliveries/${d.id}/approve`, {});
  const s = await f.until(s => s.deliveries[0].status === 'blocked'); assert.equal(s.tasks.length, 1); assert.equal(s.tasks[0].status, 'failed'); assert.match(s.deliveries[0].error, /without recorded tool/);
});

test('stopping a verification process holds locks until exit and restart requires approval', async t => {
  const f = await setup(t, { slow: true }); const d = await f.create(); await f.request(`deliveries/${d.id}/approve`, {});
  await f.until(s => s.tasks.some(t => t.deliveryPhase === 'checking' && t.logs.some(l => l.text.trim() === 'CHECK_STARTED')));
  assert.equal((await f.request('projects/project_home/update', { path: f.directory })).status, 409);
  assert.equal((await f.request(`deliveries/${d.id}/pause`, {})).body.status, 'paused');
  assert.equal((await f.request(`deliveries/${d.id}/approve`, {})).status, 409);
  await f.until(s => s.tasks.every(t => !t.stopping));
  assert.equal((await f.request('state')).body.deliveries[0].status, 'paused');
});

test('connections are validated, snapshotted, and passed as process-local MCP config', async t => {
  const f = await setup(t);
  const c = (await f.request('connections', { name: 'Design', kind: 'reference', category: 'figma', url: 'https://figma.com/design/example', notes: 'Reference only' })).body;
  assert.equal((await f.request('connections', { name: 'Secret URL', url: 'https://user:password@example.com' })).status, 400);
  assert.equal((await f.request('connections', { name: 'Token query', url: 'https://example.com?token=secret' })).status, 400);
  assert.equal((await f.request('connections', { name: 'Outside file', file: '../private.md' })).status, 400);
  const d = await f.create({ connectionIds: [c.id] }); await f.request(`connections/${c.id}/delete`, {});
  assert.equal((await f.request('state')).body.deliveries[0].connections[0].name, 'Design');
  assert.equal(connectionSettings({ name: 'Frame', url: 'https://figma.com/design/example?node-id=1-2#frame' }).url, 'https://figma.com/design/example?node-id=1-2#frame');
  const mcp = { ...connectionSettings({ name: 'Fixture MCP', kind: 'mcp', transport: 'stdio', command: '/installed/mcp', args: ['--readonly'], tools: ['read_document'] }), id: 'fixture' };
  const codex = commandArgs('codex', 'edit', null, [mcp]); assert.ok(codex.includes('mcp_servers.uh_fixture.command="/installed/mcp"')); assert.ok(codex.includes('mcp_servers.uh_fixture.enabled_tools=["read_document"]'));
  const claude = commandArgs('claude', 'edit', null, [mcp]); assert.ok(claude.includes('--strict-mcp-config')); assert.match(claude[claude.indexOf('--allowedTools')+1], /Read,Glob,Grep,Edit,Write,mcp__uh_fixture__read_document/);
  assert.equal(JSON.parse(claude[claude.indexOf('--mcp-config')+1]).mcpServers.uh_fixture.command, '/installed/mcp');
  assert.equal((await f.request('deliveries', { title: 'Invalid' })).status, 400); assert.equal((await f.request('state')).body.deliveries.length, 1);
  assert.equal((await f.request('tasks', { title: 'Bypass', projectId: 'project_home', agentId: 'agent_verify', deliveryCheck: true })).status, 400);
  assert.equal(d.connections.length, 1);
});

test('delivery route stays pinned while global gateway changes, and restart blocks active work', async t => {
  const f = await setup(t);
  await f.request('routing', { baseUrl: 'http://127.0.0.1:20128/v1' });
  const d = await f.create({ route: 'omniroute', model: 'fixture/model' }); await f.request(`deliveries/${d.id}/approve`, {});
  await f.request('routing', { baseUrl: 'http://127.0.0.1:20129/v1' });
  const s = await f.until(s => s.deliveries[0].status === 'awaiting_acceptance');
  assert.ok(s.tasks.filter(t => t.deliveryPhase !== 'checking').every(t => t.routeSnapshot.baseUrl === 'http://127.0.0.1:20128/v1'));
  await f.request(`deliveries/${d.id}/reject`, { feedback: 'Use a warmer palette.' });
  const feedback = (await f.request('state')).body.deliveries[0]; assert.equal(feedback.status, 'blocked'); assert.equal(feedback.approval, null); assert.match(feedback.feedback, /warmer palette/);
  await f.request(`deliveries/${d.id}/approve`, {}); await f.restart();
  assert.equal((await f.request('state')).body.deliveries[0].status, 'blocked');
});

test('file checks reject symlinks outside the project', async t => {
  const f = await setup(t); writeFileSync(path.join(f.directory, 'outside.txt'), 'private'); symlinkSync(path.join(f.directory, 'outside.txt'), path.join(f.root, 'escaped.txt'));
  const d = await f.create({ checks: [{ kind: 'file', file: 'escaped.txt' }], maxRepairs: 0 }); await f.request(`deliveries/${d.id}/approve`, {});
  const s = await f.until(s => s.deliveries[0].status === 'blocked'); assert.match(s.artifacts.find(a => /symlink/.test(a.content)).content, /outside the project/);
});
