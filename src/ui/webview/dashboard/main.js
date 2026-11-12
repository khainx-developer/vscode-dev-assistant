// Daily Tasks dashboard (editor panel). Attention Inbox first; everything else one click away.
import './dashboard.css';
import { loadUiState, onMessage, post, saveUiState } from '../shared/bridge.js';
import { attrs, clockTime, delegate, esc, plural, renderPreserving, timeUntil } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { renderMarkdown } from '../shared/markdown.js';
import { itemTitleText, renderAttentionItem, renderJiraItem, renderPrItem } from '../shared/items.js';

const app = document.getElementById('app');

let github = null;
let jira = null;
let inbox = null;
let status = null;
let ai = null;
let menuKey = null;

const ui = loadUiState({
  view: 'attention',
  mineOnly: false,
  teamFilter: '',
  jiraFilters: {},
  open: { snoozed: false },
  expanded: {},
});

function persist() {
  saveUiState(ui);
}

// ── Derived data ──────────────────────────────────────────────────────────

function githubSignedIn() {
  const kind = status?.github?.kind;
  return kind === 'signedIn' || kind === 'ready' || kind === 'degraded'
    || ((kind === 'refreshing' || kind === 'rateLimited') && !!status.github.user);
}

function jiraConnected() {
  const kind = status?.jira?.kind;
  return kind === 'connected' || kind === 'ready'
    || ((kind === 'refreshing' || kind === 'error') && !!status.jira.siteUrl);
}

function uniqueNames(names) {
  const seen = new Set();
  return names.filter((name) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.localeCompare(b));
}

function isMine(item) {
  const jiraMe = String(jira?.currentUser || '').trim().toLowerCase();
  const assignee = String(item.jiraTask?.assignee || '').trim().toLowerCase();
  if (jiraMe && assignee === jiraMe) return true;
  const githubMe = String(github?.me || '').trim().toLowerCase();
  if (!githubMe) return false;
  const prs = [item.pr, ...(item.relatedPRs || []).map((related) => related.pr)].filter(Boolean);
  return prs.some((pr) => String(pr.author || '').trim().toLowerCase() === githubMe);
}

function jiraGroups() {
  if (!jira?.connected) return [];
  return (jira.savedQueries || []).map((query, index) => {
    const tasks = jira.tasksByQuery?.[query.label] || [];
    const assignees = uniqueNames(tasks.map((task) => task.assignee));
    let filter = ui.jiraFilters[query.label] || '';
    if (filter && !assignees.some((name) => name.toLowerCase() === filter.toLowerCase())) filter = '';
    const shown = filter ? tasks.filter((task) => String(task.assignee || '').toLowerCase() === filter.toLowerCase()) : tasks;
    return { id: `jira-${index}`, label: query.label, assignees, filter, tasks: shown, total: tasks.length };
  });
}

// ── Pieces ────────────────────────────────────────────────────────────────

function monitoringPaused() {
  return status?.monitoringEnabled === false;
}

function header(showAi = true) {
  const refreshing = !!status?.isRefreshing;
  const paused = monitoringPaused();
  const subtitle = paused
    ? 'Monitoring paused — GitHub and Jira are not connecting.'
    : [
      githubSignedIn() && github?.me ? `GitHub: ${github.me}` : null,
      jiraConnected() && jira?.currentUser ? `Jira: ${jira.currentUser}` : null,
    ].filter(Boolean).join(' · ');
  const last = status?.lastRefreshAt ? `Updated ${clockTime(status.lastRefreshAt)}` : '';
  const actionsEnabled = !paused && !refreshing;
  return `<header class="page-header">
    <div class="title-block">
      <h1>Daily Tasks</h1>
      <p class="muted">${esc(subtitle || 'Pull requests and Jira tickets that need your attention.')}</p>
    </div>
    <div class="header-actions">
      <span class="muted small" title="${paused ? 'Monitoring is paused' : 'Refreshes automatically every 10 minutes'}">${paused ? 'Paused' : refreshing ? 'Refreshing…' : esc(last)}</span>
      <button type="button" class="secondary icon-only" data-action="refresh"${actionsEnabled ? '' : ' disabled'} title="${paused ? 'Monitoring is paused' : 'Refresh now'}" aria-label="Refresh now">
        <span class="${refreshing ? 'spin' : ''}">${icon('refresh', 'sm')}</span>
      </button>
      ${showAi && !paused ? `<button type="button" class="secondary" data-action="aiStandup" title="Generate a Yesterday / Today / Blockers summary">${icon('list', 'sm')}Standup</button>
      <button type="button" data-action="aiWhatNext"${ai?.run?.status === 'running' ? ' disabled' : ''}>${icon('sparkle', 'sm')}Ask AI: What should I do?</button>` : ''}
    </div>
  </header>`;
}

function pausedBanner() {
  if (!monitoringPaused()) return '';
  return `<div class="banner" role="status">
    ${icon('info')}
    <div class="banner-body">
      <strong>Monitoring paused.</strong> DevMate is not refreshing or connecting to GitHub or Jira. Your sign-in is kept.
    </div>
    <button type="button" data-action="resumeMonitoring">Resume</button>
  </div>`;
}

function failureBanner() {
  if (monitoringPaused() || status?.dashboard?.kind !== 'partialFailure') return '';
  const messages = status.dashboard.messages || [];
  return `<div class="banner" role="status">
    ${icon('alert')}
    <div class="banner-body">
      <strong>Some data could not be refreshed.</strong> Everything else below is up to date.
      <ul>${messages.map((message) => `<li>${esc(message)}</li>`).join('')}</ul>
    </div>
    <button type="button" class="secondary" data-action="refresh">Retry</button>
  </div>`;
}

function callout(iconName, text, actionLabel, action, extra = '', step = null) {
  return `<div class="callout">
    ${icon(iconName)}
    <span class="callout-text">${esc(text)}</span>
    <button type="button" class="secondary"${attrs({ 'data-action': action, 'data-step': step })}${extra}>${esc(actionLabel)}</button>
  </div>`;
}

function setupCallouts() {
  if (!status) return '';
  const out = [];
  const gh = status.github.kind;
  if (gh === 'signedOut' || gh === 'signingIn' || gh === 'error') {
    out.push(callout('pr', 'Sign in to see pull requests that need your review.',
      gh === 'signingIn' ? 'Signing in…' : 'Sign in to GitHub', 'githubSignIn', gh === 'signingIn' ? ' disabled' : ''));
  } else if (githubSignedIn() && github && github.monitoredRepos.length === 0) {
    out.push(callout('repo', 'Add repositories or teammates so DevMate can watch the right PRs.', 'Open Setup', 'openSetup', '', 'monitoring'));
  }
  if (status.jira.kind === 'disconnected' || status.jira.kind === 'connecting') {
    out.push(callout('ticket', 'Connect Jira to include tickets and due dates in your inbox.', 'Connect Jira', 'openSetup', '', 'jira'));
  } else if (jiraConnected() && jira && (jira.savedQueries || []).length === 0) {
    out.push(callout('ticket', 'Add a JQL query so DevMate knows which Jira tickets to watch.', 'Open Setup', 'openSetup', '', 'jira'));
  }
  return out.length ? `<div class="callouts">${out.join('')}</div>` : '';
}

function welcome() {
  const signingIn = status?.github?.kind === 'signingIn';
  return `<section class="welcome">
    <div class="welcome-icon">${icon('bell', 'lg')}</div>
    <h2>See what needs you — without leaving VS Code</h2>
    <p class="muted">DevMate watches your GitHub pull requests and Jira tickets and lists only what needs your attention:
      reviews you owe, failing checks, requested changes, new comments and due dates.</p>
    <div class="row wrap center">
      <button type="button" data-action="githubSignIn"${signingIn ? ' disabled' : ''}>${icon('pr', 'sm')}${signingIn ? 'Signing in…' : 'Sign in to GitHub'}</button>
      <button type="button" class="secondary" data-action="openSetup">${icon('gear', 'sm')}Open Setup</button>
    </div>
    <p class="muted small">Setup takes about a minute. Jira and AI are optional.</p>
  </section>`;
}

function aiCard() {
  const run = ai?.run;
  if (!run) return '';
  const running = run.status === 'running';
  let body;
  if (run.status === 'error') {
    body = `<div class="banner${run.setupHint ? '' : ' error'}">
      ${icon(run.setupHint ? 'info' : 'alert')}
      <div class="banner-body">${esc(run.error || 'The AI request failed.')}</div>
      ${run.setupHint
        ? (ai.provider === 'none'
          ? '<button type="button" data-action="aiEnable">Turn on AI</button>'
          : '<button type="button" class="secondary" data-action="openSetup" data-step="ai">Open Setup</button>')
        : (run.kind === 'whatNext' ? '<button type="button" class="secondary" data-action="aiWhatNext">Try again</button>' : '')}
    </div>`;
  } else if (run.status === 'cancelled') {
    body = `${run.text ? `<div class="markdown">${renderMarkdown(run.text)}</div>` : ''}<p class="muted small">Stopped.</p>`;
  } else if (running && !run.text) {
    body = '<div class="stack"><div class="skeleton short"></div><div class="skeleton short"></div><p class="muted small">Thinking about your inbox…</p></div>';
  } else {
    body = `<div class="markdown">${renderMarkdown(run.text)}${running ? '<span class="cursor"></span>' : ''}</div>`;
  }
  const actions = running
    ? '<button type="button" class="secondary" data-action="aiCancel">' + icon('stop', 'sm') + 'Stop</button>'
    : [
      run.text && run.status === 'done' ? `<button type="button" class="ghost" data-action="aiCopy" title="Copy as Markdown">${icon('copy', 'sm')}Copy</button>` : '',
      run.kind === 'whatNext' && run.status === 'done' ? `<button type="button" class="ghost" data-action="aiWhatNext">${icon('refresh', 'sm')}Ask again</button>` : '',
    ].join('');
  return `<section class="ai-card" aria-live="polite" aria-busy="${running}">
    <div class="ai-head">
      ${icon('sparkle')}
      <strong>${esc(run.title)}</strong>
      ${run.modelName ? `<span class="muted small">${esc(run.modelName)}</span>` : ''}
      <span class="spacer"></span>
      ${actions}
      <button type="button" class="ghost icon-only" data-action="aiDismiss" aria-label="Close AI answer" title="Close">${icon('close', 'sm')}</button>
    </div>
    <div class="ai-body">${body}</div>
    ${run.status === 'done' ? '<p class="ai-foot muted small">AI-generated from your inbox — double-check before acting.</p>' : ''}
  </section>`;
}

function tiles() {
  const counts = inbox?.counts || { attention: 0, myPrs: 0, teamPrs: 0, myJira: 0 };
  const loading = !inbox || inbox.items === null;
  const defs = [
    { view: 'attention', label: 'Needs attention', value: loading ? '…' : counts.attention, sub: counts.snoozed ? `${counts.snoozed} snoozed` : 'Sorted by priority', tone: counts.attention > 0 ? 'danger' : '' },
    { view: 'myPrs', label: 'My PRs', value: githubSignedIn() ? counts.myPrs : '—', sub: githubSignedIn() ? 'Open, authored by you' : 'GitHub not connected' },
    { view: 'teamPrs', label: 'Team PRs', value: githubSignedIn() ? counts.teamPrs : '—', sub: githubSignedIn() ? 'From teammates you watch' : 'GitHub not connected' },
    { view: 'jira', label: 'My Jira', value: jiraConnected() ? counts.myJira : '—', sub: jiraConnected() ? 'Tickets assigned to you' : 'Jira not connected' },
  ];
  return `<div class="tiles" role="toolbar" aria-label="Filter the dashboard">${defs.map((tile) => `<button type="button" class="tile${tile.tone ? ` ${tile.tone}` : ''}"${attrs({
    'data-action': 'view',
    'data-view': tile.view,
    'aria-pressed': ui.view === tile.view ? 'true' : 'false',
  })}>
      <span class="tile-label">${esc(tile.label)}</span>
      <span class="tile-value">${esc(tile.value)}</span>
      <span class="tile-sub">${esc(tile.sub)}</span>
    </button>`).join('')}</div>`;
}

function skeletonList(count = 3) {
  return `<div class="list">${Array.from({ length: count }, () => '<div class="skeleton"></div>').join('')}</div>`;
}

function emptyState(iconName, title, text, action) {
  return `<div class="empty">
    <span class="empty-icon">${icon(iconName, 'lg')}</span>
    <p class="empty-title">${esc(title)}</p>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${action || ''}
  </div>`;
}

const ctx = () => ({ githubState: github, jiraState: jira });

function attentionSection() {
  const items = inbox?.items;
  let list;
  if (!items) {
    list = skeletonList();
  } else {
    const visible = ui.mineOnly ? items.filter(isMine) : items;
    if (visible.length === 0) {
      list = items.length > 0
        ? emptyState('user', 'Nothing of yours needs attention.', `${plural(items.length, 'item')} for your team ${items.length === 1 ? 'is' : 'are'} hidden by “Mine only”.`, '')
        : emptyState('checkCircle', 'You’re clear — nothing needs your attention right now.',
          status?.lastRefreshAt ? `Last checked at ${clockTime(status.lastRefreshAt)}.` : '', '');
    } else {
      list = `<div class="list">${visible.map((item) => renderAttentionItem(item, ctx(), { expanded: ui.expanded, menuKey, snoozable: true })).join('')}</div>`;
    }
  }
  const count = items ? (ui.mineOnly ? items.filter(isMine).length : items.length) : 0;
  return `<section class="hero" aria-labelledby="inbox-title">
    <div class="section-head">
      <h2 id="inbox-title">${icon('bell')}Attention Inbox <span class="count">${count}</span></h2>
      <span class="spacer"></span>
      <label class="checkbox"><input type="checkbox" id="mineOnly"${ui.mineOnly ? ' checked' : ''}> Mine only</label>
    </div>
    ${list}
    ${snoozedGroup()}
  </section>`;
}

function snoozedGroup() {
  const snoozed = inbox?.snoozed || [];
  if (!snoozed.length) return '';
  const open = !!ui.open.snoozed;
  return `<div class="group">
    <button type="button" class="group-head" data-action="toggleGroup" data-group="snoozed" aria-expanded="${open}">
      ${icon(open ? 'chevronDown' : 'chevronRight', 'sm')}${icon('snooze', 'sm')}<span>Snoozed</span><span class="count">${snoozed.length}</span>
    </button>
    ${open ? `<div class="list">${snoozed.map((entry) => `<div class="snoozed-row">
      ${icon(entry.item.jiraTask ? 'ticket' : 'pr', 'sm')}
      <span class="snoozed-title">${esc(itemTitleText(entry.item))}</span>
      <span class="muted small">back ${esc(timeUntil(entry.until))}</span>
      <button type="button" class="ghost"${attrs({ 'data-action': 'unsnooze', 'data-key': entry.snoozeKey })}>Unsnooze</button>
    </div>`).join('')}</div>` : ''}
  </div>`;
}

function myPrsBody() {
  if (!githubSignedIn()) return emptyState('pr', 'Sign in to see pull requests that need your review.', '', '<button type="button" data-action="githubSignIn">Sign in to GitHub</button>');
  const items = github?.attention?.myPRs || [];
  if (!items.length) return emptyState('pr', 'No open pull requests of yours.', 'DevMate only looks in the repositories you monitor.', '<button type="button" class="secondary" data-action="openSetup" data-step="monitoring">Manage repositories</button>');
  return `<div class="list">${items.map((item) => renderPrItem(item, { expanded: ui.expanded })).join('')}</div>`;
}

function teamPrsBody() {
  if (!githubSignedIn()) return emptyState('users', 'Sign in to GitHub to see your teammates’ pull requests.', '', '<button type="button" data-action="githubSignIn">Sign in to GitHub</button>');
  const teammates = uniqueNames((github?.monitoredAuthors || []).filter((author) => author.status === 'valid').map((author) => author.username));
  if (ui.teamFilter && !teammates.some((name) => name.toLowerCase() === ui.teamFilter.toLowerCase())) ui.teamFilter = '';
  const items = (github?.attention?.teamPRs || []).filter((item) => !ui.teamFilter || item.pr.author.toLowerCase() === ui.teamFilter.toLowerCase());
  const filter = teammates.length > 1
    ? `<div class="filter-row"><select id="teamFilter" aria-label="Filter team pull requests by teammate">
        <option value="">All teammates</option>
        ${teammates.map((name) => `<option value="${esc(name)}"${name.toLowerCase() === ui.teamFilter.toLowerCase() ? ' selected' : ''}>${esc(name)}</option>`).join('')}
      </select></div>`
    : '';
  if (!teammates.length) return emptyState('users', 'No teammates added yet.', 'Add GitHub usernames in Setup to track their pull requests here.', '<button type="button" class="secondary" data-action="openSetup" data-step="monitoring">Add teammates</button>');
  return filter + (items.length
    ? `<div class="list">${items.map((item) => renderPrItem(item, { expanded: ui.expanded })).join('')}</div>`
    : emptyState('users', 'No open pull requests from your teammates.', '', ''));
}

function jiraBody() {
  if (!jiraConnected()) return emptyState('ticket', 'Connect Jira to include tickets and due dates in your inbox.', '', '<button type="button" data-action="openSetup" data-step="jira">Connect Jira</button>');
  const groups = jiraGroups();
  if (!groups.length) return emptyState('ticket', 'No JQL queries yet.', 'Add a query in Setup to choose which tickets to show.', '<button type="button" class="secondary" data-action="openSetup" data-step="jira">Add a query</button>');
  return groups.map((group) => `<div class="jira-group">
    <div class="section-head sub">
      <h3>${esc(group.label)} <span class="count">${group.tasks.length}</span></h3>
      <span class="spacer"></span>
      ${group.assignees.length > 1 ? `<select class="compact-select"${attrs({ 'data-jira-filter': group.label, 'aria-label': `Filter ${group.label} by assignee` })}>
        <option value="">All assignees</option>
        ${group.assignees.map((name) => `<option value="${esc(name)}"${name.toLowerCase() === group.filter.toLowerCase() ? ' selected' : ''}>${esc(name)}</option>`).join('')}
      </select>` : ''}
    </div>
    ${group.tasks.length ? `<div class="list">${group.tasks.map((task) => renderJiraItem(task, { expanded: ui.expanded })).join('')}</div>` : '<p class="muted small">No tickets match this query.</p>'}
  </div>`).join('');
}

const SECTIONS = {
  myPrs: { title: 'My pull requests', icon: 'pr', count: () => (githubSignedIn() ? (github?.attention?.myPRs || []).length : null), body: myPrsBody },
  teamPrs: { title: 'Team pull requests', icon: 'users', count: () => (githubSignedIn() ? (github?.attention?.teamPRs || []).length : null), body: teamPrsBody },
  jira: { title: 'Jira tickets', icon: 'ticket', count: () => (jiraConnected() ? jiraGroups().reduce((sum, group) => sum + group.total, 0) : null), body: jiraBody },
};

function heroSection() {
  if (ui.view === 'attention') return attentionSection();
  const section = SECTIONS[ui.view];
  const count = section.count();
  return `<section class="hero">
    <div class="section-head">
      <h2>${icon(section.icon)}${esc(section.title)}${count !== null ? ` <span class="count">${count}</span>` : ''}</h2>
      <span class="spacer"></span>
      <button type="button" class="link" data-action="view" data-view="attention">Back to Attention Inbox</button>
    </div>
    ${section.body()}
  </section>`;
}

function everythingElse() {
  const keys = Object.keys(SECTIONS).filter((key) => key !== ui.view);
  return `<section class="others" aria-label="Everything else">
    <h2 class="others-title">Everything else</h2>
    ${keys.map((key) => {
      const section = SECTIONS[key];
      const open = !!ui.open[key];
      const count = section.count();
      return `<div class="group">
        <button type="button" class="group-head"${attrs({ 'data-action': 'toggleGroup', 'data-group': key, 'aria-expanded': open ? 'true' : 'false' })}>
          ${icon(open ? 'chevronDown' : 'chevronRight', 'sm')}${icon(section.icon, 'sm')}<span>${esc(section.title)}</span>${count !== null ? `<span class="count">${count}</span>` : ''}
        </button>
        ${open ? `<div class="group-body">${section.body()}</div>` : ''}
      </div>`;
    }).join('')}
  </section>`;
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  if (!status) {
    renderPreserving(app, `${header()}${skeletonList(4)}`);
    return;
  }
  const needsSetup = status.dashboard.kind === 'needsSetup';
  const html = needsSetup
    ? `${header(false)}${pausedBanner()}${aiCard()}${welcome()}`
    : `${header()}${pausedBanner()}${failureBanner()}${setupCallouts()}${aiCard()}${tiles()}${heroSection()}${everythingElse()}`;
  renderPreserving(app, html);
}

// ── Events ────────────────────────────────────────────────────────────────

delegate(app, {
  refresh: () => post({ command: 'session.refreshAll' }),
  resumeMonitoring: () => post({ command: 'settings.setMonitoring', enabled: true }),
  githubSignIn: () => post({ command: 'github.signIn' }),
  openSetup: (el) => post({ command: 'nav.openSetup', step: el.getAttribute('data-step') || undefined }),
  view: (el) => {
    ui.view = el.getAttribute('data-view');
    persist();
    render();
    window.scrollTo({ top: 0 });
  },
  toggleGroup: (el) => {
    const id = el.getAttribute('data-group');
    ui.open[id] = !ui.open[id];
    persist();
    render();
  },
  toggleDetail: (el) => {
    const key = el.getAttribute('data-key');
    ui.expanded[key] = !ui.expanded[key];
    if (!ui.expanded[key]) delete ui.expanded[key];
    persist();
    render();
  },
  openPr: (el) => post({ command: 'github.openPr', repoKey: el.getAttribute('data-repo'), number: Number(el.getAttribute('data-number')), url: el.getAttribute('data-url') }),
  openComment: (el) => post({ command: 'github.openComment', repoKey: el.getAttribute('data-repo'), number: Number(el.getAttribute('data-number')), url: el.getAttribute('data-url') }),
  openJira: (el) => post({ command: 'jira.openTask', url: el.getAttribute('data-url') }),
  toggleSnoozeMenu: (el) => {
    const key = el.getAttribute('data-key');
    menuKey = menuKey === key ? null : key;
    render();
    if (menuKey) app.querySelector('.menu [role="menuitem"]')?.focus();
  },
  snooze: (el) => {
    menuKey = null;
    post({ command: 'attention.snooze', key: el.getAttribute('data-key'), option: el.getAttribute('data-option') });
  },
  unsnooze: (el) => post({ command: 'attention.unsnooze', key: el.getAttribute('data-key') }),
  explain: (el) => post({ command: 'ai.explain', key: el.getAttribute('data-key') }),
  aiWhatNext: () => post({ command: 'ai.whatNext' }),
  aiStandup: () => post({ command: 'ai.standup' }),
  aiCancel: () => post({ command: 'ai.cancel' }),
  aiDismiss: () => post({ command: 'ai.dismiss' }),
  aiCopy: () => post({ command: 'ai.copy' }),
  aiEnable: () => {
    post({ command: 'ai.setProvider', provider: 'vscodeLm' });
    post({ command: 'ai.whatNext' });
  },
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'mineOnly') {
    ui.mineOnly = target.checked;
  } else if (target.id === 'teamFilter') {
    ui.teamFilter = target.value;
  } else if (target.hasAttribute('data-jira-filter')) {
    ui.jiraFilters[target.getAttribute('data-jira-filter')] = target.value;
  } else {
    return;
  }
  persist();
  render();
});

document.addEventListener('click', (event) => {
  if (menuKey && !event.target.closest('.menu-anchor')) {
    menuKey = null;
    render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuKey) {
    const key = menuKey;
    menuKey = null;
    render();
    app.querySelector(`[data-action="toggleSnoozeMenu"][data-key="${CSS.escape(key)}"]`)?.focus();
  }
});

onMessage((message) => {
  switch (message.command) {
    case 'github.state':
      github = message.state;
      break;
    case 'jira.state':
      jira = message.state;
      break;
    case 'dashboard.inboxState':
      inbox = message.state;
      break;
    case 'session.status':
      status = message.status;
      break;
    case 'ai.state':
      ai = message.state;
      break;
    default:
      return;
  }
  scheduleRender();
});

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

// Keep relative times fresh.
setInterval(() => {
  if (!document.hidden && !menuKey) render();
}, 60 * 1000);

render();
post({ command: 'session.ready' });
