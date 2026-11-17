// Single text tool (Base64, URL, JSON, UUID, timestamp, case). Transforms run in the extension host.
import './tool.css';
import { onMessage, post, readBootData } from '../shared/bridge.js';
import { attrs, delegate, esc } from '../shared/dom.js';
import { icon } from '../shared/icons.js';

const tool = readBootData();
const app = document.getElementById('app');

app.innerHTML = `
  <header class="tool-header">
    <span class="tool-icon">${icon(tool.icon, 'lg')}</span>
    <div>
      <h1>${esc(tool.title)}</h1>
      <p class="muted">${esc(tool.description)}</p>
    </div>
  </header>
  ${tool.needsInput ? `<label class="field-label" for="input">Input</label>
  <textarea id="input" rows="8"${attrs({ placeholder: tool.inputPlaceholder || '' })}></textarea>` : ''}
  <div class="actions">
    ${(tool.actions || []).map((action, index) => `<button type="button"${attrs({ class: index === 0 ? null : 'secondary', 'data-action': 'run', 'data-tool-action': action.id })}>${esc(action.label)}</button>`).join('')}
  </div>
  <p class="field-error" id="error" role="alert"></p>
  <div class="output-head">
    <label class="field-label" for="output">Output</label>
    <button type="button" class="ghost" data-action="copy">${icon('copy', 'sm')}Copy</button>
  </div>
  <textarea id="output" rows="8" readonly></textarea>
`;

const input = document.getElementById('input');
const output = document.getElementById('output');
const error = document.getElementById('error');

delegate(app, {
  run: (el) => {
    error.textContent = '';
    post({ command: 'run', action: el.getAttribute('data-tool-action'), input: input ? input.value : '' });
  },
  copy: () => post({ command: 'copy', text: output.value }),
});

// Ctrl/Cmd+Enter runs the first action.
input?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    app.querySelector('[data-action="run"]')?.click();
  }
});

onMessage((message) => {
  if (message.command === 'result') {
    output.value = message.output;
    error.textContent = '';
  } else if (message.command === 'error') {
    error.textContent = message.message;
  }
});

input?.focus();
