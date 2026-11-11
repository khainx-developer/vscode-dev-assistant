// Renderers for attention items, pull requests and Jira tickets, shared by the dashboard and
// the sidebar Home tab. Reason wording comes from the same table the AI prompts use.
import { REASON_LABELS } from '../../../services/attention/reasonLabels';
import { attrs, esc, relativeTime } from './dom.js';
import { icon } from './icons.js';

const LEGACY_GITHUB_REASONS = {
  new_activity: { label: 'New activity', tone: 'info' },
  waiting_for_review: { label: 'Waiting for review', tone: 'warning' },
  needs_my_review: { label: 'Needs your review', tone: 'warning' },
  merged: { label: 'Merged', tone: 'success' },
};

const CHECK_LABELS = {
  SUCCESS: ['Checks passing', 'success'],
  FAILURE: ['Checks failing', 'danger'],
  ERROR: ['Checks errored', 'danger'],
  PENDING: ['Checks running', 'warning'],
  EXPECTED: ['Checks pending', 'warning'],
};

export const SNOOZE_OPTIONS = [
  { id: '1h', label: 'For 1 hour' },
  { id: 'laterToday', label: 'Until later today' },
  { id: 'tomorrow', label: 'Until tomorrow morning' },
];

export function reasonInfo(reason) {
  return REASON_LABELS[reason] || LEGACY_GITHUB_REASONS[reason] || { label: String(reason).replace(/[-_]/g, ' '), tone: 'neutral' };
}

export function chip(label, tone = 'neutral', title = '') {
  return `<span class="chip ${tone}"${title ? attrs({ title }) : ''}>${esc(label)}</span>`;
}

export function snoozeKeyOf(item) {
  return String(item.key).split('|')[0];
}

export function itemTitleText(item) {
  if (item.jiraTask) return `${item.jiraTask.key} ${item.jiraTask.summary}`;
  if (item.pr) return `#${item.pr.number} ${item.pr.title}`;
  return 'Attention item';
}

function reasonChips(reasons, counts = {}) {
  return reasons.map((reason) => {
    const info = reasonInfo(reason);
    const count = counts[reason] ? ` (${counts[reason]})` : '';
    return chip(info.label + count, info.tone, info.explanation || '');
  }).join('');
}

/** Draft + CI chips. Skips the CI chip when a reason chip already says the checks are failing. */
export function prStatusChips(pr, reasons = []) {
  let html = '';
  if (pr.draft) html += chip('Draft');
  const failing = pr.checkStatus === 'FAILURE' || pr.checkStatus === 'ERROR';
  if (pr.checkStatus && CHECK_LABELS[pr.checkStatus] && !(failing && reasons.includes('pr-checks-failing'))) {
    const [label, tone] = CHECK_LABELS[pr.checkStatus];
    html += chip(label, tone);
  }
  return html;
}

function commentStateChip(state, prefix) {
  if (state === 'stale') return chip(`${prefix} comments may be out of date`, 'warning');
  if (state === 'unavailable') return chip(`${prefix} comments unavailable`);
  return '';
}

function prButton(pr, label = 'Open PR', variant = 'secondary') {
  return `<button type="button" class="${variant}"${attrs({
    'data-action': 'openPr',
    'data-repo': pr.repoKey,
    'data-number': pr.number,
    'data-url': pr.url,
    'aria-label': `Open pull request ${pr.repoKey}#${pr.number} in the browser`,
  })}>${icon('external', 'sm')}${esc(label)}</button>`;
}

function commentButton(pr, comment) {
  return `<button type="button" class="secondary"${attrs({
    'data-action': 'openComment',
    'data-repo': pr.repoKey,
    'data-number': pr.number,
    'data-url': comment.url,
    'aria-label': `Open the latest comment on ${pr.repoKey}#${pr.number}`,
  })}>${icon('comment', 'sm')}Open comment</button>`;
}

function jiraButton(task, variant = 'secondary') {
  return `<button type="button" class="${variant}"${attrs({
    'data-action': 'openJira',
    'data-url': task.url,
    'aria-label': `Open ${task.key} in Jira`,
  })}>${icon('external', 'sm')}Open in Jira</button>`;
}

function quote(author, body, prefix = '') {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return `<div class="item-quote"><strong>${esc(prefix)}${esc(author)}:</strong> ${esc(text.length > 220 ? `${text.slice(0, 220)}…` : text)}</div>`;
}

function snoozeControl(item, ui) {
  const key = snoozeKeyOf(item);
  const open = ui.menuKey === key;
  return `<span class="menu-anchor">
    <button type="button" class="ghost"${attrs({
      'data-action': 'toggleSnoozeMenu',
      'data-key': key,
      'aria-haspopup': 'menu',
      'aria-expanded': open ? 'true' : 'false',
      title: 'Hide this item for a while',
    })}>${icon('snooze', 'sm')}Snooze</button>
    ${open ? `<div class="menu" role="menu">${SNOOZE_OPTIONS.map((option) => `<button type="button" role="menuitem"${attrs({
      'data-action': 'snooze',
      'data-key': key,
      'data-option': option.id,
    })}>${esc(option.label)}</button>`).join('')}</div>` : ''}
  </span>`;
}

function relatedPrBlock(related, ctx) {
  const pr = related.pr;
  const sourceKey = `github:${pr.repoKey}#${pr.number}`;
  const commentState = ctx.githubState?.commentStatusBySource?.[sourceKey];
  return `<div class="related">
    <div class="row wrap">
      ${icon('pr', 'sm')}
      <span class="related-title">${esc(pr.repoKey)}#${pr.number} ${esc(pr.title)}</span>
      <span class="muted small">by ${esc(pr.author)}</span>
    </div>
    <div class="chips">${reasonChips(related.reasons, { 'pr-unread-comment': related.unreadCount })}${prStatusChips(pr, related.reasons)}${commentStateChip(commentState, 'PR')}</div>
    ${related.latestUnreadComment ? quote(related.latestUnreadComment.authorIdentity, related.latestUnreadComment.bodyText) : ''}
    <div class="item-actions">${prButton(pr)}${related.latestUnreadComment ? commentButton(pr, related.latestUnreadComment) : ''}</div>
  </div>`;
}

/** Full attention card (dashboard). */
export function renderAttentionItem(item, ctx, ui) {
  const task = item.jiraTask;
  const pr = item.pr;
  const related = item.relatedPRs || [];
  const expanded = !!ui.expanded[item.key];
  const visibleReasons = related.length > 0 ? item.reasons.filter((reason) => reason.startsWith('jira-')) : item.reasons;
  const counts = { 'jira-unread-comment': item.jiraUnreadCount, 'pr-unread-comment': item.prUnreadCount };

  const title = task
    ? `<span class="key">${esc(task.key)}</span>${esc(task.summary)}`
    : `<span class="key">${esc(pr.repoKey)}#${pr.number}</span>${esc(pr.title)}`;
  const meta = task
    ? [task.status, task.assignee || 'Unassigned', task.dueDate ? `due ${task.dueDate}` : null].filter(Boolean).map(esc).join(' · ')
    : `by ${esc(pr.author)}${pr.draft ? ' · draft' : ''}`;
  const sourceKey = pr ? `github:${pr.repoKey}#${pr.number}` : '';
  const chips = reasonChips(visibleReasons, counts)
    + (pr ? prStatusChips(pr, visibleReasons) + commentStateChip(ctx.githubState?.commentStatusBySource?.[sourceKey], 'PR') : '')
    + (task ? commentStateChip(task.commentState, 'Jira') : '');

  const comments = [
    item.jiraLatestUnreadComment ? quote(item.jiraLatestUnreadComment.authorIdentity, item.jiraLatestUnreadComment.bodyText, 'Jira · ') : '',
    item.prLatestUnreadComment && related.length === 0 ? quote(item.prLatestUnreadComment.authorIdentity, item.prLatestUnreadComment.bodyText) : '',
  ].join('');

  const actions = [
    task ? jiraButton(task) : '',
    pr ? prButton(pr) : '',
    pr && item.prLatestUnreadComment ? commentButton(pr, item.prLatestUnreadComment) : '',
    ui.snoozable ? snoozeControl(item, ui) : '',
    `<button type="button" class="ghost"${attrs({ 'data-action': 'explain', 'data-key': item.key, title: 'Ask AI why this is flagged and what to do next' })}>${icon('sparkle', 'sm')}Explain</button>`,
    task || (pr && (pr.comments || []).length)
      ? `<button type="button" class="ghost"${attrs({ 'data-action': 'toggleDetail', 'data-key': item.key, 'aria-expanded': expanded ? 'true' : 'false' })}>${icon(expanded ? 'chevronDown' : 'chevronRight', 'sm')}Details</button>`
      : '',
  ].join('');

  return `<article class="item p${item.priority}"${attrs({ 'data-item-key': item.key, 'aria-label': itemTitleText(item) })}>
    <span class="item-source" title="${task ? 'Jira ticket' : 'Pull request'}">${icon(task ? 'ticket' : 'pr')}</span>
    <div class="item-main">
      <div class="row">
        <div class="item-title">${title}</div>
        <span class="spacer"></span>
        ${item.latestRelevantAt ? `<span class="item-time" title="${esc(new Date(item.latestRelevantAt).toLocaleString())}">${esc(relativeTime(item.latestRelevantAt))}</span>` : ''}
      </div>
      <div class="item-meta">${meta}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${comments}
      ${related.length ? `<div class="related-list">${related.map((entry) => relatedPrBlock(entry, ctx)).join('')}</div>` : ''}
      <div class="item-actions">${actions}</div>
      ${expanded ? `<div class="detail">${task ? renderJiraDetail(task) : renderPrDetail(pr)}</div>` : ''}
    </div>
  </article>`;
}

/** One-line attention row (sidebar Home). */
export function renderCompactItem(item) {
  const task = item.jiraTask;
  const pr = item.pr;
  const firstReasons = item.reasons.slice(0, 2).map((reason) => {
    const info = reasonInfo(reason);
    return chip(info.label, info.tone);
  }).join('');
  const url = task ? task.url : pr ? pr.url : '';
  const label = task ? `${task.key} ${task.summary}` : `${pr.repoKey}#${pr.number} ${pr.title}`;
  return `<div class="compact-item p${item.priority}" role="button" tabindex="0"${attrs({
    'data-action': task ? 'openJira' : 'openPr',
    'data-url': url,
    'data-repo': pr ? pr.repoKey : null,
    'data-number': pr ? pr.number : null,
    title: `${label} — open in browser`,
  })}>
    <span class="compact-source">${icon(task ? 'ticket' : 'pr', 'sm')}</span>
    <span class="compact-body">
      <span class="compact-title"><span class="key">${esc(task ? task.key : `#${pr.number}`)}</span> ${esc(task ? task.summary : pr.title)}</span>
      <span class="chips">${firstReasons}${item.latestRelevantAt ? `<span class="item-time">${esc(relativeTime(item.latestRelevantAt))}</span>` : ''}</span>
    </span>
  </div>`;
}

/** Pull request row for My PRs / Team PRs. */
export function renderPrItem(attentionItem, ui) {
  const pr = attentionItem.pr;
  const key = `pr:${pr.repoKey}#${pr.number}`;
  const expanded = !!ui.expanded[key];
  const latest = (pr.comments || []).reduce((acc, comment) => (!acc || comment.createdAt > acc.createdAt ? comment : acc), null);
  return `<article class="item${attentionItem.reasons.some((reason) => ['pr-changes-requested', 'pr-checks-failing', 'pr-merge-conflict', 'pr-stale'].includes(reason)) ? ' p1' : ''}"${attrs({ 'aria-label': `${pr.repoKey}#${pr.number} ${pr.title}` })}>
    <span class="item-source">${icon('pr')}</span>
    <div class="item-main">
      <div class="row">
        <div class="item-title"><span class="key">${esc(pr.repoKey)}#${pr.number}</span>${esc(pr.title)}</div>
        <span class="spacer"></span>
        <span class="item-time">${esc(relativeTime(pr.updatedAt))}</span>
      </div>
      <div class="item-meta">by ${esc(pr.author)}${(pr.requestedReviewers || []).length ? ` · review requested from ${esc(pr.requestedReviewers.join(', '))}` : ''}</div>
      <div class="chips">${reasonChips(attentionItem.reasons)}${prStatusChips(pr, attentionItem.reasons)}</div>
      <div class="item-actions">
        ${prButton(pr)}
        ${latest ? `<button type="button" class="ghost"${attrs({ 'data-action': 'toggleDetail', 'data-key': key, 'aria-expanded': expanded ? 'true' : 'false' })}>${icon(expanded ? 'chevronDown' : 'chevronRight', 'sm')}Comments (${pr.comments.length})</button>` : ''}
      </div>
      ${expanded ? `<div class="detail">${renderPrDetail(pr)}</div>` : ''}
    </div>
  </article>`;
}

/** Jira row for the saved-query lists. */
export function renderJiraItem(task, ui) {
  const key = `jira:${task.key}`;
  const expanded = !!ui.expanded[key];
  const due = dueReason(task.dueDate);
  const unread = task.commentAttention?.unreadCount || 0;
  const prChip = task.prLink?.kind === 'linked'
    ? chip(`PR #${task.prLink.pr.number} · ${task.prLink.pr.state.toLowerCase()}`, 'success')
    : task.prLink?.kind === 'no-match' ? chip('No PR yet') : '';
  const priority = due === 'jira-overdue' ? ' p1' : unread > 0 ? ' p2' : task.status === 'Review' || due ? ' p3' : '';
  return `<article class="item${priority}"${attrs({ 'aria-label': `${task.key} ${task.summary}` })}>
    <span class="item-source">${icon('ticket')}</span>
    <div class="item-main">
      <div class="row">
        <div class="item-title"><span class="key">${esc(task.key)}</span>${esc(task.summary)}</div>
        <span class="spacer"></span>
        ${task.updatedAt ? `<span class="item-time">${esc(relativeTime(task.updatedAt))}</span>` : ''}
      </div>
      <div class="item-meta">${esc(task.assignee || 'Unassigned')}</div>
      <div class="chips">
        ${chip(task.status)}
        ${task.dueDate ? chip(`Due ${task.dueDate}`, due === 'jira-overdue' ? 'danger' : due ? 'warning' : 'neutral') : ''}
        ${unread ? chip(`${unread} unread comment${unread === 1 ? '' : 's'}`, 'info') : ''}
        ${prChip}
        ${commentStateChip(task.commentState, 'Jira')}
      </div>
      <div class="item-actions">
        ${jiraButton(task)}
        <button type="button" class="ghost"${attrs({ 'data-action': 'toggleDetail', 'data-key': key, 'aria-expanded': expanded ? 'true' : 'false' })}>${icon(expanded ? 'chevronDown' : 'chevronRight', 'sm')}Details</button>
      </div>
      ${expanded ? `<div class="detail">${renderJiraDetail(task)}</div>` : ''}
    </div>
  </article>`;
}

function dueReason(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'jira-overdue';
  if (diffDays === 0) return 'jira-due-today';
  if (diffDays === 1) return 'jira-due-tomorrow';
  return null;
}

function htmlToText(value) {
  const parsed = new DOMParser().parseFromString(String(value ?? ''), 'text/html');
  const blockTags = new Set(['ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'OL', 'P', 'PRE', 'UL']);
  const read = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return '';
    if (node.tagName === 'BR') return '\n';
    const content = Array.from(node.childNodes, read).join('');
    return blockTags.has(node.tagName) ? `\n${content}\n` : content;
  };
  return Array.from(parsed.body.childNodes, read).join('')
    .replace(/ /g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isAutomation(author) {
  return String(author ?? '').trim().toLowerCase() === 'automation for jira';
}

function commentBlock(author, createdAt, body) {
  const text = body.length > 400 ? `${body.slice(0, 400)}…` : body;
  return `<div class="detail-comment">
    <div class="detail-comment-meta">${esc(author)} · ${esc(relativeTime(createdAt))}</div>
    <div class="detail-comment-body">${esc(text)}</div>
  </div>`;
}

export function renderJiraDetail(task) {
  const comments = (task.comments || [])
    .filter((comment) => !isAutomation(comment.author))
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const subtasks = task.subtasks || [];
  const linked = task.prLink?.kind === 'linked' ? task.prLink.pr : null;
  return `
    ${linked ? `<section><h4>Linked pull request</h4>
      <div class="row wrap">${icon('pr', 'sm')}<strong>${esc(linked.repoKey)}#${linked.number}</strong> ${esc(linked.title)}</div>
      <div class="chips">${chip(linked.state.toLowerCase())}${prStatusChips(linked)}</div>
      <div class="item-actions">${prButton(linked)}</div>
    </section>` : ''}
    <section><h4>Comments (${comments.length})</h4>
      ${comments.length ? comments.slice(0, 8).map((comment) => commentBlock(comment.author, comment.createdAt, htmlToText(comment.body))).join('') : '<p class="muted small">No comments yet.</p>'}
    </section>
    <section><h4>Subtasks (${subtasks.length})</h4>
      ${subtasks.length ? subtasks.map((subtask) => `<div class="subtask" role="button" tabindex="0"${attrs({ 'data-action': 'openJira', 'data-url': subtask.url, title: `Open ${subtask.key} in Jira` })}>
        <span class="key">${esc(subtask.key)}</span><span class="subtask-summary">${esc(subtask.summary)}</span>${chip(subtask.status)}
      </div>`).join('') : '<p class="muted small">No subtasks.</p>'}
    </section>`;
}

export function renderPrDetail(pr) {
  const comments = (pr.comments || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const reviews = (pr.reviews || []).filter((review) => review.state !== 'PENDING');
  return `
    ${reviews.length ? `<section><h4>Reviews</h4><div class="chips">${reviews.map((review) =>
      chip(`${review.author}: ${review.state.replace(/_/g, ' ').toLowerCase()}`, review.state === 'APPROVED' ? 'success' : review.state === 'CHANGES_REQUESTED' ? 'danger' : 'neutral')).join('')}</div></section>` : ''}
    <section><h4>Latest comments (${comments.length})</h4>
      ${comments.length ? comments.slice(0, 5).map((comment) => commentBlock(comment.author, comment.createdAt, String(comment.body || ''))).join('') : '<p class="muted small">No comments yet.</p>'}
    </section>`;
}
