import http from 'node:http';
import { createPreview } from './preview.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync, statSync, readdirSync, statfsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createDeliveryManager, connectionSettings, connectionArgs, runDeliveryChecks } from './delivery.mjs';
import { normalizeBaseUrl, modelId, discoverModels, routingEnvironment } from './routing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const stamp = () => new Date().toISOString();
const id = prefix => `${prefix}_${randomUUID().slice(0, 8)}`;
const clean = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const native = kind => ['workspace', 'health', 'verification'].includes(kind);
const projectExclusive = kind => !['workspace', 'health'].includes(kind);
const terminal = status => ['done', 'failed', 'cancelled'].includes(status);
const bytes = n => `${(Number(n) / 1024 ** 3).toFixed(1)} GB`;

export function createApp({ dataDir = process.env.ULTHARNESS_DATA || path.join(HERE, '.ultharness'), root = process.env.ULTHARNESS_ROOT || HERE, tickMs = 15000 } = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'workspace.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  const saved = db.prepare('SELECT body FROM state WHERE id=1').get();
  const state = saved ? JSON.parse(saved.body) : {
    projects: [{ id: 'project_home', name: 'My workspace', path: path.resolve(root), description: 'Your first local project', createdAt: stamp() }],
    agents: [
      { id: 'agent_scout', name: 'Scout', role: 'Workspace inspector', kind: 'workspace', description: 'Maps project structure and reports repository status. Local, deterministic, read-only.', color: 'lime', enabled: true },
      { id: 'agent_pulse', name: 'Pulse', role: 'System health', kind: 'health', description: 'Checks local disk space, memory and system load. Local, deterministic, read-only.', color: 'blue', enabled: true },
      { id: 'agent_codex', name: 'Codex', role: 'Coding agent', kind: 'codex', description: 'Uses your installed Codex CLI and its existing sign-in. Every run requires approval.', color: 'purple', enabled: true },
      { id: 'agent_claude', name: 'Claude', role: 'Coding & analysis', kind: 'claude', description: 'Uses your installed Claude Code CLI and its existing sign-in. Every run requires approval.', color: 'orange', enabled: true }
    ],
    tasks: [], routines: [], artifacts: [], events: [], counter: 0
  };
  state.routing ??= { baseUrl: normalizeBaseUrl(process.env.OMNIROUTE_BASE_URL || 'http://127.0.0.1:20128/v1'), defaultModel: '', models: [], checkedAt: null, status: 'unchecked', error: null };
  state.routing.provider ??= new URL(state.routing.baseUrl).hostname === 'openrouter.ai' ? 'openrouter' : 'omniroute';
  state.workflows ??= [];
  state.connections ??= []; state.deliveries ??= [];
  if (!state.agents.some(a => a.id === 'agent_verify')) state.agents.push({ id: 'agent_verify', name: 'Verifier', role: 'Recorded delivery checks', kind: 'verification', description: 'Runs approved delivery file assertions and npm scripts, records output and exit codes. Scripts execute with this app’s user permissions.', color: 'blue', enabled: true, internal: true });
  // Credentials stay in server memory and are associated with a specific endpoint.
  const routingKeys = new Map();
  const openClawKeys = new Map();
  if (process.env.OMNIROUTE_API_KEY) routingKeys.set(normalizeBaseUrl(process.env.OMNIROUTE_BASE_URL || (state.routing.provider === 'omniroute' ? state.routing.baseUrl : 'http://127.0.0.1:20128/v1')), process.env.OMNIROUTE_API_KEY);
  if (process.env.OPENROUTER_API_KEY) routingKeys.set('https://openrouter.ai/api/v1', process.env.OPENROUTER_API_KEY);
  const redactions = new Set([...routingKeys.values(), process.env.OPENCLAW_GATEWAY_TOKEN, process.env.OPENCLAW_GATEWAY_PASSWORD].filter(Boolean));
  const redact = value => { let text = String(value); for (const key of redactions) if (key) text = text.split(key).join('[gateway key redacted]'); return text; };
  const routingSnapshot = () => ({ ...state.routing, keyConfigured: !!routingKeys.get(state.routing.baseUrl) });
  const active = new Map();
  const previews = new Map();
  const clients = new Set();
  let closing = false;
  const persist = () => db.prepare('INSERT INTO state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(JSON.stringify(state));
  const broadcast = () => {
    for (const res of clients) res.write(`data: ${JSON.stringify({ at: stamp() })}\n\n`);
  };
  function event(message, taskId = null, type = 'info') {
    state.events.unshift({ id: id('event'), message, taskId, type, at: stamp() });
    state.events = state.events.slice(0, 1000);
  }
  const change = () => { persist(); broadcast(); };
  function getTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) throw fail('Task not found', 404);
    return task;
  }
  function getProject(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) throw fail('Project not found', 404);
    return project;
  }
  function getAgent(agentId) {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) throw fail('Agent not found', 404);
    return agent;
  }
  function resolveDirectory(value) {
    const resolved = path.resolve(clean(value, 1000));
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw fail('Choose an existing local directory');
    return resolved;
  }
  function executable(name) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
  function snapshot() {
    return { ...state, projects: state.projects.map(project => ({ ...project, available: existsSync(project.path) && statSync(project.path).isDirectory() })),
      workflows: state.workflows.map(workflow => {
        const steps = workflow.taskIds.map(getTask);
        const status = steps.every(t => t.status === 'done') ? 'done' : steps.some(t => ['failed', 'cancelled'].includes(t.status)) ? 'blocked' : steps.some(t => t.status === 'running') ? 'running' : !workflow.enabled ? 'paused' : workflow.error ? 'blocked' : steps.some(t => t.status === 'approval') ? 'approval' : 'ready';
        return { ...workflow, status, completedSteps: steps.filter(t => t.status === 'done').length };
      }),
      tasks: state.tasks.map(task => ({ ...task, stopping: active.has(task.id) && terminal(task.status), waitReason: waitReason(task) })), routing: routingSnapshot(), agents: state.agents.map(agent => ({ ...agent,
      available: native(agent.kind) || !!executable(agent.kind),
      activeTaskId: [...active.keys()].find(taskId => getTask(taskId).agentId === agent.id) || null
    })), server: { root: path.resolve(root), startedAt, version: '0.14.1', host: os.hostname(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
  }
  function log(task, text, channel = 'info') {
    if (terminal(task.status)) return;
    task.logs.push({ at: stamp(), text: redact(text).slice(0, 20000), channel });
    if (task.logs.length > 500) task.logs.splice(0, task.logs.length - 500);
    task.updatedAt = stamp();
    change();
  }
  function prepareTask(body, internal = false) {
    const title = clean(body.title, 160);
    if (!title) throw fail('Give this task a title');
    getProject(body.projectId);
    const agent = getAgent(body.agentId);
    if (agent.kind === 'verification' && !internal) throw fail('Verifier is managed by client deliveries');
    const routing = internal && body.approvedRoute ? (native(agent.kind) ? { provider: 'direct' } : structuredClone(body.approvedRoute)) : taskRouting(body, agent);
    if (!agent.enabled) throw fail('This agent is paused');
    if (body.parentId) getTask(body.parentId);
    if (body.dependsOnId) getTask(body.dependsOnId);
    if (body.runNow && !native(agent.kind) && !executable(agent.kind)) throw fail(`${agent.kind} is not available on this server's PATH`);
    if (body.runNow && body.dependsOnId && getTask(body.dependsOnId).status !== 'done') throw fail('Complete the dependency before running this task', 409);
    return { id: id('task'), title, description: clean(body.description, 12000),
      projectId: body.projectId, agentId: agent.id, lane: body.lane === 'operations' ? 'operations' : 'coding',
      priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal',
      mode: body.mode === 'edit' ? 'edit' : 'review', status: 'queued', createdAt: stamp(), updatedAt: stamp(),
      requireTools: !native(agent.kind) && body.requireTools === true,
      routing,
      parentId: body.parentId || null, dependsOnId: body.dependsOnId || null, routineId: body.routineId || null,
      logs: [], comments: [], runs: 0, approval: null, error: null };
  }
  function insertTask(task) {
    task.number = ++state.counter;
    state.tasks.unshift(task);
    event(`Task UH-${String(task.number).padStart(3, '0')} created: ${task.title}`, task.id);
  }
  function createTask(body) {
    const task = prepareTask(body);
    insertTask(task);
    change();
    return task;
  }
  function createWorkflow(body) {
    const title = clean(body.title, 160);
    if (!title) throw fail('Give this workflow a title');
    if (!Array.isArray(body.steps) || body.steps.length < 2 || body.steps.length > 8) throw fail('A workflow needs 2–8 steps');
    // Validate every step before inserting anything, so invalid recipes leave no partial tasks.
    const tasks = body.steps.map(step => {
      if (!step || typeof step !== 'object') throw fail('Invalid workflow step');
      return prepareTask({ ...step, projectId: body.projectId, runNow: false, parentId: null, dependsOnId: null, routineId: null });
    });
    const workflow = { id: id('workflow'), title, projectId: body.projectId, createdAt: stamp(), enabled: body.startNow !== false, taskIds: tasks.map(t => t.id), error: null };
    for (const [index, task] of tasks.entries()) {
      task.workflowId = workflow.id;
      task.parentId = task.dependsOnId = tasks[index - 1]?.id || null;
      insertTask(task);
    }
    state.workflows.unshift(workflow);
    event(`Workflow created: ${title}`); change(); pump();
    return workflow;
  }
  function advanceWorkflows() {
    for (const workflow of state.workflows) {
      if (!workflow.enabled || workflow.error) continue;
      const next = workflow.taskIds.map(getTask).find(task => task.status !== 'done');
      if (next?.status !== 'queued') continue;
      try { submitTask(next); }
      catch (err) { workflow.error = err.message; event(`Workflow “${workflow.title}” needs attention: ${err.message}`, next.id, 'warning'); change(); }
    }
  }
  function waitReason(task) {
    if (active.has(task.id) && terminal(task.status)) return 'Waiting for the previous runner to stop';
    if (task.status === 'approval') return 'Review and approve this AI run';
    if (!['ready', 'queued'].includes(task.status)) return null;
    if (task.dependsOnId && getTask(task.dependsOnId).status !== 'done') return `Waiting for UH-${String(getTask(task.dependsOnId).number).padStart(3, '0')} to finish successfully`;
    if (!getAgent(task.agentId).enabled) return 'Agent is paused';
    if (task.workflowId && !state.workflows.find(w => w.id === task.workflowId)?.enabled) return 'Workflow is paused';
    if (state.deliveries.some(d => ['planning', 'building', 'checking', 'reviewing', 'awaiting_acceptance'].includes(d.status) && d.projectId === task.projectId && d.id !== task.deliveryId) && projectExclusive(getAgent(task.agentId).kind)) return 'A client delivery has reserved this project';
    if (task.status === 'queued') return 'Submit this task to start';
    if ([...active.keys()].some(taskId => getTask(taskId).agentId === task.agentId)) return 'Agent is finishing another task';
    if (projectExclusive(getAgent(task.agentId).kind) && [...active.keys()].some(taskId => { const other = getTask(taskId); return other.projectId === task.projectId && projectExclusive(getAgent(other.agentId).kind); })) return 'Another AI task is using this project';
    return active.size >= 2 ? 'Both runner slots are in use' : 'Waiting for the next runner slot';
  }
  function taskRouting(body, agent) {
    if (body.route !== undefined && !['direct', 'omniroute', 'openrouter'].includes(body.route)) throw fail('Unknown model route');
    if (native(agent.kind) || !['omniroute', 'openrouter'].includes(body.route)) return { provider: 'direct' };
    if (body.route !== state.routing.provider) throw fail('Select and configure this provider on Model routing first');
    if (body.route === 'openrouter' && agent.kind !== 'codex') throw fail('The direct OpenRouter route currently requires Codex; route Claude through OmniRoute instead');
    if (body.route === 'openrouter' && !routingKeys.get(state.routing.baseUrl)) throw fail('Add your OpenRouter API key on Model routing first');
    const model = modelId(body.model || state.routing.defaultModel);
    if (!model) throw fail('Choose a model or set a default on Model routing');
    return { provider: body.route, model };
  }
  function artifact(task, content) {
    const item = { id: id('artifact'), taskId: task.id, name: `${task.title}.md`, content: redact(content).slice(0, 200000), createdAt: stamp(), agentId: task.agentId };
    state.artifacts.unshift(item);
    return item;
  }
  function complete(task, content, error = null) {
    if (terminal(task.status)) return;
    active.delete(task.id);
    task.status = error ? 'failed' : 'done';
    task.error = error ? redact(error) : null;
    task.completedAt = stamp();
    task.updatedAt = stamp();
    if (content) artifact(task, content);
    event(`${getAgent(task.agentId).name} ${error ? 'could not finish' : 'completed'} “${task.title}”`, task.id, error ? 'error' : 'success');
    change();
    pump();
  }
  function reportWorkspace(task, project) {
    log(task, `Inspecting ${project.path}`);
    const ignored = new Set(['node_modules', '.git', '.ultharness', '.next', 'dist', 'build', '.venv', '__pycache__', '.codex', '.claude']);
    const found = [];
    let clipped = false;
    function walk(dir, depth = 0) {
      if (depth > 3) return;
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (found.length >= 1200) { clipped = true; return; }
        if (ignored.has(entry.name) || entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        found.push({ name: path.relative(project.path, full), directory: entry.isDirectory() });
        if (entry.isDirectory()) walk(full, depth + 1);
      }
    }
    walk(project.path);
    const files = found.filter(f => !f.directory);
    const extensions = {};
    for (const file of files) { const ext = path.extname(file.name) || '(no extension)'; extensions[ext] = (extensions[ext] || 0) + 1; }
    let manifest = '';
    try {
      const pkgPath = path.join(project.path, 'package.json');
      if (statSync(pkgPath).size < 100000) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        manifest = `\n## Package\nName: ${pkg.name || 'unnamed'}\n\nDeclared scripts (not executed):\n${Object.entries(pkg.scripts || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'None'}\n`;
      }
    } catch { /* A manifest is optional. */ }
    let git = 'No Git repository detected.';
    try { git = execFileSync('git', ['-C', project.path, 'status', '--short', '--branch'], { encoding: 'utf8', timeout: 5000, maxBuffer: 50000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Git is optional. */ }
    log(task, `Found ${files.length} files and ${found.length - files.length} directories; checked Git status.`);
    return `# Workspace inspection\n\nProject: ${project.name}\nPath: ${project.path}\nGenerated: ${stamp()}\n\nThis is a deterministic local inventory, not an AI code review. Hidden files, symlinks and common generated directories were skipped; scan depth is four levels.${clipped ? ' The 1,200-entry limit was reached.' : ''}\n\n## Summary\n${files.length} files, ${found.length - files.length} directories scanned.\n\n## File types\n${Object.entries(extensions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'No files found.'}\n${manifest}\n## Git status\n${git}\n\n## Project map\n${found.slice(0, 120).map(f => `${f.directory ? '▸' : '·'} ${f.name}`).join('\n') || '(empty directory)'}\n\n## Next step\nAssign a review task to Codex or Claude for semantic analysis, or create a follow-up task from this report.\n`;
  }
  function reportHealth(task, project) {
    log(task, 'Reading local disk, memory, and system metrics.');
    const disk = statfsSync(project.path);
    const total = Number(disk.blocks) * Number(disk.bsize);
    const free = Number(disk.bavail) * Number(disk.bsize);
    const freePercent = total ? Math.round(free / total * 100) : 0;
    const warning = freePercent < 15;
    task.health = warning ? 'warning' : 'healthy';
    log(task, `Disk: ${bytes(free)} available (${freePercent}%). System load: ${os.loadavg().map(n => n.toFixed(2)).join(', ')}.`);
    if (warning) event('Disk space is below 15%; review the health report.', task.id, 'warning');
    return `# Local system health\n\nGenerated: ${stamp()}\nHost: ${os.hostname()}\nPlatform: ${os.platform()} ${os.release()}\nStatus: ${warning ? 'ATTENTION — disk space below 15%' : 'No disk-space warning'}\n\n## Disk containing project\nPath: ${project.path}\nCapacity: ${bytes(total)}\nAvailable to this user: ${bytes(free)} (${freePercent}%)\n\n## Memory snapshot\nTotal RAM: ${bytes(os.totalmem())}\nOS-reported free RAM: ${bytes(os.freemem())}\nFree RAM alone is not a memory-pressure measurement; cached memory may be reclaimable.\n\n## CPU and uptime\nLogical CPUs: ${os.cpus().length}\nLoad averages (1m, 5m, 15m): ${os.loadavg().map(n => n.toFixed(2)).join(', ')}\nHost uptime: ${(os.uptime() / 3600).toFixed(1)} hours\n\n## Scope\nThis read-only check does not probe your network, contact cloud services, or modify system settings. It is a deterministic local check, not an AI diagnosis.\n`;
  }
  function launch(task) {
    const agent = getAgent(task.agentId);
    const project = getProject(task.projectId);
    if (!existsSync(project.path)) { task.status = 'running'; complete(task, '', 'Project directory is unavailable'); return; }
    task.status = 'running'; task.startedAt = stamp(); task.updatedAt = stamp(); task.runs++;
    task.toolActivityCount = 0;
    active.set(task.id, { child: null });
    event(`${agent.name} started “${task.title}”`, task.id);
    change();
    if (agent.kind === 'verification') {
      runDeliveryChecks({ task, root: project.path, log: value => log(task, value, 'tool'), setChild: child => { if (active.has(task.id)) active.set(task.id, { child }); }, stopped: () => closing || terminal(task.status), environment: (() => { const env = { ...process.env }; delete env.OMNIROUTE_API_KEY; delete env.ULTHARNESS_OMNIROUTE_KEY; delete env.ULTHARNESS_OPENROUTER_KEY; delete env.OPENROUTER_API_KEY; delete env.OPENCLAW_GATEWAY_TOKEN; delete env.OPENCLAW_GATEWAY_PASSWORD; return env; })() }).then(result => {
        if (closing) return;
        if (terminal(task.status)) { active.delete(task.id); change(); pump(); return; }
        complete(task, result.content, result.passed ? null : 'Recorded verification failed. See check evidence.');
      }).catch(err => { if (!closing) complete(task, '', err.message); });
      return;
    }
    if (native(agent.kind)) {
      setImmediate(() => {
        if (closing || terminal(task.status)) return;
        try { complete(task, agent.kind === 'health' ? reportHealth(task, project) : reportWorkspace(task, project)); }
        catch (err) { complete(task, '', err.message); }
      });
      return;
    }
    const binary = executable(agent.kind);
    if (!binary) { complete(task, '', `${agent.kind} is not installed or is not on PATH`); return; }
    if (task.routeSnapshot?.provider === 'openrouter' && !routingKeys.get(task.routeSnapshot.baseUrl)) { complete(task, '', 'OpenRouter authentication is missing. Configure its API key before resuming.'); return; }
    const args = commandArgs(agent.kind, task.mode, task.routeSnapshot, task.connections);
    const parent = task.parentId ? getTask(task.parentId) : null;
    const context = parent ? state.artifacts.filter(a => a.taskId === parent.id).slice(0, 1).map(a => a.content.slice(0, 20000)).join('\n') : '';
    const prompt = `You are ${agent.name}, working in Ultharness. Role: ${agent.role}.\nTask: ${task.title}\n${task.description}\n\n${task.mode === 'edit' ? 'Implement the requested changes within this workspace.' : 'Review and report only. Do not modify files.'}\nDo not launch or delegate to other agents. Return a clear final report describing your findings or changes and validation.\n${context ? `Parent task report:\n${context}` : ''}`;
    log(task, `Starting ${agent.kind} in ${task.mode === 'edit' ? 'workspace edit' : 'review'} mode.`, 'info');
    if (['omniroute', 'openrouter'].includes(task.routeSnapshot?.provider)) log(task, `Model route: ${task.routeSnapshot.provider} · ${task.routeSnapshot.model} · ${task.routeSnapshot.baseUrl}`);
    const runEnv = routingEnvironment(agent.kind, task.routeSnapshot, routingKeys.get(task.routeSnapshot?.baseUrl));
    const claw = task.connections?.find(c => c.integration === 'openclaw');
    if (claw && openClawKeys.has(claw.args[1])) runEnv.OPENCLAW_GATEWAY_TOKEN = openClawKeys.get(claw.args[1]);
    const child = spawn(binary, args, { cwd: project.path, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: runEnv });
    active.set(task.id, { child });
    let result = '';
    let hasReport = false;
    let buffer = '';
    let errorText = '';
    let exhausted = false;
    let providerError = null;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; log(task, 'Run exceeded the 15-minute limit.', 'error'); stopProcess(child); }, 15 * 60 * 1000);
    const emitLine = line => {
      if (!line.trim()) return;
      let data;
      try { data = JSON.parse(line); } catch { log(task, line, 'stdout'); return; }
      if (data.type === 'item.completed') {
        const item = data.item || {};
        if (item.type === 'agent_message') { if (item.text?.trim()) hasReport = true; result = (result + (item.text || '') + '\n').slice(-200000); log(task, item.text || '', 'assistant'); }
        else if (item.type === 'command_execution') { task.toolActivityCount++; log(task, `${item.command || ''}\n${item.aggregated_output || ''}`, 'tool'); }
        else { if (['file_change', 'mcp_tool_call', 'web_search', 'custom_tool_call'].includes(item.type)) task.toolActivityCount++; log(task, JSON.stringify(item).slice(0, 5000), 'tool'); }
      } else if (data.type === 'assistant') {
        for (const item of data.message?.content || []) {
          if (item.type === 'text') { if (item.text?.trim()) hasReport = true; result = (result + item.text + '\n').slice(-200000); log(task, item.text, 'assistant'); }
          else if (item.type === 'tool_use') { task.toolActivityCount++; log(task, `${item.name}: ${JSON.stringify(item.input).slice(0, 4000)}`, 'tool'); }
        }
      } else if (data.type === 'result') {
        if (data.result) { result = String(data.result).slice(0, 200000); if (result.trim()) hasReport = true; }
        if (data.is_error) providerError = errorText = clean(data.result || 'Provider reported an error', 3000);
        if (data.permission_denials?.length) providerError = errorText = 'The provider denied required tool permissions. Review the logs and adjust the task scope.';
        if (data.total_cost_usd != null) task.costUsd = data.total_cost_usd;
        log(task, data.is_error ? errorText : 'Provider returned its final result.', data.is_error ? 'error' : 'info');
      } else if (data.type === 'error' || data.type === 'turn.failed') { providerError = errorText = clean(data.message || data.error?.message || JSON.stringify(data)); log(task, errorText, 'error'); }
      else if (data.type === 'turn.completed') { task.usage = data.usage || null; log(task, 'Turn completed.'); }
      else if (data.type === 'system' || data.type === 'thread.started') log(task, `${data.type}${data.session_id ? ` · ${data.session_id}` : ''}`);
    };
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 500000) { exhausted = true; stopProcess(child); return; }
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) emitLine(line);
    });
    child.stderr.on('data', chunk => { const text = chunk.toString(); errorText = (errorText + text).slice(-3000); log(task, text, 'stderr'); });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    child.once('error', err => { providerError = err.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (closing) return;
      if (terminal(task.status)) { active.delete(task.id); change(); pump(); return; }
      if (buffer) emitLine(buffer);
      const error = timedOut ? 'Run exceeded the 15-minute limit' : providerError || (code === 0 && !exhausted ? (hasReport && result.trim() ? null : 'The runner exited without an assistant report. Review the logs and retry.') : (exhausted ? 'Output limit exceeded' : errorText || `Process exited ${code ?? signal}`));
      const evidenceError = !error && task.requireTools && task.toolActivityCount === 0 ? 'The agent returned a report without recorded tool activity. This task requires tool use. Review the report or retry with a model that can use tools.' : null;
      complete(task, result || task.logs.map(l => l.text).join('\n'), error || evidenceError);
    });
  }
  function stopProcess(child) {
    if (!child?.pid) return;
    try { process.platform !== 'win32' ? process.kill(-child.pid, 'SIGTERM') : child.kill('SIGTERM'); } catch { /* Already exited. */ }
    const kill = setTimeout(() => { try { process.platform !== 'win32' ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL'); } catch {} }, 2000);
    kill.unref();
  }
  function pump() {
    if (closing) return;
    deliveries.advance();
    advanceWorkflows();
    const priority = { high: 0, normal: 1, low: 2 };
    const ready = state.tasks.filter(t => t.status === 'ready').sort((a, b) => priority[a.priority] - priority[b.priority] || Date.parse(a.submittedAt || a.createdAt) - Date.parse(b.submittedAt || b.createdAt) || a.number - b.number);
    for (const task of ready) {
      if (active.size >= 2) break;
      if (task.status !== 'ready') continue;
      const agent = getAgent(task.agentId);
      if (task.workflowId && !state.workflows.find(w => w.id === task.workflowId)?.enabled) continue;
      if (projectExclusive(agent.kind) && state.deliveries.some(d => ['planning', 'building', 'checking', 'reviewing', 'awaiting_acceptance'].includes(d.status) && d.projectId === task.projectId && d.id !== task.deliveryId)) continue;
      if (!agent.enabled || [...active.keys()].some(taskId => getTask(taskId).agentId === agent.id)) continue;
      if (task.dependsOnId && getTask(task.dependsOnId).status !== 'done') continue;
      // Coding agents that may write share a project lock to prevent conflicting edits.
      if (projectExclusive(agent.kind) && [...active.keys()].some(taskId => { const other = getTask(taskId); return other.projectId === task.projectId && projectExclusive(getAgent(other.agentId).kind); })) continue;
      launch(task);
    }
  }
  function submitTask(task, cycleApproval = null) {
    if (active.has(task.id)) throw fail('The previous run is still stopping. Wait before submitting this task again.', 409);
    if (!['queued', 'failed', 'cancelled', 'done'].includes(task.status)) throw fail('This task has already been submitted', 409);
    const agent = getAgent(task.agentId);
    if (!agent.enabled) throw fail('Resume this agent first');
    if (!native(agent.kind) && !executable(agent.kind)) throw fail(`${agent.kind} is not available on this server's PATH`);
    if (task.dependsOnId && getTask(task.dependsOnId).status !== 'done') {
      throw fail('Complete the dependency before running this task', 409);
    }
    if (!cycleApproval && !native(agent.kind) && task.routing?.provider !== 'direct' && task.routing?.provider !== state.routing.provider) throw fail('This task’s selected gateway changed. Configure its provider on Model routing before submitting.');
    task.error = null; task.completedAt = null; task.updatedAt = stamp();
    task.submittedAt = stamp();
    delete task.usage; delete task.costUsd;
    task.routeSnapshot = cycleApproval ? (native(agent.kind) ? { provider: 'direct' } : structuredClone(cycleApproval.routeSnapshot)) : ['omniroute', 'openrouter'].includes(task.routing?.provider) ? { ...task.routing, baseUrl: state.routing.baseUrl } : { provider: 'direct' };
    task.status = cycleApproval || native(agent.kind) ? 'ready' : 'approval';
    task.approval = cycleApproval ? { requestedAt: cycleApproval.at, decidedAt: cycleApproval.at, decision: 'approved', deliveryId: cycleApproval.deliveryId } : native(agent.kind) ? null : { requestedAt: stamp(), decidedAt: null, decision: null };
    event(cycleApproval ? `Queued under your approved delivery cycle: ${task.title}` : native(agent.kind) ? `Queued “${task.title}” for a local check` : `Approval requested: ${agent.name} · ${task.title}`, task.id, cycleApproval || native(agent.kind) ? 'info' : 'warning');
    change();
  }
  function requestRun(task) {
    submitTask(task);
    if (task.workflowId) { const workflow = state.workflows.find(w => w.id === task.workflowId); workflow.error = null; change(); }
    pump();
    return task;
  }
  function runRoutine(routine) {
    if (state.tasks.some(t => t.routineId === routine.id && !terminal(t.status))) throw fail('This routine already has an unfinished task', 409);
    const task = prepareTask({ ...routine, route: routine.routing?.provider || 'direct', model: routine.routing?.model, routineId: routine.id, runNow: true });
    insertTask(task);
    routine.lastRunAt = stamp(); routine.nextRunAt = new Date(Date.now() + routine.intervalMinutes * 60000).toISOString();
    requestRun(task); change();
    return task;
  }
  function routineSettings(body) {
    const title = clean(body.title, 160); if (!title) throw fail('Give this routine a title');
    const agent = getAgent(body.agentId); getProject(body.projectId);
    const intervalMinutes = Number(body.intervalMinutes);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 43200) throw fail('Interval must be 1–43,200 minutes');
    return { title, description: clean(body.description, 12000), agentId: agent.id, projectId: body.projectId,
      routing: taskRouting(body, agent), requireTools: !native(agent.kind) && body.requireTools === true, intervalMinutes, lane: body.lane === 'coding' ? 'coding' : 'operations',
      mode: body.mode === 'edit' ? 'edit' : 'review', priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal' };
  }
  function cancelManagedTask(task) {
    task.status = 'cancelled'; task.updatedAt = stamp();
    const child = active.get(task.id)?.child; stopProcess(child);
    if (!child) active.delete(task.id);
  }
  const deliveries = createDeliveryManager({ state, getProject, getAgent, prepareTask: body => prepareTask(body, true), insertTask, submitTask, active, change, event, cancelTask: cancelManagedTask, executable });
  function tick() {
    for (const routine of state.routines) {
      if (!routine.enabled || Date.parse(routine.nextRunAt) > Date.now()) continue;
      try { runRoutine(routine); }
      catch (err) {
        routine.nextRunAt = new Date(Date.now() + routine.intervalMinutes * 60000).toISOString();
        event(`Routine “${routine.title}” skipped: ${err.message}`, null, 'warning'); change();
      }
    }
    pump();
  }
  for (const task of state.tasks) {
    if (task.status === 'running' || task.status === 'ready') { task.status = 'failed'; task.error = 'Server restarted before this run finished. Review logs and run again.'; task.updatedAt = stamp(); }
  }
  const startedAt = stamp();
  persist();
  const timer = setInterval(tick, tickMs); timer.unref();
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': heartbeat\n\n'); }, 20000); heartbeat.unref();

  async function readBody(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw fail('Use application/json', 415);
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 50000) throw fail('Request too large', 413); }
    try { return JSON.parse(body || '{}'); } catch { throw fail('Invalid JSON'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) throw fail('Local access only', 403);
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail('Cross-origin requests are not allowed', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const route = url.pathname;
      if (req.method === 'GET' && route === '/api/state') return json(snapshot());
      if (req.method === 'GET' && route === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write('data: {}\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && /^\/api\/deliveries\/[^/]+\/preview$/.test(route)) {
        const delivery = deliveries.find(route.split('/')[3]);
        const folder = getProject(delivery.projectId).path;
        if (!previews.has(folder)) { const pending = createPreview(folder).catch(error => { previews.delete(folder); throw error; }); previews.set(folder, pending); }
        const preview = await previews.get(folder); return json({ url: preview.url });
      }
      if (req.method === 'GET' && /^\/api\/deliveries\/[^/]+\/report$/.test(route)) {
        const delivery = deliveries.find(route.split('/')[3]);
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="delivery-${delivery.id}.md"`, 'Cache-Control': 'no-store' });
        return res.end(redact(deliveries.report(delivery)));
      }
      if (req.method === 'GET' && route.startsWith('/api/artifacts/')) {
        const item = state.artifacts.find(a => a.id === route.split('/')[3]);
        if (!item) throw fail('Artifact not found', 404);
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${item.name.replace(/[^a-zA-Z0-9_. -]/g, '_')}"`, 'Cache-Control': 'no-store' }); return res.end(item.content);
      }
      if (req.method === 'POST' && route.startsWith('/api/')) {
        const body = await readBody(req);
        const parts = route.split('/').filter(Boolean);
        if (route === '/api/routing') {
          const baseUrl = normalizeBaseUrl(body.baseUrl || state.routing.baseUrl);
          const defaultModel = modelId(body.defaultModel ?? state.routing.defaultModel);
          if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey))) throw fail('Invalid gateway API key');
          const provider = body.provider || (baseUrl === state.routing.baseUrl ? state.routing.provider : null) || (new URL(baseUrl).hostname === 'openrouter.ai' ? 'openrouter' : 'omniroute');
          if (!['omniroute', 'openrouter'].includes(provider)) throw fail('Choose OmniRoute or OpenRouter');
          const changedEndpoint = baseUrl !== state.routing.baseUrl || provider !== state.routing.provider;
          if (body.apiKey?.trim()) { routingKeys.set(baseUrl, body.apiKey.trim()); redactions.add(body.apiKey.trim()); }
          if (body.clearKey === true) routingKeys.delete(baseUrl);
          state.routing = { ...state.routing, provider, baseUrl, defaultModel, ...(changedEndpoint ? { models: [], checkedAt: null, status: 'unchecked', error: null } : {}) };
          event('Model gateway connection settings updated'); change(); return json(routingSnapshot());
        }
        if (route === '/api/routing/test') {
          const target = state.routing.baseUrl;
          try {
            const models = await discoverModels(target, routingKeys.get(target));
            if (target !== state.routing.baseUrl) throw fail('Connection settings changed during the test. Test the new endpoint.', 409);
            state.routing.models = models; state.routing.checkedAt = stamp(); state.routing.status = 'connected'; state.routing.error = null;
            event(`Model gateway connected: ${models.length} models discovered`); change(); return json(routingSnapshot());
          } catch (err) {
            if (target === state.routing.baseUrl) { state.routing.status = 'error'; state.routing.error = err.message; state.routing.checkedAt = stamp(); change(); }
            throw fail(err.message, err.status || 502);
          }
        }
        if (route === '/api/connections') {
          const connection = { ...connectionSettings(body), id: id('connection'), enabled: true, createdAt: stamp() };
          if (body.kind === 'openclaw' && body.apiKey) {
            if (typeof body.apiKey !== 'string' || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey)) throw fail('Invalid OpenClaw gateway token');
            openClawKeys.set(connection.args[1], body.apiKey.trim()); redactions.add(body.apiKey.trim());
          }
          state.connections.unshift(connection); event(`Connection saved: ${connection.name}`); change(); return json(connection, 201);
        }
        if (parts[1] === 'connections' && parts[2] && ['toggle', 'delete'].includes(parts[3])) {
          const connection = state.connections.find(c => c.id === parts[2]); if (!connection) throw fail('Connection not found', 404);
          if (parts[3] === 'delete') state.connections = state.connections.filter(c => c.id !== connection.id);
          else connection.enabled = !connection.enabled;
          event(`Connection ${parts[3] === 'delete' ? 'removed' : connection.enabled ? 'enabled' : 'disabled'}: ${connection.name}`); change(); return json({ ok: true });
        }
        if (route === '/api/missions') { const delivery = deliveries.mission(body); pump(); return json(delivery, 201); }
        if (route === '/api/deliveries') return json(deliveries.create(body), 201);
        if (parts[1] === 'deliveries' && parts[2]) {
          const delivery = deliveries.find(parts[2]);
          let result;
          if (parts[3] === 'approve') result = deliveries.approve(delivery);
          else if (parts[3] === 'pause') result = deliveries.pause(delivery);
          else if (parts[3] === 'accept') result = deliveries.accept(delivery);
          else if (parts[3] === 'reject') result = deliveries.reject(delivery, body.feedback);
          else throw fail('Unknown delivery action', 404);
          pump(); return json(result);
        }
        if (route === '/api/tasks') { const task = createTask(body); if (body.runNow) requestRun(task); return json(task, 201); }
        if (route === '/api/workflows') return json(createWorkflow(body), 201);
        if (parts[1] === 'workflows' && parts[2] && parts[3] === 'toggle') {
          const workflow = state.workflows.find(w => w.id === parts[2]); if (!workflow) throw fail('Workflow not found', 404);
          workflow.enabled = !workflow.enabled; workflow.error = null;
          event(`Workflow ${workflow.enabled ? 'resumed' : 'paused'}: ${workflow.title}`); change(); pump(); return json(workflow);
        }
        if (parts[1] === 'tasks' && parts[2]) {
          const task = getTask(parts[2]); const action = parts[3];
          if (task.deliveryId && ['run', 'approve', 'reject', 'requirements'].includes(action)) throw fail('This task is managed by its client delivery. Use delivery controls.', 409);
          if (action === 'run') return json(requestRun(task));
          if (action === 'requirements') {
            if (active.has(task.id) || !['queued', 'done', 'failed', 'cancelled'].includes(task.status)) throw fail('Change run requirements before submitting the task', 409);
            if (typeof body.requireTools !== 'boolean') throw fail('Tool activity requirement must be true or false');
            task.requireTools = !native(getAgent(task.agentId).kind) && body.requireTools;
            task.updatedAt = stamp(); event(`Tool activity ${task.requireTools ? 'required' : 'optional'} for the next run: ${task.title}`, task.id); change(); return json(task);
          }
          if (action === 'priority') {
            if (terminal(task.status)) throw fail('Change priority before the task finishes', 409);
            if (!['low', 'normal', 'high'].includes(body.priority)) throw fail('Choose low, normal, or high priority');
            task.priority = body.priority; task.updatedAt = stamp();
            event(`Priority changed to ${task.priority}: ${task.title}`, task.id); change(); pump(); return json(task);
          }
          if (action === 'approve') {
            if (task.status !== 'approval') throw fail('This task is not awaiting approval', 409);
            task.approval.decidedAt = stamp(); task.approval.decision = 'approved'; task.status = 'ready'; task.updatedAt = stamp();
            event(`You approved ${getAgent(task.agentId).name} to run “${task.title}”`, task.id); change(); pump(); return json(task);
          }
          if (action === 'reject') {
            if (task.status !== 'approval') throw fail('This task is not awaiting approval', 409);
            task.approval.decidedAt = stamp(); task.approval.decision = 'rejected'; task.status = 'cancelled'; task.updatedAt = stamp();
            event(`You declined “${task.title}”`, task.id); change(); return json(task);
          }
          if (action === 'cancel') {
            if (terminal(task.status)) throw fail('This task has already finished', 409);
            task.status = 'cancelled'; task.updatedAt = stamp();
            const child = active.get(task.id)?.child;
            stopProcess(child);
            // Keep the lock until an external process actually exits.
            if (!child) active.delete(task.id);
            event(`You cancelled “${task.title}”`, task.id); change(); pump(); return json(task);
          }
          if (action === 'comment') {
            const text = clean(body.text, 5000); if (!text) throw fail('Write a comment first');
            task.comments.push({ id: id('comment'), text, at: stamp(), author: 'You' }); task.updatedAt = stamp();
            event(`You added a note to “${task.title}”`, task.id); change(); return json(task);
          }
        }
        if (route === '/api/projects') {
          const name = clean(body.name, 80); if (!name) throw fail('Give this project a name');
          const project = { id: id('project'), name, path: resolveDirectory(body.path), description: clean(body.description, 500), createdAt: stamp() };
          state.projects.push(project); event(`Project connected: ${name}`); change(); return json(project, 201);
        }
        if (parts[1] === 'projects' && parts[2] && parts[3] === 'update') {
          const project = getProject(parts[2]);
          const name = clean(body.name ?? project.name, 80); if (!name) throw fail('Give this project a name');
          const folder = resolveDirectory(body.path ?? project.path);
          const moved = folder !== project.path;
          if (moved && state.deliveries.some(d => d.projectId === project.id && ['planning', 'building', 'checking', 'reviewing', 'awaiting_acceptance'].includes(d.status))) throw fail('Finish or stop this delivery, or request changes, before changing its folder', 409);
          if (moved && [...active.keys()].some(taskId => getTask(taskId).projectId === project.id)) throw fail('Wait for this project’s active tasks to finish before changing its folder', 409);
          Object.assign(project, { name, path: folder, description: clean(body.description ?? project.description, 500) });
          if (moved) for (const task of state.tasks.filter(t => t.projectId === project.id && ['approval', 'ready'].includes(t.status))) {
            task.status = 'queued'; task.approval = null; task.routeSnapshot = null; task.updatedAt = stamp();
            event('Project folder changed. Submit this task again to review its new location.', task.id, 'warning');
          }
          event(`Project updated: ${name}`); change(); return json(project);
        }
        if (parts[1] === 'agents' && parts[2] && parts[3] === 'toggle') {
          const agent = getAgent(parts[2]); agent.enabled = !agent.enabled;
          event(`${agent.name} ${agent.enabled ? 'resumed' : 'paused for new work'}`); change(); pump(); return json(agent);
        }
        if (route === '/api/routines') {
          const settings = routineSettings(body);
          const routine = { ...settings, id: id('routine'),
            enabled: body.enabled !== false, createdAt: stamp(), lastRunAt: null, nextRunAt: new Date(Date.now() + settings.intervalMinutes * 60000).toISOString() };
          state.routines.unshift(routine); event(`Routine created: ${routine.title}`); change(); return json(routine, 201);
        }
        if (parts[1] === 'routines' && parts[2]) {
          const routine = state.routines.find(r => r.id === parts[2]); if (!routine) throw fail('Routine not found', 404);
          if (parts[3] === 'update') {
            const settings = routineSettings({ ...routine, route: routine.routing?.provider || 'direct', model: routine.routing?.model, ...body });
            const changedInterval = settings.intervalMinutes !== routine.intervalMinutes;
            Object.assign(routine, settings);
            if (changedInterval) routine.nextRunAt = new Date(Date.now() + routine.intervalMinutes * 60000).toISOString();
            event(`Routine updated: ${routine.title}`); change(); return json(routine);
          }
          if (parts[3] === 'run') return json(runRoutine(routine), 201);
          if (parts[3] === 'toggle') { routine.enabled = !routine.enabled; if (routine.enabled) routine.nextRunAt = new Date(Date.now() + routine.intervalMinutes * 60000).toISOString(); event(`Routine ${routine.enabled ? 'resumed' : 'paused'}: ${routine.title}`); change(); return json(routine); }
        }
        throw fail('Unknown action', 404);
      }
      if (req.method !== 'GET') throw fail('Not found', 404);
      const asset = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }[route];
      if (!asset) throw fail('Not found', 404);
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(readFileSync(path.join(HERE, 'public', asset[0])));
    } catch (err) { if (!res.headersSent) json({ error: err.message }, err.status || 500); else res.end(); }
  });
  async function close() {
    closing = true; clearInterval(timer); clearInterval(heartbeat);
    for (const [taskId, value] of active) { stopProcess(value.child); const task = getTask(taskId); if (!terminal(task.status)) { task.status = 'failed'; task.error = 'Server stopped during this run. Review logs and run again.'; } }
    await Promise.allSettled([...previews.values()].map(async preview => (await preview).close()));
    persist(); for (const client of clients) client.end(); clients.clear();
    await new Promise(resolve => server.close(resolve)); db.close();
  }
  return { server, close, tick };
}

export function commandArgs(kind, mode, route, connections = []) {
  if (kind === 'codex') {
    const routed = ['omniroute', 'openrouter'].includes(route?.provider);
    const provider = route?.provider === 'openrouter' ? 'openrouter' : 'omniroute';
    const extra = routed ? ['--model', route.model, '-c', `model_provider="ultharness_${provider}"`,
      '-c', `model_providers.ultharness_${provider}.name="${provider}"`, '-c', `model_providers.ultharness_${provider}.base_url=${JSON.stringify(normalizeBaseUrl(route.baseUrl))}`,
      '-c', `model_providers.ultharness_${provider}.env_key="ULTHARNESS_${provider.toUpperCase()}_KEY"`, '-c', `model_providers.ultharness_${provider}.requires_openai_auth=false`,
      '-c', `model_providers.ultharness_${provider}.wire_api="responses"`] : [];
    // This installed local model rejects the thinking defaults inherited from Codex.
    if (route?.provider === 'omniroute' && route.model === 'ollama-local/llama3.2:3b') extra.push(
      '-c', 'model_reasoning_effort="none"', '-c', 'model_reasoning_summary="none"'
    );
    return ['exec', '--json', '--color', 'never', '--sandbox', mode === 'edit' ? 'workspace-write' : 'read-only', '-c', 'approval_policy="never"', '--skip-git-repo-check', ...extra, ...connectionArgs(kind, connections), '-'];
  }
  // Claude receives a fixed file-tool allowlist; shell execution is deliberately unavailable.
  const mcpTools = connections.filter(c => c.kind === 'mcp').flatMap(c => c.tools.map(tool => `mcp__uh_${c.id.replace(/[^a-zA-Z0-9_]/g, '_')}__${tool}`));
  const tools = mode === 'edit' ? 'Read,Glob,Grep,Edit,Write' : 'Read,Glob,Grep';
  return ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', mode === 'edit' ? 'acceptEdits' : 'default', '--tools', tools, '--allowedTools', [tools, ...mcpTools].join(','), ...connectionArgs(kind, connections), ...(route?.provider === 'omniroute' ? ['--model', route.model] : [])];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 4310);
  app.server.on('error', err => { console.error(err.message); process.exit(1); });
  app.server.listen(port, '127.0.0.1', () => console.log(`Ultharness is running at http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
