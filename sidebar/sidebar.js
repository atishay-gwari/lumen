// ─── Lumen — sidebar.js ───────────────────────────────────────────────────────
// Runs inside the Chrome side panel. Manages the chat UI, article extraction,
// streaming API calls to OpenRouter, mode switching, and daily usage tracking.

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const MODES = {
  quick: {
    label:       '⚡ Quick',
    desc:        'Short, direct answers straight from the article.',
    placeholder: 'Ask a quick question…',
    systemSuffix: `
STYLE — Quick mode:
- Answer in 1–3 sentences for simple facts; short paragraph for complex ones.
- Start with the answer immediately. No "Great question!", no preamble.
- Pull the answer directly from the article. If a specific section answers it, say so briefly (e.g. "According to the intro…").
- If the article doesn't cover it, say "The article doesn't mention this" in one line, then give a brief general answer if you can.
- Never use bullet points or headers for short answers — plain prose only.`,
    chips: [
      { label: '3-sentence summary', prompt: 'Summarize this article in exactly 3 sentences.' },
      { label: 'Main argument',      prompt: 'What is the single main argument this article is making?' },
      { label: 'Key numbers',        prompt: 'What are the most important numbers, stats, or data points mentioned?' },
      { label: 'Bottom line',        prompt: "What's the author's conclusion? What do they want me to take away?" },
    ],
  },

  tutor: {
    label:       '🎓 Tutor',
    desc:        'Teaches concepts from the article — breaks them down, uses analogies.',
    placeholder: 'What would you like to understand better?',
    systemSuffix: `
STYLE — Tutor mode:
- You are a patient, enthusiastic teacher. Your job is to build understanding, not just transfer information.
- Always anchor your explanation in the article — quote or paraphrase it, then unpack it.
- Break complex ideas into 2–3 clear steps. Use a concrete real-world analogy for anything technical.
- Keep explanations focused. One idea at a time, not a wall of text.
- End every response with exactly ONE follow-up question that checks if they understood the core concept (not a yes/no question).
- Warm, encouraging tone. Never make them feel the question is basic.`,
    chips: [
      { label: 'Explain the core idea', prompt: "Explain the core idea of this article like I'm completely new to this topic." },
      { label: 'Key concepts',          prompt: 'What are the 3 most important concepts I need to understand this article?' },
      { label: 'Real-world impact',     prompt: 'Why does this topic matter in the real world? Give me a concrete example.' },
      { label: 'Quiz me',               prompt: 'Ask me 3 questions to see if I truly understood this article.' },
    ],
  },

  deep: {
    label:       '🔍 Deep',
    desc:        'Thorough analysis — context, implications, what the article leaves unsaid.',
    placeholder: 'What do you want to explore in depth?',
    systemSuffix: `
STYLE — Deep Dive mode:
- Give a thorough, multi-layered answer. Don't skip nuance or hedge everything into mush.
- Quote or paraphrase the article directly to anchor your analysis — use "According to the article…" or similar.
- Go beyond the article: add relevant context, implications, or comparisons the author didn't cover.
- Structure: use ## headers when your answer has 3+ distinct sections, otherwise use clear paragraphs.
- Surface tensions or open questions the article raises but doesn't fully answer.
- If the question has a clear answer in the article, give it first — then go deeper.`,
    chips: [
      { label: 'Full analysis',    prompt: "Analyze the article's main argument — what's strong, what's assumed, what's implied." },
      { label: 'Broader context',  prompt: 'What context or background knowledge makes this article easier to understand?' },
      { label: 'What it leaves out', prompt: 'What important angles, data, or perspectives did this article not cover?' },
      { label: 'Implications',     prompt: 'If everything in this article is true, what are the long-term consequences?' },
    ],
  },

  devil: {
    label:       '🎭 Debate',
    desc:        "Challenges the article's claims — finds weak evidence and hidden assumptions.",
    placeholder: 'What claim should I push back on?',
    systemSuffix: `
STYLE — Debate mode:
- Your job is critical analysis, not summary. Challenge the article's claims head-on.
- For each significant claim, rate it: **Strong** (well-evidenced), **Moderate** (reasonable but needs more support), or **Weak** (asserted without evidence).
- Identify hidden assumptions — things the author treats as obvious that could be questioned.
- Point out who might be missing from the article: whose perspective is absent?
- Propose the strongest counter-argument to the article's main point, even if you personally disagree with it.
- Be intellectually honest. Don't manufacture controversy where none exists — say so if a claim is solid.`,
    chips: [
      { label: 'Rate the claims',  prompt: "Go through the main claims in this article and rate each one: Strong, Moderate, or Weak — and say why." },
      { label: 'Hidden assumptions', prompt: 'What assumptions is the author making that they never explicitly state?' },
      { label: "Who's missing",    prompt: 'Whose perspective or voice is absent from this article? Who should have been included?' },
      { label: 'Best counter-argument', prompt: "What is the strongest possible argument someone could make AGAINST this article's conclusion?" },
    ],
  },

  simple: {
    label:       '👶 Simple',
    desc:        'Plain language, no jargon — explains like you have zero background.',
    placeholder: 'What should I explain in plain English?',
    systemSuffix: `
STYLE — Simplify mode:
- Write for a curious 15-year-old with zero background in this subject.
- Every technical term gets replaced or immediately defined in plain English — no exceptions.
- Use short sentences (under 20 words each where possible).
- Use everyday analogies: "Think of it like a filing cabinet…", "It's similar to when you…"
- Avoid abstract language. Concrete and specific beats vague and general every time.
- Aim for max 8th-grade reading level. Simple ≠ dumb — be clear and warm, never condescending.`,
    chips: [
      { label: 'ELI15',          prompt: "Explain this entire article in simple terms, like I'm 15 and have never heard of this topic." },
      { label: 'One sentence',   prompt: 'Summarize this article in one single simple sentence that a teenager would understand.' },
      { label: 'The big takeaway', prompt: 'What is the ONE thing I should remember from this article? Make it stick.' },
      { label: 'Jargon buster',  prompt: 'Find the 5 most confusing words or phrases in this article and explain each one in plain English.' },
    ],
  },
};

const DEFAULT_MODE = 'quick';

// Fallback list shown before the live fetch completes.
// These are verified current IDs as of May 2026 — the live fetch always replaces this.
// openrouter/owl-alpha is OpenRouter's own free routing model that auto-picks
// the best available endpoint, which sidesteps "no endpoints" errors entirely.
const MODELS = [
  { id: 'openrouter/owl-alpha',                    name: 'Auto (Owl Router)',  isFree: true },
  { id: 'deepseek/deepseek-v4-flash:free',         name: 'DeepSeek V4 Flash', isFree: true },
  { id: 'google/gemma-4-31b-it:free',              name: 'Gemma 4 31B',       isFree: true },
  { id: 'google/gemma-4-26b-a4b-it:free',          name: 'Gemma 4 26B A4B',   isFree: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',  name: 'Nemotron 120B',     isFree: true },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron Nano 30B', isFree: true },
];

// openrouter/owl-alpha: OpenRouter's own free router — picks the best live endpoint
// automatically. Best default for free users since it survives provider outages.
const DEFAULT_MODEL       = 'openrouter/owl-alpha';
const DAILY_DISPLAY_LIMIT = 50;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_API_URL     = `${OPENROUTER_BASE_URL}/chat/completions`;
// Bump this whenever the model filter/shape changes so old caches are discarded.
const MODELS_CACHE_VERSION = 4; // v4 = updated to current live model IDs (May 2026)

// ── Model health tracking ─────────────────────────────────────────────────────
// Remembers when each model last failed so the fallback queue automatically
// deprioritises recently-broken models. Resets when the sidebar is closed.
// modelId → timestamp (ms) of most recent retryable failure
const _modelFailedAt = new Map();

function recordModelFailure(modelId) {
  _modelFailedAt.set(modelId, Date.now());
}

// Returns a penalty score: 0 = healthy, higher = failed more recently.
// Failures older than 30 minutes are forgotten (capacity may have recovered).
function modelPenalty(modelId) {
  const t = _modelFailedAt.get(modelId);
  if (!t) return 0;
  const minsAgo = (Date.now() - t) / 60_000;
  if (minsAgo > 30) { _modelFailedAt.delete(modelId); return 0; }
  if (minsAgo < 3)  return 10; // failed very recently — skip to bottom
  if (minsAgo < 10) return 5;
  return 2;
}

// Returns true for errors that are worth retrying with a different model.
// Returns false for errors no other model can fix (bad key, quota exhausted).
function isRetryableError(msg) {
  const m = msg.toLowerCase();
  return (
    m.includes('429')          || m.includes('502')         || m.includes('503')  ||
    m.includes('529')          || m.includes('rate-limit')  || m.includes('rate limit') ||
    m.includes('no endpoints') || m.includes('no available') ||
    m.includes('temporarily unavailable') || m.includes('provider returned error') ||
    m.includes('overloaded')   || m.includes('empty response') ||
    m.includes('context deadline') || m.includes('upstream') || m.includes('timeout')
  );
}

// Build the fallback queue from the LIVE model list — IDs always current.
// Strategy:
//   1. Primary (user's pick)
//   2. openrouter/owl-alpha — OpenRouter's own free router, survives provider outages
//   3. Other healthy free models (sorted by penalty score)
//   4. Penalised free models (recently failed, pushed to back)
//   5. Paid models as absolute last resort
function buildFallbackQueue(primary) {
  const OWL = 'openrouter/owl-alpha';
  const queue = [primary];

  // Pin owl-alpha second if it's not already the primary
  if (primary !== OWL) queue.push(OWL);

  if (_allModels.length) {
    const others = _allModels
      .filter(m => m.id !== primary && m.id !== OWL)
      .sort((a, b) => {
        const penaltyDiff = modelPenalty(a.id) - modelPenalty(b.id);
        if (penaltyDiff !== 0) return penaltyDiff;   // healthy first
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1; // free before paid
        return 0;
      });

    for (const m of others) queue.push(m.id);
  }

  return queue.slice(0, 5); // cap at 5 attempts
}

// The Settings page stores the *base* URL (e.g. "https://openrouter.ai/api/v1").
// This helper ensures we always hit the chat completions endpoint, even if the
// user accidentally saved the base URL without the trailing path.
function buildChatUrl(base) {
  const url = (base || OPENROUTER_BASE_URL).replace(/\/+$/, ''); // strip trailing slashes
  return url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;
}

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

let article         = null;   // { title, url, text, wordCount, truncated }
let conversation    = [];     // [{ role: 'user'|'assistant', content: string }]
let isStreaming     = false;
let currentApiKey   = null;
let currentModel    = DEFAULT_MODEL;
let currentMode     = DEFAULT_MODE;
let currentApiUrl   = DEFAULT_API_URL;  // overridable via Settings → API Endpoint
let abortController = null;

// ══════════════════════════════════════════════════════════════════════════════
// DOM REFERENCES
// ══════════════════════════════════════════════════════════════════════════════

const $messages         = document.getElementById('messages');
const $welcome          = document.getElementById('welcome');
const $input            = document.getElementById('user-input');
const $sendBtn          = document.getElementById('send-btn');
const $modelBtn         = document.getElementById('model-btn');
const $modelBtnName     = document.getElementById('model-btn-name');
const $modelPanel       = document.getElementById('model-panel');
const $modelPanelSearch = document.getElementById('model-panel-search');
const $modelPanelList   = document.getElementById('model-panel-list');
const $articleTitle     = document.getElementById('article-title');
const $wordCount    = document.getElementById('word-count');
const $articleIcon  = document.getElementById('article-icon');
const $refreshBtn   = document.getElementById('refresh-btn');
const $usageText    = document.getElementById('usage-text');
const $usageFill    = document.getElementById('usage-bar-fill');
const $clearBtn     = document.getElementById('clear-btn');
const $banner       = document.getElementById('banner');
const $settingsBtn  = document.getElementById('settings-btn');
const $modeDesc     = document.getElementById('mode-desc');
const $chips        = document.getElementById('chips');

// ══════════════════════════════════════════════════════════════════════════════
// POPUP MODE
// ══════════════════════════════════════════════════════════════════════════════
// When the user clicks the ⤢ button, this same page opens in a chrome.windows
// popup with ?tabId=N in the URL. We read that and pass it on every
// EXTRACT_CONTENT message so background.js reads the right tab regardless of
// which window Chrome considers "last focused".

const _urlTabId = (() => {
  const v = new URLSearchParams(window.location.search).get('tabId');
  return v ? parseInt(v, 10) : null;
})();

if (_urlTabId) {
  // Running as a pop-out — mark body so CSS hides the pop-out button
  document.body.classList.add('is-popup');
}

document.getElementById('popout-btn').addEventListener('click', () => {
  // Ask background for the current tab (works reliably from sidebar context)
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, (res) => {
    const tabId = res?.tabId;
    const base  = chrome.runtime.getURL('sidebar/sidebar.html');
    const url   = tabId ? `${base}?tabId=${tabId}` : base;
    chrome.windows.create({ url, type: 'popup', width: 720, height: 880 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INITIALISATION
// ══════════════════════════════════════════════════════════════════════════════

async function init() {
  const stored = await chrome.storage.sync.get([
    'apiKey', 'preferredModel', 'preferredMode', 'customApiUrl',
  ]);

  currentApiKey = stored.apiKey || null;
  if (stored.preferredModel)                              currentModel  = stored.preferredModel;
  if (stored.preferredMode && MODES[stored.preferredMode]) currentMode = stored.preferredMode;
  // Always build the full completions URL — guards against a saved base URL
  // that is missing the /chat/completions path (the most common misconfiguration).
  if (stored.customApiUrl) currentApiUrl = buildChatUrl(stored.customApiUrl);

  console.log('[Lumen] init — chat URL:', currentApiUrl, '| model:', currentModel);

  if (!currentApiKey) {
    showBanner('No API key set. <a href="#" id="setup-link">Set up Lumen →</a>', 'error');
    document.getElementById('setup-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    });
    setInputEnabled(false);
    return;
  }

  await buildModelDropdown();
  applyMode(currentMode, /* animate */ false);
  updateUsageDisplay();
  loadArticle();
}

// ══════════════════════════════════════════════════════════════════════════════
// ARTICLE LOADING
// ══════════════════════════════════════════════════════════════════════════════

async function loadArticle() {
  $articleIcon.textContent  = '⏳';
  $articleTitle.textContent = 'Reading page…';
  $wordCount.textContent    = '';
  $refreshBtn.classList.add('spinning');

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'EXTRACT_CONTENT', tabId: _urlTabId ?? undefined }, (res) => {
      $refreshBtn.classList.remove('spinning');

      if (!res || res.error) {
        $articleIcon.textContent  = '⚠️';
        $articleTitle.textContent = res?.title || 'Cannot read this page';
        showBanner(res?.error || 'Navigate to an article and click ↻ to reload.', 'warn');
        article = null;
        return resolve(null);
      }

      article = res;
      $articleIcon.textContent  = '📄';
      $articleTitle.textContent = res.title || res.url;
      $articleTitle.title       = res.url;
      $wordCount.textContent    = `${res.wordCount.toLocaleString()} words`;

      if (res.truncated) {
        showBanner('Long article — content was trimmed to fit the AI context window.', 'info');
      } else {
        hideBanner();
      }

      resolve(res);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt() {
  return `You are Lumen — an AI reading assistant embedded in the user's browser.

The user is reading this article right now:

Title: ${article.title}
URL:   ${article.url}

━━━ ARTICLE START ━━━
${article.text}
━━━ ARTICLE END ━━━

Core rules (apply these in every response, regardless of mode):
1. Ground everything in the article above. It is your primary source of truth.
2. When the article directly answers the question, use it — quote or paraphrase clearly.
3. If the article doesn't cover something, say so in one short line, then you may draw on general knowledge to fill the gap. Never pretend the article said something it didn't.
4. Do not repeat the question back to the user. Get straight to the response.
5. Do not add filler phrases: no "Certainly!", "Great question!", "Of course!", or "As an AI…"

${MODES[currentMode].systemSuffix}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT — SEND & STREAM
// ══════════════════════════════════════════════════════════════════════════════

async function sendMessage(text) {
  text = text.trim();
  if (!text || isStreaming) return;
  if (!currentApiKey) { showBanner('Please set up your API key first.', 'error'); return; }

  // Try loading the article if it wasn't available on open
  if (!article) {
    await loadArticle();
    if (!article) {
      addMessage('assistant', "⚠️ I couldn't read the current page. Navigate to an article and click ↻ to refresh.", true);
      return;
    }
  }

  hideWelcome();
  addMessage('user', text);
  conversation.push({ role: 'user', content: text });

  $input.value = '';
  autoResize($input);
  setInputEnabled(false);

  // Try the selected model first, then fall through free fallbacks automatically
  // when rate-limited or temporarily unavailable — fully transparent to the user.
  const queue = buildFallbackQueue(currentModel);
  let finalSuccess = false;

  for (let attempt = 0; attempt < queue.length; attempt++) {
    const model  = queue[attempt];
    const isLast = attempt === queue.length - 1;

    if (attempt > 0) {
      showBanner(`↻ Trying ${escHtml(shortenModelName(model))}…`, 'info');
    }

    const { success, retryable } = await streamResponse(model, /* suppressError */ !isLast);

    if (success) {
      finalSuccess = true;
      if (attempt > 0) {
        // Update the picker so the user can see which model actually worked
        currentModel = model;
        syncModelBtnLabel();
        renderModelPanel(_allModels);
        savePreference('preferredModel', model);
        showBanner(`Switched to ${escHtml(shortenModelName(model))} — your previous model was rate-limited`, 'info');
      }
      break;
    }

    if (!retryable) break; // 401, 402 etc — no other model will fix these
  }

  setInputEnabled(true);
  if (finalSuccess) incrementUsage();
}

// model        — which model ID to call (may differ from currentModel on retry)
// suppressError — if true, don't render an error bubble for retryable errors
//                 (caller will retry with a different model instead)
async function streamResponse(model, suppressError = false) {
  isStreaming     = true;
  abortController = new AbortController();

  const typingEl = addTypingIndicator();

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...conversation.slice(-10),
  ];

  let fullResponse = '';
  let msgEl        = null;
  let success      = false;
  let retryable    = false;

  console.log('[Lumen] sending request →', { model, url: currentApiUrl, turns: messages.length });

  try {
    const res = await fetch(currentApiUrl, {
      method:  'POST',
      signal:  abortController.signal,
      headers: {
        'Authorization': `Bearer ${currentApiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  `chrome-extension://${chrome.runtime.id}`,
        'X-Title':       'Lumen',
      },
      body: JSON.stringify({
        model,
        messages,
        stream:      true,
        max_tokens:  1024,
        temperature: 0.3,
      }),
    });

    console.log('[Lumen] response status →', res.status, res.ok ? 'OK' : 'FAILED');

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('[Lumen] API error body →', errBody);
      throw new Error(errBody?.error?.message || `HTTP ${res.status}`);
    }

    typingEl.remove();
    msgEl = addMessage('assistant', '', false, /* streaming */ true);
    const bubbleEl = msgEl.querySelector('.bubble');

    fullResponse = await readSSEStream(res.body, bubbleEl);
    bubbleEl.classList.remove('streaming');

    console.log('[Lumen] stream complete, response length →', fullResponse.length);

    if (!fullResponse) {
      throw new Error('Model returned an empty response. Try again or switch to a different model.');
    }

    bubbleEl.innerHTML = renderMarkdown(fullResponse);
    success = true;

  } catch (err) {
    typingEl.remove();

    if (err.name === 'AbortError') {
      msgEl?.querySelector('.bubble')?.classList.remove('streaming');
    } else {
      retryable = isRetryableError(err.message);

      if (retryable) {
        // Remember this model failed so buildFallbackQueue deprioritises it next time
        recordModelFailure(model);
      }

      if (suppressError && retryable) {
        // We'll retry with another model — silently remove any partial bubble
        msgEl?.remove();
      } else {
        handleApiError(err, msgEl);
      }
    }
  }

  if (success && fullResponse) {
    conversation.push({ role: 'assistant', content: fullResponse });
  }

  isStreaming     = false;
  abortController = null;
  scrollToBottom();

  return { success, retryable };
}

// Reads an SSE ReadableStream, appends tokens to bubbleEl, returns the full text.
async function readSSEStream(body, bubbleEl) {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';
  let   full    = '';

  let chunkCount = 0;

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log('[Lumen] stream ended — total chunks received:', chunkCount, '— total text length:', full.length);
      break;
    }

    chunkCount++;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep any incomplete trailing line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        console.log('[Lumen] [DONE] received — total text length:', full.length);
        break outer;
      }

      try {
        const parsed = JSON.parse(data);

        // OpenRouter sometimes sends an error object mid-stream instead of tokens
        // e.g. {"error":{"message":"Provider returned error","code":502}}
        if (parsed?.error) {
          console.error('[Lumen] stream error from provider →', parsed.error);
          throw new Error(parsed.error.message || 'Provider returned error');
        }

        const chunk = parsed?.choices?.[0]?.delta?.content || '';
        if (chunk) {
          full += chunk;
          bubbleEl.textContent = full;
          scrollToBottom();
        }
      } catch (err) {
        // Re-throw real errors (provider errors, etc.) so streamResponse catches them
        // Only swallow genuine JSON parse failures (malformed/partial chunks)
        if (err.message !== 'Unexpected end of JSON input' && !err.message.startsWith('Unexpected token')) {
          throw err;
        }
        console.log('[Lumen] skipped malformed SSE chunk →', data.slice(0, 80));
      }
    }
  }

  return full;
}

// ══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════════════════════════════════════

function handleApiError(err, existingMsgEl) {
  console.error('Lumen API error:', err);

  const msg = err.message || 'Unknown error';
  let friendly = `❌ ${msg}`;

  if (msg.includes('401') || msg.includes('Unauthorized')) {
    friendly = '❌ Invalid API key. Go to Settings to update it.';
  } else if (msg.includes('429') || msg.includes('rate limit') || msg.includes('rate-limited')) {
    // 429 from OpenRouter usually means the *model's* free tier is overloaded,
    // not the user's personal daily limit. Tell them to switch models.
    friendly = '❌ This model is overloaded right now (free tier rate limit). Switch to a different model in the dropdown above and try again.';
    showBanner('Model overloaded — pick a different one from the dropdown.', 'warn');
  } else if (msg.includes('402')) {
    friendly = '❌ Your OpenRouter free quota is exhausted. Add $10 to your account for 1000 req/day.';
  } else if (msg.includes('context') || msg.includes('tokens')) {
    friendly = '❌ Article too long for this model. Try switching to a model with a larger context window.';
  } else if (
    msg.includes('Provider returned error') ||
    msg.includes('502') || msg.includes('503') || msg.includes('529')
  ) {
    // OpenRouter 502/503/529 = upstream model provider is down or overloaded
    friendly = '❌ This model is temporarily unavailable. Switch to a different model using the dropdown above and try again.';
  } else if (msg.includes('empty response')) {
    friendly = '❌ The model returned nothing. Try again — if it keeps happening, switch to a different model.';
  }

  if (existingMsgEl) {
    const bubble = existingMsgEl.querySelector('.bubble');
    bubble.textContent = friendly;
    bubble.classList.add('error');
    bubble.classList.remove('streaming');
  } else {
    addMessage('assistant', friendly, /* isError */ true);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MODE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function applyMode(modeKey, animate = true) {
  currentMode = modeKey;
  const mode  = MODES[modeKey];

  // Update button active states
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === modeKey);
  });

  $modeDesc.textContent  = mode.desc;
  $input.placeholder     = mode.placeholder;

  if (animate) {
    $modeDesc.classList.add('flash');
    setTimeout(() => $modeDesc.classList.remove('flash'), 600);
  }

  renderChips(mode.chips);
  savePreference('preferredMode', modeKey);
}

function renderChips(chips) {
  if (!$chips) return;
  $chips.innerHTML = chips.map(c =>
    `<button class="chip" data-prompt="${c.prompt.replace(/"/g, '&quot;')}">${c.label}</button>`
  ).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL PICKER
// ══════════════════════════════════════════════════════════════════════════════

// Full model list kept in memory so search re-filtering is instant
let _allModels = [];
// How many models to show per section before the "Show X more" button appears
const PANEL_INITIAL_LIMIT = 6;
let _freeExpanded = false;
let _paidExpanded = false;

async function buildModelDropdown() {
  // Toggle panel open/closed — reset collapsed state on each open
  $modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = $modelPanel.classList.toggle('open');
    if (isOpen) {
      $modelPanelSearch.value = '';
      _freeExpanded = false;
      _paidExpanded = false;
      $modelPanelSearch.focus();
      renderModelPanel(_allModels);
    }
  });

  // Close when clicking anywhere outside the panel
  document.addEventListener('click', () => $modelPanel.classList.remove('open'));
  $modelPanel.addEventListener('click', (e) => e.stopPropagation());

  // Live search filter
  $modelPanelSearch.addEventListener('input', () => renderModelPanel(_allModels));

  // Check version BEFORE rendering — never show an unfiltered/stale cache.
  const { modelsCache } = await chrome.storage.local.get('modelsCache');
  const cacheValid = modelsCache && modelsCache.version === MODELS_CACHE_VERSION;

  if (!cacheValid && modelsCache) {
    await chrome.storage.local.remove('modelsCache');
    console.log('[Lumen] cleared stale model cache (version mismatch)');
  }

  // Render immediately from valid cache; fall back to hardcoded list while fetching
  _allModels = cacheValid ? modelsCache.models : MODELS.map(m => ({ ...m, isFree: true }));
  renderModelPanel(_allModels);
  syncModelBtnLabel();

  // Always fetch fresh in the background — text-only filter, latest models
  if (currentApiKey) {
    fetchAndCacheModels(currentApiKey)
      .then(freshModels => { _allModels = freshModels; renderModelPanel(_allModels); syncModelBtnLabel(); })
      .catch(e => console.warn('Lumen: model list fetch failed —', e.message));
  }
}

// Fetch the full model catalogue from OpenRouter and store it in local cache.
async function fetchAndCacheModels(apiKey) {
  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data   = await res.json();
  const models = (data.data || [])
    // Only text-output models — filters out audio (Lyria, Suno), image, video generators.
    // Modality format is e.g. "text->text", "text+image->text", "text->image".
    // If the field is missing we check the model name/id for known non-text keywords
    // so nothing slips through.
    .filter(m => {
      const modality = m.architecture?.modality;
      if (modality) return modality.endsWith('->text');
      // No modality field — exclude obvious non-text models by name
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
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  await chrome.storage.local.set({
    modelsCache: { models, fetchedAt: Date.now(), version: MODELS_CACHE_VERSION },
  });
  return models;
}

// Render the floating panel, grouped into Free / Paid sections, filtered by search.
// Each section shows PANEL_INITIAL_LIMIT items then a "Show X more" button.
function renderModelPanel(modelList) {
  const query    = $modelPanelSearch.value.trim().toLowerCase();
  const searching = query.length > 0;
  let list       = modelList || [];

  if (searching) {
    list = list.filter(m =>
      m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
    );
  }

  // Always show the current model even if it's not in the filtered list
  if (currentModel && !list.find(m => m.id === currentModel)) {
    list = [{ id: currentModel, name: currentModel, isFree: currentModel.endsWith(':free') }, ...list];
  }

  if (!list.length) {
    $modelPanelList.innerHTML = '<div class="model-panel-empty">No models match</div>';
    return;
  }

  const free = list.filter(m => m.isFree);
  const paid = list.filter(m => !m.isFree);

  let html = '';

  if (free.length) {
    const show    = (searching || _freeExpanded) ? free : free.slice(0, PANEL_INITIAL_LIMIT);
    const hidden  = free.length - show.length;
    html += `<div class="model-section-label">⚡ Free models</div>`;
    html += show.map(m => modelItemHTML(m)).join('');
    if (hidden > 0) {
      html += `<button class="model-show-more" data-section="free">Show ${hidden} more free models ▾</button>`;
    } else if (!searching && _freeExpanded && free.length > PANEL_INITIAL_LIMIT) {
      html += `<button class="model-show-more" data-section="free-collapse">Show less ▴</button>`;
    }
  }

  if (paid.length) {
    const show   = (searching || _paidExpanded) ? paid : paid.slice(0, PANEL_INITIAL_LIMIT);
    const hidden = paid.length - show.length;
    html += `<div class="model-section-label">💎 Paid models</div>`;
    html += show.map(m => modelItemHTML(m)).join('');
    if (hidden > 0) {
      html += `<button class="model-show-more" data-section="paid">Show ${hidden} more paid models ▾</button>`;
    } else if (!searching && _paidExpanded && paid.length > PANEL_INITIAL_LIMIT) {
      html += `<button class="model-show-more" data-section="paid-collapse">Show less ▴</button>`;
    }
  }

  $modelPanelList.innerHTML = html;

  // Model selection
  $modelPanelList.querySelectorAll('.model-item').forEach(el => {
    el.addEventListener('click', () => {
      currentModel = el.dataset.id;
      syncModelBtnLabel();
      savePreference('preferredModel', currentModel);
      $modelPanel.classList.remove('open');
      renderModelPanel(_allModels);
    });
  });

  // Expand / collapse buttons
  $modelPanelList.querySelectorAll('.model-show-more').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const section = btn.dataset.section;
      if (section === 'free')          { _freeExpanded = true;  }
      if (section === 'free-collapse') { _freeExpanded = false; }
      if (section === 'paid')          { _paidExpanded = true;  }
      if (section === 'paid-collapse') { _paidExpanded = false; }
      renderModelPanel(_allModels);
    });
  });
}

function modelItemHTML(m) {
  const sel   = m.id === currentModel;
  // Escape all API-sourced strings before inserting into innerHTML
  const safeId    = escHtml(m.id);
  const safeName  = escHtml(m.name);
  const safeShort = escHtml(shortenModelName(m.name));
  const badge = m.isFree
    ? `<span class="model-badge free">Free</span>`
    : `<span class="model-badge paid">Paid</span>`;
  const check = `<span class="model-check">${sel ? '✓' : ''}</span>`;
  return `<div class="model-item${sel ? ' selected' : ''}" data-id="${safeId}" data-name="${safeName}">
    ${check}<span class="model-item-name" title="${safeName}">${safeShort}</span>${badge}
  </div>`;
}

// Keep the header button label in sync with currentModel
function syncModelBtnLabel() {
  const match = _allModels.find(m => m.id === currentModel);
  $modelBtnName.textContent = shortenModelName(match ? match.name : currentModel);
}

// Trim provider prefixes ("Meta: ", "Google: " etc.) so names fit the panel.
function shortenModelName(name) {
  return name
    .replace(/^[^:]+:\s*/, '')   // strip "Meta: ", "Google: ", etc.
    .replace(/\s*\(free\)/i, '') // strip "(free)"
    .trim()
    .slice(0, 32);
}

// ══════════════════════════════════════════════════════════════════════════════
// HTML ESCAPE UTILITY
// ══════════════════════════════════════════════════════════════════════════════
// All data that comes from external sources (OpenRouter API model names/IDs)
// must be escaped before being inserted into innerHTML to prevent XSS.

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════════════════════
// MARKDOWN RENDERER
// ══════════════════════════════════════════════════════════════════════════════
// Zero-dependency renderer for the subset of Markdown that LLMs typically output.
// Input is HTML-escaped first, so no model output can inject markup.

function renderMarkdown(raw) {
  if (!raw) return '';

  // ── 1. Escape HTML ─────────────────────────────────────────────────────────
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ── 2. Fenced code blocks → block placeholders (hoisted before line split) ─
  const blockStore = [];
  s = s.replace(/```(?:[^\n`]*)?\n?([\s\S]*?)```/g, (_, code) => {
    blockStore.push(`<pre><code>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`);
    return `\x02B${blockStore.length - 1}\x03`;
  });

  // ── 3. Inline code → inline placeholders (so bold/italic skip them) ────────
  const inlineStore = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    inlineStore.push(`<code>${code}</code>`);
    return `\x02I${inlineStore.length - 1}\x03`;
  });

  // ── 4. Inline emphasis ─────────────────────────────────────────────────────
  s = s.replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/gs,     '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g,      '<em>$1</em>');
  s = s.replace(/__(.+?)__/gs,         '<strong>$1</strong>');

  // ── 5. Line-by-line block structure ────────────────────────────────────────
  const lines = s.split('\n');
  const out   = [];
  let inUl = false, inOl = false, para = [], tableRows = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; }
  };
  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    // Second row is a separator ( |---|---| ) → first row is a header
    const isSep = (r) => /^\|[-:| ]+\|$/.test(r.trim());
    const parseRow = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    let html = '<table>';
    if (tableRows.length > 1 && isSep(tableRows[1])) {
      html += `<thead><tr>${parseRow(tableRows[0]).map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
      for (let i = 2; i < tableRows.length; i++)
        html += `<tr>${parseRow(tableRows[i]).map(c => `<td>${c}</td>`).join('')}</tr>`;
      html += '</tbody>';
    } else {
      html += '<tbody>';
      for (const row of tableRows)
        html += `<tr>${parseRow(row).map(c => `<td>${c}</td>`).join('')}</tr>`;
      html += '</tbody>';
    }
    out.push(html + '</table>');
    tableRows = [];
  };

  for (const line of lines) {
    const t = line.trim();

    // Block code fence placeholder — stands alone
    if (/^\x02B\d+\x03$/.test(t)) { flushPara(); closeLists(); flushTable(); out.push(t); continue; }

    // Markdown table row — starts and ends with |
    if (t.startsWith('|') && t.endsWith('|')) {
      flushPara(); closeLists();
      tableRows.push(t);
      continue;
    }

    // Non-table line → flush any open table first
    if (tableRows.length) flushTable();

    // Headers — h3-h6 to stay visually compact inside the bubble
    const hm = t.match(/^(#{1,4}) (.+)$/);
    if (hm) {
      flushPara(); closeLists();
      const lvl = Math.min(hm[1].length + 2, 6);
      out.push(`<h${lvl}>${hm[2]}</h${lvl}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeLists(); out.push('<hr>'); continue; }

    // Unordered list
    const ul = t.match(/^[-*+] (.+)$/);
    if (ul) {
      flushPara();
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }

    // Ordered list
    const ol = t.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushPara();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${ol[1]}</li>`);
      continue;
    }

    // Blank line → flush
    if (t === '') { flushPara(); closeLists(); continue; }

    // Normal text → accumulate paragraph
    closeLists();
    para.push(t);
  }

  flushPara(); closeLists(); flushTable();

  // ── 6. Restore placeholders ────────────────────────────────────────────────
  return out.join('\n')
    .replace(/\x02B(\d+)\x03/g, (_, i) => blockStore[+i])
    .replace(/\x02I(\d+)\x03/g, (_, i) => inlineStore[+i]);
}

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Wraps chrome.storage.sync.set with error logging — sync storage can throw
// QUOTA_EXCEEDED if too many keys are written too quickly.
async function savePreference(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
  } catch (e) {
    console.warn('Lumen: could not save preference:', key, e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// USAGE TRACKING
// ══════════════════════════════════════════════════════════════════════════════

async function updateUsageDisplay() {
  const today  = new Date().toISOString().slice(0, 10);
  const stored = await chrome.storage.local.get('usage');
  const count  = stored.usage?.date === today ? stored.usage.count : 0;
  const pct    = Math.min((count / DAILY_DISPLAY_LIMIT) * 100, 100);

  $usageText.textContent  = `${count} / ${DAILY_DISPLAY_LIMIT} today`;
  $usageFill.style.width  = `${pct}%`;

  if      (pct >= 90) $usageFill.style.background = '#ef4444';
  else if (pct >= 70) $usageFill.style.background = '#f59e0b';
  else                $usageFill.style.background = '';
}

async function incrementUsage() {
  const today  = new Date().toISOString().slice(0, 10);
  const stored = await chrome.storage.local.get('usage');
  const prev   = stored.usage;
  const count  = (prev?.date === today ? prev.count : 0) + 1;

  await chrome.storage.local.set({ usage: { date: today, count } });
  updateUsageDisplay();

  if (count === DAILY_DISPLAY_LIMIT) {
    showBanner(`You've used all ${DAILY_DISPLAY_LIMIT} free requests for today. OpenRouter resets at midnight UTC.`, 'warn');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function hideWelcome() {
  if ($welcome) $welcome.style.display = 'none';
}

function addMessage(role, text, isError = false, streaming = false) {
  const wrap   = document.createElement('div');
  wrap.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = ['bubble', isError ? 'error' : '', streaming ? 'streaming' : '']
    .filter(Boolean).join(' ');
  bubble.textContent = text;

  const time = document.createElement('div');
  time.className   = 'message-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  wrap.appendChild(bubble);
  wrap.appendChild(time);
  $messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTypingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  $messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function scrollToBottom() {
  $messages.scrollTop = $messages.scrollHeight;
}

function setInputEnabled(enabled) {
  $input.disabled    = !enabled;
  $sendBtn.disabled  = !enabled;
  if (enabled) $input.focus();
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function showBanner(html, type = 'info') {
  $banner.innerHTML = html;
  $banner.className = `show ${type}`;
}

function hideBanner() {
  $banner.className = '';
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════════════════════════════════════════

// Send on button click or Enter (Shift+Enter inserts a newline)
$sendBtn.addEventListener('click', () => sendMessage($input.value));

$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage($input.value);
  }
});

$input.addEventListener('input', () => autoResize($input));

// ↻ Refresh — re-reads the page and clears conversation
$refreshBtn.addEventListener('click', () => {
  conversation = [];
  $messages.querySelectorAll('.message').forEach(el => el.remove());
  $welcome.style.display = '';
  hideBanner();
  loadArticle();
});

// Clear chat — keeps article loaded, just wipes messages
$clearBtn.addEventListener('click', () => {
  conversation = [];
  $messages.querySelectorAll('.message, div[style*="text-align:center"]').forEach(el => el.remove());
  $welcome.style.display = '';
  renderChips(MODES[currentMode].chips);
  hideBanner();
});

$settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

// Mode bar — switches mode and clears conversation so new style takes effect cleanly
document.getElementById('mode-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn || btn.dataset.mode === currentMode) return;

  const modeKey = btn.dataset.mode;
  applyMode(modeKey, /* animate */ true);
  conversation = [];

  $messages.querySelectorAll('.message, div[style*="text-align:center"]').forEach(el => el.remove());
  $welcome.style.display = '';

  const notice = document.createElement('div');
  notice.style.cssText  = 'text-align:center;font-size:11px;color:var(--brand);padding:8px 0;font-weight:500;';
  notice.textContent    = `${MODES[modeKey].label} mode — ask anything`;
  $messages.insertBefore(notice, $welcome.nextSibling);
});

// Suggestion chips (event delegation — chips live inside #messages)
$messages.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) {
    $input.value = chip.dataset.prompt;
    sendMessage(chip.dataset.prompt);
  }
});

// React to settings changes made in the settings page (other tab/window)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes.apiKey) {
    currentApiKey = changes.apiKey.newValue;
    if (currentApiKey) {
      hideBanner();
      setInputEnabled(true);
      loadArticle();
    }
  }

  if (changes.preferredModel) {
    currentModel = changes.preferredModel.newValue;
    syncModelBtnLabel();
    renderModelPanel(_allModels);
  }

  if (changes.preferredMode) {
    const m = changes.preferredMode.newValue;
    if (MODES[m] && m !== currentMode) applyMode(m, /* animate */ false);
  }

  // Custom API URL changed — update immediately so next request uses the new endpoint.
  // buildChatUrl ensures we always hit /chat/completions even if base URL was saved.
  if (changes.customApiUrl) {
    currentApiUrl = changes.customApiUrl.newValue
      ? buildChatUrl(changes.customApiUrl.newValue)
      : DEFAULT_API_URL;
    console.log('[Lumen] API URL updated →', currentApiUrl);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════════

init();
