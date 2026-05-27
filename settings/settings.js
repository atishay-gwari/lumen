// ─── Lumen — settings.js ──────────────────────────────────────────────────────

// Escape user/API-sourced strings before inserting into innerHTML
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEFAULT_API_URL      = 'https://openrouter.ai/api/v1';
const MODELS_CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // re-fetch once per day
const MODELS_CACHE_VERSION = 4; // v4 = updated to current live model IDs (May 2026)
const DAILY_LIMIT          = 50;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $keyInput    = document.getElementById('key-input');
const $keyDot      = document.getElementById('key-dot');
const $keyStatus   = document.getElementById('key-status');
const $btnValidate = document.getElementById('btn-validate');

const $modelSelect    = document.getElementById('model-select');
const $modelSearch    = document.getElementById('model-search');
const $freeOnly       = document.getElementById('free-only');
const $modelCount     = document.getElementById('model-count');
const $modelUpdated   = document.getElementById('model-updated');
const $btnRefresh     = document.getElementById('btn-refresh-models');

const $customUrlInput  = document.getElementById('custom-url-input');
const $customUrlDot    = document.getElementById('custom-url-dot');
const $customUrlStatus = document.getElementById('custom-url-status');
const $btnCustomUrlSave  = document.getElementById('btn-custom-url-save');
const $btnCustomUrlReset = document.getElementById('btn-custom-url-reset');

const $usageFill  = document.getElementById('usage-fill');
const $usageLabel = document.getElementById('usage-label');
const $toast      = document.getElementById('save-toast');

// In-memory copy of the full fetched model list so search/filter is instant
let allModels    = [];
let currentModel = '';

// ══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP — load everything on page open
// ══════════════════════════════════════════════════════════════════════════════

async function load() {
  const { apiKey, preferredModel, customApiUrl } =
    await chrome.storage.sync.get(['apiKey', 'preferredModel', 'customApiUrl']);

  currentModel = preferredModel || '';

  loadKeyStatus(apiKey);
  loadCustomUrl(customApiUrl);
  loadUsage();

  // Models need the API key to fetch — show a prompt if it's missing
  if (!apiKey) {
    setModelStatus('No API key set — validate your key above first.');
    return;
  }

  await loadModels(apiKey, /* forceRefresh */ false);
}

// ══════════════════════════════════════════════════════════════════════════════
// API KEY
// ══════════════════════════════════════════════════════════════════════════════

function loadKeyStatus(apiKey) {
  if (apiKey) {
    $keyInput.value = apiKey;
    setKeyStatus('ok', '✅ Key is set and active');
  } else {
    setKeyStatus('none', 'No key set — paste one above');
  }
}

function setKeyStatus(state, message) {
  $keyDot.className      = `dot ${state === 'ok' ? 'ok' : state === 'fail' ? 'fail' : state === 'loading' ? 'loading' : ''}`;
  $keyStatus.textContent = message;
}

async function validateAndSave(key) {
  if (!key) { setKeyStatus('none', 'Paste a key above'); return; }
  if (!key.startsWith('sk-or-')) {
    setKeyStatus('fail', 'Invalid format — key must start with sk-or-…');
    return;
  }

  setKeyStatus('loading', 'Validating with OpenRouter…');
  $btnValidate.disabled = true;

  try {
    const res = await fetch(`${DEFAULT_API_URL}/models`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });

    if (res.status === 401) { setKeyStatus('fail', '❌ Invalid key');                     $btnValidate.disabled = false; return; }
    if (!res.ok)            { setKeyStatus('fail', `❌ OpenRouter error (${res.status})`); $btnValidate.disabled = false; return; }

    await chrome.storage.sync.set({ apiKey: key });
    setKeyStatus('ok', '✅ Valid — key saved');
    showToast('API key saved');

    // Fetch models now that we have a key
    await loadModels(key, /* forceRefresh */ true);

  } catch {
    setKeyStatus('fail', '❌ Network error — check connection');
  }

  $btnValidate.disabled = false;
}

$btnValidate.addEventListener('click', () => validateAndSave($keyInput.value.trim()));
$keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') validateAndSave($keyInput.value.trim());
});

document.getElementById('btn-remove-key').addEventListener('click', async () => {
  if (!confirm("Remove your API key? You'll need to set it up again to use Lumen.")) return;
  await chrome.storage.sync.remove('apiKey');
  $keyInput.value = '';
  setKeyStatus('none', 'Key removed — paste a new one above');
  showToast('Key removed');
});

// ══════════════════════════════════════════════════════════════════════════════
// MODEL FETCHING & CACHING
// ══════════════════════════════════════════════════════════════════════════════

// Fetch model list from OpenRouter, using a 24-hour local cache to avoid
// hitting the API on every settings open.
async function loadModels(apiKey, forceRefresh) {
  setModelStatus('Loading models…', /* loading */ true);

  try {
    const cached = await getCachedModels();

    if (!forceRefresh && cached) {
      allModels = cached.models;
      renderModelDropdown();
      showCacheTimestamp(cached.fetchedAt);
      return;
    }

    // Fetch fresh list from OpenRouter
    const res = await fetch(`${DEFAULT_API_URL}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    allModels  = parseModels(data.data || []);

    await cacheModels(allModels);
    renderModelDropdown();
    showCacheTimestamp(Date.now());

  } catch (e) {
    setModelStatus(`❌ Could not fetch models — ${e.message}`);
  }
}

function parseModels(rawList) {
  return rawList
    // Keep only models whose output is text — excludes audio generators (Lyria,
    // Suno, etc.), image generators (DALL-E, Stable Diffusion, etc.), and
    // video generators. modality is e.g. "text->text" or "text+image->text".
    // If the field is missing we include the model (safe default).
    .filter(m => {
      const modality = m.architecture?.modality;
      if (modality) return modality.endsWith('->text');
      const id = (m.id || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      const nonText = ['image', 'audio', 'video', 'music', 'speech', 'tts', 'lyria', 'suno', 'dall-e', 'stable-diffusion', 'flux'];
      return !nonText.some(kw => id.includes(kw) || name.includes(kw));
    })
    .map(m => ({
      id:            m.id,
      name:          m.name || m.id,
      contextLength: m.context_length || 0,
      isFree:        m.id.endsWith(':free') ||
                     (m.pricing?.prompt === '0' && m.pricing?.completion === '0'),
    }))
    .sort((a, b) => {
      // Free models first, then alphabetically by name
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

async function getCachedModels() {
  const { modelsCache } = await chrome.storage.local.get('modelsCache');
  if (!modelsCache) return null;
  if (modelsCache.version !== MODELS_CACHE_VERSION) return null; // stale schema
  if (Date.now() - modelsCache.fetchedAt > MODELS_CACHE_TTL_MS) return null;
  return modelsCache; // { models, fetchedAt, version }
}

async function cacheModels(models) {
  await chrome.storage.local.set({
    modelsCache: { models, fetchedAt: Date.now(), version: MODELS_CACHE_VERSION },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL DROPDOWN RENDERING
// ══════════════════════════════════════════════════════════════════════════════

function renderModelDropdown() {
  const search   = $modelSearch.value.trim().toLowerCase();
  const freeOnly = $freeOnly.checked;

  const filtered = allModels.filter(m => {
    if (freeOnly && !m.isFree) return false;
    if (search) return m.name.toLowerCase().includes(search) || m.id.toLowerCase().includes(search);
    return true;
  });

  $modelSelect.innerHTML = filtered.map(m => {
    const ctx    = m.contextLength ? ` · ${formatCtx(m.contextLength)}` : '';
    const badge  = m.isFree ? ' [free]' : '';
    // Escape API-sourced strings before inserting into innerHTML
    const safeId    = escHtml(m.id);
    const safeLabel = escHtml(`${m.name}${badge}${ctx}`);
    return `<option value="${safeId}" ${m.id === currentModel ? 'selected' : ''}>${safeLabel}</option>`;
  }).join('');

  $modelCount.textContent = `${filtered.length} model${filtered.length !== 1 ? 's' : ''} shown`;
}

function formatCtx(tokens) {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k ctx` : `${tokens} ctx`;
}

function setModelStatus(message, loading = false) {
  $modelCount.textContent   = message;
  $modelUpdated.textContent = '';
  if (loading) {
    $modelSelect.innerHTML = '<option disabled>Loading…</option>';
  }
}

function showCacheTimestamp(fetchedAt) {
  const d = new Date(fetchedAt);
  $modelUpdated.textContent = `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Save preference when the user selects a different model
$modelSelect.addEventListener('change', async () => {
  currentModel = $modelSelect.value;
  await chrome.storage.sync.set({ preferredModel: currentModel });
  showToast('Model saved');
});

// Live search filter
$modelSearch.addEventListener('input', renderModelDropdown);

// Free-only toggle
$freeOnly.addEventListener('change', renderModelDropdown);

// Force re-fetch
$btnRefresh.addEventListener('click', async () => {
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) { showToast('Set an API key first'); return; }
  $btnRefresh.disabled = true;
  await loadModels(apiKey, /* forceRefresh */ true);
  $btnRefresh.disabled = false;
  showToast('Model list refreshed');
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM API ENDPOINT
// ══════════════════════════════════════════════════════════════════════════════

function loadCustomUrl(customApiUrl) {
  const url = customApiUrl || DEFAULT_API_URL;
  $customUrlInput.value = url;

  if (customApiUrl && customApiUrl !== DEFAULT_API_URL) {
    $customUrlDot.className      = 'dot ok';
    $customUrlStatus.textContent = 'Custom endpoint active';
  } else {
    $customUrlDot.className      = 'dot';
    $customUrlStatus.textContent = 'Using default OpenRouter endpoint';
  }
}

$btnCustomUrlSave.addEventListener('click', async () => {
  let val = $customUrlInput.value.trim();
  if (!val) { showToast('Enter a URL first'); return; }
  try { new URL(val); } catch { showToast('Invalid URL format'); return; }

  // Normalise: strip /chat/completions suffix so we always store the base URL.
  // sidebar.js appends /chat/completions itself via buildChatUrl().
  val = val.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');

  // If it matches the default, just remove the custom override so storage stays clean.
  if (val === DEFAULT_API_URL) {
    await chrome.storage.sync.remove('customApiUrl');
    loadCustomUrl(null);
    showToast('Endpoint reset to default');
    return;
  }

  await chrome.storage.sync.set({ customApiUrl: val });
  loadCustomUrl(val);
  showToast('Endpoint saved');
});

$btnCustomUrlReset.addEventListener('click', async () => {
  await chrome.storage.sync.remove('customApiUrl');
  loadCustomUrl(null);
  showToast('Endpoint reset to default');
});

// ══════════════════════════════════════════════════════════════════════════════
// USAGE
// ══════════════════════════════════════════════════════════════════════════════

async function loadUsage() {
  const today  = new Date().toISOString().slice(0, 10);
  const stored = await chrome.storage.local.get('usage');
  const count  = stored.usage?.date === today ? stored.usage.count : 0;
  const pct    = Math.min((count / DAILY_LIMIT) * 100, 100);

  $usageFill.style.width      = `${pct}%`;
  $usageFill.style.background = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#6366f1';
  $usageLabel.textContent     = `${count} / ${DAILY_LIMIT}`;
}

document.getElementById('btn-reset-usage').addEventListener('click', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await chrome.storage.local.set({ usage: { date: today, count: 0 } });
  loadUsage();
  showToast('Usage counter reset');
});

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════

function showToast(msg) {
  $toast.textContent   = `✓ ${msg}`;
  $toast.style.display = 'block';
  setTimeout(() => { $toast.style.display = 'none'; }, 2000);
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════════

load();
