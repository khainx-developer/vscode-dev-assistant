// Small DOM helpers shared by every DevMate webview.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Attribute string from an object; falsy values are skipped, `true` renders a bare attribute. */
export function attrs(map) {
  return Object.entries(map)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${esc(value)}"`))
    .join('');
}

export function relativeTime(value) {
  if (!value) return '';
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function timeUntil(epochMs) {
  const minutes = Math.round((epochMs - Date.now()) / 60000);
  if (minutes <= 1) return 'in a moment';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return new Date(epochMs).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function clockTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many || `${one}s`}`;
}

/**
 * Replace a container's markup while keeping what the user is doing: typed-but-unsent input
 * values (fields marked `data-keep-value`), focus and caret position. Field ids listed in `fresh`
 * take the newly rendered value instead (e.g. after a successful "Add", or when starting an edit).
 */
export function renderPreserving(container, html, fresh = new Set()) {
  const values = new Map();
  container.querySelectorAll('input[id], textarea[id], select[id]').forEach((field) => {
    if (field.type === 'checkbox') return;
    values.set(field.id, field.value);
  });
  const active = document.activeElement;
  const activeId = active && container.contains(active) ? active.id : '';
  const activeKey = active && container.contains(active) ? active.getAttribute('data-focus-key') : null;
  const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  container.innerHTML = html;

  values.forEach((value, id) => {
    const field = document.getElementById(id);
    if (!field || field.type === 'checkbox' || field.tagName === 'SELECT') return;
    if (!fresh.has(id) && field.hasAttribute('data-keep-value')) field.value = value;
  });
  fresh.clear();

  let target = activeId ? document.getElementById(activeId) : null;
  if (!target && activeKey) target = container.querySelector(`[data-focus-key="${CSS.escape(activeKey)}"]`);
  if (target && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
    if (selection && 'setSelectionRange' in target && selection[0] !== null) {
      try {
        target.setSelectionRange(selection[0], selection[1]);
      } catch {
        // Not a text field.
      }
    }
  }
}

/**
 * Event delegation: clicks (and Enter/Space on role="button") on any `[data-action]` element
 * call `handlers[action](element, event)`.
 */
export function delegate(root, handlers) {
  const run = (element, event) => {
    const action = element.getAttribute('data-action');
    const handler = handlers[action];
    if (handler && !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true') {
      handler(element, event);
    }
  };
  root.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    if (!element || !root.contains(element)) return;
    if (element.tagName === 'A') event.preventDefault();
    event.stopPropagation();
    run(element, event);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const element = event.target.closest('[data-action][role="button"]');
    if (!element || element !== event.target) return;
    event.preventDefault();
    run(element, event);
  });
}
