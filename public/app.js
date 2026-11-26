const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const glyphs = {
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  branch: 'M6 3v12a4 4 0 0 0 4 4h4 M6 9h8a4 4 0 0 0 4-4 M9 3a3 3 0 1 1-6 0 M21 3a3 3 0 1 1-6 0 M21 19a3 3 0 1 1-6 0',
  database: 'M20 6c0 2-3.6 3-8 3S4 8 4 6s3.6-3 8-3 8 1 8 3z M4 6v12c0 2 3.6 3 8 3s8-1 8-3V6 M4 12c0 2 3.6 3 8 3s8-1 8-3',
  design: 'M8 3h8v6H8z M8 9h8v6H8z M8 15h4v6H8z M12 9h7v6h-7',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18',
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
const newt = window.webkit?.messageHandlers?.newt;
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
let deliveryFilter = 'all';
let liveDeliveryId = sessionStorage.getItem('uh-live-delivery') || '';
let mobileMenuOpen = false;
const compactNavigation = window.matchMedia('(max-width: 860px)');
compactNavigation.addEventListener('change', () => { mobileMenuOpen = false; if (state) render(); });
const nav = [['overview', 'grid', 'Overview'], ['live', 'activity', 'Live workspace'], ['deliveries', 'shield', 'Client deliveries'], ['tasks', 'tasks', 'Tasks'], ['workflows', 'link', 'Workflows'], ['team', 'team', 'Team'], ['routines', 'routine', 'Routines'], ['artifacts', 'file', 'Artifacts'], ['activity', 'activity', 'Activity'], ['projects', 'folder', 'Projects'], ['connections', 'link', 'Connections'], ['routing', 'code', 'Model routing']];
if (!nav.some(([key]) => key === view)) view = 'overview';
const agent = id => state.agents.find(a => a.id === id);
const project = id => state.projects.find(p => p.id === id);
const taskName = t => `UH-${String(t.number).padStart(3, '0')}`;
const isNative = a => ['workspace', 'health', 'verification'].includes(a.kind);
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
function navigate(next) { mobileMenuOpen = false; view = next; query = ''; location.hash = next; render(); window.scrollTo(0, 0); }

let lastNewtProgress = '';
function render() {
  if (newt) {
    const mission = state.deliveries.find(d => d.mission && d.id === liveDeliveryId) || state.deliveries.find(d => d.mission);
    if (mission && lastNewtProgress !== mission.id + mission.status) {
      lastNewtProgress = mission.id + mission.status;
      newt.postMessage({id: mission.id, title: mission.title, status: mission.status});
    }
  }
  const liveLog = $('.mission-log');
  const logPosition = liveLog ? { top: liveLog.scrollTop, follow: liveLog.scrollHeight - liveLog.scrollTop - liveLog.clientHeight < 60 } : null;
  const expandedDetails = $$('main details[data-preserve-key][open]').map(el => el.dataset.preserveKey);
  const routingFocus = document.activeElement?.closest('#routing-form') && document.activeElement?.tagName === 'INPUT' ? document.activeElement.name : null;
  const routingDraft = $('#routing-form') ? Object.fromEntries(new FormData($('#routing-form'))) : null;
  const approvals = state.tasks.filter(t => t.status === 'approval');
  const running = state.tasks.filter(t => t.status === 'running');
  const current = nav.find(n => n[0] === view) || nav[0];
  const searchFocused = document.activeElement?.id === 'search';
  $('#app').innerHTML = `<a class="skip-link" href="#main-content">Skip to content</a>
  ${sidebar()}
  <div class="shell"><header class="topbar"><div class="topbar-start"><button class="icon-button mobile-menu-toggle" data-action="toggle-menu" aria-label="${mobileMenuOpen ? 'Close navigation' : 'Open navigation'}" aria-expanded="${mobileMenuOpen}" aria-controls="workspace-navigation">${icon(mobileMenuOpen ? 'close' : 'menu')}</button><div class="breadcrumbs">Workspace ${icon('chevron')} <span>${current[2]}</span></div></div><div class="topbar-right"><button class="workspace-search" data-action="open-search" aria-label="Search workspace">${icon('search')}<span>Search workspace</span><kbd>⌘ K</kbd></button><span class="connection ${connected ? '' : 'offline'}"><span class="dot"></span>${connected ? 'Local server online' : 'Reconnecting…'}</span><button class="icon-button notification ${approvals.length ? 'has-notification' : ''}" data-action="approvals" aria-label="View approvals">${icon('bell')}${approvals.length ? `<b>${approvals.length}</b>` : ''}</button><span class="top-avatar" title="Workspace owner">Y</span></div></header>
  <main id="main-content" tabindex="-1"><div class="page-content" data-view="${e(view)}">${view === 'overview' ? overview(approvals, running) : view === 'live' ? livePage() : view === 'deliveries' ? deliveriesPage() : view === 'connections' ? connectionsPage() : view === 'tasks' ? tasksPage() : view === 'workflows' ? workflowsPage() : view === 'team' ? teamPage() : view === 'routines' ? routinesPage() : view === 'artifacts' ? artifactsPage() : view === 'activity' ? activityPage() : view === 'routing' ? routingPage() : projectsPage()}</div><footer><span><span class="tiny-brand">uh</span> Your ideas. Your agents. Your workspace.</span><span><span class="dot"></span>LOCAL WORKSPACE <span class="mono">v${e(state.server.version)}</span></span></footer></main></div>`;
  document.body.classList.toggle('menu-open', mobileMenuOpen);
  $('.sidebar').inert = compactNavigation.matches && !mobileMenuOpen;
  $('.shell').inert = compactNavigation.matches && mobileMenuOpen;
  if (searchFocused) { const field = $('#search'); field?.focus(); field?.setSelectionRange(query.length, query.length); }
  if (routingDraft && $('#routing-form')) {
    for (const [name, value] of Object.entries(routingDraft)) { const field = $('#routing-form').elements.namedItem(name); if (field) { if (field.type === 'checkbox') field.checked = value === 'on'; else field.value = value; } }
    if (routingFocus) $('#routing-form').elements.namedItem(routingFocus)?.focus();
  }
  for (const key of expandedDetails) $$('main details[data-preserve-key]').find(el => el.dataset.preserveKey === key)?.setAttribute('open', '');
  if (view === 'routing') filterModels();
  const updatedLog = $('.mission-log'); if (updatedLog) updatedLog.scrollTop = !logPosition || logPosition.follow ? updatedLog.scrollHeight : logPosition.top;
}

function sidebar() {
  const groups = [ ['WORKSPACE', ['overview', 'live', 'deliveries', 'tasks', 'workflows']], ['RESOURCES', ['team', 'projects', 'artifacts']], ['SETUP & OPERATIONS', ['connections', 'routing', 'routines', 'activity']] ];
  const navCount = key => key === 'tasks' ? state.tasks.filter(t => !finished(t)).length : key === 'deliveries' ? state.deliveries.filter(d => !['accepted', 'draft'].includes(d.status)).length : 0;
  return `<aside class="sidebar ${mobileMenuOpen ? 'is-open' : ''}" id="workspace-navigation"><a class="brand" href="#overview" aria-label="Ultharness home"><span class="brand-mark">u<span>h</span></span><span class="brand-word">ultharness<small>YOUR AGENT WORKSPACE</small></span></a><button class="icon-button sidebar-close" data-action="toggle-menu" aria-label="Close navigation">${icon('close')}</button><div class="workspace-switch"><span class="workspace-icon">${icon('grid')}</span><div>Personal workspace<small><span class="dot"></span> Local environment</small></div><span class="workspace-key">01</span></div><nav aria-label="Main navigation">${groups.map(([title, keys]) => `<div class="nav-label">${title}</div>${keys.map(key => { const [, symbol, label] = nav.find(n => n[0] === key), count = navCount(key); return `<a href="#${key}" class="nav-item ${view === key ? 'selected' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</a>`; }).join('')}`).join('')}</nav><div class="sidebar-bottom"><div class="local-note">${icon('shield')}<div>Made to stay local<small>Your work, on your machine.</small></div></div><div class="profile"><span class="profile-avatar">Y</span><div>Your workspace<small>Personal account</small></div><span class="profile-dot"></span></div></div></aside>${mobileMenuOpen ? '<button class="sidebar-backdrop" data-action="toggle-menu" aria-label="Close navigation"></button>' : ''}`;
}
function openSearch() {
  mobileMenuOpen = false; render();
  openDialog('Search workspace', `<div class="command-input">${icon('search')}<input id="command-search" type="search" placeholder="Find a page, task, or client delivery…" autocomplete="off" aria-label="Find pages, tasks and deliveries" autofocus><kbd>ESC</kbd></div><div id="command-results"></div><div class="command-footer">${icon('arrow')}Select a result to open it<span>↑ ↓ to navigate · Enter to open</span></div>`);
  $('dialog').classList.add('command-dialog'); renderSearch('');
}
function renderSearch(value) {
  const q = value.trim().toLowerCase();
  const pages = nav.filter(([, , label]) => label.toLowerCase().includes(q)).slice(0, q ? 6 : 5);
  const tasks = q ? state.tasks.filter(t => `${t.title} ${taskName(t)}`.toLowerCase().includes(q)).slice(0, 5) : [];
  const deliveries = q ? state.deliveries.filter(d => `${d.title} ${d.client}`.toLowerCase().includes(q)).slice(0, 5) : [];
  $('#command-results').innerHTML = `${pages.length ? `<div class="command-label">PAGES</div>${pages.map(([key, symbol, label]) => `<button class="command-result" data-action="search-navigate" data-view="${key}">${icon(symbol)}<span>${e(label)}</span>${icon('chevron')}</button>`).join('')}` : ''}${deliveries.length ? `<div class="command-label">CLIENT DELIVERIES</div>${deliveries.map(d => `<button class="command-result" data-action="open-delivery" data-id="${d.id}">${icon('shield')}<span>${e(d.title)}<small>${e(d.client || 'Client project')}</small></span>${deliveryBadge(d)}</button>`).join('')}` : ''}${tasks.length ? `<div class="command-label">TASKS</div>${tasks.map(t => `<button class="command-result" data-task="${t.id}">${icon('tasks')}<span>${e(t.title)}<small>${taskName(t)}</small></span>${badge(t.status)}</button>`).join('')}` : ''}${!pages.length && !tasks.length && !deliveries.length ? '<div class="command-empty">No matches. Try a page name, client, or task number.</div>' : ''}`;
}

function heading(eyebrow, title, description, actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function overview(approvals, running) {
  const deliveries = state.deliveries || [];
  const active = deliveries.filter(d => ['planning', 'building', 'checking', 'reviewing'].includes(d.status));
  const waiting = deliveries.filter(d => ['blocked', 'awaiting_acceptance'].includes(d.status));
  const accepted = deliveries.filter(d => d.status === 'accepted');
  const team = state.agents.filter(a => !a.internal);
  return `${heading('WORKSPACE OVERVIEW', 'Good work starts here<span class="accent">.</span>', 'A clear view of your projects, your agents, and what comes next.', (newt ? button('Talk with Newt', 'open-newt', 'spark', 'subtle') : '') + button('New task', 'new-task', 'plus', 'subtle') + button('Start with an aim', 'new-mission', 'spark', 'primary'))}
  <div class="summary-grid">
    <div class="summary-card"><div class="summary-label">Active deliveries <span class="stat-icon">${icon('folder')}</span></div><div class="summary-value">${active.length}<span>in progress</span></div><div class="summary-caption"><span class="dot lime-dot"></span>${deliveries.length} ${deliveries.length === 1 ? 'client brief' : 'client briefs'} in your workspace</div></div>
    <div class="summary-card"><div class="summary-label">Agents working <span class="stat-icon">${icon('team')}</span></div><div class="summary-value">${running.length}<span>running now</span></div><div class="summary-caption">${team.filter(a => a.available && a.enabled).length} of ${team.length} team members available</div></div>
    <div class="summary-card"><div class="summary-label">Needs attention <span class="stat-icon amber">${icon('shield')}</span></div><div class="summary-value ${approvals.length + waiting.length ? 'amber-text' : ''}">${approvals.length + waiting.length}<span>to review</span></div><div class="summary-caption">${approvals.length} task approvals · ${waiting.length} delivery reviews</div></div>
    <div class="summary-card"><div class="summary-label">Accepted deliveries <span class="stat-icon">${icon('check')}</span></div><div class="summary-value">${accepted.length}<span>accepted by you</span></div><div class="summary-caption">${state.tasks.filter(t => t.status === 'done').length} completed tasks across your workspace</div></div>
  </div>
  ${approvals.length ? `<div class="attention-banner">${icon('shield')}<div><strong>Your team is ready for the next step</strong><span>${approvals.length} ${approvals.length === 1 ? 'task is' : 'tasks are'} waiting for your approval.</span></div><button class="text-button" data-action="approvals">Review approvals ${icon('arrow')}</button></div>` : ''}
  ${state.projects.some(p => !p.available) ? `<div class="attention-banner">${icon('folder')}<div><strong>A project folder needs reconnecting</strong><span>Update its location to keep work moving.</span></div><a class="text-link" href="#projects">Open projects ${icon('arrow')}</a></div>` : ''}
  <section class="launch-panel"><div class="launch-copy"><div class="eyebrow"><span class="dot"></span> FROM IDEA TO DELIVERY</div><h2>A great brief.<br>A better way to build<span class="accent">.</span></h2><p>Give your agents the full picture. Build, check, and refine against your requirements, with the final word always yours.</p><div class="launch-actions"><button class="button primary" data-action="new-mission">Start with your aim ${icon('arrow')}</button><button class="text-button" data-action="delivery-example">Explore a sample brief</button></div></div><div class="launch-diagram" aria-label="Delivery process: your brief, agent build, verification, then your acceptance"><div class="diagram-label"><span>ONE BRIEF. A COMPLETE WORKFLOW.</span>${icon('link')}</div><div class="diagram-row"><span class="diagram-node">${icon('file')}</span><div><strong>Your client brief</strong><small>Context, requirements, and a clear goal</small></div><span class="diagram-number">01</span></div><div class="diagram-row"><span class="diagram-node">${icon('code')}</span><div><strong>Built by your agents</strong><small>Implementation with recorded checks</small></div><span class="diagram-number">02</span></div><div class="diagram-row last"><span class="diagram-node accent-node">${icon('shield')}</span><div><strong>Reviewed. Refined. Yours.</strong><small>Repairs when needed. You accept the result.</small></div><span class="diagram-number">03</span></div></div></section>
  <section class="section"><div class="section-title"><div><h2>Client deliveries <span class="count-label">${deliveries.length}</span></h2><p>From the first brief to your final review.</p></div><a class="text-link" href="#deliveries">View all deliveries ${icon('arrow')}</a></div>${deliveries.length ? `<div class="project-preview-grid">${deliveries.slice(0, 3).map(d => `<button class="delivery-preview panel" data-action="open-delivery" data-id="${d.id}"><div class="preview-top"><span class="project-monogram">${e((d.client || d.title).slice(0, 2).toUpperCase())}</span>${deliveryBadge(d)}</div><small>${e(d.client || 'CLIENT PROJECT')}</small><h3>${e(d.title)}</h3><p>${e(project(d.projectId)?.name)} · ${d.criteria.length} acceptance criteria</p><div class="preview-bottom"><span>${e(deliveryLabels[d.status])}</span>${icon('arrow')}</div></button>`).join('')}</div>` : `<div class="delivery-empty-inline"><span class="empty-symbol">${icon('folder')}</span><div><h3>Your next project starts with a brief.</h3><p>Bring the client’s idea, connect the context, and define a result you can verify.</p></div><button class="button subtle" data-action="new-delivery">Create your first brief ${icon('plus')}</button></div>`}</section>
  <div class="overview-bottom"><section class="panel work-panel"><div class="panel-heading"><h2>Recent tasks</h2><a href="#tasks" class="text-link">All tasks ${icon('arrow')}</a></div><div class="tabs"><button class="tab ${lane === 'all' ? 'active' : ''}" data-lane="all">All work</button><button class="tab ${lane === 'coding' ? 'active' : ''}" data-lane="coding">${icon('code')} Coding</button><button class="tab ${lane === 'operations' ? 'active' : ''}" data-lane="operations">${icon('monitor')} Operations</button></div>${taskTable(state.tasks.filter(t => lane === 'all' || t.lane === lane).slice(0, 5), true)}</section><section class="panel activity-panel"><div class="panel-heading"><h2>Workspace activity</h2><span class="live-label"><span class="dot"></span>LIVE</span></div>${state.events.length ? activityList(state.events.slice(0, 4)) : `<div class="quiet-activity">${icon('activity')}<h3>All quiet for now</h3><p>Tasks, reviews, and milestones will appear here as your team works.</p></div>`}<a href="#activity" class="activity-footer">View all activity ${icon('arrow')}</a></section></div>
  <section class="section"><div class="section-title"><div><h2>Your team <span class="count-label">${team.length}</span></h2><p>The right agent for every part of the work.</p></div><a href="#team" class="text-link">Manage team ${icon('arrow')}</a></div><div class="agent-grid">${team.map(a => agentCard(a, true)).join('')}</div></section>
  <section class="get-started"><div class="get-started-icon">${icon('terminal')}</div><div><h3>Know your workspace before you build.</h3><p>Run a local project inspection or check your system’s health.</p></div><button class="button subtle" data-action="quick-health">${icon('activity')}System health</button><button class="button" data-action="quick-scout">Inspect workspace ${icon('arrow')}</button></section>`;
}
function agentCard(a, compact = false) {
  const active = a.activeTaskId ? state.tasks.find(t => t.id === a.activeTaskId) : null;
  const status = active?.stopping ? 'Stopping' : !a.enabled ? 'Paused' : active ? 'Working' : !a.available ? 'Not installed' : 'Ready';
  return `<article class="agent-card ${compact ? '' : 'expanded'}"><div class="agent-top">${avatar(a)}<span class="agent-state ${active ? 'working' : ''}"><span class="dot"></span>${status}</span></div><h3>${e(a.name)}</h3><p class="agent-role">${e(a.role)}</p>${compact ? '' : `<p class="agent-description">${e(a.description)}</p>`}<div class="agent-bottom"><span class="runner-label">${isNative(a) ? 'LOCAL CHECK' : `${e(a.kind.toUpperCase())} CLI`}</span>${compact ? `<button class="mini-arrow" data-action="agent-task" data-id="${a.id}" ${!a.enabled || !a.available ? 'disabled' : ''} aria-label="Assign task to ${e(a.name)}">${icon('arrow')}</button>` : `<button class="text-button" data-action="agent-toggle" data-id="${a.id}">${a.enabled ? 'Pause' : 'Resume'} ${icon(a.enabled ? 'pause' : 'play')}</button>`}</div>${active ? `<button class="agent-current" data-task="${active.id}">${icon('activity')}${e(active.title)}</button>` : ''}${!compact ? `<button class="button wide" data-action="agent-task" data-id="${a.id}" ${a.internal || !a.enabled || !a.available ? 'disabled' : ''}>${icon('plus')}Assign task</button>` : ''}</article>`;
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
  <section class="panel scope-panel"><div>${icon('shield')}</div><div><h3>You set the scope.</h3><p>AI tasks wait for your approval. Review mode asks for analysis; edit mode allows workspace changes. Codex uses its CLI sandbox. Claude has a fixed file-tool allowlist. Scout and Pulse inspect locally. Verifier runs the checks approved in a delivery cycle.</p><p>Pausing an agent stops new work from starting. Cancel its active task to stop a current run.</p></div></section>`;
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
  return `<fieldset class="workflow-step-form" data-step-lane="${e(step.lane || (agent(step.agentId)?.kind === 'health' ? 'operations' : 'coding'))}"><legend>Workflow step</legend><div class="form-row"><label>Step name<input name="stepTitle" required maxlength="160" value="${e(step.title || '')}" placeholder="What should this step do?"></label><label>Agent<select name="stepAgent">${options(state.agents.filter(a => a.enabled && !a.internal), step.agentId || 'agent_codex')}</select></label></div><label>Instructions<textarea name="stepDescription" rows="2">${e(step.description || '')}</textarea></label><label class="checkbox-label"><input type="checkbox" name="stepRequireTools" ${step.requireTools ? 'checked' : ''}>Require recorded tool activity from an AI agent</label><p class="route-form-help">A report without tool activity will hold the workflow. Review its accuracy separately.</p><div class="form-row"><label>Access<select name="stepMode"><option value="review">Review</option><option value="edit" ${step.mode === 'edit' ? 'selected' : ''}>Edit project files</option></select></label><button type="button" class="text-button remove-step" data-action="workflow-remove-step">${icon('close')}Remove step</button></div></fieldset>`;
}
function workflowForm(recipeId = 'review') {
  const recipe = workflowRecipes[recipeId] || workflowRecipes.review;
  openDialog('Create a workflow', `<form id="workflow-form"><div class="form-content"><label>Workflow name<input name="title" required maxlength="160" value="${e(recipe.name)}" autofocus></label><label>Goal and shared context<textarea name="goal" rows="3" placeholder="Describe the outcome. This context is included in every step’s instructions."></textarea></label><label>Project<select name="projectId">${options(state.projects, state.projects.find(p => p.available)?.id)}</select></label>${routingFields({ provider: state.routing.defaultModel ? 'omniroute' : 'direct' })}<div id="workflow-step-list">${recipe.steps.map(workflowStep).join('')}</div><button type="button" class="button subtle wide" data-action="workflow-add-step">${icon('plus')}Add a step</button><p class="route-form-help">Steps run in order. Each step receives the preceding step’s latest report. Local checks keep their fixed scope.</p><label class="checkbox-label"><input name="startNow" type="checkbox" checked>Start the first step after creating</label></div><div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Create workflow ${icon('arrow')}</button></div></form>`, true);
}
function routinesPage() {
  return `${heading('A RHYTHM FOR REPEAT WORK', 'Routines', 'Schedule checks and AI tasks. Keep the local server running for scheduled work.', button('New routine', 'new-routine', 'plus', 'primary'))}
  ${state.routines.length ? `<div class="routine-grid">${state.routines.map(r => `<article class="panel routine-card"><div class="routine-top"><span class="routine-icon">${icon('routine')}</span><button class="switch ${r.enabled ? 'on' : ''}" role="switch" aria-checked="${r.enabled}" aria-label="${r.enabled ? 'Pause' : 'Enable'} ${e(r.title)}" data-action="routine-toggle" data-id="${r.id}"><span></span></button></div><h3>${e(r.title)}</h3><p>${e(r.description || 'A recurring task for your team.')}</p><div class="routine-meta"><span>${icon('clock')}Every ${r.intervalMinutes < 60 ? `${r.intervalMinutes} min` : `${+(r.intervalMinutes / 60).toFixed(1)} hours`}</span><span>${avatar(agent(r.agentId), true)}${e(agent(r.agentId)?.name)}</span></div>${['omniroute','openrouter'].includes(r.routing?.provider) ? `<div class="routine-route">${icon('link')}<code>${e(r.routing.model)}</code></div>` : ''}<div class="routine-next"><span>${r.enabled ? 'Next run' : 'Schedule paused'}</span><strong>${r.enabled ? date(r.nextRunAt) : '—'}</strong></div>${(() => { const latest = state.tasks.find(t => t.routineId === r.id); return latest ? `<button class="routine-latest" data-task="${latest.id}"><span>Latest run</span>${badge(latest.status)}${icon('chevron')}</button>` : ''; })()}<div class="routine-actions"><button class="text-button" data-action="routine-edit" data-id="${r.id}">Edit routine</button><button class="button subtle" data-action="routine-run" data-id="${r.id}">${icon('play')}Run now</button></div></article>`).join('')}</div>` : `<section class="panel">${empty('Good habits, on a schedule.', 'Check disk space hourly, inspect a project daily, or queue a recurring AI review.', button('Create your first routine', 'new-routine', 'plus', 'primary'), 'routine')}</section>`}
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
  const gateway = r.provider === 'openrouter' ? 'OpenRouter' : 'OmniRoute';
  const dashboard = r.provider === 'openrouter' ? 'https://openrouter.ai/' : r.baseUrl.replace(/\/v1$/, '');
  return `${heading('ONE GATEWAY, YOUR CHOICE OF MODELS', 'Model routing', 'Connect OpenRouter or OmniRoute, then choose a model for your mission.', `<a class="button" href="${e(dashboard)}" target="_blank" rel="noopener noreferrer">${icon('link')}Open ${gateway}</a>`)}
    <div class="routing-flow"><div>${icon('tasks')}<span>Ultharness task</span></div>${icon('arrow')}<div>${icon('terminal')}<span>Codex or Claude</span></div>${icon('arrow')}<div class="flow-accent">${icon('link')}<span>${gateway}</span></div>${icon('arrow')}<div>${icon('code')}<span>Your chosen model</span></div></div>
    ${r.models.length ? `<div class="provider-grid">${providerCards()}</div><div class="catalog-controls"><span>Catalog access does not verify model availability or remaining quota.</span><button class="text-button" data-action="provider-filter" data-prefix="">Show all providers</button></div>` : ''}
    ${r.defaultModel ? `<div class="default-route panel"><span class="routine-icon">${icon('link')}</span><div><small>DEFAULT MODEL OR COMBO</small><strong>${e(r.defaultModel)}</strong><p>Try a short response through your coding agent and save the result as a task report.</p></div><button class="button primary" data-action="model-demo" data-model="${e(r.defaultModel)}">${icon('play')}Create demo task</button></div>` : ''}
    <div class="routing-layout"><section class="panel routing-settings"><div class="panel-heading"><h2>${gateway} connection</h2><span class="badge ${r.status === 'connected' ? 'done' : r.status === 'error' ? 'failed' : 'queued'}"><span class="dot"></span>${r.status === 'connected' ? 'Last check passed' : r.status === 'error' ? 'Needs attention' : 'Not tested'}</span></div>
      <form id="routing-form"><div class="form-content"><label>Provider<select name="provider"><option value="omniroute" ${r.provider !== 'openrouter' ? 'selected' : ''}>OmniRoute · local or hosted router</option><option value="openrouter" ${r.provider === 'openrouter' ? 'selected' : ''}>OpenRouter · direct API through Codex</option></select></label><label>Gateway base URL<input name="baseUrl" type="url" required value="${e(r.baseUrl)}" placeholder="http://127.0.0.1:20128/v1"><small>A local HTTP endpoint or a remote HTTPS endpoint. The /v1 suffix is added automatically.</small></label>
      <label>Default model or combo <span class="optional">optional</span><input name="defaultModel" list="routing-default-models" maxlength="200" value="${e(r.defaultModel)}" placeholder="Choose from the catalog or enter an exact ID"><datalist id="routing-default-models">${r.models.map(model => `<option value="${e(model)}"></option>`).join('')}</datalist><small>Used when a task selects OmniRoute without its own model ID.</small></label>
      <label>Gateway API key <span class="optional">optional</span><input name="apiKey" type="password" autocomplete="new-password" placeholder="${r.keyConfigured ? 'A key is configured; leave blank to keep it' : 'Only if your gateway requires authentication'}"><small>New keys stay in this server session. For restarts, set ${r.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OMNIROUTE_API_KEY'} in your local .env file.</small></label>
      ${r.keyConfigured ? '<label class="checkbox-label"><input type="checkbox" name="clearKey">Remove the configured session key</label>' : ''}
      ${r.error ? `<div class="error-box">${icon('close')}<span>${e(r.error)}</span></div>` : ''}
      <div class="routing-check-meta">${r.checkedAt ? `Last checked ${date(r.checkedAt)}` : 'A connection test reads the model catalog; it does not generate text.'}</div></div>
      <div class="dialog-footer"><button class="button" type="submit" value="save">Save settings</button><button class="button primary" type="submit" value="test">${icon('link')}Save & test connection</button></div></form></section>
    <section class="panel routing-catalog"><div class="panel-heading"><h2>Model catalog <span class="count-label">${r.models.length}</span></h2><span id="catalog-visible" class="muted"></span></div>${r.models.length ? `<label class="search-field catalog-search">${icon('search')}<input id="model-search" type="search" value="${e(modelQuery)}" placeholder="Find a model or combo…" aria-label="Filter model catalog"></label><div class="model-catalog">${r.models.map(model => `<div class="model-row" data-model-id="${e(model)}"><code>${e(model)}</code><div class="model-actions"><button class="text-button" data-action="model-demo" data-model="${e(model)}">Try model</button><button class="${model === r.defaultModel ? 'model-selected' : 'text-button'}" ${model === r.defaultModel ? 'disabled' : ''} data-action="routing-model" data-model="${e(model)}">${model === r.defaultModel ? `${icon('check')}Default` : 'Use default'}</button></div></div>`).join('')}<p id="catalog-no-matches" class="tab-empty" hidden>No matching models. Clear the search or show all providers.</p></div>` : empty('Bring your models into the workspace.', 'Start OmniRoute, connect your providers there, then test the connection to load its model catalog.', '', 'link')}</section></div>
    <div class="info-strip">${icon('shield')}<span>Each AI task still requires approval. Its approval screen shows the gateway and model. Provider credentials and fallback policies are managed in your selected gateway. OpenRouter requires a key; model support and free quotas vary.</span></div>`;
}

function routingFields(routing = { provider: 'direct' }) {
  return `<div data-routing-fields><div class="form-row"><label>Model route<select name="route"><option value="direct" ${routing.provider === 'direct' ? 'selected' : ''}>CLI default</option><option value="${state.routing.provider || 'omniroute'}" ${routing.provider !== 'direct' ? 'selected' : ''}>${state.routing.provider === 'openrouter' ? 'OpenRouter (Codex)' : 'OmniRoute'}</option></select></label><label data-model-field ${routing.provider !== 'direct' ? '' : 'hidden'}>Model or combo<input name="model" list="task-route-models" maxlength="200" value="${e(routing.model || state.routing.defaultModel)}" placeholder="Exact model ID"><datalist id="task-route-models">${state.routing.models.map(model => `<option value="${e(model)}"></option>`).join('')}</datalist></label></div><p class="route-form-help">Your configured gateway routes model requests. Your selected agent still handles tools and workspace access.</p></div>`;
}
function syncRoutingFields(form) {
  if (!form?.elements.agentId) return;
  const fields = $('[data-routing-fields]', form);
  if (!fields) return;
  fields.hidden = isNative(agent(form.elements.agentId.value));
  for (const field of $$('[data-tool-requirement], [data-tool-requirement-help]', form)) field.hidden = fields.hidden;
  $('[data-model-field]', form).hidden = form.elements.route.value === 'direct';
}

function openDialog(title, content, wide = false) {
  closeDialog();
  $('#overlay').innerHTML = `<dialog aria-labelledby="dialog-title" class="dialog ${wide ? 'detail-dialog' : ''}"><div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div><div id="dialog-content">${content}</div></dialog>`;
  const dialog = $('dialog'); dialog.showModal(); dialog.scrollTop = 0;
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
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
    <div class="form-row"><label>Assign to<select name="agentId">${options(state.agents.filter(a => a.enabled && !a.internal), agentId)}</select></label><label>Project<select name="projectId">${options(state.projects, projectId)}</select></label></div>
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
    ${t.deliveryId ? `<div class="form-note">${icon('shield')}Managed by a client delivery. Use delivery controls to restart or change scope. <a href="#deliveries" data-action="close-dialog">Open deliveries</a></div>` : ''}
    ${!isNative(a) ? `<div class="task-scheduling"><label class="checkbox-label"><input type="checkbox" name="taskRequireTools" data-task-id="${t.id}" ${t.requireTools ? 'checked' : ''} ${t.deliveryId || !['queued', 'done', 'failed', 'cancelled'].includes(t.status) || t.stopping ? 'disabled' : ''}>Require tool activity for this task’s next run</label>${t.runs ? `<span>${t.toolActivityCount == null ? 'Tool activity was not recorded for this run' : `${t.toolActivityCount} recorded tool actions`}</span>` : ''}</div>` : ''}
    ${['omniroute','openrouter'].includes((t.routeSnapshot || t.routing)?.provider) ? `<div class="task-route">${icon('link')}${e((t.routeSnapshot || t.routing).provider)} <code>${e((t.routeSnapshot || t.routing).model)}</code><span>${e(t.routeSnapshot?.baseUrl || state.routing.baseUrl)}</span></div>` : ''}
    ${t.error ? `<div class="error-box">${icon('close')}<span>${e(t.error)}</span></div>` : ''}
    ${t.status === 'approval' ? `<div class="approval-box"><div class="approval-title">${icon('shield')}Review this run</div><p><strong>${e(a.name)}</strong> will receive these instructions and run in <code>${e(project(t.projectId)?.path)}</code>.</p><p>${t.mode === 'edit' ? 'This task permits workspace file changes.' : 'This task is configured for review without file edits.'} ${['omniroute','openrouter'].includes(t.routeSnapshot?.provider) ? 'Model requests go through the gateway endpoint shown above using its configured providers.' : 'Provider usage uses your existing CLI account.'}</p><div class="approval-actions"><button class="button primary" data-action="task-approve" data-id="${t.id}">${icon('check')}Approve & run</button><button class="button" data-action="task-reject" data-id="${t.id}">Decline</button></div></div>` : ''}
    ${t.dependsOnId ? `<button class="dependency" data-task="${t.dependsOnId}">${icon('link')}Depends on ${e(state.tasks.find(item => item.id === t.dependsOnId)?.title)} ${icon('arrow')}</button>` : ''}
    <div class="detail-actions">${!t.deliveryId && ['queued', 'failed', 'cancelled', 'done'].includes(t.status) ? `<button class="button ${t.status === 'queued' ? 'primary' : ''}" data-action="task-run" data-id="${t.id}" ${t.stopping ? 'disabled' : ''}>${icon('play')}${t.stopping ? 'Stopping previous run…' : t.status === 'queued' ? 'Run task' : 'Run again'}</button>` : ''}${!finished(t) && t.status !== 'approval' ? `<button class="button danger-text" data-action="task-cancel" data-id="${t.id}">${icon('close')}Cancel task</button>` : ''}<button class="button" data-action="follow-up" data-id="${t.id}">${icon('plus')}Create follow-up</button>${t.costUsd != null ? `<span class="cost">Reported cost: $${Number(t.costUsd).toFixed(4)}</span>` : t.usage ? `<span class="cost">${Number(t.usage.input_tokens || 0).toLocaleString()} input / ${Number(t.usage.output_tokens || 0).toLocaleString()} output tokens</span>` : ''}</div>
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
    if (action === 'toggle-menu') { mobileMenuOpen = !mobileMenuOpen; render(); (mobileMenuOpen ? $('.nav-item.selected') : $('.mobile-menu-toggle'))?.focus(); return; }
    if (action === 'open-search') return openSearch();
    if (action === 'search-navigate') { closeDialog(); mobileMenuOpen = false; navigate(trigger.dataset.view); return; }
    if (action === 'open-delivery') { closeDialog(); mobileMenuOpen = false; deliveryFilter = 'all'; navigate('deliveries'); document.getElementById(id)?.scrollIntoView({ block: 'center' }); return; }
    if (action === 'delivery-filter') { deliveryFilter = trigger.dataset.filter; render(); return; }
    if (action === 'close-dialog') return closeDialog();
    if (action === 'open-newt') { newt?.postMessage('openNewt'); return; }
    if (action === 'forget-newt') { await api('newt/forget', {}); await refresh(); toast('Newt will ask for a project on the next mission.'); return; }
    if (action === 'new-mission') return missionForm();
    if (action === 'watch-mission') { liveDeliveryId = id; sessionStorage.setItem('uh-live-delivery', id); closeDialog(); navigate('live'); return; }
    if (action === 'mission-preview') {
      const result = await api(`deliveries/${id}/preview`);
      openDialog('Live site preview', `<div class="preview-note">Static websites and built output reload when files change. Interactive development servers are not started by this preview.</div><iframe class="mission-preview-frame" sandbox="allow-scripts" src="${e(result.url)}" title="Live project preview"></iframe>`, true); return;
    }
    if (action === 'new-delivery' || action === 'delivery-example') return deliveryForm(null, action === 'delivery-example');
    if (action === 'new-connection') return connectionForm();
    if (action === 'delivery-revise') return deliveryForm(state.deliveries.find(d => d.id === id));
    if (action === 'delivery-review-scope') return deliveryScope(state.deliveries.find(d => d.id === id));
    if (action === 'delivery-request-changes') return openDialog('Request changes', `<form id="delivery-feedback-form" data-id="${id}"><div class="form-content"><label>What needs to change?<textarea name="feedback" rows="5" required maxlength="10000" autofocus></textarea></label><p class="route-form-help">The next cycle will use this feedback and require a new run approval.</p></div><div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">Save feedback</button></div></form>`);
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
      return taskForm({ agentId: runner.id, title: `Try ${trigger.dataset.model}`.slice(0, 160), description: 'Reply with ULTHARNESS_READY and one short sentence introducing yourself. Do not use tools, read files, or change anything. This is a short model connection demo.', routing: { provider: state.routing.provider || 'omniroute', model: trigger.dataset.model } });
    }
    if (action === 'follow-up') { const t = state.tasks.find(t => t.id === id); return taskForm({ projectId: t.projectId, agentId: t.agentId, parentId: id, taskLane: t.lane, routing: t.routing, requireTools: t.requireTools }); }
    if (action === 'approvals') {
      const awaiting = state.tasks.filter(t => t.status === 'approval');
      if (awaiting.length) openDialog('Approval inbox', `<div class="approvals-list">${awaiting.map(t => `<button data-task="${t.id}"><span class="event-icon warning">${icon('shield')}</span><div><strong>${e(t.title)}</strong><small>${e(agent(t.agentId)?.name)} · ${e(t.mode)} · ${e(project(t.projectId)?.name)}</small></div>${icon('chevron')}</button>`).join('')}</div>`);
      else toast('No tasks are waiting for approval.');
      return;
    }
    trigger.disabled = true;
    if (['delivery-approve', 'delivery-pause', 'delivery-accept'].includes(action)) { await api(`deliveries/${id}/${action.slice(9)}`, {}); closeDialog(); await refresh(); toast(action === 'delivery-approve' ? 'Delivery cycle started. Follow progress and evidence here.' : action === 'delivery-accept' ? 'Delivery accepted.' : 'Delivery stopped.'); }
    else if (action.startsWith('connection-')) { await api(`connections/${id}/${action.slice(11)}`, {}); await refresh(); }
    else if (action === 'routing-model') { await api('routing', { defaultModel: trigger.dataset.model }); if ($('#routing-form')) $('#routing-form').elements.defaultModel.value = trigger.dataset.model; await refresh(); toast('Default model updated.'); }
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
  if (event.target.id === 'command-search') renderSearch(event.target.value);
  if (event.target.id === 'search') { query = event.target.value; render(); }
  if (event.target.id === 'model-search') { modelQuery = event.target.value; filterModels(); }
});
document.addEventListener('change', async event => {
  if (event.target.name === 'provider' && event.target.form?.id === 'routing-form') {
    const form = event.target.form;
    form.elements.baseUrl.value = event.target.value === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://127.0.0.1:20128/v1';
    form.elements.defaultModel.value = ''; form.elements.apiKey.value = '';
  }
  if (event.target.form?.id === 'connection-form') syncConnectionForm(event.target.form);
  if (event.target.name === 'route' && ['delivery-form','mission-form'].includes(event.target.form?.id)) $('[data-model-field]', event.target.form).hidden = event.target.value === 'direct';
  if (['agentId', 'route'].includes(event.target.name)) syncRoutingFields(event.target.form);
  if (event.target.name === 'route' && event.target.form?.id === 'workflow-form') $('[data-model-field]', event.target.form).hidden = event.target.value === 'direct';
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
  if (!['mission-form', 'task-form', 'routine-form', 'project-form', 'workflow-form', 'comment-form', 'routing-form', 'delivery-form', 'connection-form', 'delivery-feedback-form'].includes(form.id)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const submitButtons = [...form.querySelectorAll('button[type="submit"]')]; submitButtons.forEach(button => button.disabled = true);
  try {
    if (form.id === 'mission-form') {
      const delivery = await api('missions', { ...values, rememberNewt: !!newt && values.rememberNewt === 'on', references: values.references.split('\n').map(v => v.trim()).filter(Boolean), connectionIds: new FormData(form).getAll('connectionIds'), maxRepairs: values.runPolicy === 'persistent' ? 100 : 3, maxMinutes: Number(values.maxMinutes) });
      liveDeliveryId = delivery.id; sessionStorage.setItem('uh-live-delivery', delivery.id); closeDialog(); await refresh(); navigate('live'); return;
    }
    if (form.id === 'delivery-form') {
      const lines = value => value.split('\n').map(v => v.trim()).filter(Boolean);
      await api('deliveries', { ...values, criteria: lines(values.criteria), checks: [...lines(values.files).map(line => { const [file, ...rest] = line.split(' :: '); return { kind: 'file', file, contains: rest.join(' :: ') }; }), ...lines(values.scripts).map(script => ({ kind: 'npm', script }))], connectionIds: new FormData(form).getAll('connectionIds'), maxRepairs: Number(values.maxRepairs) });
      closeDialog(); await refresh(); navigate('deliveries'); toast('Brief saved. Review & start when ready.'); return;
    }
    if (form.id === 'connection-form') {
      let args = [];
      if (values.kind === 'mcp' && values.transport === 'stdio') { try { args = JSON.parse(values.args); } catch { throw new Error('MCP arguments must be a valid JSON array.'); } }
      await api('connections', { ...values, args, tools: values.tools.split(',').map(v => v.trim()).filter(Boolean) });
      closeDialog(); await refresh(); navigate('connections'); toast('Connection saved. Select it in a client brief.'); return;
    }
    if (form.id === 'delivery-feedback-form') { await api(`deliveries/${form.dataset.id}/reject`, values); closeDialog(); await refresh(); return; }
    if (form.id === 'routing-form') {
      await api('routing', { ...values, clearKey: values.clearKey === 'on' });
      // Clear the entered secret before any render or connection error.
      form.elements.apiKey.value = '';
      if (event.submitter?.value === 'test') await api('routing/test', {});
      await refresh(); toast(event.submitter?.value === 'test' ? 'Gateway connected. Model catalog loaded.' : 'Routing settings saved.'); return;
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
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (nav.some(n => n[0] === next)) { mobileMenuOpen = false; view = next; query = ''; render(); window.scrollTo(0, 0); } });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('dialog[open]')) { event.preventDefault(); closeDialog(); return; }
  if (mobileMenuOpen && event.key === 'Tab') {
    const links = $$('a, button:not(:disabled)', $('.sidebar')); const index = links.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); links.at(-1)?.focus(); }
    else if (!event.shiftKey && index === links.length - 1) { event.preventDefault(); links[0]?.focus(); }
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); if (!$('.command-dialog')) openSearch(); else $('#command-search')?.focus(); }
  if (mobileMenuOpen && event.key === 'Escape') { mobileMenuOpen = false; render(); $('.mobile-menu-toggle')?.focus(); }
  if ($('.command-dialog') && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    const results = $$('.command-result'); const index = results.indexOf(document.activeElement);
    if (event.key === 'Enter' && document.activeElement?.id === 'command-search') { event.preventDefault(); results[0]?.click(); }
    else if (event.key !== 'Enter') { event.preventDefault(); results[(index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length]?.focus(); }
  }
  const row = event.target.closest?.('tr[data-task]');
  if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openTask(row.dataset.task); }
});

const deliveryLabels = { planning: 'Planning standards', draft: 'Brief saved', building: 'Building', checking: 'Running checks', reviewing: 'Reviewing', awaiting_acceptance: 'Ready for your review', accepted: 'Accepted', blocked: 'Needs attention', paused: 'Stopped' };
const deliveryBadge = d => `<span class="badge ${['accepted', 'awaiting_acceptance'].includes(d.status) ? 'done' : d.status === 'blocked' ? 'failed' : ['draft', 'paused'].includes(d.status) ? 'queued' : 'running'}"><span class="dot"></span>${e(deliveryLabels[d.status])}</span>`;
const checkLabel = c => c.kind === 'npm' ? `npm run ${c.script}` : `${c.file}${c.contains ? ` contains “${c.contains}”` : ' exists'}`;
function deliveryStageRail(d) {
  const stages = ['Brief', 'Build', 'Checks', 'Review', 'Your acceptance'];
  const position = d.status === 'accepted' ? 5 : d.status === 'awaiting_acceptance' ? 4 : d.status === 'draft' ? 0 : ({ building: 1, checking: 2, reviewing: 3 }[d.phase || d.status] || 0);
  return `<ol class="delivery-stage-rail" aria-label="Delivery progress">${stages.map((label, index) => `<li class="${index < position ? 'complete' : index === position ? 'current' : ''}"><span>${index < position ? icon('check') : String(index + 1).padStart(2, '0')}</span><strong>${label}</strong></li>`).join('')}</ol>`;
}
function deliveriesPage() {
  const matchesFilter = d => deliveryFilter === 'all' || deliveryFilter === 'active' && ['planning','building','checking','reviewing'].includes(d.status) || deliveryFilter === 'review' && ['awaiting_acceptance','blocked'].includes(d.status) || deliveryFilter === 'accepted' && d.status === 'accepted';
  const visible = state.deliveries.filter(matchesFilter);
  const filterCounts = { all: state.deliveries.length, active: state.deliveries.filter(d => ['planning','building','checking','reviewing'].includes(d.status)).length, review: state.deliveries.filter(d => ['awaiting_acceptance','blocked'].includes(d.status)).length, accepted: state.deliveries.filter(d => d.status === 'accepted').length };
  return `${heading('FROM CLIENT BRIEF TO ACCEPTED WORK', 'Client deliveries', 'Define what good looks like. Build, verify, review, and repair against the same brief.', button('New client brief', 'new-delivery', 'plus', 'primary'))}
  <section class="delivery-intro panel"><span class="intro-emblem">${icon('shield')}</span><div><div class="eyebrow">A CLEAR PATH TO DONE</div><h2>Built to meet the brief.</h2><p>Define the goal. Let your agents build, verify, and refine. Accept the work when it meets your requirements.</p></div><button class="button subtle" data-action="delivery-example">${icon('file')}Try a website brief</button></section>
  <div class="delivery-flow" aria-label="Delivery stages">${['Your brief', 'Build', 'Check', 'Review', 'Repair if needed', 'You accept'].map((label, i) => `<span><b>${String(i + 1).padStart(2,'0')}</b>${label}${i < 5 ? icon('chevron') : icon('shield')}</span>`).join('')}</div>
  <div class="delivery-filterbar"><div class="segmented-tabs" aria-label="Filter deliveries">${[['all','All deliveries'],['active','In progress'],['review','Needs review'],['accepted','Accepted']].map(([key,label]) => `<button class="segment ${deliveryFilter === key ? 'active' : ''}" data-action="delivery-filter" data-filter="${key}" aria-pressed="${deliveryFilter === key}">${label}<span>${filterCounts[key]}</span></button>`).join('')}</div><span class="filter-total">${visible.length} ${visible.length === 1 ? 'delivery' : 'deliveries'}</span></div>
  ${visible.length ? `<div class="delivery-list">${visible.map(d => {
    const latest = d.attempts.at(-1), current = state.tasks.find(t => t.id === d.currentTaskId);
    return `<article class="panel delivery-card" id="${d.id}"><div class="panel-heading"><div><div class="eyebrow">${e(d.client || 'CLIENT PROJECT')}</div><h2>${e(d.title)}</h2><p>${e(project(d.projectId)?.name)} · ${d.criteria.length} criteria · ${d.checks.length} checks · ${Math.min(d.repairs, d.maxRepairs)}/${d.maxRepairs} repairs</p></div>${deliveryBadge(d)}</div>
      <div class="delivery-body">${deliveryStageRail(d)}<p class="delivery-brief">${e(d.brief)}</p>${d.retryAt ? `<div class="info-strip">Temporary provider failure. Recovery ${d.recoveryAttempts}/${d.maxRecoveries} scheduled for ${date(d.retryAt)}. Stop remains available.</div>` : ''}${d.error ? `<div class="error-box">${icon('shield')}<span>${e(d.error)}</span></div>` : ''}
      <details data-preserve-key="${d.id}-criteria"><summary>Acceptance criteria & checks</summary><ol class="criteria-list">${d.criteria.map(c => { const result = latest?.criteria.find(r => r.id === c.id); return `<li><span class="criterion-id">${e(c.id)}</span><div><strong>${e(c.text)}</strong>${result ? `<p class="${result.status === 'pass' ? 'pass-text' : 'fail-text'}">${result.status.toUpperCase()} · ${e(result.evidence)}</p>` : '<p>Awaiting recorded review</p>'}</div></li>`; }).join('')}</ol><div class="check-chips">${d.checks.map(c => `<code>${e(checkLabel(c))}</code>`).join('')}</div><p class="route-form-help">Builder: ${e(agent(d.builderId)?.name)} · Reviewer: ${e(agent(d.reviewerId)?.name)} (separate run) · ${['omniroute','openrouter'].includes(d.routing.provider) ? `${e(d.routing.provider)} / ${e(d.routing.model)}` : 'CLI account defaults'}<br>${d.connections.length ? `Connections: ${d.connections.map(c => e(c.name)).join(', ')}. Snapshots are kept with this brief.` : 'No connections selected.'}</p></details>
      ${latest ? `<div class="review-summary ${latest.verdict === 'pass' ? 'pass' : 'reject'}"><strong>Latest review: ${latest.verdict === 'pass' ? 'Pass' : 'Changes required'}</strong><p>${e(latest.summary)}</p></div>` : ''}
      ${current ? `<button class="delivery-current" data-task="${current.id}">${icon('terminal')}<span>${e(current.title)}</span>${badge(current.status)}${icon('chevron')}</button>` : ''}
      ${d.taskIds.length ? `<details data-preserve-key="${d.id}-history"><summary>Run history · ${d.taskIds.length} steps</summary><div class="delivery-history">${d.taskIds.map(id => { const t = state.tasks.find(t => t.id === id); return `<button data-task="${id}"><span>${e(t?.title)}</span>${badge(t?.status)}</button>`; }).join('')}</div></details>` : ''}
      <div class="delivery-actions"><button class="button subtle" data-action="watch-mission" data-id="${d.id}">${icon('activity')}Watch live</button>${['draft', 'paused', 'blocked'].includes(d.status) && !d.repairLimitReached ? `<button class="button primary" data-action="delivery-review-scope" data-id="${d.id}">${icon('shield')}${d.status === 'draft' ? 'Review & start' : 'Review & restart'}</button>` : ''}${['planning', 'building', 'checking', 'reviewing'].includes(d.status) ? `<button class="button" data-action="delivery-pause" data-id="${d.id}">${icon('pause')}Stop cycle</button>` : ''}${d.status === 'awaiting_acceptance' ? `<button class="button primary" data-action="delivery-accept" data-id="${d.id}">${icon('check')}Accept delivery</button><button class="button" data-action="delivery-request-changes" data-id="${d.id}">Request changes</button>` : ''}<button class="text-button" data-action="delivery-revise" data-id="${d.id}">Revise brief</button><a class="text-link" href="/api/deliveries/${d.id}/report">${icon('down')}Evidence report</a></div>
      ${d.status === 'awaiting_acceptance' ? '<p class="route-form-help">Checks passed and the AI reviewer approved each criterion. Inspect the website and evidence before accepting. Publication is a separate action.</p>' : ''}</div></article>`;
  }).join('')}</div>` : state.deliveries.length ? empty('No deliveries in this view.', 'Choose another filter to see the rest of your client work.', '<button class="button subtle" data-action="delivery-filter" data-filter="all">Show all deliveries</button>', 'folder') : empty('Start with the client’s actual brief.', 'Capture pages, content, design direction, behavior, constraints, and measurable requirements in one place.', button('Create a client brief', 'new-delivery', 'plus', 'subtle'), 'file')}`;
}
function missionForm(aim = '') {
  const preferred = state.projects.find(p => p.available)?.id;
  openDialog('Tell Ultharness your aim', `<form id="mission-form"><div class="form-content"><div class="brief-form-intro">${icon('spark')}<div><strong>Your aim is the starting point.</strong><p>The harness derives standards, builds, checks, reviews, and repairs while you watch.</p></div></div><label>What do you want to achieve?<textarea name="aim" rows="6" maxlength="16000" required autofocus placeholder="Build a complete website for my architecture client. Use the attached references, make it elegant and responsive, and make sure every interaction works."></textarea></label><label>References <span class="optional">optional</span><textarea name="references" rows="3" placeholder="https://example.com/design-reference\ndocs/client-brief.md"></textarea><small>One URL or project-relative document per line. Include design and content preferences in your aim.</small></label><label>Work in this project<select name="projectId">${options(state.projects, preferred)}</select><small>${e(state.projects.find(p => p.id === preferred)?.path || '')}</small></label><details class="mission-options"><summary>Run settings & connected tools</summary><label>Persistence<select name="runPolicy"><option value="persistent">Keep working · up to 100 repairs + 3 recovery attempts</option><option value="bounded">Short run · up to 3 repairs</option></select></label><label>Time budget (minutes)<input name="maxMinutes" type="number" min="1" max="1440" value="720" required><small>Progress is saved. Stops on a verified result, missing access, stalled progress, the time budget, or your Stop command.</small></label>${routingFields({ provider: 'direct' })}<fieldset class="connection-picker"><legend>Connected context and inspection tools</legend>${state.connections.filter(c => c.enabled).map(c => `<label class="checkbox-label"><input name="connectionIds" type="checkbox" value="${c.id}">${e(c.name)}</label>`).join('') || '<p>Add reusable tools and context under Connections.</p>'}</fieldset></details>${newt ? '<label class="checkbox-label"><input name="rememberNewt" type="checkbox">Use this project, route, connections and limits when I say “start mission” to Newt.</label>' : ''}${newt && state.newtShortcut ? '<button type="button" class="text-button" data-action="forget-newt">Clear saved Newt mission settings</button>' : ''}<p class="route-form-help mission-consent">Start authorizes planning, project edits, and finite local verification scripts derived from this aim, plus automatic repairs within the displayed run and time budgets. Uses an available coding agent and your selected model account; provider usage may be billed. Your references and files read by the agent go to that provider. Stop the cycle at any time. Passing work comes back for your acceptance.</p></div><div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">${icon('play')}Start & watch live</button></div></form>`, true);
  $('#mission-form').elements.aim.value = aim;
}
function livePage() {
  const d = state.deliveries.find(d => d.id === liveDeliveryId) || state.deliveries.find(d => d.mission) || state.deliveries[0];
  if (!d) return `${heading('ONE AIM. A COMPLETE CYCLE.', 'Live workspace', 'Describe the goal and references. Follow the work from planning to review.', button('Start with an aim', 'new-mission', 'spark', 'primary'))}${empty('Your next aim starts here.', 'The harness will derive a plan and measurable standards, build, verify and repair.', button('Give it an aim', 'new-mission', 'plus'))}`;
  liveDeliveryId = d.id;
  const tasks = d.taskIds.map(id => state.tasks.find(t => t.id === id)).filter(Boolean), current = state.tasks.find(t => t.id === d.currentTaskId);
  const entries = tasks.flatMap(t => [{ at: t.createdAt, text: t.title, channel: 'phase' }, ...t.logs]);
  const latest = state.artifacts.find(a => a.taskId === current?.id);
  return `${heading('YOUR AIM, IN MOTION', 'Live workspace', 'Actual runner output and recorded checks, updated while the harness works.', button('New aim', 'new-mission', 'spark', 'subtle'))}<section class="panel mission-header"><div><span class="eyebrow">${d.mission ? 'AIM-DRIVEN RUN' : 'CLIENT DELIVERY'}</span><h2>${e(d.title)}</h2><p>${e(project(d.projectId)?.name)} · ${e(agent(d.builderId)?.name)} builds · ${e(agent(d.reviewerId)?.name)} reviews · ${d.repairs}/${d.maxRepairs} repairs · ${d.runPolicy === 'persistent' ? 'Persistent mode' : 'Bounded mode'}${d.deadlineAt ? ` · budget ends ${date(d.deadlineAt)}` : ''}</p></div>${deliveryBadge(d)}<div class="mission-header-actions">${['planning','building','checking','reviewing'].includes(d.status) ? `<button class="button" data-action="delivery-pause" data-id="${d.id}">${icon('pause')}Stop cycle</button>` : ''}${d.status === 'awaiting_acceptance' ? `<button class="button primary" data-action="delivery-accept" data-id="${d.id}">Accept result</button><button class="button" data-action="delivery-request-changes" data-id="${d.id}">Request changes</button>` : ''}${['blocked','paused'].includes(d.status) && !d.repairLimitReached ? `<button class="button" data-action="delivery-review-scope" data-id="${d.id}">Review & restart</button>` : ''}<button class="button subtle" data-action="mission-preview" data-id="${d.id}">${icon('monitor')}Live site preview</button><a class="text-link" href="/api/deliveries/${d.id}/report">Evidence report</a></div></section>${d.retryAt ? `<div class="info-strip">Temporary provider failure. Recovery ${d.recoveryAttempts}/${d.maxRecoveries} scheduled for ${date(d.retryAt)}. Stop remains available.</div>` : ''}${d.error ? `<div class="error-box">${icon('shield')}<span>${e(d.error)}</span></div>` : ''}<div class="mission-grid"><section class="panel"><div class="panel-heading"><h2>Live activity</h2><span class="live-label"><span class="dot"></span>${current?.status === 'running' ? 'STREAMING' : e(deliveryLabels[d.status]).toUpperCase()}</span></div><div class="mission-log log-output" role="log" aria-label="Live runner output">${entries.slice(-180).map(l => `<div class="log-line ${e(l.channel)}"><time>${new Date(l.at).toLocaleTimeString([], { hour12: false })}</time><pre>${e(l.text)}</pre></div>`).join('') || '<p class="log-empty">Waiting for the first runner output…</p>'}</div>${current ? `<button class="delivery-current mission-task-link" data-task="${current.id}">${icon('terminal')}<span>${e(current.title)}</span>${badge(current.status)}</button>` : ''}</section><aside class="mission-evidence panel"><div class="panel-heading"><h2>The standard to meet</h2><span class="count-label">${d.planned || !d.mission ? d.criteria.length : 'Planning'}</span></div><div class="delivery-body"><details data-preserve-key="mission-aim"><summary>Original aim & references</summary><p class="delivery-brief">${e(d.brief)}</p>${d.connections.map(c => `<p class="route-form-help">${e(c.url || c.file || c.name)}</p>`).join('')}</details>${d.plan ? `<h3 class="mission-plan-title">Implementation plan</h3><p class="delivery-brief">${e(d.plan.summary)}</p>` : d.mission ? '<p class="route-form-help">The planner is inspecting the workspace and deriving measurable requirements. The original aim remains the authority.</p>' : ''}<ol class="criteria-list">${d.criteria.map(c => { const r = d.attempts.at(-1)?.criteria.find(r => r.id === c.id); return `<li><span class="criterion-id">${e(c.id)}</span><div><strong>${e(c.text)}</strong>${r ? `<p class="${r.status === 'pass' ? 'pass-text' : 'fail-text'}">${e(r.status.toUpperCase())} · ${e(r.evidence)}</p>` : ''}</div></li>`; }).join('')}</ol>${d.planned || !d.mission ? `<div class="check-chips">${d.checks.map(c => `<code>${e(checkLabel(c))}</code>`).join('')}</div>` : ''}${d.attempts.length ? `<p class="route-form-help">${d.checkpoints?.length || d.taskIds.length} saved phase checkpoints · ${d.attempts.length} recorded reviews · latest: ${e(d.attempts.at(-1).verdict)}</p>` : ''}${latest ? `<details data-preserve-key="mission-report"><summary>Latest report</summary><pre class="report-output">${e(latest.content)}</pre></details>` : ''}</div></aside></div>`;
}

function deliveryForm(saved, example = false) {
  const runners = state.agents.filter(a => !isNative(a) && a.enabled);
  const defaultAgent = runners.find(a => a.available)?.id || runners[0]?.id;
  const sample = { title: 'Studio website', client: 'Example client', brief: 'Build a polished website for an independent design studio. Use a warm neutral palette, strong typography, and clear navigation. Include Home, Work, About, and Contact sections. The main CTA should lead to Contact. Use honest placeholder copy where client material is missing and document what still needs their input. Create a complete local implementation and run instructions.', criteria: [{ text: 'Home, Work, About, and Contact are reachable through navigation.' }, { text: 'Layout works at 390px and 1440px without horizontal overflow.' }, { text: 'The primary call to action leads to Contact.' }, { text: 'Forms have visible labels and accessible validation feedback.' }, { text: 'No placeholder integration is presented as a working submission service.' }], checks: [{ kind: 'file', file: 'index.html' }] };
  const d = saved || (example ? sample : {});
  openDialog(saved ? 'Revise client brief' : 'New client brief', `<form id="delivery-form"><div class="form-content"><div class="brief-form-intro">${icon('file')}<div><strong>Great work starts with clear context.</strong><p>Capture the goal, define the finish line, and choose your team.</p></div></div><div class="form-section-heading"><span>01</span><h3>The project</h3></div><div class="form-row"><label>Project title<input name="title" required maxlength="160" value="${e(d.title)}" placeholder="Client website redesign" autofocus></label><label>Client<input name="client" maxlength="120" value="${e(d.client)}" placeholder="Client or company name"></label></div>
    <label>Full client brief<textarea name="brief" rows="7" required maxlength="16000" placeholder="Purpose, audience, pages, user flows, content, visual references, tech stack, accessibility, responsive behavior, constraints, and what must be delivered…">${e(d.brief)}</textarea></label>
    <div class="form-section-heading"><span>02</span><h3>What success looks like</h3></div><label>Acceptance criteria<textarea name="criteria" rows="5" required placeholder="One measurable requirement per line">${e(d.criteria?.map(c => c.text).join('\n'))}</textarea><small>Each line gets its own pass/fail review and evidence. An unverifiable criterion must fail.</small></label>
    <div class="form-section-heading"><span>03</span><h3>Workspace & team</h3></div><label>Project folder<select name="projectId">${options(state.projects, d.projectId || state.projects.find(p => p.available)?.id)}</select><small>Use a dedicated connected folder for the client’s work.</small></label>
    <div class="form-row"><label>Builder<select name="builderId">${options(runners, d.builderId || defaultAgent)}</select></label><label>Reviewer<select name="reviewerId">${options(runners, d.reviewerId || defaultAgent)}</select><small>Always runs in a separate session with file tools. You can choose another agent.</small></label></div>
    ${routingFields(d.routing)}
    <div class="form-section-heading"><span>04</span><h3>Checks & connections</h3></div><div class="form-row"><label>Required files<textarea name="files" rows="3" placeholder="One relative file path per line; optionally path :: required text">${e(d.checks?.filter(c => c.kind === 'file').map(c => c.file + (c.contains ? ' :: ' + c.contains : '')).join('\n'))}</textarea></label><label>npm verification scripts<textarea name="scripts" rows="3" placeholder="build\ntest\ntest:e2e">${e(d.checks?.filter(c => c.kind === 'npm').map(c => c.script).join('\n'))}</textarea><small>Script names from package.json; no npm run prefix. Finite checks only.</small></label></div>
    <p class="route-form-help">Add at least one automated check. npm scripts run as your Mac user for up to 120 seconds each. Include real browser or accessibility tests in a project script when the brief requires them.</p>
    <label>Maximum automatic repairs<select name="maxRepairs">${[0,1,2,3,4,5].map(n => `<option value="${n}" ${n === (d.maxRepairs ?? 2) ? 'selected' : ''}>${n} repairs · up to ${2*(n+1)} agent runs per approval</option>`).join('')}</select></label>
    <fieldset class="connection-picker"><legend>Connect context & tools</legend>${state.connections.filter(c => c.enabled).map(c => `<label class="checkbox-label"><input type="checkbox" name="connectionIds" value="${c.id}" ${d.connections?.some(selected => selected.id === c.id) ? 'checked' : ''}>${e(c.name)} <small>${e(c.category)} · ${c.kind === 'mcp' ? 'MCP tools for builder' : 'Reference only'}</small></label>`).join('') || '<p>No connections yet. Save this brief, then add connections and revise it.</p>'}</fieldset>
    <p class="route-form-help">Saving creates a draft. Review the full run scope before any files change or model requests start.${saved ? ' Your previous brief and evidence remain in history.' : ''}</p></div><div class="dialog-footer"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Save client brief</button></div></form>`, true);
}
function deliveryScope(d) {
  openDialog('Approve a delivery cycle', `<div class="form-content"><h3>${e(d.title)}</h3><p class="task-description">${e(d.brief)}</p><div class="approval-box"><p><strong>Folder:</strong> ${e(project(d.projectId)?.path)}</p><p><strong>Agents:</strong> ${e(agent(d.builderId)?.name)} edits files; ${e(agent(d.reviewerId)?.name)} reviews in a separate session.</p><p><strong>Model route:</strong> ${['omniroute','openrouter'].includes(d.routing.provider) ? `${e(state.routing.baseUrl)} · ${e(d.routing.model)}` : 'Your installed CLI’s configured account and model'}. Instructions and files read by the agent go to this provider.</p><p><strong>Limit:</strong> ${d.maxRepairs} automatic repairs; at most ${(d.mission && !d.planned ? 1 : 0) + 2*(d.maxRepairs+1) + (d.maxRecoveries || 0)} AI runs on this approval. ${d.maxRecoveries || 0} recovery attempts; ${d.maxMinutes || 120} minutes total. Model usage may be billed by your provider.</p><p><strong>Local checks:</strong> ${d.checks.map(c => e(checkLabel(c))).join('; ')}. npm scripts execute project code as your Mac user; each is limited to 120 seconds.</p><p><strong>Connections:</strong> ${d.connections.map(c => e(c.name + ' (' + (c.kind === 'mcp' ? 'MCP: ' + c.tools.join(', ') + '; ' + (c.url || c.command + ' ' + JSON.stringify(c.args)) : c.url || c.file) + ')')).join('; ') || 'None'}. MCP read tool names are chosen by you; the connected server controls their behavior.</p><p>The same brief, connection snapshot, project path, model and gateway are used throughout. Stop the cycle at any time. Your final acceptance is required. Deployment and external writes are outside this cycle.</p></div>${d.feedback ? `<h4>Feedback for this attempt</h4><pre class="report-output">${e(d.feedback)}</pre>` : ''}</div><div class="dialog-footer"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="delivery-approve" data-id="${d.id}">${icon('shield')}Approve & build</button></div>`, true);
}
function connectionsPage() {
  const services = [['GitHub', 'Repository and issue context'], ['Figma', 'Design references and read tools'], ['Project files', 'Briefs, content and brand guides'], ['CMS & databases', 'Schema, documentation and read tools'], ['APIs', 'API documentation and MCP services'], ['Deployment', 'Hosting references and status tools']];
  return `${heading('BRING YOUR WORK INTO THE LOOP', 'Connections', 'Attach project context or connect selected MCP tools to the builder.', button('Add connection', 'new-connection', 'plus', 'primary'))}
    <div class="connection-categories">${services.map(([name, description], index) => `<div><span class="service-symbol service-${index}">${icon(['branch','design','folder','database','code','globe'][index])}</span><strong>${name}</strong><p>${description}</p></div>`).join('')}</div>
    <div class="info-strip">${icon('shield')}<span>References provide context; saving a link does not authenticate to that service. MCP connections configure the selected CLI for that run. Use locally configured credentials or an authenticated local proxy. Keep secrets out of these fields.</span></div>
    <div class="connection-list">${state.connections?.length ? state.connections.map(c => `<article class="panel connection-card"><div class="panel-heading"><div><h2>${e(c.name)}</h2><p>${e(c.category)} · ${c.kind === 'mcp' ? 'MCP · not yet verified by a live agent run' : 'Reference · no service authentication'}</p></div><span class="badge ${c.enabled ? 'ready' : 'paused'}">${c.enabled ? 'Enabled' : 'Disabled'}</span></div><div class="delivery-body"><code>${e(c.url || c.file || `${c.command} ${JSON.stringify(c.args)}`)}</code>${c.kind === 'mcp' ? `<p class="route-form-help">Allowed read tools: ${c.tools.map(e).join(', ')}</p>` : ''}<p class="delivery-brief">${e(c.notes)}</p><div class="delivery-actions"><button class="button subtle" data-action="connection-toggle" data-id="${c.id}">${c.enabled ? 'Disable for new briefs' : 'Enable for new briefs'}</button><button class="text-button" data-action="connection-delete" data-id="${c.id}">Remove</button></div></div></article>`).join('') : empty('Add the context your client work needs.', 'Start with a design link, a repository, a local brief, or a read-only MCP tool server.', button('Add a connection', 'new-connection', 'plus', 'subtle'), 'link')}</div>
    <section class="panel delivery-intro"><div><h2>Extend the checks with your own tools.</h2><p>Add build, test, browser, accessibility, or integration checks as npm scripts in each client project, then select their names in the brief. Exit code and output become part of the evidence report. Configure authenticated services outside the brief; production changes remain a separate decision.</p></div><a class="button subtle" href="#routing">Model routing ${icon('arrow')}</a></section>`;
}
function connectionForm() {
  openDialog('Add a connection', `<form id="connection-form"><div class="form-content"><label>Connection name<input name="name" required maxlength="100" placeholder="Client Figma / GitHub / CMS" autofocus></label><div class="form-row"><label>Category<select name="category">${['github','figma','files','cms','database','deployment','api','mcp','other'].map(v => `<option value="${v}">${v}</option>`).join('')}</select></label><label>Connection type<select name="kind"><option value="reference">Reference link or local document</option><option value="mcp">MCP tool server</option><option value="openclaw">OpenClaw · research & browser inspection</option></select></label></div><label data-connection-transport hidden>MCP transport<select name="transport"><option value="http">Streamable HTTP</option><option value="stdio">Local stdio command</option></select></label><label data-connection-url>URL<input name="url" type="url" placeholder="https://…"><small>No embedded credentials or authentication tokens.</small></label><label data-openclaw-key hidden>OpenClaw gateway token <span class="optional">optional</span><input name="apiKey" type="password" autocomplete="new-password"><small>Session only. For restarts set OPENCLAW_GATEWAY_TOKEN in .env. Uses your local gateway, managed browser profile, and selected inspection tools.</small></label><label data-connection-file>Local document path<input name="file" placeholder="docs/client-brief.md"><small>Relative to the selected client project. Provide this or a URL.</small></label><div data-connection-command hidden><label>Installed MCP command<input name="command" placeholder="/path/to/mcp-server"></label><label>Arguments (JSON array)<textarea name="args" rows="2" placeholder='["--read-only"]'>[]</textarea></label></div><label data-connection-tools hidden>Exact allowed read tool names<input name="tools" placeholder="get_file, search, get_schema"><small>Comma separated. Choose tools that cannot change external data. Server behavior is not independently verified by Ultharness.</small></label><label>Context and usage notes<textarea name="notes" rows="3" maxlength="2000" placeholder="What this connection contains and how it should inform the work. No secrets."></textarea></label><p class="route-form-help">Saving does not start a server, install packages, or make a service request. Enabled connections become selectable in a new or revised client brief.</p></div><div class="dialog-footer"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Save connection</button></div></form>`);
}
function syncConnectionForm(form) {
  const claw = form.elements.kind.value === 'openclaw';
  const mcp = form.elements.kind.value === 'mcp', stdio = form.elements.transport.value === 'stdio';
  $('[data-connection-transport]', form).hidden = !mcp;
  $('[data-connection-file]', form).hidden = mcp || claw;
  $('[data-openclaw-key]', form).hidden = !claw;
  $('[data-connection-url]', form).hidden = mcp && stdio;
  $('[data-connection-command]', form).hidden = !mcp || !stdio;
  $('[data-connection-tools]', form).hidden = !mcp && !claw;
  if (claw && !form.elements.url.value) form.elements.url.value = 'http://127.0.0.1:18789';
  if (claw && !form.elements.tools.value) form.elements.tools.value = 'web_search, web_fetch, memory_search, memory_get, browser';
}

try {
  state = await api('state'); render();
  if (newt) {
    window.newtMission = async (kind, aim) => {
      state = await api('state');
      if (kind === 'stopAll') {
        const stopped = await api('newt/stop-all', {});
        await refresh(); closeDialog(); navigate('live');
        return 'Stopped ' + stopped.deliveries + ' delivery cycles and ' + stopped.tasks + ' other tasks.';
      }
      if (kind === 'start') {
        if (!state.newtShortcut || !aim) {
          missionForm(aim);
          return 'Choose the project and start the mission.';
        }
        try {
          const delivery = await api('newt/missions', { aim });
          liveDeliveryId = delivery.id;
          sessionStorage.setItem('uh-live-delivery', delivery.id);
          closeDialog(); await refresh(); navigate('live');
          return 'Started ' + delivery.title;
        } catch (error) { missionForm(aim); toast(error.message, true); return error.message; }
      }
      const active = state.deliveries.filter(d => d.mission && ['planning','building','checking','reviewing'].includes(d.status));
      if (kind === 'stop' && active.length !== 1) {
        closeDialog(); navigate('deliveries');
        const message = active.length ? 'Choose which mission to stop.' : 'There is no active mission to stop.';
        toast(message); return message;
      }
      const delivery = active.find(d => d.id === liveDeliveryId) || active[0] || state.deliveries.find(d => d.mission);
      closeDialog();
      if (!delivery) { navigate('live'); return 'No missions yet.'; }
      liveDeliveryId = delivery.id; sessionStorage.setItem('uh-live-delivery', delivery.id);
      if (kind === 'stop') { await api('deliveries/' + delivery.id + '/pause', {}); await refresh(); }
      navigate('live');
      return delivery.title + ' · ' + (kind === 'stop' ? 'paused' : delivery.status);
    };
    newt.postMessage('ready');
  }
  const stream = new EventSource('/api/events');
  stream.onmessage = () => { connected = true; if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 150); };
  stream.onerror = () => { connected = false; render(); };
  stream.onopen = () => { connected = true; refresh(); };
} catch (err) {
  $('#app').innerHTML = `<div class="connection-error"><h1>Couldn’t reach your workspace.</h1><p>${e(err.message)}</p><p>Start the local server with <code>npm start</code>, then reload this page.</p></div>`;
}
