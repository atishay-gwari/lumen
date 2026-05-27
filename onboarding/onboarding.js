// ─── Lumen — onboarding.js ────────────────────────────────────────────────────

let validatedKey = null;
let validateTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $keyInput    = document.getElementById('key-input');
const $validateDot = document.getElementById('validate-dot');
const $validateMsg = document.getElementById('validate-msg');
const $btnSave     = document.getElementById('btn-save');

// ── Step navigation ───────────────────────────────────────────────────────────
function goToStep(n) {
  document.querySelectorAll('.panel').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });

  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`dot-${i}`);
    const lbl = document.getElementById(`lbl-${i}`);
    const line = document.getElementById(`line-${i}`);

    dot.className = 'step-dot' + (i < n ? ' done' : i === n ? ' active' : '');
    dot.textContent = i < n ? '✓' : String(i);
    lbl.className = 'step-label' + (i === n ? ' active' : '');
    if (line) line.className = 'step-line' + (i < n ? ' done' : '');
  }
}

// ── Step 1 buttons ────────────────────────────────────────────────────────────
document.getElementById('btn-to-step2').addEventListener('click', () => goToStep(2));
document.getElementById('btn-openrouter').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://openrouter.ai/settings/keys' });
});

// ── Key validation ────────────────────────────────────────────────────────────
function setValidating() {
  $validateDot.className = 'dot loading';
  $validateMsg.className = '';
  $validateMsg.textContent = 'Validating…';
  $btnSave.disabled = true;
  $btnSave.textContent = 'Validating…';
}

function setValid(modelCount) {
  $validateDot.className = 'dot ok';
  $validateMsg.className = 'ok';
  $validateMsg.textContent = `✅ Connected — ${modelCount} free models available`;
  $btnSave.disabled = false;
  $btnSave.textContent = 'Save & Continue →';
}

function setInvalid(reason) {
  validatedKey = null;
  $validateDot.className = 'dot fail';
  $validateMsg.className = 'fail';
  $validateMsg.textContent = `❌ ${reason}`;
  $btnSave.disabled = true;
  $btnSave.textContent = 'Invalid key';
}

async function validateKey(key) {
  if (!key || !key.startsWith('sk-or-')) {
    setInvalid('Key must start with sk-or-…');
    return;
  }

  setValidating();

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });

    if (res.status === 401) { setInvalid('Invalid key — please check and try again.'); return; }
    if (!res.ok)             { setInvalid(`OpenRouter error (${res.status}). Try again.`); return; }

    const data = await res.json();
    const freeModels = (data.data || []).filter(m => m.id.endsWith(':free'));
    validatedKey = key;
    setValid(freeModels.length);

  } catch (e) {
    setInvalid('Could not reach OpenRouter. Check your internet connection.');
  }
}

$keyInput.addEventListener('input', () => {
  const val = $keyInput.value.trim();
  clearTimeout(validateTimer);

  if (!val) {
    $validateDot.className = 'dot';
    $validateMsg.className = '';
    $validateMsg.textContent = 'Paste your key above to validate it';
    $btnSave.disabled = true;
    $btnSave.textContent = 'Save & Continue →';
    return;
  }

  // Debounce — wait 600ms after typing stops before hitting the API
  validateTimer = setTimeout(() => validateKey(val), 600);
});

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-save').addEventListener('click', async () => {
  if (!validatedKey) return;
  await chrome.storage.sync.set({ apiKey: validatedKey });
  goToStep(3);
});

// ── Success panel ─────────────────────────────────────────────────────────────
document.getElementById('btn-try').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://en.wikipedia.org/wiki/Artificial_intelligence' });
});

document.getElementById('btn-close').addEventListener('click', () => {
  window.close();
});

// ── If key already exists, skip to step 3 ────────────────────────────────────
(async () => {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (apiKey) goToStep(3);
})();
