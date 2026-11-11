# ✦ Gemini 4 Argon

**Use free AI models** — a Gemini-style chat interface with a real working model
lineup, chat history, a Linux code sandbox and live file previews, built for
GitHub. Model tiers follow the **Claude Opus / Sonnet / Haiku** convention.

![stack](https://img.shields.io/badge/node-22-brightgreen) ![three](https://img.shields.io/badge/three.js-0.187-blue) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

## Features

- **Model lineup (all working, all shown live)** — `Gemini 4 Argon` (Opus-class),
  `Gemini 4 Argon Pro`, `Gemini 4 Flash` (Sonnet-class), `Gemini 4 Flash Lite`
  (Haiku-class), `Qwen 4 Preview` and `Qwen 4 Coder` — every one with a
  **1,000,000-token context window**, streaming responses and live status.
- **Chat history** — searchable sidebar grouped by date. Saved locally, mirrored
  to the server, and synced to **Supabase** (`gemini_chats` / `gemini_messages`)
  when `public/config.js` is configured.
- **Linux code sandbox** — every code block has **▶ Run**. Executes Node.js 22,
  Python 3.11, C/C++ (gcc/g++), Bash, Perl and more, with a 10 s timeout and a
  **20-line output pane** (expandable). Rust/Go/Java/PHP/… are detected and
  report toolchain status honestly. Ask *"execute this python code: print(2+2)"*
  and the model runs it for you and streams the output back.
- **File previews** — HTML, SVG art and **three.js** scenes render live in the
  preview dock. *"Generate a futuristic image"* produces vector art; *"make a
  three.js scene"* renders a glowing Argon crystal.
- **Node.js + three.js installed** — three.js is served from
  `/vendor/three.module.js`, so 3D previews work fully offline.

## Quick start

```bash
npm install
npm start          # → http://localhost:3000
```

## Layout

```
server/          # Express API: chat (SSE), sandbox runner, artifacts, models
  index.js       # routes + static hosting
  engine.js      # the "Argon" inference core (intent detection, code corpus)
  models.js      # model catalog (Gemini 4 Argon, Qwen 4 Preview, …)
  sandbox.js     # Linux code sandbox (temp dirs, timeouts, capped output)
  files.js       # artifact store for previews
public/          # Gemini-style UI (dark, glowing), three.js preview scene
  config.example.js  # Supabase sync config template
examples/
  rust_20_lines.rs   # 20-line Rust demo (primes ≤ 100)
```

## Supabase chat-history sync

Tables (already provisioned on project `AI Model Giver`):

```sql
gemini_chats(id, title, model, created_at, updated_at)
gemini_messages(id, chat_id → gemini_chats, role, content, model, created_at)
```

Copy `public/config.example.js` → `public/config.js` and fill in the project URL
and a **publishable** key (RLS protects the data). Without config, history falls
back to localStorage + the server-side store.

## API

| Endpoint | Description |
|---|---|
| `POST /api/chat` | SSE stream — `{model, messages}` → word-by-word reply |
| `POST /api/run` | `{lang, code}` → sandbox execution result |
| `GET /api/models` | Model lineup + language/toolchain status |
| `GET /api/files` · `POST /api/files` | Previewable artifacts |
| `GET /api/history` · `POST` · `DELETE` | Chat history store |
| `GET /api/github` | Repo info (live from api.github.com) |

## Sandbox toolchains

Installed: **Node 22, Python 3.11, gcc, g++, Perl, Bash**. Rust, Go, Java,
PHP, Ruby, Lua, Kotlin, Swift, C#, R and SQL run when their toolchains are
present — otherwise the UI says so instead of faking output.
