import './style.css';
import { formatInput, getDownloadName, inferModeFromFile, samples } from './formatter.js';

const MODE_STORAGE_KEY = 'format-foundry:last-mode';
const DRAFT_STORAGE_PREFIX = 'format-foundry:draft:';
const THEME_STORAGE_KEY = 'format-foundry:theme';

const state = {
  mode: localStorage.getItem(MODE_STORAGE_KEY) || 'json',
  theme: localStorage.getItem(THEME_STORAGE_KEY) || 'dark',
  drafts: {
    json: localStorage.getItem(`${DRAFT_STORAGE_PREFIX}json`) || '',
    xml: localStorage.getItem(`${DRAFT_STORAGE_PREFIX}xml`) || '',
  },
  output: '',
  lastTransform: 'formatted',
};

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <p class="brand-name">Format Foundry</p>
        <p class="brand-note">Local JSON and XML cleanup with import, validation, and export.</p>
      </div>

      <div class="topbar-controls">
        <button class="theme-toggle" type="button" id="themeToggle" aria-pressed="false">
          <span class="theme-toggle-label">Light mode</span>
        </button>
        <div class="tabs" role="tablist" aria-label="Formatter mode">
          <button class="tab-button" type="button" role="tab" data-mode="json" id="tab-json">JSON</button>
          <button class="tab-button" type="button" role="tab" data-mode="xml" id="tab-xml">XML</button>
        </div>
        <p class="trust-note" aria-label="Trust note">Local only <span aria-hidden="true">/</span> No upload</p>
      </div>
    </header>

    <main class="workspace" aria-label="Formatter application">
      <section class="toolbar" aria-label="Formatter actions">
        <div class="toolbar-group" aria-label="Primary actions">
          <button class="action-button action-button-primary" type="button" data-action="format">Format</button>
          <button class="action-button action-button-primary" type="button" data-action="minify">Minify</button>
        </div>

        <div class="toolbar-group" aria-label="Input actions">
          <button class="action-button" type="button" data-action="import">Import</button>
          <button class="action-button" type="button" data-action="sample">Sample</button>
          <button class="action-button" type="button" data-action="clear">Clear</button>
        </div>

        <div class="toolbar-group" aria-label="Output actions">
          <button class="action-button" type="button" data-action="copy">Copy</button>
          <button class="action-button" type="button" data-action="download">Download</button>
          <button class="action-button" type="button" data-action="reuse">Use result as input</button>
        </div>
      </section>

      <section class="status-bar" id="statusBar" data-state="idle" aria-label="Application status">
        <p class="status-message" id="statusMessage" aria-live="polite">Ready for JSON input.</p>
        <p class="status-detail" id="errorMessage" aria-live="assertive">Shortcuts: Ctrl/Cmd + Enter formats. Ctrl/Cmd + Shift + M minifies.</p>
      </section>

      <section class="editor-grid">
        <article class="editor-panel editor-panel-drop" id="dropZone">
          <div class="panel-header">
            <div>
              <h2>Input</h2>
              <p class="panel-description">Paste text, type directly, or drop a file here.</p>
            </div>
            <div class="panel-meta">
              <span class="meta-chip" id="inputModeBadge">JSON</span>
              <span class="meta-stat" id="inputStats">0 chars / 1 line</span>
            </div>
          </div>

          <label class="sr-only" for="inputEditor">Input editor</label>
          <textarea
            id="inputEditor"
            class="editor"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
          ></textarea>
          <div class="drop-hint" id="dropHint" aria-hidden="true">Drop a JSON or XML file to load it into this workspace.</div>
        </article>

        <article class="editor-panel">
          <div class="panel-header">
            <div>
              <h2>Output</h2>
              <p class="panel-description">Formatted or minified result. Copy it, download it, or reuse it.</p>
            </div>
            <div class="panel-meta">
              <span class="meta-chip meta-chip-muted">Read only</span>
              <span class="meta-stat" id="outputStats">0 chars / 1 line</span>
            </div>
          </div>

          <label class="sr-only" for="outputEditor">Output editor</label>
          <textarea id="outputEditor" class="editor editor-output" spellcheck="false" readonly></textarea>
        </article>
      </section>
    </main>

    <input class="sr-only" id="fileInput" type="file" accept=".json,.xml,text/json,text/xml,application/json,application/xml" />
  </div>
`;

const inputEditor = document.querySelector('#inputEditor');
const outputEditor = document.querySelector('#outputEditor');
const statusBar = document.querySelector('#statusBar');
const statusMessage = document.querySelector('#statusMessage');
const errorMessage = document.querySelector('#errorMessage');
const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const dropHint = document.querySelector('#dropHint');
const inputModeBadge = document.querySelector('#inputModeBadge');
const inputStats = document.querySelector('#inputStats');
const outputStats = document.querySelector('#outputStats');
const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const actionButtons = Array.from(document.querySelectorAll('.action-button'));
const themeToggle = document.querySelector('#themeToggle');
const themeToggleLabel = themeToggle.querySelector('.theme-toggle-label');

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  const isDark = theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(!isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggleLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function saveDraft(mode, value) {
  state.drafts[mode] = value;
  localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${mode}`, value);
}

function getEditorStats(value) {
  const lines = value.length ? value.split(/\r?\n/).length : 1;
  const chars = value.length;
  return `${chars} char${chars === 1 ? '' : 's'} / ${lines} line${lines === 1 ? '' : 's'}`;
}

function updateInputMeta() {
  inputModeBadge.textContent = state.mode.toUpperCase();
  inputStats.textContent = getEditorStats(inputEditor.value);
}

function updateOutputMeta() {
  outputStats.textContent = getEditorStats(outputEditor.value);
}

function updatePlaceholders() {
  inputEditor.placeholder = state.mode === 'json'
    ? '{\n  "team": "foundry",\n  "ready": true\n}'
    : '<project>\n  <team>foundry</team>\n  <ready>true</ready>\n</project>';
}

function setStatus(message, type = 'idle', detail = 'Shortcuts: Ctrl/Cmd + Enter formats. Ctrl/Cmd + Shift + M minifies.') {
  statusBar.dataset.state = type;
  statusMessage.textContent = message;
  errorMessage.textContent = detail;
}

function clearMessages() {
  setStatus(`Ready for ${state.mode.toUpperCase()} input.`);
}

function setOutput(value, transformLabel = state.lastTransform) {
  state.output = value;
  state.lastTransform = transformLabel;
  outputEditor.value = value;
  updateOutputMeta();
  syncActionAvailability();
}

function syncActionAvailability() {
  const hasOutput = state.output.trim().length > 0;
  for (const button of actionButtons) {
    if (['copy', 'download', 'reuse'].includes(button.dataset.action)) {
      button.disabled = !hasOutput;
    }
  }
}

function setMode(mode, announce = true) {
  saveDraft(state.mode, inputEditor.value);
  state.mode = mode;
  localStorage.setItem(MODE_STORAGE_KEY, mode);

  for (const button of tabButtons) {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  inputEditor.value = state.drafts[mode] || '';
  setOutput('', state.lastTransform);
  updatePlaceholders();
  updateInputMeta();

  if (announce) {
    clearMessages();
  }
}

function requireInput() {
  if (inputEditor.value.trim()) {
    return true;
  }

  setOutput('', state.lastTransform);
  setStatus(`Add some ${state.mode.toUpperCase()} first.`, 'error', 'Paste content, load a sample, or import a file.');
  return false;
}

function runTransform(action) {
  if (!requireInput()) {
    return;
  }

  try {
    const transform = action === 'format' ? 'formatted' : 'minified';
    const result = formatInput(state.mode, inputEditor.value, transform);
    setOutput(result, transform);
    setStatus(
      `${capitalize(transform)} ${state.mode.toUpperCase()} successfully.`,
      'success',
      'Result is ready in the output panel.'
    );
  } catch (error) {
    setOutput('', state.lastTransform);
    setStatus(
      `Could not ${action} ${state.mode.toUpperCase()}.`,
      'error',
      error instanceof Error ? error.message : `Unable to ${action} ${state.mode.toUpperCase()}.`
    );
  }
}

function loadSample() {
  inputEditor.value = samples[state.mode];
  saveDraft(state.mode, inputEditor.value);
  setOutput('', state.lastTransform);
  updateInputMeta();
  setStatus(`Loaded ${state.mode.toUpperCase()} sample data.`, 'success', 'You can format it, minify it, or replace it with your own text.');
}

function clearWorkspace() {
  inputEditor.value = '';
  saveDraft(state.mode, '');
  setOutput('', state.lastTransform);
  updateInputMeta();
  clearMessages();
}

async function copyOutput() {
  if (!state.output.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.output);
  } catch {
    outputEditor.focus();
    outputEditor.select();
    document.execCommand('copy');
  }

  setStatus('Output copied.', 'success', 'The current result is now on your clipboard.');
}

function downloadOutput() {
  if (!state.output.trim()) {
    return;
  }

  const blob = new Blob([state.output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getDownloadName(state.mode, state.lastTransform);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('Download started.', 'success', `Saved as ${getDownloadName(state.mode, state.lastTransform)}.`);
}

function reuseOutputAsInput() {
  if (!state.output.trim()) {
    return;
  }

  inputEditor.value = state.output;
  saveDraft(state.mode, inputEditor.value);
  updateInputMeta();
  setStatus('Output moved into input.', 'success', 'You can keep refining the current result from the input panel.');
  inputEditor.focus();
}

function openFilePicker() {
  fileInput.click();
}

async function importFile(file) {
  if (!file) {
    return;
  }

  const text = await file.text();
  const inferredMode = inferModeFromFile(file.name, text) || state.mode;

  if (inferredMode !== state.mode) {
    setMode(inferredMode, false);
  }

  inputEditor.value = text;
  saveDraft(state.mode, text);
  setOutput('', state.lastTransform);
  updateInputMeta();
  setStatus(`Imported ${file.name}.`, 'success', `Loaded into ${state.mode.toUpperCase()} mode.`);
}

function handleAction(action) {
  if (action === 'format' || action === 'minify') {
    runTransform(action);
    return;
  }

  if (action === 'sample') {
    loadSample();
    return;
  }

  if (action === 'clear') {
    clearWorkspace();
    return;
  }

  if (action === 'copy') {
    void copyOutput();
    return;
  }

  if (action === 'download') {
    downloadOutput();
    return;
  }

  if (action === 'reuse') {
    reuseOutputAsInput();
    return;
  }

  openFilePicker();
}

function handleDropState(active) {
  dropZone.classList.toggle('is-dropping', active);
  dropHint.classList.toggle('is-visible', active);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

actionButtons.forEach((button) => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

themeToggle.addEventListener('click', toggleTheme);

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  await importFile(file);
  fileInput.value = '';
});

inputEditor.addEventListener('input', () => {
  saveDraft(state.mode, inputEditor.value);
  if (state.output) {
    setOutput('', state.lastTransform);
  }
  updateInputMeta();
});

inputEditor.addEventListener('paste', (event) => {
  const pastedText = event.clipboardData?.getData('text');

  if (!pastedText) {
    return;
  }

  const inferredMode = inferModeFromFile(`clipboard.${state.mode}`, pastedText);
  if (inferredMode && inferredMode !== state.mode) {
    event.preventDefault();
    setMode(inferredMode, false);

    const { selectionStart, selectionEnd, value } = inputEditor;
    inputEditor.value = `${value.slice(0, selectionStart)}${pastedText}${value.slice(selectionEnd)}`;
    inputEditor.selectionStart = inputEditor.selectionEnd = selectionStart + pastedText.length;
    saveDraft(state.mode, inputEditor.value);
    updateInputMeta();
    setStatus(
      `Pasted into ${state.mode.toUpperCase()} mode.`,
      'success',
      `Detected ${state.mode.toUpperCase()} from pasted content.`
    );
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    handleDropState(true);
  });
});

['dragleave', 'dragend'].forEach((eventName) => {
  dropZone.addEventListener(eventName, () => handleDropState(false));
});

dropZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  handleDropState(false);
  const [file] = Array.from(event.dataTransfer?.files || []);
  await importFile(file);
});

window.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier && event.key === 'Enter') {
    event.preventDefault();
    runTransform('format');
  }

  if (modifier && event.shiftKey && event.key.toLowerCase() === 'm') {
    event.preventDefault();
    runTransform('minify');
  }

  if (modifier && event.shiftKey && event.key.toLowerCase() === 'c') {
    event.preventDefault();
    void copyOutput();
  }

  if (modifier && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    openFilePicker();
  }
});

inputEditor.value = state.drafts[state.mode] || '';
applyTheme(state.theme);
updatePlaceholders();
updateInputMeta();
updateOutputMeta();
setMode(state.mode, false);
clearMessages();
syncActionAvailability();
