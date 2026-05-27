# 💡 Lumen

> Chat with any article, blog post, or webpage using AI — as a floating widget right on the page.  
> **Your reading stays completely private.** Your API key never leaves your device.

---

## ✨ What it does

Click the 💡 toolbar icon on any article and a floating chat panel appears over the page. Ask anything in plain English:

- *"What's the main argument here?"*
- *"Summarize this in 3 sentences"*
- *"What evidence does the author cite?"*
- *"Challenge the claims in this article"*
- *"Explain this like I'm new to the topic"*

The AI reads the page and responds instantly — no copy-pasting, no switching tabs.

---

## 🚀 How to install

> Lumen is not yet on the Chrome Web Store — install it manually in a few clicks:

1. [Download this repo](https://github.com/atishay-gwari/lumen/archive/refs/heads/main.zip) and unzip it
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right corner)
4. Click **Load unpacked** → select the unzipped `lumen-main` folder
5. The 💡 icon appears in your toolbar — click it on any article!

---

## 🔑 First-time setup

Lumen uses **OpenRouter** — a free gateway to powerful AI models. You bring your own account so your reading stays completely private (we have no servers).

1. Go to [openrouter.ai](https://openrouter.ai) and create a free account (~2 minutes)
2. Click your profile → **Keys** → **Create Key**
3. Copy the key — it starts with `sk-or-v1-`
4. Paste it in the Lumen setup screen that opens on first install

The extension validates your key live. Once saved, you're ready.

---

## 💬 Chat modes

Switch modes from the bar at the top of the chat panel:

| Mode | What it does |
|---|---|
| ⚡ **Quick** | Short, direct answers pulled straight from the article |
| 🎓 **Tutor** | Explains with analogies, breaks down concepts, ends with a follow-up question |
| 🔍 **Deep** | Thorough analysis — context, implications, what the article leaves unsaid |
| 🎭 **Debate** | Challenges the article's claims, rates evidence strength, finds hidden assumptions |
| 👶 **Simple** | Plain English, no jargon, 8th-grade reading level |

---

## 🤖 Models

Lumen fetches the full model list live from OpenRouter. Free models are available with no credit card:

- **Auto (Owl Router)** — OpenRouter's own free router, picks the best available model automatically *(default)*
- **DeepSeek V4 Flash** — fastest responses
- **Gemma 4 31B** — solid all-rounder from Google
- **Nemotron 120B** — largest free model from Nvidia

If a free model is overloaded, Lumen automatically falls back to another — no interruption.

Want better reliability? Any paid model from [openrouter.ai/models](https://openrouter.ai/models) works at a fraction of a cent per request.

---

## 🔒 Privacy

- **No backend.** Lumen has no servers. Zero.
- **Your API key** is stored in Chrome's encrypted local storage and only ever sent directly to OpenRouter — never to us.
- **Article text** goes directly from your browser to OpenRouter's API. We never see it.
- **No analytics**, no tracking, no account required from us.

---

## 📁 File structure

```
lumen/
├── manifest.json          # Chrome MV3 config
├── background.js          # Service worker — toolbar click, message relay
├── content.js             # Injected into pages — article extraction + floating widget
├── sidebar/
│   ├── sidebar.html       # Chat UI
│   ├── sidebar.js         # Chat logic, streaming, model picker
│   └── sidebar.css        # Styles
├── onboarding/
│   ├── onboarding.html    # First-run setup wizard
│   └── onboarding.js
├── settings/
│   ├── settings.html      # Settings page (key, model, usage)
│   └── settings.js
└── icons/                 # Extension icons (16, 48, 128px)
```

---

## 🛣️ Roadmap

- [ ] Conversation history — persist chat across sessions per URL
- [ ] Citation mode — highlight the exact sentence the answer came from
- [ ] PDF support
- [ ] Export chat as Markdown
- [ ] Firefox support
- [ ] Chrome Web Store listing

---

## 🛠 Built with

- Chrome Extension Manifest V3
- Chrome Side Panel API + content script floating widget
- [OpenRouter](https://openrouter.ai) — free LLM gateway
- Vanilla JS + CSS — zero dependencies, fast load

---

*Made with ❤️ — feedback and PRs welcome.*
