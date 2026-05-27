# 🧩 ArticleChat

> Chat with any article or webpage using AI — directly in your browser sidebar.  
> **Your reading stays private.** Your API key never leaves your device.

---

## ✨ What it does

Open ArticleChat on any article, blog post, Wikipedia page, or news story and ask questions in plain English:

- *"What's the main argument?"*
- *"Summarize this in 3 points"*
- *"What evidence does the author cite?"*
- *"What's the conclusion?"*

The AI reads the page and answers instantly — no copy-pasting, no switching tabs.

---

## 🚀 How to install (developer mode)

> Until it's on the Chrome Web Store, load it manually:

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select this `article-chat` folder
5. The 🧩 icon will appear in your toolbar — click it!

---

## 🔑 First-time setup

ArticleChat uses **OpenRouter** — a free gateway to powerful AI models. You connect your own account so your reading stays completely private.

1. Go to [openrouter.ai](https://openrouter.ai) and create a free account
2. Go to **Settings → Keys → Create Key**
3. Copy the key (starts with `sk-or-v1-`)
4. Paste it in the ArticleChat setup screen that opens on first install

That's it. The extension validates the key and you're ready to chat.

---

## 🤖 Available models (all free)

| Model | Size | Best for |
|---|---|---|
| Llama 3.3 70B | 70B | Best quality, default choice |
| DeepSeek V4 Flash | — | Fastest responses |
| Gemma 4 31B | 31B | Google's model, solid all-rounder |
| Qwen 3 80B | 80B | Smartest reasoning |
| Llama 3.2 3B | 3B | Lightweight, very fast |
| Nemotron 120B | 120B | Nvidia's largest free model |

Switch models anytime from the dropdown in the sidebar.

---

## 📊 Rate limits

OpenRouter's free tier gives each user:
- **50 requests/day** free
- **1000 requests/day** with a one-time $10 top-up to your own account

The sidebar shows your daily usage and warns when you're close to the limit.

---

## 🔒 Privacy

- **No backend.** This extension has no servers. Zero.
- **Your API key** is stored in Chrome's encrypted local storage (`chrome.storage.sync`) and is never transmitted anywhere except directly to OpenRouter.
- **Article text** goes directly from your browser to OpenRouter's API. We never see it.
- **No analytics**, no tracking, no account required from us.

---

## 📁 File structure

```
article-chat/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — handles install + toolbar click
├── content.js          # Runs on pages — extracts article text
├── sidebar.html/js/css # Main chat UI (Chrome Side Panel)
├── onboarding.html/js  # First-run setup wizard
├── settings.html/js    # Settings page (key, model, usage)
├── icons/              # Extension icons (16, 48, 128px)
└── README.md           # This file
```

---

## 🛣️ Roadmap

- [ ] Conversation history (persist across sessions)
- [ ] Citation mode — highlight the source sentence in the article
- [ ] Export chat as Markdown or PDF
- [ ] Firefox support
- [ ] Chrome Web Store listing

---

## 🛠 Built with

- Chrome Extension Manifest V3
- Chrome Side Panel API
- [OpenRouter](https://openrouter.ai) — free LLM gateway
- Vanilla JS + CSS (no frameworks, fast load)

---

*Made with ❤️ — feedback welcome.*
