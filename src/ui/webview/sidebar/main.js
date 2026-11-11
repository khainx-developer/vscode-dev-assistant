// Activity-bar sidebar: Home (attention summary), Tools (text utilities), Setup (guided checklist).
import './sidebar.css';
import { loadUiState, onMessage, post, readBootData, saveUiState } from '../shared/bridge.js';
import { attrs, clockTime, delegate, esc, renderPreserving } from '../shared/dom.js';
import { icon } from '../shared/icons.js';
import { renderCompactItem } from '../shared/items.js';

const boot = readBootData();
const app = document.getElementById('app');
const TOOLS = boot.tools || [];
const HOME_LIMIT = 5;
const PRESET_JQL = {
  label: 'My open tickets',
  jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC',
};

let github = null;
let jira = null;
let inbox = null;
let status = null;
let ai = null;

const ui = loadUiState({ tab: boot.initialTab || 'home', openStep: null, toolQuery: '' });
if (boot.initialTab && boot.initialTab !== 'home') ui.tab = boot.initialTab;
if (boot.initialStep) ui.openStep = boot.initialStep;

// Transient form feedback (not persisted).
const errors = { repo: '', author: '', jiraSite: '', jiraUser: '', jiraTeam: '', jql: '' };
const fresh = new Set();
let editingQuery = null;

function persist() {
  saveUiState(ui);
}

function operation(state, id) {
  return state?.pendingOperations?.[id] || null;
}

function pending(state, id) {
  return !!operation(state, id)?.pending;
}

function signedIn() {
  const g = status?.github;
  if (!g) return false;
  return g.kind === 'signedIn' || g.kind === 'ready' || g.kind === 'degraded'
    || ((g.kind === 'refreshing' || g.kind === 'rateLimited') && !!g.user);
}

function jiraConnected() {
  const j = status?.jira;
  if (!j) return false;
  return j.kind === 'connected' || j.kind === 'ready' || ((j.kind === 'refreshing' || j.kind === 'error') && !!j.siteUrl);
}

// ── Shell ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tools', label: 'Tools', icon: 'tools' },
  { id: 'setup', label: 'Setup', icon: 'gear' },
];

function tabBar() {
  const setup = status?.setup;
  const setupBadge = setup && setup.completed < setup.required ? `<span class="tab-badge" title="Setup steps remaining">${setup.required - setup.completed}</span>` : '';
  return `<nav class="tabs" role="tablist" aria-label="DevMate Kit">${TABS.map((tab) => `<button type="button" role="tab"${attrs({
    id: `tab-${tab.id}`,
    'data-action': 'tab',
    'data-tab': tab.id,
    'aria-selected': ui.tab === tab.id ? 'true' : 'false',
    tabindex: ui.tab === tab.id ? '0' : '-1',
  })}>${esc(tab.label)}${tab.id === 'setup' ? setupBadge : ''}</button>`).join('')}</nav>`;
}

// ── Home ──────────────────────────────────────────────────────────────────

function statusPill(kind, label, step) {
  const cls = kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'off';
  const stateText = kind === 'ok' ? 'connected' : kind === 'warn' ? 'needs attention' : 'not connected';
  return `<button type="button" class="status-pill ${cls}"${attrs({ 'data-action': 'openStep', 'data-step': step, title: `${label}: ${stateText} — open Setup` })}>
    <span class="state-dot"></span>${esc(label)}<span class="sr-only"> ${stateText}</span>
  </button>`;
}

function githubPillKind() {
  const kind = status?.github?.kind;
  if (kind === 'degraded' || kind === 'rateLimited' || kind === 'error') return 'warn';
  if (signedIn()) return (github?.monitoredRepos || []).length ? 'ok' : 'warn';
  return 'off';
}

function jiraPillKind() {
  if (status?.jira?.kind === 'error') return 'warn';
  if (jiraConnected()) return jira?.currentUser && (jira?.savedQueries || []).length ? 'ok' : 'warn';
  return 'off';
}

function homeWelcome() {
  const signingIn = status?.github?.kind === 'signingIn';
  return `<section class="welcome">
    <div class="welcome-mark">${icon('bell', 'lg')}</div>
    <h2>Your daily work radar</h2>
    <p>See the pull requests and Jira tickets that need <em>you</em> — reviews you owe, failing checks, new comments, due dates — without leaving VS Code.</p>
    <button type="button" class="block" data-action="githubSignIn"${signingIn ? ' disabled' : ''}>${icon('pr', 'sm')}${signingIn ? 'Signing in…' : 'Sign in to GitHub'}</button>
    <button type="button" class="secondary block" data-action="tab" data-tab="setup">${icon('gear', 'sm')}Start setup</button>
    <p class="muted small">Jira and AI are optional. Text tools work right away in the <button type="button" class="link" data-action="tab" data-tab="tools">Tools</button> tab.</p>
  </section>`;
}

function homeNudges() {
  const out = [];
  if (status?.github?.kind === 'signedOut' || status?.github?.kind === 'error') {
    out.push(['pr', 'Sign in to see pull requests that need your review.', 'Sign in', 'githubSignIn', '']);
  } else if (signedIn() && github && github.monitoredRepos.length === 0) {
    out.push(['repo', 'Add repositories or teammates so DevMate can watch the right PRs.', 'Open Setup', 'openStep', 'monitoring']);
  }
  if (status?.jira?.kind === 'disconnected') {
    out.push(['ticket', 'Connect Jira to include tickets and due dates in your inbox.', 'Connect Jira', 'openStep', 'jira']);
  }
  return out.map(([iconName, text, label, action, step]) => `<div class="nudge">
    ${icon(iconName, 'sm')}<span>${esc(text)}</span>
    <button type="button" class="link"${attrs({ 'data-action': action, 'data-step': step || null })}>${esc(label)}</button>
  </div>`).join('');
}

function homeTab() {
  if (!status) return '<div class="stack"><div class="skeleton short"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  if (status.dashboard.kind === 'needsSetup') return homeWelcome();

  const counts = inbox?.counts || { attention: 0, myPrs: 0, teamPrs: 0, myJira: 0 };
  const items = inbox?.items;
  const refreshing = !!status.isRefreshing;
  const stats = [
    ['Need attention', items ? counts.attention : '…', counts.attention > 0 ? 'danger' : ''],
    ['My PRs', signedIn() ? counts.myPrs : '—', ''],
    ['Team PRs', signedIn() ? counts.teamPrs : '—', ''],
    ['My Jira', jiraConnected() ? counts.myJira : '—', ''],
  ];

  let list;
  if (!items) {
    list = '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div></div>';
  } else if (items.length === 0) {
    list = `<div class="empty compact">
      <span class="empty-icon">${icon('checkCircle', 'lg')}</span>
      <p class="empty-title">You’re clear — nothing needs your attention right now.</p>
      ${status.lastRefreshAt ? `<p class="small">Last checked at ${esc(clockTime(status.lastRefreshAt))}.</p>` : ''}
    </div>`;
  } else {
    const more = items.length - HOME_LIMIT;
    list = `<div class="compact-list">${items.slice(0, HOME_LIMIT).map(renderCompactItem).join('')}</div>
      ${more > 0 ? `<button type="button" class="link see-all" data-action="openDashboard">See all ${items.length} items</button>` : ''}`;
  }

  const banner = status.dashboard.kind === 'partialFailure'
    ? `<div class="banner small" role="status">${icon('alert', 'sm')}<div class="banner-body">${status.dashboard.messages.map(esc).join('<br/>')}</div></div>`
    : '';

  return `<div class="home">
    <div class="pills">
      ${statusPill(githubPillKind(), 'GitHub', signedIn() ? 'monitoring' : 'github')}
      ${statusPill(jiraPillKind(), 'Jira', 'jira')}
      ${statusPill(ai?.provider === 'vscodeLm' ? 'ok' : 'off', 'AI', 'ai')}
      <span class="spacer"></span>
      <button type="button" class="ghost icon-only" data-action="refresh"${refreshing ? ' disabled' : ''} title="Refresh now" aria-label="Refresh now"><span class="${refreshing ? 'spin' : ''}">${icon('refresh', 'sm')}</span></button>
    </div>
    ${banner}
    ${homeNudges()}
    <button type="button" class="stats" data-action="openDashboard" title="Open the Daily Tasks dashboard">
      ${stats.map(([label, value, tone]) => `<span class="stat${tone ? ` ${tone}` : ''}"><span class="stat-value">${esc(value)}</span><span class="stat-label">${esc(label)}</span></span>`).join('')}
    </button>
    <div class="home-section-head">
      <h2>Needs your attention</h2>
      ${items && inbox.snoozed?.length ? `<span class="muted small">${inbox.snoozed.length} snoozed</span>` : ''}
    </div>
    ${list}
    <div class="home-actions">
      <button type="button" class="block" data-action="openDashboard">${icon('dashboard', 'sm')}Open Daily Tasks</button>
      ${ai?.provider === 'vscodeLm'
        ? `<button type="button" class="secondary block" data-action="aiWhatNext">${icon('sparkle', 'sm')}Ask AI: What should I do next?</button>`
        : ''}
    </div>
    <p class="muted small footnote">${refreshing ? 'Refreshing…' : status.lastRefreshAt ? `Updated ${esc(clockTime(status.lastRefreshAt))} · refreshes every 10 min` : ''}</p>
  </div>`;
}

// ── Tools ─────────────────────────────────────────────────────────────────

function toolsTab() {
  const query = ui.toolQuery.trim().toLowerCase();
  const shown = TOOLS.filter((tool) => !query
    || tool.title.toLowerCase().includes(query)
    || tool.description.toLowerCase().includes(query)
    || (tool.tags || []).some((tag) => tag.includes(query)));
  return `<div class="tools">
    <div class="search">${icon('search', 'sm')}<input type="text" id="toolQuery" data-keep-value placeholder="Filter tools" aria-label="Filter tools" value="${esc(ui.toolQuery)}"></div>
    <div class="tool-list">
      ${shown.map((tool) => `<div class="tool" role="button" tabindex="0"${attrs({ 'data-action': 'openTool', 'data-tool': tool.id, title: `Open ${tool.title}` })}>
        <span class="tool-icon">${icon(tool.icon)}</span>
        <span class="tool-body"><span class="tool-title">${esc(tool.title)}</span><span class="tool-desc">${esc(tool.description)}</span></span>
      </div>`).join('') || '<p class="muted small">No tools match.</p>'}
    </div>
    <p class="muted small">Tip: select text in the editor and right-click → <strong>DevMate Kit</strong> to transform it in place.</p>
  </div>`;
}

// ── Setup ─────────────────────────────────────────────────────────────────

const STATE_LABELS = {
  done: 'Done',
  todo: 'To do',
  attention: 'Needs attention',
  optional: 'Optional',
  checking: 'Checking…',
};

function fieldError(message) {
  return message ? `<p class="field-error" role="alert">${esc(message)}</p>` : '';
}

function opFeedback(state, id, okText) {
  const op = operation(state, id);
  if (!op || op.pending || !op.result) return '';
  return op.result.ok ? `<p class="field-ok" role="status">${icon('check', 'sm')} ${esc(okText)}</p>` : fieldError(op.result.reason || 'That didn’t work. Try again.');
}

function entryChips(entries, kind) {
  if (!entries.length) return '';
  return `<ul class="entries">${entries.map((entry) => {
    const label = kind === 'repo' ? `${entry.owner}/${entry.repo}` : entry.username;
    const invalid = entry.status === 'invalid';
    const removeAttrs = kind === 'repo'
      ? { 'data-action': 'removeRepo', 'data-owner': entry.owner, 'data-repo': entry.repo }
      : { 'data-action': 'removeAuthor', 'data-username': entry.username };
    return `<li class="entry${invalid ? ' invalid' : ''}"${invalid && entry.invalidReason ? attrs({ title: entry.invalidReason }) : ''}>
      ${invalid ? icon('alert', 'sm') : ''}<span>${esc(label)}</span>
      <button type="button" class="ghost icon-only"${attrs({ ...removeAttrs, 'aria-label': `Remove ${label}` })}>${icon('close', 'sm')}</button>
    </li>`;
  }).join('')}</ul>`;
}

function githubStepBody() {
  if (signedIn()) {
    return `<p>Signed in as <strong>${esc(github?.me || '')}</strong>.</p>
      <p class="field-help">DevMate uses the GitHub account you’re signed into in VS Code. Switch accounts from the Accounts menu.</p>`;
  }
  const signingIn = status?.github?.kind === 'signingIn';
  return `<p class="field-help">DevMate uses your GitHub account in VS Code and only reads pull requests in repositories you choose.</p>
    <button type="button" data-action="githubSignIn"${signingIn ? ' disabled' : ''}>${signingIn ? 'Waiting for browser…' : 'Sign in to GitHub'}</button>
    ${opFeedback(github, 'github.signIn', 'Signed in.')}`;
}

function monitoringStepBody() {
  if (!signedIn()) return '<p class="field-help">Sign in to GitHub first.</p>';
  const repos = github?.monitoredRepos || [];
  const authors = github?.monitoredAuthors || [];
  const addingRepo = pending(github, 'github.addRepo');
  const addingAuthor = pending(github, 'github.addAuthor');
  return `<label class="field-label" for="ghRepo">Repositories</label>
    <div class="field-row">
      <input type="text" id="ghRepo" data-keep-value placeholder="owner/repo" autocomplete="off" data-enter="addRepo">
      <button type="button" class="secondary" data-action="addRepo"${addingRepo ? ' disabled' : ''}>${addingRepo ? 'Adding…' : 'Add'}</button>
    </div>
    ${fieldError(errors.repo)}
    ${entryChips(repos, 'repo')}
    <label class="field-label" for="ghAuthor">Teammates (GitHub usernames)</label>
    <div class="field-row">
      <input type="text" id="ghAuthor" data-keep-value placeholder="octocat" autocomplete="off" data-enter="addAuthor">
      <button type="button" class="secondary" data-action="addAuthor"${addingAuthor ? ' disabled' : ''}>${addingAuthor ? 'Adding…' : 'Add'}</button>
    </div>
    ${fieldError(errors.author)}
    ${entryChips(authors, 'author')}
    <p class="field-help">Your own PRs in these repositories appear under My PRs; your teammates’ appear under Team PRs and in the inbox when they need you.</p>`;
}

function jiraStepBody() {
  if (!jiraConnected()) {
    const connecting = status?.jira?.kind === 'connecting';
    return `<label class="field-label" for="jiraSite">Jira site URL</label>
      <input type="url" id="jiraSite" data-keep-value placeholder="https://your-company.atlassian.net" data-enter="connectJira">
      ${fieldError(errors.jiraSite)}
      <div class="step-actions"><button type="button" data-action="connectJira"${connecting ? ' disabled' : ''}>${connecting ? 'Waiting for Atlassian…' : 'Connect Jira'}</button></div>
      <p class="field-help">Opens Atlassian in your browser so you can approve access. Tokens are kept in VS Code’s secret storage.</p>`;
  }

  const queries = jira?.savedQueries || [];
  const team = jira?.teamMembers || [];
  const saving = pending(jira, editingQuery ? 'jira.updateQuery' : 'jira.addQuery');
  const editing = editingQuery ? queries.find((query) => query.label === editingQuery) : null;
  const host = (() => {
    try {
      return new URL(jira.siteUrl).host;
    } catch {
      return jira?.siteUrl || '';
    }
  })();
  const disconnecting = pending(jira, 'jira.disconnect');

  return `<div class="connected-row">
      <span class="state-dot ok"></span><span>Connected to <strong>${esc(host)}</strong></span>
      <span class="spacer"></span>
      <button type="button" class="ghost" data-action="disconnectJira"${disconnecting ? ' disabled' : ''}>${disconnecting ? 'Disconnecting…' : 'Disconnect'}</button>
    </div>

    <label class="field-label" for="jiraUser">Your name in Jira</label>
    <div class="field-row">
      <input type="text" id="jiraUser" data-keep-value placeholder="e.g. Jane Doe" value="${esc(jira?.currentUser || '')}" data-enter="saveJiraUser">
      <button type="button" class="secondary" data-action="saveJiraUser"${pending(jira, 'jira.setCurrentUser') ? ' disabled' : ''}>Save</button>
    </div>
    ${errors.jiraUser ? fieldError(errors.jiraUser) : opFeedback(jira, 'jira.setCurrentUser', 'Saved.')}
    <p class="field-help">Type it exactly as it appears in the <strong>Assignee</strong> field on your tickets.</p>

    <label class="field-label" for="jiraTeam">Teammates in Jira (optional)</label>
    <div class="field-row">
      <input type="text" id="jiraTeam" data-keep-value placeholder="e.g. Alex Smith" data-enter="addJiraTeammate">
      <button type="button" class="secondary" data-action="addJiraTeammate"${pending(jira, 'jira.addTeamMember') ? ' disabled' : ''}>Add</button>
    </div>
    ${fieldError(errors.jiraTeam)}
    ${team.length ? `<ul class="entries">${team.map((name) => `<li class="entry"><span>${esc(name)}</span>
      <button type="button" class="ghost icon-only"${attrs({ 'data-action': 'removeJiraTeammate', 'data-name': name, 'aria-label': `Remove ${name}` })}>${icon('close', 'sm')}</button></li>`).join('')}</ul>` : ''}

    <label class="field-label">Which tickets to fetch (JQL)</label>
    ${queries.length ? `<ul class="queries">${queries.map((query) => `<li class="query">
      <div class="row"><strong>${esc(query.label)}</strong><span class="spacer"></span>
        <button type="button" class="ghost icon-only"${attrs({ 'data-action': 'editQuery', 'data-label': query.label, 'aria-label': `Edit ${query.label}`, title: 'Edit' })}>${icon('edit', 'sm')}</button>
        <button type="button" class="ghost icon-only"${attrs({ 'data-action': 'removeQuery', 'data-label': query.label, 'aria-label': `Remove ${query.label}`, title: 'Remove' })}>${icon('trash', 'sm')}</button>
      </div>
      <div class="mono small muted query-jql">${esc(query.jql)}</div>
    </li>`).join('')}</ul>` : `<p class="field-help">No queries yet. <button type="button" class="link" data-action="presetQuery">Use “${esc(PRESET_JQL.label)}”</button></p>`}
    <div class="query-form">
      <input type="text" id="jqlLabel" data-keep-value placeholder="Label, e.g. My open tickets" aria-label="Query label" value="${esc(editing ? editing.label : '')}">
      <textarea id="jqlText" data-keep-value rows="2" placeholder="${esc(PRESET_JQL.jql)}" aria-label="JQL">${esc(editing ? editing.jql : '')}</textarea>
      ${fieldError(errors.jql)}
      <div class="step-actions">
        <button type="button" class="secondary" data-action="saveQuery"${saving ? ' disabled' : ''}>${saving ? 'Saving…' : editingQuery ? 'Update query' : 'Add query'}</button>
        ${editingQuery ? '<button type="button" class="ghost" data-action="cancelEdit">Cancel</button>' : ''}
      </div>
    </div>`;
}

function aiStepBody() {
  const enabled = ai?.provider === 'vscodeLm';
  let models = '';
  if (enabled) {
    if (ai && !ai.supported) {
      models = '<p class="field-help">This editor doesn’t expose a language-model API, so AI features aren’t available here.</p>';
    } else if (ai?.modelsLoading) {
      models = '<p class="field-help">Looking for models in this editor…</p>';
    } else if (!ai?.models) {
      models = `<div class="step-actions"><button type="button" class="secondary" data-action="loadModels">Choose a model…</button></div>
        <p class="field-help">If you don’t choose, DevMate uses the first GitHub Copilot model available.</p>`;
    } else if (ai.models.length === 0) {
      models = `<div class="banner small">${icon('info', 'sm')}<div class="banner-body">No language models available in this editor. Install or sign in to GitHub Copilot Chat (or another language-model provider), then <button type="button" class="link" data-action="loadModels">check again</button>.</div></div>`;
    } else {
      models = `<label class="field-label" for="aiModel">Model</label>
        <select id="aiModel">${ai.models.map((model) => `<option value="${esc(model.id)}"${model.id === ai.selectedModelId ? ' selected' : ''}>${esc(model.name || model.id)} · ${esc(model.vendor === 'copilot' ? 'GitHub Copilot' : model.vendor)}</option>`).join('')}</select>
        <p class="field-help">The list comes from this editor — any installed language-model provider shows up here.</p>`;
    }
  }
  return `<label class="checkbox"><input type="checkbox" id="aiEnabled"${enabled ? ' checked' : ''}> Use AI from this editor</label>
    <p class="field-help">AI runtime: use models from this editor (GitHub Copilot and any other installed language-model providers). DevMate sends only titles, statuses and short comment excerpts — never tokens.</p>
    ${models}`;
}

const STEP_BODIES = { github: githubStepBody, monitoring: monitoringStepBody, jira: jiraStepBody, ai: aiStepBody };

function defaultOpenStep(steps) {
  const next = steps.find((step) => step.state === 'attention' || step.state === 'todo');
  return next ? next.id : null;
}

function setupTab() {
  if (!status) return '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div></div>';
  const { steps, completed, required } = status.setup;
  const openStep = ui.openStep === null ? defaultOpenStep(steps) : ui.openStep;
  const percent = Math.round((completed / required) * 100);
  return `<div class="setup">
    <div class="progress-head">
      <strong>${completed === required ? 'You’re all set' : `${completed} of ${required} steps done`}</strong>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${required}" aria-valuenow="${completed}" aria-label="Setup progress"><span class="progress-bar" data-percent="${percent}"></span></div>
    </div>
    <ol class="steps">
      ${steps.map((step, index) => {
        const open = openStep === step.id;
        return `<li class="step ${step.state}${open ? ' open' : ''}">
          <button type="button" class="step-head"${attrs({ 'data-action': 'toggleStep', 'data-step': step.id, 'aria-expanded': open ? 'true' : 'false' })}>
            <span class="step-marker">${step.state === 'done' ? icon('check', 'sm') : step.state === 'attention' ? icon('alert', 'sm') : `<span>${index + 1}</span>`}</span>
            <span class="step-text"><span class="step-title">${esc(step.title)}</span><span class="step-detail">${esc(step.detail)}</span></span>
            <span class="step-state">${esc(STATE_LABELS[step.state] || '')}</span>
          </button>
          ${open ? `<div class="step-body">${STEP_BODIES[step.id]()}</div>` : ''}
        </li>`;
      }).join('')}
    </ol>
    <div class="prefs">
      <h3>Preferences</h3>
      <label class="checkbox"><input type="checkbox" id="notifications"${status.notificationsEnabled ? ' checked' : ''}> Notify me when something new needs my attention</label>
      <button type="button" class="link" data-action="openSettings">All DevMate Kit settings</button>
    </div>
  </div>`;
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  const body = ui.tab === 'tools' ? toolsTab() : ui.tab === 'setup' ? setupTab() : homeTab();
  renderPreserving(app, `${tabBar()}<main class="tab-panel" role="tabpanel" aria-labelledby="tab-${ui.tab}">${body}</main>`, fresh);
  // Progress width is set via CSSOM (inline style attributes are blocked by the CSP).
  const bar = app.querySelector('.progress-bar');
  if (bar) bar.style.width = `${bar.getAttribute('data-percent')}%`;
}

function value(id) {
  const field = document.getElementById(id);
  return field ? field.value.trim() : '';
}

function setTab(tab) {
  ui.tab = tab;
  persist();
  render();
}

delegate(app, {
  tab: (el) => setTab(el.getAttribute('data-tab')),
  openStep: (el) => {
    ui.openStep = el.getAttribute('data-step');
    setTab('setup');
  },
  toggleStep: (el) => {
    const id = el.getAttribute('data-step');
    const current = ui.openStep === null ? defaultOpenStep(status.setup.steps) : ui.openStep;
    ui.openStep = current === id ? '' : id;
    persist();
    render();
  },
  refresh: () => post({ command: 'session.refreshAll' }),
  openDashboard: () => post({ command: 'nav.openDashboard' }),
  openSettings: () => post({ command: 'nav.openSettings' }),
  openTool: (el) => post({ command: 'nav.openTool', toolId: el.getAttribute('data-tool') }),
  openPr: (el) => post({ command: 'github.openPr', repoKey: el.getAttribute('data-repo'), number: Number(el.getAttribute('data-number')), url: el.getAttribute('data-url') }),
  openJira: (el) => post({ command: 'jira.openTask', url: el.getAttribute('data-url') }),
  aiWhatNext: () => post({ command: 'ai.whatNext' }),
  githubSignIn: () => post({ command: 'github.signIn' }),
  addRepo: () => {
    const repo = value('ghRepo');
    if (!repo) return;
    errors.repo = '';
    post({ command: 'github.addRepo', value: repo });
  },
  addAuthor: () => {
    const username = value('ghAuthor');
    if (!username) return;
    errors.author = '';
    post({ command: 'github.addAuthor', value: username });
  },
  removeRepo: (el) => post({ command: 'github.removeRepo', owner: el.getAttribute('data-owner'), repo: el.getAttribute('data-repo') }),
  removeAuthor: (el) => post({ command: 'github.removeAuthor', username: el.getAttribute('data-username') }),
  connectJira: () => {
    const site = value('jiraSite');
    if (!site) {
      errors.jiraSite = 'Enter your Jira site URL, for example https://your-company.atlassian.net.';
      render();
      return;
    }
    errors.jiraSite = '';
    post({ command: 'jira.saveConnection', siteUrl: /^https?:\/\//i.test(site) ? site : `https://${site}` });
  },
  disconnectJira: () => post({ command: 'jira.disconnect' }),
  saveJiraUser: () => {
    errors.jiraUser = '';
    post({ command: 'jira.setCurrentUser', displayName: value('jiraUser') });
  },
  addJiraTeammate: () => {
    const name = value('jiraTeam');
    if (!name) return;
    errors.jiraTeam = '';
    post({ command: 'jira.addTeamMember', displayName: name });
  },
  removeJiraTeammate: (el) => post({ command: 'jira.removeTeamMember', displayName: el.getAttribute('data-name') }),
  presetQuery: () => {
    const label = document.getElementById('jqlLabel');
    const jql = document.getElementById('jqlText');
    if (label) label.value = PRESET_JQL.label;
    if (jql) jql.value = PRESET_JQL.jql;
    jql?.focus();
  },
  editQuery: (el) => {
    editingQuery = el.getAttribute('data-label');
    errors.jql = '';
    fresh.add('jqlLabel');
    fresh.add('jqlText');
    render();
    document.getElementById('jqlText')?.focus();
  },
  cancelEdit: () => {
    editingQuery = null;
    errors.jql = '';
    fresh.add('jqlLabel');
    fresh.add('jqlText');
    render();
  },
  removeQuery: (el) => {
    const label = el.getAttribute('data-label');
    if (editingQuery === label) editingQuery = null;
    post({ command: 'jira.removeQuery', label });
  },
  saveQuery: () => {
    const label = value('jqlLabel');
    const jql = value('jqlText');
    if (!label || !jql) {
      errors.jql = !label ? 'Give the query a short label.' : 'Enter a JQL query.';
      render();
      return;
    }
    errors.jql = '';
    post(editingQuery
      ? { command: 'jira.updateQuery', originalLabel: editingQuery, label, jql }
      : { command: 'jira.addQuery', label, jql });
  },
  loadModels: () => post({ command: 'ai.loadModels' }),
});

// Enter in a single-line field triggers its form's action.
app.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
  const action = event.target.getAttribute('data-enter');
  if (!action) return;
  event.preventDefault();
  app.querySelector(`button[data-action="${action}"]`)?.click();
});

// Arrow keys move between tabs (WAI-ARIA tabs pattern).
app.addEventListener('keydown', (event) => {
  if (event.target.getAttribute('role') !== 'tab' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  const index = TABS.findIndex((tab) => tab.id === ui.tab);
  const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
  setTab(next.id);
  document.getElementById(`tab-${next.id}`)?.focus();
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'toolQuery') {
    ui.toolQuery = event.target.value;
    persist();
    render();
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'aiEnabled') {
    post({ command: 'ai.setProvider', provider: target.checked ? 'vscodeLm' : 'none' });
  } else if (target.id === 'aiModel') {
    post({ command: 'ai.setModel', modelId: target.value });
  } else if (target.id === 'notifications') {
    post({ command: 'settings.setNotifications', enabled: target.checked });
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
    case 'nav.showTab':
      ui.tab = message.tab;
      if (message.tab === 'setup') ui.openStep = message.step || null;
      persist();
      break;
    case 'github.addResult':
      if (message.kind === 'repo') {
        errors.repo = message.ok ? '' : message.reason || 'Could not add that repository.';
        if (message.ok) fresh.add('ghRepo');
      } else {
        errors.author = message.ok ? '' : message.reason || 'Could not add that user.';
        if (message.ok) fresh.add('ghAuthor');
      }
      break;
    case 'jira.connectionResult':
      errors.jiraSite = message.ok ? '' : message.reason || 'Could not connect to Jira.';
      if (message.ok) fresh.add('jiraSite');
      break;
    case 'jira.currentUserResult':
      errors.jiraUser = message.ok ? '' : message.reason || 'Could not save your Jira name.';
      if (message.ok) fresh.add('jiraUser');
      break;
    case 'jira.teamMemberResult':
      errors.jiraTeam = message.ok ? '' : message.reason || 'Could not update Jira teammates.';
      if (message.ok) fresh.add('jiraTeam');
      break;
    case 'jira.queryResult':
    case 'jira.updateQueryResult':
      errors.jql = message.ok ? '' : message.reason || 'Could not save the query.';
      if (message.ok) {
        editingQuery = null;
        fresh.add('jqlLabel');
        fresh.add('jqlText');
      }
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

setInterval(() => {
  if (!document.hidden && ui.tab === 'home') render();
}, 60 * 1000);

render();
post({ command: 'session.ready' });
