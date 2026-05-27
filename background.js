// ─── Lumen — background.js ────────────────────────────────────────────────────
// Service worker: handles install, toolbar clicks, and relays messages between
// the sidebar (an extension page) and content scripts running on web pages.
//
// Message flow:
//   sidebar.js  →  chrome.runtime.sendMessage
//   background  →  chrome.tabs.sendMessage  →  content.js
//   content.js  →  sendResponse  →  background  →  sendResponse  →  sidebar.js

// ── Install: open onboarding if this is a fresh install ───────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;

  const { apiKey } = await chrome.storage.sync.get('apiKey');
  if (!apiKey) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
});

// ── Toolbar icon click: toggle the floating chat widget on the active page ─────
// Sends TOGGLE_WIDGET to the content script. If the content script isn't loaded
// yet (tab was open before the extension was installed/reloaded), injects it first.
// On restricted pages (chrome://, etc.) executeScript throws — silently ignored.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  const tabId = tab.id;

  chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_WIDGET', tabId }, () => {
    if (!chrome.runtime.lastError) return; // content script responded — done

    // Content script not present — inject dynamically then retry
    chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
      .then(() => chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_WIDGET', tabId }))
      .catch(e => console.warn('Lumen: cannot inject widget on this page —', e.message));
  });
});

// ── Message relay ──────────────────────────────────────────────────────────────
// The sidebar cannot directly message a tab's content script because it doesn't
// know which tab is active. Background queries the active tab and forwards the
// message on the sidebar's behalf.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'EXTRACT_CONTENT') {
    // msg.tabId is set when the request comes from a popped-out window that
    // already knows which tab it should read (passed via ?tabId= in the URL).
    const findTab = (cb) => {
      if (msg.tabId) {
        chrome.tabs.get(msg.tabId, tab => {
          if (chrome.runtime.lastError) cb(null);
          else cb(tab);
        });
      } else {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => cb(tab));
      }
    };

    findTab((tab) => {
      if (!tab?.id) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (res) => {
        if (!chrome.runtime.lastError) {
          // Content script was already running — return result directly
          sendResponse(res);
          return;
        }

        // Content script not present — this happens when the tab was already open
        // before the extension was installed or reloaded. Inject it dynamically
        // (requires the "scripting" permission which is declared in manifest.json).
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files:  ['content.js'],
        })
        .then(() => {
          // Retry the message now that the script is injected
          chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (res2) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                error: 'Cannot read this page. Navigate to an article and try again.',
                title: tab.title || 'Unknown page',
                url:   tab.url  || '',
              });
            } else {
              sendResponse(res2);
            }
          });
        })
        .catch(() => {
          // executeScript itself failed — restricted page (chrome://, etc.)
          sendResponse({
            error: 'Cannot read this page. Navigate to an article and try again.',
            title: tab.title || 'Unknown page',
            url:   tab.url  || '',
          });
        });
      });
    });

    return true; // keep message channel open for the async sendResponse
  }

  if (msg.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
      sendResponse({ title: tab?.title, url: tab?.url, tabId: tab?.id });
    });
    return true;
  }
});
