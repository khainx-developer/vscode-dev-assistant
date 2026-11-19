// Renderers for attention items, pull requests and Jira tickets, shared by the dashboard and
// the sidebar Home tab. Reason wording comes from the same table the AI prompts use.
import { isAutomationIdentity } from '../../../services/attention/commentAttention';
import { REASON_LABELS } from '../../../services/attention/reasonLabels';
import { attrs, esc, relativeTime } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown } from './markdown.js';

function hasUnreadCommentSignal(item) {
  return !!(
    item.reasons?.includes('pr-unread-comment')
    || item.reasons?.includes('jira-unread-comment')
    || item.prUnreadCount > 0
    || item.prLatestUnreadComment
    || item.jiraUnreadCount > 0
    || item.jiraLatestUnreadComment
  );
}

function hasAwaitingReplySignal(item) {
  return !!(
    item.reasons?.includes('pr-awaiting-reply')
    || item.reasons?.includes('jira-awaiting-reply')
    || item.prLatestAwaitingComment
    || item.jiraLatestAwaitingComment
  );
}

/** Prefer unread excerpt when both apply; otherwise show the awaiting-reply excerpt. */
function jiraCommentForCard(item) {
  if (item.jiraLatestUnreadComment) return { comment: item.jiraLatestUnreadComment, prefix: 'Jira · ' };
  if (item.jiraLatestAwaitingComment) return { comment: item.jiraLatestAwaitingComment, prefix: 'Jira · ' };
  return null;
}

function prCommentForCard(item) {
  if (item.prLatestUnreadComment) return item.prLatestUnreadComment;
  if (item.prLatestAwaitingComment) return item.prLatestAwaitingComment;
  return null;
}

function relatedCommentForCard(related) {
  if (related.latestUnreadComment) return related.latestUnreadComment;
  if (related.latestAwaitingComment) return related.latestAwaitingComment;
  return null;
}

/** Fast triage chips — answered on-card from the snapshot (no PR diff / Jira body). */
function quickChatSuggestions(item) {
  const suggestions = [
    'Why does this need attention?',
    "What's the next step?",
    'Whose turn is it?',
  ];
  if (hasUnreadCommentSignal(item) || hasAwaitingReplySignal(item)) {
    suggestions.push('Draft a reply to the comment');
  }
  return suggestions;
}

/**
 * Deep work actions — copy a portable editor-chat prompt (MCP how-to included).
 * These need live PR/Jira data the card snapshot does not have.
 */
function deepEditorActions(item) {
  const actions = [];
  const pr = item.pr || item.relatedPRs?.[0]?.pr;
  if (pr) {
    actions.push({ template: 'review', label: 'Review PR' });
    actions.push({ template: 'summarize', label: 'Summarize changes' });
    const failing = item.reasons?.includes('pr-checks-failing')
      || pr.checkStatus === 'FAILURE'
      || pr.checkStatus === 'ERROR';
    if (failing) actions.push({ template: 'fixChecks', label: 'Fix failing checks' });
    if (
      item.reasons?.includes('pr-unread-comment')
      || item.prUnreadCount > 0
      || item.prLatestUnreadComment
      || item.reasons?.includes('pr-awaiting-reply')
      || item.prLatestAwaitingComment
    ) {
      actions.push({ template: 'draftReply', label: 'Draft reply (with PR context)' });
    }
  }
  if (item.jiraTask) actions.push({ template: 'planTicket', label: 'Plan this ticket' });
  if (!actions.length) {
    actions.push({
      template: item.jiraTask ? 'planTicket' : 'review',
      label: 'Copy editor prompt',
    });
  }
  return actions;
}

/** Free-text questions that need the PR diff / full Jira body should not go to card AI. */
export function isDeepEditorQuestion(text) {
  return /\b(summarize|summary of (the )?changes|what changed|diff|code review|review (the )?pr|review this pr|failing checks?|fix (the )?checks?|plan (this|the)? ticket|implement|refactor|pull request body|jira description)\b/i.test(String(text || ''));
}

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

/** Latest review per author (same convention as attentionEngine.classifyReviewState). */
function latestReviewsByAuthor(reviews) {
  const latestByAuthor = new Map();
  for (const review of reviews || []) {
    const existing = latestByAuthor.get(review.author);
    if (!existing || new Date(review.submittedAt) > new Date(existing.submittedAt)) {
      latestByAuthor.set(review.author, review);
    }
  }
  return [...latestByAuthor.values()];
}

/** Approver names whose latest review is APPROVED. Empty when none. */
export function approvedReviewers(pr) {
  return latestReviewsByAuthor(pr?.reviews)
    .filter((review) => review.state === 'APPROVED')
    .map((review) => review.author)
    .filter(Boolean);
}

/** Compact approval label: `alice approved`, `alice, bob approved`, or `alice, bob +1 approved`. */
export function approvalChipLabel(approvers) {
  if (!approvers.length) return '';
  if (approvers.length === 1) return `${approvers[0]} approved`;
  if (approvers.length === 2) return `${approvers[0]}, ${approvers[1]} approved`;
  return `${approvers[0]}, ${approvers[1]} +${approvers.length - 2} approved`;
}

/** Draft + CI + approval chips. Skips the CI chip when a reason chip already says the checks are failing. */
export function prStatusChips(pr, reasons = []) {
  let html = '';
  if (pr.draft) html += chip('Draft');
  const failing = pr.checkStatus === 'FAILURE' || pr.checkStatus === 'ERROR';
  if (pr.checkStatus && CHECK_LABELS[pr.checkStatus] && !(failing && reasons.includes('pr-checks-failing'))) {
    const [label, tone] = CHECK_LABELS[pr.checkStatus];
    html += chip(label, tone);
  }
  const approvers = approvedReviewers(pr);
  if (approvers.length) {
    html += chip(approvalChipLabel(approvers), 'success', approvers.join(', '));
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

/** Small linked keys for issues blocking this ticket (jira-blocked). */
function blockedByKeys(task) {
  const blockers = task?.blockedBy || [];
  if (!blockers.length) return '';
  const links = blockers.map((blocker) => `<button type="button" class="ghost key"${attrs({
    'data-action': 'openJira',
    'data-url': blocker.url,
    'aria-label': `Open blocking issue ${blocker.key} in Jira`,
    title: blocker.summary || blocker.key,
  })}>${esc(blocker.key)}</button>`).join(', ');
  return `<div class="item-quote muted small">Blocked by ${links}</div>`;
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

function relatedCommentExtras(related) {
  const comment = relatedCommentForCard(related);
  if (!comment) {
    return { quoteHtml: '', actionHtml: '' };
  }
  return {
    quoteHtml: quote(comment.authorIdentity, comment.bodyText),
    actionHtml: commentButton(related.pr, comment),
  };
}

function relatedPrBlock(related, ctx, extraActions = '') {
  const pr = related.pr;
  const sourceKey = `github:${pr.repoKey}#${pr.number}`;
  const commentState = ctx.githubState?.commentStatusBySource?.[sourceKey];
  const { quoteHtml, actionHtml } = relatedCommentExtras(related);
  return `<div class="related">
    <div class="row wrap">
      ${icon('pr', 'sm')}
      <span class="related-title">${esc(pr.repoKey)}#${pr.number} ${esc(pr.title)}</span>
      <span class="muted small">by ${esc(pr.author)}</span>
    </div>
    <div class="chips">${reasonChips(related.reasons, { 'pr-unread-comment': related.unreadCount })}${prStatusChips(pr, related.reasons)}${commentStateChip(commentState, 'PR')}</div>
    ${quoteHtml}
    <div class="item-actions">${prButton(pr)}${extraActions}${actionHtml}</div>
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

  const jiraCardComment = jiraCommentForCard(item);
  const prCardComment = related.length === 0 ? prCommentForCard(item) : null;
  const comments = [
    jiraCardComment ? quote(jiraCardComment.comment.authorIdentity, htmlToText(jiraCardComment.comment.bodyText), jiraCardComment.prefix) : '',
    prCardComment ? quote(prCardComment.authorIdentity, prCardComment.bodyText) : '',
  ].join('');
  const blockedByHtml = task ? blockedByKeys(task) : '';

  // Keep Open PR + Open in Jira on one row: when PRs are in related blocks, put the
  // Jira button beside the first Open PR instead of on the secondary actions row.
  const jiraOnRelated = !!(task && related.length);
  const thread = ui.threads?.[item.key];
  // Explicit false means the user hid the panel; do not force it open just because a thread exists.
  const chatOpen = ui.chatOpen?.[item.key] === false
    ? false
    : !!(ui.chatOpen?.[item.key] || thread);
  const actions = [
    task && !jiraOnRelated ? jiraButton(task) : '',
    pr ? prButton(pr) : '',
    pr && prCardComment ? commentButton(pr, prCardComment) : '',
    ui.snoozable ? snoozeControl(item, ui) : '',
    `<button type="button" class="ghost"${attrs({
      'data-action': 'toggleChat',
      'data-key': item.key,
      'aria-expanded': chatOpen ? 'true' : 'false',
      title: 'Ask AI: quick triage on this card. Deep PR/Jira work uses copy-to-editor-chat prompts.',
    })}>${icon('sparkle', 'sm')}${chatOpen ? 'Hide chat' : 'Ask AI'}</button>`,
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
      ${blockedByHtml}
      ${comments}
      ${related.length ? `<div class="related-list">${related.map((entry, index) => relatedPrBlock(entry, ctx, index === 0 && jiraOnRelated ? jiraButton(task) : '')).join('')}</div>` : ''}
      <div class="item-actions">${actions}</div>
      ${chatOpen ? cardChatPanel(item, thread, ui) : ''}
      ${expanded ? `<div class="detail">${task ? renderJiraDetail(task) : renderPrDetail(pr)}</div>` : ''}
    </div>
  </article>`;
}

function cardChatPanel(item, thread, ui = {}) {
  const running = thread?.status === 'running';
  const messages = thread?.messages || [];
  const deepHint = ui.deepHint?.[item.key] || '';
  const list = messages.length
    ? messages.map((message) => {
      const body = message.role === 'assistant'
        ? `<div class="markdown">${renderMarkdown(message.text)}${running && message === messages[messages.length - 1] ? '<span class="cursor"></span>' : ''}</div>`
        : `<p class="card-chat-user">${esc(message.text)}</p>`;
      return `<div class="card-chat-msg ${message.role}">${body}</div>`;
    }).join('')
    : '<p class="muted small">Fast triage from card data (why flagged, whose turn, next step). For diffs and full Jira/PR details, copy a prompt for editor chat below.</p>';

  let status = '';
  if (thread?.status === 'error') {
    status = `<div class="banner${thread.setupHint ? '' : ' error'} small">
      ${icon(thread.setupHint ? 'info' : 'alert', 'sm')}
      <div class="banner-body">${esc(thread.error || 'The AI request failed.')}</div>
      ${thread.setupHint ? '<button type="button" class="ghost" data-action="openSetup" data-step="ai">Open Setup</button>' : ''}
    </div>`;
  }

  const quickChips = !running
    ? `<div class="card-chat-section">
        <p class="muted small card-chat-label">Quick questions</p>
        <div class="card-chat-chips">${quickChatSuggestions(item).map((text) => `<button type="button" class="ghost chip-btn"${attrs({
          'data-action': 'chatSend',
          'data-key': item.key,
          'data-text': text,
        })}>${esc(text)}</button>`).join('')}</div>
      </div>`
    : '';

  const deepButtons = deepEditorActions(item).map((action) => `<button type="button" class="ghost chip-btn"${attrs({
    'data-action': 'reviewInChat',
    'data-key': item.key,
    'data-template': action.template,
    title: 'Copy a prompt for Copilot / Cursor / other editor chat (includes MCP how-to)',
  })}>${icon('copy', 'sm')}${esc(action.label)}</button>`).join('');

  const deepHintBanner = deepHint && !running
    ? `<div class="banner small" role="status">
        ${icon('info', 'sm')}
        <div class="banner-body">
          <strong>That needs live PR/Jira details.</strong>
          Card AI can’t see the diff or full description. Copy a sample prompt and paste it into editor chat:
          <p class="muted small">“${esc(deepHint)}”</p>
        </div>
      </div>`
    : '';

  const deepSection = !running
    ? `<div class="card-chat-section">
        <p class="muted small card-chat-label">Deep work — copy prompt for editor chat</p>
        ${deepHintBanner}
        <div class="card-chat-chips">${deepButtons}</div>
      </div>`
    : '';

  const actions = running
    ? `<button type="button" class="secondary" data-action="aiCancel">${icon('stop', 'sm')}Stop</button>`
    : [
      messages.length ? `<button type="button" class="ghost"${attrs({ 'data-action': 'chatClear', 'data-key': item.key })}>Clear</button>` : '',
      deepHint
        ? `<button type="button" class="ghost"${attrs({ 'data-action': 'dismissDeepHint', 'data-key': item.key })}>Dismiss hint</button>`
        : '',
    ].join('');

  return `<div class="card-chat" aria-live="polite" aria-busy="${running ? 'true' : 'false'}">
    <div class="card-chat-head">
      <strong>Ask AI</strong>
      ${thread?.modelName ? `<span class="muted small">${esc(thread.modelName)}</span>` : ''}
      <span class="spacer"></span>
      ${actions}
    </div>
    <div class="card-chat-messages">${list}</div>
    ${status}
    ${quickChips}
    ${deepSection}
    <div class="card-chat-compose">
      <input type="text" class="card-chat-input"${attrs({
        'data-chat-input': item.key,
        placeholder: 'Quick triage question…',
        'aria-label': 'Quick triage question about this card',
        disabled: running ? true : null,
      })}>
      <button type="button"${attrs({
        'data-action': 'chatSend',
        'data-key': item.key,
        disabled: running ? true : null,
      })}>${icon('sparkle', 'sm')}Send</button>
    </div>
  </div>`;
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
  const comments = humanComments(pr.comments);
  const latest = comments[0] || null;
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
        ${latest ? `<button type="button" class="ghost"${attrs({ 'data-action': 'toggleDetail', 'data-key': key, 'aria-expanded': expanded ? 'true' : 'false' })}>${icon(expanded ? 'chevronDown' : 'chevronRight', 'sm')}Comments (${comments.length})</button>` : ''}
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

function humanComments(comments) {
  return (comments || [])
    .filter((comment) => !isAutomationIdentity(comment.author))
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function commentBlock(author, createdAt, body) {
  const text = body.length > 400 ? `${body.slice(0, 400)}…` : body;
  return `<div class="detail-comment">
    <div class="detail-comment-meta">${esc(author)} · ${esc(relativeTime(createdAt))}</div>
    <div class="detail-comment-body">${esc(text)}</div>
  </div>`;
}

export function renderJiraDetail(task) {
  const comments = humanComments(task.comments);
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
  const comments = humanComments(pr.comments);
  const reviews = (pr.reviews || []).filter((review) => review.state !== 'PENDING');
  return `
    ${reviews.length ? `<section><h4>Reviews</h4><div class="chips">${reviews.map((review) =>
      chip(`${review.author}: ${review.state.replace(/_/g, ' ').toLowerCase()}`, review.state === 'APPROVED' ? 'success' : review.state === 'CHANGES_REQUESTED' ? 'danger' : 'neutral')).join('')}</div></section>` : ''}
    <section><h4>Latest comments (${comments.length})</h4>
      ${comments.length ? comments.slice(0, 5).map((comment) => commentBlock(comment.author, comment.createdAt, String(comment.body || ''))).join('') : '<p class="muted small">No comments yet.</p>'}
    </section>`;
}
