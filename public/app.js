const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const glyphs = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  tasks: 'M9 6h12 M9 12h12 M9 18h12 M3 6l1 1 2-2 M3 12l1 1 2-2 M3 18l1 1 2-2',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  routine: 'M20 7v5h-5 M4 17v-5h5 M5.3 7a7.5 7.5 0 0 1 12.4-2L20 8 M4 16l2.3 3A7.5 7.5 0 0 0 18.7 17',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  activity: 'M2 12h4l3-8 5 16 3-8h5',
  folder: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus: 'M12 5v14 M5 12h14', arrow: 'M5 12h14 M13 6l6 6-6 6',
  search: 'M21 21l-5-5 M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  close: 'M6 6l12 12 M6 18L18 6', play: 'M8 4l13 8-13 8z',
  check: 'M5 12l4 4L19 6', clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  terminal: 'M4 6l6 6-6 6 M12 18h8', down: 'M12 3v12 M6 9l6 6 6-6 M4 17v4h16v-4',
  shield: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',
  chevron: 'M9 5l7 7-7 7', pause: 'M8 5v14 M16 5v14', link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  monitor: 'M3 3h18v14H3z M8 21h8 M12 17v4', code: 'M8 5l-7 7 7 7 M16 5l7 7-7 7 M14 3l-4 18'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${glyphs[name] || glyphs.grid}"/></svg>`;
let state;
let view = location.hash.slice(1) || 'overview';
let lane = 'all';
let query = '';
let modalTaskId = null;
let detailTab = 'activity';
let connected = true;
let refreshTimer;
let modelQuery = '';
let providerFilter = '';
const nav = [['overview', 'grid', 'Overview'], ['tasks', 'tasks', 'Tasks'], ['workflows', 'link', 'Workflows'], ['team', 'team', 'Team'], ['routines', 'routine', 'Routines'], ['artifacts', 'file', 'Artifacts'], ['activity', 'activity', 'Activity'], ['projects', 'folder', 'Projects'], ['routing', 'code', 'Model routing']];
const agent = id => state.agents.find(a => a.id === id);
const project = id => state.projects.find(p => p.id === id);
const taskName = t => `UH-${String(t.number).padStart(3, '0')}`;
const isNative = a => ['workspace', 'health'].includes(a.kind);
const finished = t => ['done', 'failed', 'cancelled'].includes(t.status);
const date = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
function ago(value) {
  const n = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  return n < 60 ? 'just now' : n < 3600 ? `${Math.floor(n / 60)}m ago` : n < 86400 ? `${Math.floor(n / 3600)}h ago` : `${Math.floor(n / 86400)}d ago`;
}
const statusLabels = { queued: 'Queued', approval: 'Needs approval', ready: 'Waiting for runner', running: 'Working', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', blocked: 'Needs attention', paused: 'Paused' };
const badge = status => `<span class="badge ${e(status)}"><span class="dot"></span>${e(statusLabels[status] || status)}</span>`;
const avatar = (a, small = false) => `<span class="avatar ${e(a?.color || 'lime')} ${small ? 'small' : ''}">${a?.kind === 'codex' ? icon('code') : a?.kind === 'claude' ? '✳' : icon(a?.kind === 'health' ? 'activity' : 'search')}</span>`;
const empty = (title, description, action = '', symbol = 'tasks') => `<div class="empty"><div class="empty-symbol">${icon(symbol)}</div><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
const button = (label, action, symbol = 'plus', cls = '') => `<button class="button ${cls}" data-action="${action}">${icon(symbol)}${label}</button>`;

async function api(endpoint, body) {
  const response = await fetch(`/api/${endpoint}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed');
  return result;
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = '', 4500);
}
async function refresh() {
  try { state = await api('state'); render(); if (modalTaskId) renderDetail(); }
  catch (err) { toast(err.message, true); }
}
function navigate(next) { view = next; query = ''; location.hash = next; render(); }

function render() {
  const routingFocus = document.activeElement?.closest('#routing-form') && document.activeElement?.tagName === 'INPUT' ? document.activeElement.name : null;
  const routingDraft = $('#routing-form') ? Object.fromEntries(new FormData($('#routing-form'))) : null;
  const approvals = state.tasks.filter(t => t.status === 'approval');
  const running = state.tasks.filter(t => t.status === 'running');
  const current = nav.find(n => n[0] === view) || nav[0];
  const searchFocused = document.activeElement?.id === 'search';
  $('#app').innerHTML = `<aside class="sidebar">
    <a class="brand" href="#overview" aria-label="Ultharness home"><span class="brand-mark">u<span>h</span></span>ultharness<span class="version">α</span></a>
    <div class="workspace-switch"><span class="workspace-icon">${icon('grid')}</span><div>Personal workspace<small>Local · ${e(state.server.host)}</small></div><span class="switch-dots">···</span></div>
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Main navigation">${nav.map(([key, symbol, label]) => `<a href="#${key}" class="nav-item ${view === key ? 'selected' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}${label}${key === 'tasks' && state.tasks.filter(t => !finished(t)).length ? `<span class="nav-count">${state.tasks.filter(t => !finished(t)).length}</span>` : ''}</a>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="local-note">${icon('shield')}<div>On your machine<small>Tasks and reports stored here.</small></div></div><div class="profile"><span class="profile-avatar">Y</span><div>Your workspace<small>Owner</small></div><span class="profile-dot"></span></div></div>
  </aside>
  <div class="shell"><header class="topbar"><div class="breadcrumbs">Workspace ${icon('chevron')} <span>${current[2]}</span></div><div class="topbar-right"><span class="connection ${connected ? '' : 'offline'}"><span class="dot"></span>${connected ? 'Local server online' : 'Reconnecting…'}</span><button class="icon-button notification ${approvals.length ? 'has-notification' : ''}" data-action="approvals" aria-label="View approvals">${icon('bell')}${approvals.length ? `<b>${approvals.length}</b>` : ''}</button><span class="top-avatar">Y</span></div></header>
  <main><div class="page-content">${view === 'overview' ? overview(approvals, running) : view === 'tasks' ? tasksPage() : view === 'workflows' ? workflowsPage() : view === 'team' ? teamPage() : view === 'routines' ? routinesPage() : view === 'artifacts' ? artifactsPage() : view === 'activity' ? activityPage() : view === 'routing' ? routingPage() : projectsPage()}</div><footer><span><span class="tiny-brand">uh</span> A little structure. A lot more done.</span><span>ULTHARNESS <span class="mono">v${e(state.server.version)}</span></span></footer></main></div>`;
  if (searchFocused) { const field = $('#search'); field?.focus(); field?.setSelectionRange(query.length, query.length); }
  if (routingDraft && $('#routing-form')) {
    for (const [name, value] of Object.entries(routingDraft)) { const field = $('#routing-form').elements.namedItem(name); if (field) { if (field.type === 'checkbox') field.checked = value === 'on'; else field.value = value; } }
    if (routingFocus) $('#routing-form').elements.namedItem(routingFocus)?.focus();
  }
  if (view === 'routing') filterModels();
}

function heading(eyebrow, title, description, actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function overview(approvals, running) {
  const done = state.tasks.filter(t => t.status === 'done');
  const health = state.tasks.find(t => t.health && t.status === 'done');
  return `${heading('YOUR COMMAND CENTER', 'Good work starts here<span class="accent">.</span>', 'One workspace for your coding agents and everyday operations.', button('New task', 'new-task', 'plus', 'primary'))}
  <div class="summary-grid">
    <div class="summary-card"><div class="summary-label">Active agents ${icon('team')}</div><div class="summary-value">${running.length}<span>/ ${state.agents.length}</span></div><div class="summary-caption"><span class="dot lime-dot"></span>${running.length ? 'Work is in motion' : 'Ready when you are'}</div></div>
    <div class="summary-card"><div class="summary-label">Tasks completed ${icon('check')}</div><div class="summary-value">${done.length}<span>tasks</span></div><div class="summary-caption">${state.tasks.length ? `${state.tasks.length} tasks in your workspace` : 'Your next idea is the first one'}</div></div>
    <div class="summary-card"><div class="summary-label">Needs your attention ${icon('shield')}</div><div class="summary-value ${approvals.length ? 'amber-text' : ''}">${approvals.length}<span>approvals</span></div><div class="summary-caption">${approvals.length ? 'Review before agents start' : 'You’re all caught up'}</div></div>
    <div class="summary-card"><div class="summary-label">Scheduled routines ${icon('routine')}</div><div class="summary-value">${state.routines.filter(r => r.enabled).length}<span>active</span></div><div class="summary-caption">${state.routines.length ? 'Runs while the local server is on' : 'Put the repeat work on a schedule'}</div></div>
  </div>
  ${approvals.length ? `<div class="attention-banner">${icon('shield')}<div><strong>${approvals.length} ${approvals.length === 1 ? 'task needs' : 'tasks need'} your approval</strong><span>Review the instructions and access before starting an AI run.</span></div><button class="text-button" data-action="approvals">Review tasks ${icon('arrow')}</button></div>` : ''}
  ${state.projects.some(p => !p.available) ? `<div class="attention-banner">${icon('folder')}<div><strong>A project folder has moved</strong><span>Reconnect its folder before running tasks.</span></div><a class="text-link" href="#projects">Open projects ${icon('arrow')}</a></div>` : ''}
  <div class="workspace-shortcuts"><a href="#workflows">${icon('link')}Plan a multi-step workflow ${icon('arrow')}</a><a href="#routing">${icon('code')}${state.routing.models.length} models in your catalog ${icon('arrow')}</a></div>
  <section class="section"><div class="section-title"><h2>Your team <span class="count-label">${state.agents.length}</span></h2><a href="#team" class="text-link">Manage team ${icon('arrow')}</a></div><div class="agent-grid">${state.agents.map(a => agentCard(a, true)).join('')}</div></section>
  <div class="overview-bottom"><section class="panel work-panel"><div class="panel-heading"><h2>Work in motion</h2><a href="#tasks" class="text-link">All tasks ${icon('arrow')}</a></div><div class="tabs"><button class="tab ${lane === 'all' ? 'active' : ''}" data-lane="all">All work</button><button class="tab ${lane === 'coding' ? 'active' : ''}" data-lane="coding">${icon('code')} Coding</button><button class="tab ${lane === 'operations' ? 'active' : ''}" data-lane="operations">${icon('monitor')} Operations</button></div>${taskTable(state.tasks.filter(t => lane === 'all' || t.lane === lane).slice(0, 6), true)}</section>
  <section class="panel activity-panel"><div class="panel-heading"><h2>Latest activity</h2><span class="live-label"><span class="dot"></span>LIVE</span></div>${state.events.length ? activityList(state.events.slice(0, 5)) : `<div class="quiet-activity">${icon('activity')}<h3>A quiet start</h3><p>As your team gets to work, you’ll see what’s happening here.</p></div>`}<a href="#activity" class="activity-footer">View activity log ${icon('arrow')}</a></section></div>
  <section class="get-started"><div class="get-started-icon">${icon('terminal')}</div><div><h3>${state.tasks.length ? 'From one-off work to everyday rhythm.' : 'Give your workspace its first task.'}</h3><p>${health ? `Last health check: ${e(health.health)} · ${ago(health.completedAt)}.` : 'Try a local workspace inspection or check your system’s health. No API key needed.'}</p></div><button class="button subtle" data-action="quick-health">${icon('activity')}Check system health</button><button class="button" data-action="quick-scout">Inspect workspace ${icon('arrow')}</button></section>`;
}
function agentCard(a, compact = false) {
  const active = a.activeTaskId ? state.tasks.find(t => t.id === a.activeTaskId) : null;
  const status = active?.stopping ? 'Stopping' : !a.enabled ? 'Paused' : active ? 'Working' : !a.available ? 'Not installed' : 'Ready';
  return `<article class="agent-card ${compact ? '' : 'expanded'}"><div class="agent-top">${avatar(a)}<span class="agent-state ${active ? 'working' : ''}"><span class="dot"></span>${status}</span></div><h3>${e(a.name)}</h3><p class="agent-role">${e(a.role)}</p>${compact ? '' : `<p class="agent-description">${e(a.description)}</p>`}<div class="agent-bottom"><span class="runner-label">${isNative(a) ? 'LOCAL CHECK' : `${e(a.kind.toUpperCase())} CLI`}</span>${compact ? `<button class="mini-arrow" data-action="agent-task" data-id="${a.id}" aria-label="Assign task to ${e(a.name)}">${icon('arrow')}</button>` : `<button class="text-button" data-action="agent-toggle" data-id="${a.id}">${a.enabled ? 'Pause' : 'Resume'} ${icon(a.enabled ? 'pause' : 'play')}</button>`}</div>${active ? `<button class="agent-current" data-task="${active.id}">${icon('activity')}${e(active.title)}</button>` : ''}${!compact ? `<button class="button wide" data-action="agent-task" data-id="${a.id}" ${!a.enabled || !a.available ? 'disabled' : ''}>${icon('plus')}Assign task</button>` : ''}</article>`;
}
function taskTable(tasks, compact = false) {
  if (!tasks.length) return empty(query ? 'No matching tasks' : 'A clear desk. A fresh start.', query ? 'Try a different title or task number.' : 'Create a task, pick an agent, and turn an idea into progress.', button('Create a task', 'new-task', 'plus', 'subtle'));
  return `<div class="table-scroll"><table class="task-table"><thead><tr><th>Task</th><th>Agent</th><th>Status</th>${compact ? '' : '<th>Workspace</th><th>Updated</th>'}<th><span class="sr-only">Open</span></th></tr></thead><tbody>${tasks.map(t => `<tr data-task="${t.id}" tabindex="0" role="button" aria-label="Open ${e(t.title)}"><td><div class="task-title"><span class="task-id">${taskName(t)}</span><strong>${e(t.title)}</strong>${t.priority === 'high' ? '<span class="priority-mark" title="High priority">↑</span>' : ''}</div><div class="task-secondary">${icon(t.lane === 'coding' ? 'code' : 'monitor')}${t.lane === 'coding' ? 'Coding' : 'Operations'}${t.parentId ? ` <span>· Follow-up</span>` : ''}</div></td><td><div class="agent-inline">${avatar(agent(t.agentId), true)}${e(agent(t.agentId)?.name)}</div></td><td>${badge(t.status)}</td>${compact ? '' : `<td><span class="muted">${e(project(t.projectId)?.name)}</span></td><td class="muted nowrap">${ago(t.updatedAt)}</td>`}<td class="table-arrow">${icon('chevron')}</td></tr>`).join('')}</tbody></table></div>`;
}
function tasksPage() {
  const tasks = state.tasks.filter(t => (lane === 'all' || t.lane === lane) && `${t.title} ${taskName(t)} ${t.description}`.toLowerCase().includes(query.toLowerCase()));
  const ready = tasks.filter(t => t.status === 'ready').sort((a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority]) || Date.parse(a.submittedAt || a.createdAt) - Date.parse(b.submittedAt || b.createdAt) || a.number - b.number);
  return `${heading('MAKE THINGS HAPPEN', 'Tasks', 'Coding projects and operations, with clear ownership at every step.', button('New task', 'new-task', 'plus', 'primary'))}
  ${ready.length ? `<section class="panel queue-panel"><div class="panel-heading"><h2>Waiting to run <span class="count-label">${ready.length}</span></h2><span class="muted">High priority first · oldest submission first within each priority</span></div>${ready.map(t => `<button class="queue-row" data-task="${t.id}"><span class="priority-pill ${e(t.priority)}">${e(t.priority)}</span><strong>${e(t.title)}</strong><span>${e(t.waitReason)}</span>${icon('chevron')}</button>`).join('')}</section>` : ''}
  <section class="panel"><div class="task-toolbar"><div class="tabs"><button class="tab ${lane === 'all' ? 'active' : ''}" data-lane="all">All work <span>${state.tasks.length}</span></button><button class="tab ${lane === 'coding' ? 'active' : ''}" data-lane="coding">Coding</button><button class="tab ${lane === 'operations' ? 'active' : ''}" data-lane="operations">Operations</button></div><label class="search-field">${icon('search')}<input id="search" type="search" aria-label="Search tasks" placeholder="Find a task…" value="${e(query)}"></label></div>${taskTable(tasks)}</section>`;
}
function teamPage() {
  return `${heading('THE RIGHT AGENT FOR THE WORK', 'Meet your team', 'Local tools for routine checks. AI agents for the work that needs reasoning.')}
  <div class="info-strip">${icon('link')}<span>CLI availability is detected on this machine. Provider sign-in is checked when a run starts.</span></div>
  <div class="agent-grid team-grid">${state.agents.map(a => agentCard(a)).join('')}</div>
  <section class="panel scope-panel"><div>${icon('shield')}</div><div><h3>You set the scope.</h3><p>AI tasks wait for your approval. Review mode asks for analysis; edit mode allows workspace changes. Codex uses its CLI sandbox. Claude has a fixed file-tool allowlist. Local checks only read system and workspace data.</p><p>Pausing an agent stops new work from starting. Cancel its active task to stop a current run.</p></div></section>`;
}
const workflowRecipes = {
  review: { name: 'Inspect & review', description: 'Map the project, then ask a coding agent for a focused review.', steps: [
    { title: 'Inspect workspace', agentId: 'agent_scout', description: 'Map the project structure and declared checks.' },
    { title: 'Review the project', agentId: 'agent_codex', requireTools: true, description: 'Use the inspection report to review the project. Identify concrete issues and recommend the next change.', mode: 'review' }
  ] },
  build: { name: 'Inspect, build & review', description: 'Give Codex an implementation task, then hand its report to Claude.', steps: [
    { title: 'Inspect workspace', agentId: 'agent_scout', description: 'Map the project structure and declared checks.' },
    { title: 'Implement the goal', agentId: 'agent_codex', requireTools: true, description: 'Implement the requested goal and run appropriate checks. Report the files changed and validation.', mode: 'edit' },
    { title: 'Review the implementation', agentId: 'agent_claude', requireTools: true, description: 'Review the preceding implementation and its report. Read changed files and report defects or missing validation.', mode: 'review' }
  ] },
  operations: { name: 'Operations review', description: 'Collect system health and project context for an AI assessment.', steps: [
    { title: 'Check local system health', agentId: 'agent_pulse', description: 'Collect disk, memory and CPU load measurements.' },
    { title: 'Assess health and next actions', agentId: 'agent_codex', description: 'Review the health report. Explain any concerns and suggest concrete next actions. Do not modify system settings.', mode: 'review', lane: 'operations' }
  ] }
};
function workflowsPage() {
  return `${heading('ONE GOAL, A CLEAR SEQUENCE', 'Workflows', 'Pass each step’s report to the next agent. AI steps request approval when their turn arrives.', button('New workflow', 'new-workflow', 'plus', 'primary'))}
  <div class="recipe-grid">${Object.entries(workflowRecipes).map(([key, recipe]) => `<article class="panel recipe-card"><span class="routine-icon">${icon(key === 'operations' ? 'monitor' : 'link')}</span><h3>${e(recipe.name)}</h3><p>${e(recipe.description)}</p><button class="text-button" data-action="workflow-recipe" data-recipe="${key}">Use recipe ${icon('arrow')}</button></article>`).join('')}</div>
  ${state.workflows.length ? `<div class="workflow-list">${state.workflows.map(w => `<article class="panel workflow-card"><div class="panel-heading"><div><h2>${e(w.title)}</h2><p>${e(project(w.projectId)?.name)} · ${w.completedSteps} of ${w.taskIds.length} steps complete</p></div>${badge(w.status)}${w.status !== 'done' ? `<button class="button subtle" data-action="workflow-toggle" data-id="${w.id}">${icon(w.enabled ? 'pause' : 'play')}${w.enabled ? 'Pause' : 'Resume'}</button>` : ''}</div>${w.error ? `<div class="workflow-error">${e(w.error)}. Resolve the issue, then pause and resume this workflow to retry.</div>` : ''}<ol class="workflow-steps">${w.taskIds.map((id, index) => { const t = state.tasks.find(t => t.id === id); return `<li><button data-task="${t.id}"><span class="step-number ${t.status === 'done' ? 'complete' : ''}">${t.status === 'done' ? icon('check') : index + 1}</span><div><strong>${e(t.title)}</strong><small>${e(agent(t.agentId)?.name)} · ${e(t.waitReason || (t.status === 'done' ? 'Report handed to the next step' : statusLabels[t.status]))}</small></div>${badge(t.status)}${icon('chevron')}</button></li>`; }).join('')}</ol></article>`).join('')}</div>` : `<div class="info-strip">${icon('link')}<span>Start with a recipe or customize up to eight steps. A failed or cancelled step holds the rest of the workflow until you retry it. Pausing holds future steps and leaves active work running.</span></div>`}`;
}
function workflowStep(step = {}) {
  return `<fieldset class="workflow-step-form" data-step-lane="${e(step.lane || (agent(step.agentId)?.kind === 'health' ? 'operations' : 'coding'))}"><legend>Workflow step</legend><div class="form-row"><label>Step name<input name="stepTitle" required maxlength="160" value="${e(step.title || '')}" placeholder="What should this step do?"></label><label>Agent<select name="stepAgent">${options(state.agents.filter(a => a.enabled), step.agentId || 'agent_codex')}</select></label></div><label>Instructions<textarea name="stepDescription" rows="2">${e(step.description || '')}</textarea></label><label class="checkbox-label"><input type="checkbox" name="stepRequireTools" ${step.requireTools ? 'checked' : ''}>Require recorded tool activity from an AI agent</label><p class="route-form-help">A report without tool activity will hold the workflow. Review its accuracy separately.</p><div class="form-row"><label>Access<select name="stepMode"><option value="review">Review</option><option value="edit" ${step.mode === 'edit' ? 'selected' : ''}>Edit project files</option></select></label><button type="button" class="text-button remove-step" data-action="workflow-remove-step">${icon('close')}Remove step</button></div></fieldset>`;
}
function workflowForm(recipeId = 'review') {
  const recipe = workflowRecipes[recipeId] || workflowRecipes.review;
  openDialog('Create a workflow', `<form id="workflow-form"><div class="form-content"><label>Workflow name<input name="title" required maxlength="160" value="${e(recipe.name)}" autofocus></label><label>Goal and shared context<textarea name="goal" rows="3" placeholder="Describe the outcome. This context is included in every step’s instructions."></textarea></label><label>Project<select name="projectId">${options(state.projects, state.projects.find(p => p.available)?.id)}</select></label>${routingFields({ provider: state.routing.defaultModel ? 'omniroute' : 'direct' })}<div id="workflow-step-list">${recipe.steps.map(workflowStep).join('')}</div><button type="button" class="button subtle wide" data-action="workflow-add-step">${icon('plus')}Add a step</button><p class="route-form-help">Steps run in order. Each step receives the preceding step’s latest report. Local checks keep their fixed scope.</p><label class="checkbox-label"><input name="startNow" type="checkbox" checked>Start the first step after creating</label></div><div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Create workflow ${icon('arrow')}</button></div></form>`, true);
}
function routinesPage() {
  return `${heading('A RHYTHM FOR REPEAT WORK', 'Routines', 'Schedule checks and AI tasks. Keep the local server running for scheduled work.', button('New routine', 'new-routine', 'plus', 'primary'))}
  ${state.routines.length ? `<div class="routine-grid">${state.routines.map(r => `<article class="panel routine-card"><div class="routine-top"><span class="routine-icon">${icon('routine')}</span><button class="switch ${r.enabled ? 'on' : ''}" role="switch" aria-checked="${r.enabled}" aria-label="${r.enabled ? 'Pause' : 'Enable'} ${e(r.title)}" data-action="routine-toggle" data-id="${r.id}"><span></span></button></div><h3>${e(r.title)}</h3><p>${e(r.description || 'A recurring task for your team.')}</p><div class="routine-meta"><span>${icon('clock')}Every ${r.intervalMinutes < 60 ? `${r.intervalMinutes} min` : `${+(r.intervalMinutes / 60).toFixed(1)} hours`}</span><span>${avatar(agent(r.agentId), true)}${e(agent(r.agentId)?.name)}</span></div>${r.routing?.provider === 'omniroute' ? `<div class="routine-route">${icon('link')}<code>${e(r.routing.model)}</code></div>` : ''}<div class="routine-next"><span>${r.enabled ? 'Next run' : 'Schedule paused'}</span><strong>${r.enabled ? date(r.nextRunAt) : '—'}</strong></div>${(() => { const latest = state.tasks.find(t => t.routineId === r.id); return latest ? `<button class="routine-latest" data-task="${latest.id}"><span>Latest run</span>${badge(latest.status)}${icon('chevron')}</button>` : ''; })()}<div class="routine-actions"><button class="text-button" data-action="routine-edit" data-id="${r.id}">Edit routine</button><button class="button subtle" data-action="routine-run" data-id="${r.id}">${icon('play')}Run now</button></div></article>`).join('')}</div>` : `<section class="panel">${empty('Good habits, on a schedule.', 'Check disk space hourly, inspect a project daily, or queue a recurring AI review.', button('Create your first routine', 'new-routine', 'plus', 'primary'), 'routine')}</section>`}
  <div class="info-strip">${icon('clock')}<span>Schedules use elapsed intervals. After downtime, an overdue routine runs once. An unfinished run prevents duplicates.</span></div>`;
}
function artifactsPage() {
  return `${heading('THE WORK, ALL IN ONE PLACE', 'Artifacts', 'Reports and final responses, linked to the tasks that produced them.')}
  ${state.artifacts.length ? `<div class="artifact-grid">${state.artifacts.map(a => { const t = state.tasks.find(t => t.id === a.taskId); return `<article class="panel artifact-card"><div class="artifact-icon">${icon('file')}</div><span class="file-type">MARKDOWN</span><h3>${e(a.name)}</h3><p>${e(a.content.replace(/^#+\s*/gm, '').slice(0, 130))}…</p><div class="artifact-meta">${avatar(agent(a.agentId), true)}${e(agent(a.agentId)?.name)}<span>${ago(a.createdAt)}</span></div><div class="artifact-actions"><button class="text-button" data-task="${a.taskId}">View ${t ? taskName(t) : 'task'} ${icon('arrow')}</button><a class="icon-button" aria-label="Download ${e(a.name)}" href="/api/artifacts/${a.id}">${icon('down')}</a></div></article>`; }).join('')}</div>` : `<section class="panel">${empty('Something to show for the work.', 'Completed checks and AI tasks save their reports here. Run a workspace inspection to create your first artifact.', button('Inspect workspace', 'quick-scout', 'search', 'subtle'), 'file')}</section>`}`;
}
function activityList(events) {
  return `<div class="activity-list">${events.map(item => `<${item.taskId ? 'button' : 'div'} class="activity-item" ${item.taskId ? `data-task="${item.taskId}"` : ''}><span class="event-icon ${e(item.type)}">${icon(item.type === 'success' ? 'check' : item.type === 'warning' ? 'shield' : item.type === 'error' ? 'close' : 'activity')}</span><div><p>${e(item.message)}</p><time>${ago(item.at)}</time></div></${item.taskId ? 'button' : 'div'}>`).join('')}</div>`;
}
function activityPage() {
  return `${heading('A RECORD YOU CAN FOLLOW', 'Activity', 'Task changes, decisions, and completed work in one timeline.')}<section class="panel full-activity">${state.events.length ? activityList(state.events) : empty('Your story starts here.', 'Task activity appears here as you use your workspace.', '', 'activity')}</section>`;
}
function projectsPage() {
  return `${heading('CONTEXT FOR YOUR AGENTS', 'Projects', 'Connect local folders. Each task runs inside its assigned project.', button('Connect folder', 'new-project', 'folder', 'primary'))}
  <div class="project-grid">${state.projects.map(p => `<article class="panel project-card"><span class="project-icon">${icon('folder')}</span><h3>${e(p.name)}</h3><p>${e(p.description || 'Local project workspace')}</p><code>${e(p.path)}</code>${!p.available ? '<div class="folder-missing">Folder unavailable. Update its location to continue.</div>' : ''}<div class="project-card-bottom"><button class="text-button" data-action="project-edit" data-id="${p.id}">${p.available ? 'Edit project' : 'Reconnect folder'}</button><button class="text-button" data-action="project-task" data-id="${p.id}" ${p.available ? '' : 'disabled'}>Create task ${icon('arrow')}</button></div></article>`).join('')}</div>`;
}

const providerDetails = {
  'kilo-free': ['Kilo Free', 'Configured free model routes', 'Cloud'],
  'ovh-free': ['OVHcloud Anonymous', 'Anonymous access with provider rate limits', 'Cloud'],
  'horde-free': ['AI Horde', 'Community workers · best for text demos', 'Community'],
  'ollama-local': ['Ollama', 'Runs on this machine', 'Local'],
  combos: ['Model combinations', 'Fallback and routing rules managed in OmniRoute', 'Routing']
};
function modelProvider(model) { return model.includes('/') ? model.split('/')[0] : 'combos'; }
function providerCards() {
  const groups = new Map();
  for (const model of state.routing.models) { const key = modelProvider(model); groups.set(key, [...(groups.get(key) || []), model]); }
  return [...groups].map(([prefix, models]) => {
    const [name, description, kind] = providerDetails[prefix] || [prefix, 'Models discovered from your gateway', 'Provider'];
    return `<button class="panel provider-card ${providerFilter === prefix ? 'selected' : ''}" data-action="provider-filter" data-prefix="${e(prefix)}" aria-pressed="${providerFilter === prefix}"><span class="provider-kind">${e(kind)}</span><strong>${e(name)}</strong><span class="provider-count">${models.length}<small>${models.length === 1 ? 'entry' : 'entries'}</small></span><p>${e(description)}</p></button>`;
  }).join('');
}
function filterModels() {
  let visible = 0;
  for (const row of document.querySelectorAll('[data-model-id]')) {
    row.hidden = !row.dataset.modelId.toLowerCase().includes(modelQuery.toLowerCase()) || !!providerFilter && modelProvider(row.dataset.modelId) !== providerFilter;
    if (!row.hidden) visible++;
  }
  const count = $('#catalog-visible'); if (count) count.textContent = `${visible} shown`;
  const noMatches = $('#catalog-no-matches'); if (noMatches) noMatches.hidden = visible > 0;
}
function routingPage() {
  const r = state.routing;
  const dashboard = r.baseUrl.replace(/\/v1$/, '');
  return `${heading('ONE GATEWAY, YOUR CHOICE OF MODELS', 'Model routing', 'Connect OmniRoute, then choose a model for each coding or operations task.', `<a class="button" href="${e(dashboard)}" target="_blank" rel="noopener noreferrer">${icon('link')}Open OmniRoute</a>`)}
    <div class="routing-flow"><div>${icon('tasks')}<span>Ultharness task</span></div>${icon('arrow')}<div>${icon('terminal')}<span>Codex or Claude</span></div>${icon('arrow')}<div class="flow-accent">${icon('link')}<span>OmniRoute</span></div>${icon('arrow')}<div>${icon('code')}<span>Your chosen model</span></div></div>
    ${r.models.length ? `<div class="provider-grid">${providerCards()}</div><div class="catalog-controls"><span>Catalog access does not verify model availability or remaining quota.</span><button class="text-button" data-action="provider-filter" data-prefix="">Show all providers</button></div>` : ''}
    ${r.defaultModel ? `<div class="default-route panel"><span class="routine-icon">${icon('link')}</span><div><small>DEFAULT MODEL OR COMBO</small><strong>${e(r.defaultModel)}</strong><p>Try a short response through your coding agent and save the result as a task report.</p></div><button class="button primary" data-action="model-demo" data-model="${e(r.defaultModel)}">${icon('play')}Create demo task</button></div>` : ''}
    <div class="routing-layout"><section class="panel routing-settings"><div class="panel-heading"><h2>OmniRoute connection</h2><span class="badge ${r.status === 'connected' ? 'done' : r.status === 'error' ? 'failed' : 'queued'}"><span class="dot"></span>${r.status === 'connected' ? 'Last check passed' : r.status === 'error' ? 'Needs attention' : 'Not tested'}</span></div>
      <form id="routing-form"><div class="form-content"><label>Gateway base URL<input name="baseUrl" type="url" required value="${e(r.baseUrl)}" placeholder="http://127.0.0.1:20128/v1"><small>A local HTTP endpoint or a remote HTTPS endpoint. The /v1 suffix is added automatically.</small></label>
      <label>Default model or combo <span class="optional">optional</span><input name="defaultModel" list="routing-default-models" maxlength="200" value="${e(r.defaultModel)}" placeholder="Choose from the catalog or enter an exact ID"><datalist id="routing-default-models">${r.models.map(model => `<option value="${e(model)}"></option>`).join('')}</datalist><small>Used when a task selects OmniRoute without its own model ID.</small></label>
      <label>Gateway API key <span class="optional">optional</span><input name="apiKey" type="password" autocomplete="new-password" placeholder="${r.keyConfigured ? 'A key is configured; leave blank to keep it' : 'Only if your gateway requires authentication'}"><small>New keys stay in this server session. For restarts, set OMNIROUTE_API_KEY in your local .env file.</small></label>
      ${r.keyConfigured ? '<label class="checkbox-label"><input type="checkbox" name="clearKey">Remove the configured session key</label>' : ''}
      ${r.error ? `<div class="error-box">${icon('close')}<span>${e(r.error)}</span></div>` : ''}
      <div class="routing-check-meta">${r.checkedAt ? `Last checked ${date(r.checkedAt)}` : 'A connection test reads the model catalog; it does not generate text.'}</div></div>
      <div class="dialog-footer"><button class="button" type="submit" value="save">Save settings</button><button class="button primary" type="submit" value="test">${icon('link')}Save & test connection</button></div></form></section>
    <section class="panel routing-catalog"><div class="panel-heading"><h2>Model catalog <span class="count-label">${r.models.length}</span></h2><span id="catalog-visible" class="muted"></span></div>${r.models.length ? `<label class="search-field catalog-search">${icon('search')}<input id="model-search" type="search" value="${e(modelQuery)}" placeholder="Find a model or combo…" aria-label="Filter model catalog"></label><div class="model-catalog">${r.models.map(model => `<div class="model-row" data-model-id="${e(model)}"><code>${e(model)}</code><div class="model-actions"><button class="text-button" data-action="model-demo" data-model="${e(model)}">Try model</button><button class="${model === r.defaultModel ? 'model-selected' : 'text-button'}" ${model === r.defaultModel ? 'disabled' : ''} data-action="routing-model" data-model="${e(model)}">${model === r.defaultModel ? `${icon('check')}Default` : 'Use default'}</button></div></div>`).join('')}<p id="catalog-no-matches" class="tab-empty" hidden>No matching models. Clear the search or show all providers.</p></div>` : empty('Bring your models into the workspace.', 'Start OmniRoute, connect your providers there, then test the connection to load its model catalog.', '', 'link')}</section></div>
    <div class="info-strip">${icon('shield')}<span>Each AI task still requires approval. Its approval screen shows the gateway and model. Provider credentials and fallback policies are managed in OmniRoute.</span></div>`;
}

function routingFields(routing = { provider: 'direct' }) {
  return `<div data-routing-fields><div class="form-row"><label>Model route<select name="route"><option value="direct" ${routing.provider !== 'omniroute' ? 'selected' : ''}>CLI default</option><option value="omniroute" ${routing.provider === 'omniroute' ? 'selected' : ''}>OmniRoute</option></select></label><label data-model-field ${routing.provider === 'omniroute' ? '' : 'hidden'}>Model or combo<input name="model" list="task-route-models" maxlength="200" value="${e(routing.model || state.routing.defaultModel)}" placeholder="Exact model ID"><datalist id="task-route-models">${state.routing.models.map(model => `<option value="${e(model)}"></option>`).join('')}</datalist></label></div><p class="route-form-help">OmniRoute routes the model requests. Your selected agent still handles tools and workspace access.</p></div>`;
}
function syncRoutingFields(form) {
  if (!form?.elements.agentId) return;
  const fields = $('[data-routing-fields]', form);
  if (!fields) return;
  fields.hidden = isNative(agent(form.elements.agentId.value));
  for (const field of $$('[data-tool-requirement], [data-tool-requirement-help]', form)) field.hidden = fields.hidden;
  $('[data-model-field]', form).hidden = form.elements.route.value !== 'omniroute';
}

function openDialog(title, content, wide = false) {
  closeDialog();
  $('#overlay').innerHTML = `<dialog class="dialog ${wide ? 'detail-dialog' : ''}"><div class="dialog-heading"><h2>${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div><div id="dialog-content">${content}</div></dialog>`;
  const dialog = $('dialog'); dialog.showModal();
  dialog.addEventListener('cancel', () => { modalTaskId = null; });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
}
function closeDialog() { modalTaskId = null; $('dialog')?.close(); $('#overlay').innerHTML = ''; }
function options(items, selected, label = 'name') { return items.map(item => `<option value="${e(item.id)}" ${item.id === selected ? 'selected' : ''}>${e(item[label])}${item.available === false ? ' (not installed)' : ''}</option>`).join(''); }
function taskForm({ agentId = 'agent_scout', projectId = state.projects.find(p => p.available)?.id || state.projects[0]?.id, parentId = '', routine = false, routineId = '', title = '', description = '', taskLane, routing, requireTools = false } = {}) {
  const saved = routineId ? state.routines.find(r => r.id === routineId) : null;
  if (saved) { ({ agentId, projectId, title, description, routing, requireTools } = saved); taskLane = saved.lane; routine = true; }
  const a = agent(agentId);
  const parent = state.tasks.find(t => t.id === parentId);
  const content = `<form id="${routine ? 'routine-form' : 'task-form'}" data-id="${e(routineId)}"><div class="form-content">
    <label>${routine ? 'Routine' : 'Task'} name<input name="title" required maxlength="160" placeholder="What would you like to get done?" value="${e(title)}" autofocus></label>
    <label>Instructions<textarea name="description" rows="4" placeholder="Describe the goal, context, and what a good result looks like…">${e(description)}</textarea></label>
    <div class="form-row"><label>Assign to<select name="agentId">${options(state.agents.filter(a => a.enabled), agentId)}</select></label><label>Project<select name="projectId">${options(state.projects, projectId)}</select></label></div>
    <div class="form-row"><label>Workstream<select name="lane"><option value="coding" ${(taskLane || (a?.kind === 'health' ? 'operations' : 'coding')) === 'coding' ? 'selected' : ''}>Coding</option><option value="operations" ${(taskLane || (a?.kind === 'health' ? 'operations' : 'coding')) === 'operations' ? 'selected' : ''}>Operations</option></select></label><label>${routine ? 'Repeat every (minutes)' : 'Priority'}${routine ? `<input name="intervalMinutes" type="number" min="1" max="43200" step="1" required value="${saved?.intervalMinutes || 60}" list="routine-intervals"><datalist id="routine-intervals"><option value="60">Hourly</option><option value="360">Every 6 hours</option><option value="1440">Daily</option><option value="10080">Weekly</option></datalist><small>1 minute to 30 days. Changing the interval starts a new countdown.</small>` : '<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select>'}</label></div>
    <label>AI access mode<select name="mode"><option value="review">Review — analysis without file edits</option><option value="edit">Edit — allow changes in the project</option></select><small>Applies to CLI agents. Built-in checks always read only.</small></label>
    <label class="checkbox-label" data-tool-requirement><input type="checkbox" name="requireTools" ${requireTools ? 'checked' : ''}>Require recorded tool activity</label><p class="route-form-help" data-tool-requirement-help>Fail this AI run if it responds without using tools. This does not verify report accuracy.</p>
    ${routingFields(routing)}
    ${parent ? `<div class="form-note">${icon('link')}Follow-up to ${taskName(parent)}: ${e(parent.title)}<input type="hidden" name="parentId" value="${e(parentId)}"></div>` : ''}
    ${!routine && state.tasks.length ? `<label>Depends on <span class="optional">optional</span><select name="dependsOnId"><option value="">No dependency</option>${options(state.tasks.map(t => ({ id: t.id, name: `${taskName(t)} · ${t.title}` })), '')}</select></label>` : ''}
    <div class="form-note">${icon('shield')} ${routine ? 'Local checks run on schedule. AI routines create a task for your approval each time.' : 'AI runs require your approval. CLI defaults use your CLI account; routed runs use the gateway’s providers.'}</div>
    ${routine ? '' : '<label class="checkbox-label"><input type="checkbox" name="runNow" checked>Submit immediately after creating</label>'}
    </div><div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${icon(saved ? 'check' : 'plus')}${saved ? 'Save routine' : routine ? 'Create routine' : 'Create task'}</button></div></form>`;
  openDialog(saved ? 'Edit routine' : routine ? 'Create a routine' : parent ? 'Create a follow-up task' : 'Create a task', content);
  if (saved) $('#routine-form').elements.mode.value = saved.mode;
  syncRoutingFields($('form', $('#dialog-content')));
}
function projectForm(projectId) {
  const p = projectId ? project(projectId) : null;
  openDialog(p ? 'Edit project' : 'Connect a project', `<form id="project-form" data-id="${e(projectId || '')}"><div class="form-content"><label>Project name<input name="name" value="${e(p?.name)}" placeholder="e.g. Website redesign" required maxlength="80" autofocus></label><label>Local folder path<input name="path" placeholder="/Users/you/Projects/my-project" required value="${e(p?.path || state.server.root)}"><small>The folder must already exist. Changing it resets pending approvals so you can review the new location.</small></label><label>Description<textarea name="description" rows="3" placeholder="What is this project for?">${e(p?.description)}</textarea></label></div><div class="dialog-footer"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${icon('folder')}${p ? 'Save project' : 'Connect folder'}</button></div></form>`);
}
function openTask(taskId) {
  detailTab = 'activity';
  openDialog('Task details', '', true);
  modalTaskId = taskId;
  renderDetail();
}
function renderDetail() {
  const t = state.tasks.find(t => t.id === modalTaskId);
  if (!t || !$('#dialog-content')) return;
  const a = agent(t.agentId);
  const artifacts = state.artifacts.filter(item => item.taskId === t.id);
  const children = state.tasks.filter(item => item.parentId === t.id);
  const commentValue = $('#comment-text')?.value || '';
  const focusedComment = document.activeElement?.id === 'comment-text';
  const oldScroll = $('.log-output')?.scrollTop;
  const content = `<div class="detail-content"><div class="detail-kicker"><span class="mono muted">${taskName(t)}</span>${badge(t.status)}<span class="workstream">${e(t.lane)}</span></div><h2 class="task-detail-title">${e(t.title)}</h2><p class="task-description">${e(t.description || 'No additional instructions.')}</p>
    <div class="detail-meta"><span>${avatar(a, true)}${e(a.name)}</span><span>${icon('folder')}${e(project(t.projectId)?.name)}</span><span>${icon('clock')}${date(t.createdAt)}</span></div>
    <div class="task-scheduling"><label>Priority<select name="taskPriority" data-task-id="${t.id}" ${finished(t) ? 'disabled' : ''}>${['high', 'normal', 'low'].map(p => `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>${t.waitReason ? `<span>${icon('clock')}${e(t.waitReason)}</span>` : ''}${t.workflowId ? '<a class="text-link" href="#workflows" data-action="close-dialog">View workflow</a>' : ''}</div>
    ${!isNative(a) ? `<div class="task-scheduling"><label class="checkbox-label"><input type="checkbox" name="taskRequireTools" data-task-id="${t.id}" ${t.requireTools ? 'checked' : ''} ${!['queued', 'done', 'failed', 'cancelled'].includes(t.status) || t.stopping ? 'disabled' : ''}>Require tool activity for this task’s next run</label>${t.runs ? `<span>${t.toolActivityCount == null ? 'Tool activity was not recorded for this run' : `${t.toolActivityCount} recorded tool actions`}</span>` : ''}</div>` : ''}
    ${(t.routeSnapshot || t.routing)?.provider === 'omniroute' ? `<div class="task-route">${icon('link')}OmniRoute <code>${e((t.routeSnapshot || t.routing).model)}</code><span>${e(t.routeSnapshot?.baseUrl || state.routing.baseUrl)}</span></div>` : ''}
    ${t.error ? `<div class="error-box">${icon('close')}<span>${e(t.error)}</span></div>` : ''}
    ${t.status === 'approval' ? `<div class="approval-box"><div class="approval-title">${icon('shield')}Review this run</div><p><strong>${e(a.name)}</strong> will receive these instructions and run in <code>${e(project(t.projectId)?.path)}</code>.</p><p>${t.mode === 'edit' ? 'This task permits workspace file changes.' : 'This task is configured for review without file edits.'} ${t.routeSnapshot?.provider === 'omniroute' ? 'Model requests go through the OmniRoute endpoint shown above using its configured providers.' : 'Provider usage uses your existing CLI account.'}</p><div class="approval-actions"><button class="button primary" data-action="task-approve" data-id="${t.id}">${icon('check')}Approve & run</button><button class="button" data-action="task-reject" data-id="${t.id}">Decline</button></div></div>` : ''}
    ${t.dependsOnId ? `<button class="dependency" data-task="${t.dependsOnId}">${icon('link')}Depends on ${e(state.tasks.find(item => item.id === t.dependsOnId)?.title)} ${icon('arrow')}</button>` : ''}
    <div class="detail-actions">${['queued', 'failed', 'cancelled', 'done'].includes(t.status) ? `<button class="button ${t.status === 'queued' ? 'primary' : ''}" data-action="task-run" data-id="${t.id}" ${t.stopping ? 'disabled' : ''}>${icon('play')}${t.stopping ? 'Stopping previous run…' : t.status === 'queued' ? 'Run task' : 'Run again'}</button>` : ''}${!finished(t) && t.status !== 'approval' ? `<button class="button danger-text" data-action="task-cancel" data-id="${t.id}">${icon('close')}Cancel task</button>` : ''}<button class="button" data-action="follow-up" data-id="${t.id}">${icon('plus')}Create follow-up</button>${t.costUsd != null ? `<span class="cost">Reported cost: $${Number(t.costUsd).toFixed(4)}</span>` : t.usage ? `<span class="cost">${Number(t.usage.input_tokens || 0).toLocaleString()} input / ${Number(t.usage.output_tokens || 0).toLocaleString()} output tokens</span>` : ''}</div>
    ${children.length ? `<div class="subtasks"><h4>Follow-up tasks</h4>${children.map(child => `<button data-task="${child.id}">${icon('tasks')}<span>${e(child.title)}</span>${badge(child.status)}</button>`).join('')}</div>` : ''}
    <div class="tabs detail-tabs"><button class="tab ${detailTab === 'activity' ? 'active' : ''}" data-detail-tab="activity">${icon('terminal')}Live log <span>${t.logs.length}</span></button><button class="tab ${detailTab === 'output' ? 'active' : ''}" data-detail-tab="output">${icon('file')}Output <span>${artifacts.length}</span></button><button class="tab ${detailTab === 'notes' ? 'active' : ''}" data-detail-tab="notes">Notes <span>${t.comments.length}</span></button></div>
    ${detailTab === 'activity' ? `<div class="log-output">${t.logs.length ? t.logs.map(l => `<div class="log-line ${e(l.channel)}"><time>${new Date(l.at).toLocaleTimeString([], { hour12: false })}</time><pre>${e(l.text)}</pre></div>`).join('') : `<div class="log-empty">${icon('terminal')} ${t.status === 'approval' ? 'Logs will appear after you approve this run.' : 'No output yet. Submit this task to get started.'}</div>`}</div>` : detailTab === 'output' ? (artifacts.length ? artifacts.map(item => `<div class="report-toolbar"><strong>${e(item.name)}</strong><a class="button subtle" href="/api/artifacts/${item.id}">${icon('down')}Download</a></div><pre class="report-output">${e(item.content)}</pre>`).join('') : '<div class="tab-empty">Completed tasks save their report here.</div>') : `<div class="notes-list">${t.comments.map(comment => `<div class="note"><strong>You <time>${date(comment.at)}</time></strong><p>${e(comment.text)}</p></div>`).join('')}</div><form id="comment-form" data-id="${t.id}"><textarea id="comment-text" name="text" required placeholder="Add context, a decision, or a note…" rows="3">${e(commentValue)}</textarea><button class="button subtle" type="submit">Add note ${icon('arrow')}</button></form>`}
    </div>`;
  $('#dialog-content').innerHTML = content;
  if (focusedComment) { $('#comment-text')?.focus(); $('#comment-text')?.setSelectionRange(commentValue.length, commentValue.length); }
  const log = $('.log-output');
  if (log && oldScroll != null) log.scrollTop = oldScroll;
}

document.addEventListener('click', async event => {
  const task = event.target.closest('[data-task]');
  if (task) { openTask(task.dataset.task); return; }
  const laneButton = event.target.closest('[data-lane]');
  if (laneButton) { lane = laneButton.dataset.lane; render(); return; }
  const tab = event.target.closest('[data-detail-tab]');
  if (tab) { detailTab = tab.dataset.detailTab; renderDetail(); return; }
  const trigger = event.target.closest('[data-action]');
  if (!trigger || trigger.disabled) return;
  const action = trigger.dataset.action; const id = trigger.dataset.id;
  try {
    if (action === 'close-dialog') return closeDialog();
    if (action === 'new-task') return taskForm();
    if (action === 'agent-task') return taskForm({ agentId: id });
    if (action === 'project-task') return taskForm({ projectId: id });
    if (action === 'new-routine') return taskForm({ routine: true, agentId: 'agent_pulse', title: 'Hourly system health', description: 'Check local disk space, memory, and system load.' });
    if (action === 'new-project') return projectForm();
    if (action === 'project-edit') return projectForm(id);
    if (action === 'routine-edit') return taskForm({ routineId: id });
    if (action === 'new-workflow' || action === 'workflow-recipe') return workflowForm(trigger.dataset.recipe);
    if (action === 'workflow-add-step') {
      if ($$('#workflow-step-list .workflow-step-form').length >= 8) return toast('A workflow supports up to eight steps.', true);
      $('#workflow-step-list').insertAdjacentHTML('beforeend', workflowStep({ agentId: 'agent_codex', requireTools: true })); return;
    }
    if (action === 'workflow-remove-step') {
      if ($$('#workflow-step-list .workflow-step-form').length <= 2) return toast('Keep at least two steps.', true);
      trigger.closest('fieldset').remove(); return;
    }
    if (action === 'provider-filter') { providerFilter = trigger.dataset.prefix; render(); return; }
    if (action === 'model-demo') {
      const runner = state.agents.find(a => a.kind === 'codex' && a.available && a.enabled) || state.agents.find(a => !isNative(a) && a.available && a.enabled);
      if (!runner) return toast('Install and enable Codex or Claude to run a model demo.', true);
      return taskForm({ agentId: runner.id, title: `Try ${trigger.dataset.model}`.slice(0, 160), description: 'Reply with ULTHARNESS_READY and one short sentence introducing yourself. Do not use tools, read files, or change anything. This is a short model connection demo.', routing: { provider: 'omniroute', model: trigger.dataset.model } });
    }
    if (action === 'follow-up') { const t = state.tasks.find(t => t.id === id); return taskForm({ projectId: t.projectId, agentId: t.agentId, parentId: id, taskLane: t.lane, routing: t.routing, requireTools: t.requireTools }); }
    if (action === 'approvals') {
      const awaiting = state.tasks.filter(t => t.status === 'approval');
      if (awaiting.length) openDialog('Approval inbox', `<div class="approvals-list">${awaiting.map(t => `<button data-task="${t.id}"><span class="event-icon warning">${icon('shield')}</span><div><strong>${e(t.title)}</strong><small>${e(agent(t.agentId)?.name)} · ${e(t.mode)} · ${e(project(t.projectId)?.name)}</small></div>${icon('chevron')}</button>`).join('')}</div>`);
      else toast('No tasks are waiting for approval.');
      return;
    }
    trigger.disabled = true;
    if (action === 'routing-model') { await api('routing', { defaultModel: trigger.dataset.model }); if ($('#routing-form')) $('#routing-form').elements.defaultModel.value = trigger.dataset.model; await refresh(); toast('Default model updated.'); }
    else if (action.startsWith('task-')) { await api(`tasks/${id}/${action.slice(5)}`, {}); await refresh(); }
    else if (action === 'agent-toggle') { await api(`agents/${id}/toggle`, {}); await refresh(); }
    else if (action === 'workflow-toggle') { await api(`workflows/${id}/toggle`, {}); await refresh(); }
    else if (action === 'routine-toggle') { await api(`routines/${id}/toggle`, {}); await refresh(); }
    else if (action === 'routine-run') { const t = await api(`routines/${id}/run`, {}); await refresh(); openTask(t.id); }
    else if (action === 'quick-health' || action === 'quick-scout') {
      const t = await api('tasks', { title: action === 'quick-health' ? 'Check local system health' : 'Inspect workspace', description: action === 'quick-health' ? 'Read local disk, memory, and load metrics.' : 'Map the workspace structure, package scripts, and Git status.', agentId: action === 'quick-health' ? 'agent_pulse' : 'agent_scout', lane: action === 'quick-health' ? 'operations' : 'coding', projectId: state.projects[0].id, runNow: true });
      await refresh(); openTask(t.id);
    }
  } catch (err) { toast(err.message, true); }
  finally { if (trigger.isConnected) trigger.disabled = false; }
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') { query = event.target.value; render(); }
  if (event.target.id === 'model-search') { modelQuery = event.target.value; filterModels(); }
});
document.addEventListener('change', async event => {
  if (['agentId', 'route'].includes(event.target.name)) syncRoutingFields(event.target.form);
  if (event.target.name === 'route' && event.target.form?.id === 'workflow-form') $('[data-model-field]', event.target.form).hidden = event.target.value !== 'omniroute';
  if (event.target.name === 'taskRequireTools') {
    try { await api(`tasks/${event.target.dataset.taskId}/requirements`, { requireTools: event.target.checked }); await refresh(); }
    catch (err) { toast(err.message, true); await refresh(); }
  }
  if (event.target.name === 'taskPriority') {
    try { await api(`tasks/${event.target.dataset.taskId}/priority`, { priority: event.target.value }); await refresh(); }
    catch (err) { toast(err.message, true); await refresh(); }
  }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['task-form', 'routine-form', 'project-form', 'workflow-form', 'comment-form', 'routing-form'].includes(form.id)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const submitButtons = [...form.querySelectorAll('button[type="submit"]')]; submitButtons.forEach(button => button.disabled = true);
  try {
    if (form.id === 'routing-form') {
      await api('routing', { ...values, clearKey: values.clearKey === 'on' });
      // Clear the entered secret before any render or connection error.
      form.elements.apiKey.value = '';
      if (event.submitter?.value === 'test') await api('routing/test', {});
      await refresh(); toast(event.submitter?.value === 'test' ? 'OmniRoute connected. Model catalog loaded.' : 'Routing settings saved.'); return;
    }
    if (form.id === 'comment-form') { await api(`tasks/${form.dataset.id}/comment`, values); $('#comment-text').value = ''; await refresh(); return; }
    let result;
    if (form.id === 'task-form') result = await api('tasks', { ...values, runNow: values.runNow === 'on', requireTools: values.requireTools === 'on' });
    if (form.id === 'routine-form') result = await api(form.dataset.id ? `routines/${form.dataset.id}/update` : 'routines', { ...values, intervalMinutes: Number(values.intervalMinutes), requireTools: values.requireTools === 'on' });
    if (form.id === 'project-form') result = await api(form.dataset.id ? `projects/${form.dataset.id}/update` : 'projects', values);
    if (form.id === 'workflow-form') {
      const steps = $$('#workflow-step-list .workflow-step-form').map(card => ({ title: $('[name="stepTitle"]', card).value, agentId: $('[name="stepAgent"]', card).value, description: `${values.goal ? `Shared goal\n${values.goal}\n\n` : ''}${$('[name="stepDescription"]', card).value}`, mode: $('[name="stepMode"]', card).value, requireTools: $('[name="stepRequireTools"]', card).checked, route: values.route, model: values.model, lane: card.dataset.stepLane }));
      result = await api('workflows', { title: values.title, projectId: values.projectId, startNow: values.startNow === 'on', steps });
    }
    closeDialog(); await refresh();
    if (form.id === 'task-form') openTask(result.id);
    else { navigate(form.id === 'workflow-form' ? 'workflows' : form.id === 'routine-form' ? 'routines' : 'projects'); toast(form.id === 'workflow-form' ? 'Workflow created. Open a step to see its report or review an approval.' : form.id === 'routine-form' ? 'Routine saved.' : 'Project saved.'); }
  } catch (err) { if (form.id === 'routing-form') await refresh(); toast(err.message, true); }
  finally { for (const button of submitButtons) if (button.isConnected) button.disabled = false; }
});
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (nav.some(n => n[0] === next)) { view = next; query = ''; render(); } });
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); navigate('tasks'); $('#search')?.focus(); }
  const row = event.target.closest?.('tr[data-task]');
  if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openTask(row.dataset.task); }
});

try {
  state = await api('state'); render();
  const stream = new EventSource('/api/events');
  stream.onmessage = () => { connected = true; if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 150); };
  stream.onerror = () => { connected = false; render(); };
  stream.onopen = () => { connected = true; refresh(); };
} catch (err) {
  $('#app').innerHTML = `<div class="connection-error"><h1>Couldn’t reach your workspace.</h1><p>${e(err.message)}</p><p>Start the local server with <code>npm start</code>, then reload this page.</p></div>`;
}
