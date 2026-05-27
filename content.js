// ─── Lumen — content.js ───────────────────────────────────────────────────────
// Runs on every http/https page.
// 1. Extracts clean article text when the sidebar requests it.
// 2. Injects / toggles the floating chat widget when the toolbar icon is clicked.

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONTENT') {
    sendResponse(extractContent());
    return true;
  }

  if (msg.type === 'TOGGLE_WIDGET') {
    injectOrToggleWidget(msg.tabId);
    sendResponse({ ok: true });
    return true;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ARTICLE EXTRACTION
// ══════════════════════════════════════════════════════════════════════════════

function extractContent() {
  const title = document.title;
  const url   = location.href;

  // ── 1. Try known article containers in priority order ──────────────────────
  const ARTICLE_SELECTORS = [
    'article[class]',
    'article',
    '[role="main"]',
    'main[class]',
    'main',
    // Common CMS / blog patterns
    '.post-content', '.post-body', '.entry-content', '.entry-body',
    '.article-content', '.article-body', '.article-text',
    '.story-body', '.story-content',
    '.page-content', '.page-body',
    '#article-body', '#article-content',
    '#content', '#main-content', '#main',
    // Medium / Substack / Ghost
    '.section-content', '.post', '.gh-content',
    // Wikipedia
    '#mw-content-text',
  ];

  let node = null;
  for (const sel of ARTICLE_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 300) {
        node = el;
        break;
      }
    } catch (_) {}
  }

  // Fall back to full body if nothing useful found
  if (!node) node = document.body;

  // ── 2. Clone and strip noise ───────────────────────────────────────────────
  const clone = node.cloneNode(true);
  const REMOVE_TAGS = [
    'script', 'style', 'noscript', 'svg', 'canvas',
    'nav', 'header', 'footer', 'aside',
    'form', 'input', 'button', 'select', 'textarea',
    'iframe', 'embed', 'object', 'video', 'audio',
    'figure > figcaption',
  ];
  REMOVE_TAGS.forEach(tag => {
    clone.querySelectorAll(tag).forEach(el => el.remove());
  });

  // Remove elements that look like ads or nav by class/id
  const NOISE_PATTERNS = /\b(ad|ads|advert|banner|promo|sidebar|widget|comment|social|share|related|recommend|newsletter|subscribe|cookie|popup|modal|overlay)\b/i;
  clone.querySelectorAll('[class],[id]').forEach(el => {
    const sig = (el.className || '') + ' ' + (el.id || '');
    if (NOISE_PATTERNS.test(sig)) el.remove();
  });

  // ── 3. Extract and clean text ──────────────────────────────────────────────
  let text = (clone.innerText || clone.textContent || '')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.length;

  const TEXT_LIMIT = 20000;
  const truncated  = charCount > TEXT_LIMIT;
  if (truncated) text = text.slice(0, TEXT_LIMIT) + '\n\n[Article truncated to fit context window]';

  return {
    title,
    url,
    text,
    wordCount,
    charCount,
    truncated,
    excerpt: text.slice(0, 180).replace(/\n/g, ' ') + '…',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FLOATING CHAT WIDGET
// ══════════════════════════════════════════════════════════════════════════════
// An Intercom-style floating chat overlay injected into the page.
// Uses Shadow DOM so the widget's CSS never leaks into or from the host page.
//
// Structure:
//   body > #lumen-host (shadow host, no visual)
//     └── shadow root
//           ├── <style>   (scoped CSS)
//           ├── #ac-fab   (floating action button — always visible)
//           └── #ac-panel (chat panel, shown/hidden on toggle)
//                 ├── #ac-drag (drag bar + title + close button)
//                 ├── #ac-frame (iframe → sidebar/sidebar.html)
//                 └── #ac-resize (resize grip, bottom-right corner)

let _widgetInjected = false;
let _widgetOpen     = false;
let _widgetTabId    = null;
let _widgetShadow   = null;
let _widgetPanel    = null;
let _widgetFab      = null;
let _widgetIframe   = null;
let _iframeLoaded   = false;

// Called by the TOGGLE_WIDGET message handler.
function injectOrToggleWidget(tabId) {
  _widgetTabId = tabId;

  if (!_widgetInjected) {
    _createWidget();
    _widgetInjected = true;
    _openWidget(); // open immediately on first click
    return;
  }

  if (_widgetOpen) _closeWidget();
  else             _openWidget();
}

function _createWidget() {
  // Guard: prevent double injection (e.g. if the script is injected twice)
  if (document.getElementById('lumen-host')) return;

  // ── Shadow host ─────────────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'lumen-host';
  // Host is invisible and non-interactive — all real elements live in shadow
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  _widgetShadow = shadow;

  // ── CSS (shadow-scoped, never leaks to page) ─────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Floating Action Button ─────────────────────────────────────────── */
    #ac-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #6366f1;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(99,102,241,.5);
      font-size: 24px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: all;
      transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
      z-index: 2147483647;
    }
    #ac-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(99,102,241,.65);
      background: #4f46e5;
    }
    #ac-fab.open {
      background: #4338ca;
    }

    /* ── Chat Panel ─────────────────────────────────────────────────────── */
    #ac-panel {
      position: fixed;
      /* top + left set by JS on first render */
      width: 400px;
      height: 580px;
      min-width: 280px;
      min-height: 360px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.12);
      display: none;
      flex-direction: column;
      overflow: hidden;
      pointer-events: all;
      z-index: 2147483646;
    }
    #ac-panel.open {
      display: flex;
    }

    /* ── Drag bar ───────────────────────────────────────────────────────── */
    #ac-drag {
      flex-shrink: 0;
      height: 42px;
      background: linear-gradient(120deg, #6366f1 0%, #8b5cf6 100%);
      border-radius: 16px 16px 0 0;
      cursor: move;
      display: flex;
      align-items: center;
      padding: 0 10px;
      gap: 8px;
      user-select: none;
    }
    #ac-drag-grip {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      width: 18px;
      pointer-events: none;
      opacity: .45;
      flex-shrink: 0;
    }
    #ac-drag-grip span {
      display: block;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #fff;
    }
    #ac-drag-title {
      flex: 1;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: rgba(255,255,255,.95);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #ac-close {
      flex-shrink: 0;
      background: rgba(255,255,255,.15);
      border: none;
      color: #fff;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      transition: background .12s;
    }
    #ac-close:hover { background: rgba(255,255,255,.3); }

    /* ── Iframe ─────────────────────────────────────────────────────────── */
    #ac-frame {
      flex: 1;
      min-height: 0;
      width: 100%;
      border: none;
      display: block;
      background: transparent;
    }

    /* ── Resize grip (bottom-right corner) ──────────────────────────────── */
    #ac-resize {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 22px;
      height: 22px;
      cursor: se-resize;
      z-index: 10;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      padding: 4px;
      pointer-events: all;
    }
    #ac-resize::after {
      content: '';
      display: block;
      width: 10px;
      height: 10px;
      border-right: 2px solid rgba(0,0,0,.25);
      border-bottom: 2px solid rgba(0,0,0,.25);
      border-radius: 0 0 3px 0;
    }
  `;
  shadow.appendChild(style);

  // ── FAB ──────────────────────────────────────────────────────────────────────
  _widgetFab = document.createElement('button');
  _widgetFab.id = 'ac-fab';
  _widgetFab.textContent = '💡';
  _widgetFab.title = 'Open Lumen';
  shadow.appendChild(_widgetFab);

  // ── Panel ────────────────────────────────────────────────────────────────────
  _widgetPanel = document.createElement('div');
  _widgetPanel.id = 'ac-panel';

  // Initial position: above and to the right, aligned with FAB at bottom-right
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = Math.min(400, vw - 16);
  const ph = Math.min(580, vh - 120);
  _widgetPanel.style.width  = pw + 'px';
  _widgetPanel.style.height = ph + 'px';
  _widgetPanel.style.left   = Math.max(8, vw - pw - 24) + 'px';
  _widgetPanel.style.top    = Math.max(8, vh - ph - 96) + 'px';

  shadow.appendChild(_widgetPanel);

  // Drag bar
  const dragBar = document.createElement('div');
  dragBar.id = 'ac-drag';

  const grip = document.createElement('div');
  grip.id = 'ac-drag-grip';
  for (let i = 0; i < 6; i++) grip.appendChild(document.createElement('span'));
  dragBar.appendChild(grip);

  const titleSpan = document.createElement('span');
  titleSpan.id = 'ac-drag-title';
  titleSpan.textContent = '💡 Lumen';
  dragBar.appendChild(titleSpan);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'ac-close';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  dragBar.appendChild(closeBtn);

  _widgetPanel.appendChild(dragBar);

  // iframe (src set lazily on first open)
  _widgetIframe = document.createElement('iframe');
  _widgetIframe.id = 'ac-frame';
  _widgetIframe.setAttribute('allowtransparency', 'true');
  _widgetPanel.appendChild(_widgetIframe);

  // Resize grip
  const resizeGrip = document.createElement('div');
  resizeGrip.id = 'ac-resize';
  resizeGrip.title = 'Drag to resize';
  _widgetPanel.appendChild(resizeGrip);

  // ── FAB click ───────────────────────────────────────────────────────────────
  _widgetFab.addEventListener('click', () => {
    if (_widgetOpen) _closeWidget();
    else             _openWidget();
  });

  // ── Close button ────────────────────────────────────────────────────────────
  closeBtn.addEventListener('click', _closeWidget);

  // ── Drag ─────────────────────────────────────────────────────────────────────
  let dragging = false;
  let drag = {};

  dragBar.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn) return; // let close button click through
    dragging    = true;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    const r     = _widgetPanel.getBoundingClientRect();
    drag.origLeft = r.left;
    drag.origTop  = r.top;
    _widgetIframe.style.pointerEvents = 'none'; // prevent iframe eating mouse events
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const pw2 = _widgetPanel.offsetWidth;
    const ph2 = _widgetPanel.offsetHeight;
    let newLeft = drag.origLeft + (e.clientX - drag.startX);
    let newTop  = drag.origTop  + (e.clientY - drag.startY);
    // Clamp: keep at least 40px of the panel visible on each edge
    newLeft = Math.max(-pw2 + 40, Math.min(window.innerWidth  - 40, newLeft));
    newTop  = Math.max(0,         Math.min(window.innerHeight - 40, newTop));
    _widgetPanel.style.left = newLeft + 'px';
    _widgetPanel.style.top  = newTop  + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      _widgetIframe.style.pointerEvents = '';
    }
  });

  // ── Resize ──────────────────────────────────────────────────────────────────
  let resizing = false;
  let res = {};

  resizeGrip.addEventListener('mousedown', (e) => {
    resizing    = true;
    res.startX  = e.clientX;
    res.startY  = e.clientY;
    res.origW   = _widgetPanel.offsetWidth;
    res.origH   = _widgetPanel.offsetHeight;
    const r     = _widgetPanel.getBoundingClientRect();
    res.panelLeft = r.left;
    res.panelTop  = r.top;
    _widgetIframe.style.pointerEvents = 'none';
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const newW = Math.max(280, res.origW + (e.clientX - res.startX));
    const newH = Math.max(360, res.origH + (e.clientY - res.startY));
    // Cap at viewport bounds
    const maxW = window.innerWidth  - res.panelLeft - 8;
    const maxH = window.innerHeight - res.panelTop  - 8;
    _widgetPanel.style.width  = Math.min(newW, maxW) + 'px';
    _widgetPanel.style.height = Math.min(newH, maxH) + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (resizing) {
      resizing = false;
      _widgetIframe.style.pointerEvents = '';
    }
  });
}

function _openWidget() {
  // Lazy-load the iframe on the very first open
  if (!_iframeLoaded) {
    const base = chrome.runtime.getURL('sidebar/sidebar.html');
    _widgetIframe.src = `${base}?floating=1${_widgetTabId ? `&tabId=${_widgetTabId}` : ''}`;
    _iframeLoaded = true;
  }

  _widgetPanel.classList.add('open');
  _widgetFab.classList.add('open');
  _widgetFab.textContent = '✕';
  _widgetFab.title = 'Close Lumen';
  _widgetOpen = true;
}

function _closeWidget() {
  _widgetPanel.classList.remove('open');
  _widgetFab.classList.remove('open');
  _widgetFab.textContent = '💡';
  _widgetFab.title = 'Open Lumen';
  _widgetOpen = false;
}
