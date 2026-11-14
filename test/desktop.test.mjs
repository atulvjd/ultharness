import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const entry = new URL('../desktop/server-entry.mjs', import.meta.url).pathname;
test('desktop engine uses its own data directory, serves real checks, and shuts down cleanly', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ultharness-desktop-test-'));
  const project = path.join(directory, 'project'); mkdirSync(project);
  writeFileSync(path.join(project, 'fixture.txt'), 'Desktop fixture');
  const child = spawn(process.execPath, [entry], { env: { ...process.env, ULTHARNESS_DATA: path.join(directory, 'data'), ULTHARNESS_ROOT: project }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
  t.after(async () => { if (child.exitCode == null && !child.killed) { child.kill('SIGTERM'); await once(child, 'close'); } rmSync(directory, { recursive: true, force: true }); });
  const ready = await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('Desktop readiness timed out: ' + stderr)), 5000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Desktop exited ${code}: ${stderr}`)); });
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (!buffer.includes('\n')) return;
      try { const message = JSON.parse(buffer.split('\n')[0]); assert.equal(message.event, 'ultharness-ready'); clearTimeout(timeout); resolve(message); }
      catch (error) { clearTimeout(timeout); reject(error); }
    });
  });
  const base = `http://127.0.0.1:${ready.port}`;
  const state = async () => (await fetch(base + '/api/state')).json();
  assert.equal((await state()).projects[0].path, project);
  assert.equal((await fetch(base)).status, 200);
  const created = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Desktop inspection', agentId: 'agent_scout', projectId: 'project_home', runNow: true }) });
  assert.equal(created.status, 201);
  let current;
  for (let i = 0; i < 70; i++) { current = await state(); if (current.tasks[0].status === 'done') break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.equal(current.tasks[0].status, 'done'); assert.match(current.artifacts[0].content, /fixture\.txt/);
  const report = await fetch(base + '/api/artifacts/' + current.artifacts[0].id);
  assert.match(report.headers.get('content-disposition'), /attachment/);
  const closed = once(child, 'close'); child.kill('SIGTERM');
  assert.equal((await closed)[0], 0);
  await assert.rejects(fetch(base + '/api/state'));
  const db = new DatabaseSync(path.join(directory, 'data/workspace.sqlite'), { readOnly: true });
  assert.equal(JSON.parse(db.prepare('SELECT body FROM state WHERE id=1').get().body).tasks[0].status, 'done'); db.close();
});

test('desktop engine requires external data and project paths rather than writing into its bundle', () => {
  const env = { ...process.env }; delete env.ULTHARNESS_DATA; delete env.ULTHARNESS_ROOT;
  const result = spawnSync(process.execPath, [entry], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /desktop launcher must supply/);
});
