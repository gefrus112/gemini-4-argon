// Gemini 4 Argon — server
// Chat API (streaming), Linux code sandbox, artifact previews, model catalog,
// chat-history store and GitHub repo info. Binds 0.0.0.0 for live preview.

import express from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, getModel } from './models.js';
import { composeReply, LANGUAGE_LIST } from './engine.js';
import { runCode, toolchainStatus } from './sandbox.js';
import { saveArtifact, readArtifact, listArtifacts, deleteArtifact, ARTIFACTS_DIR } from './files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const HISTORY_FILE = join(ROOT, 'workspace', 'history.json');

const app = express();
app.use(express.json({ limit: '4mb' }));

/* ------------------------------- static ------------------------------- */
app.use(express.static(join(ROOT, 'public')));
app.use('/artifacts', express.static(ARTIFACTS_DIR));
app.get('/vendor/three.module.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'));
});

/* ------------------------------- history ------------------------------ */
async function loadHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}
async function saveHistory(chats) {
  await mkdir(join(ROOT, 'workspace'), { recursive: true });
  await writeFile(HISTORY_FILE, JSON.stringify(chats, null, 2), 'utf8');
}

app.get('/api/history', async (_req, res) => {
  res.json(await loadHistory());
});

app.post('/api/history', async (req, res) => {
  const chats = await loadHistory();
  const incoming = req.body?.chat;
  if (!incoming?.id) return res.status(400).json({ error: 'chat.id required' });
  const idx = chats.findIndex((c) => c.id === incoming.id);
  if (idx >= 0) chats[idx] = { ...chats[idx], ...incoming, updatedAt: new Date().toISOString() };
  else chats.unshift({ ...incoming, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await saveHistory(chats);
  res.json({ ok: true });
});

app.delete('/api/history/:id', async (req, res) => {
  const chats = (await loadHistory()).filter((c) => c.id !== req.params.id);
  await saveHistory(chats);
  res.json({ ok: true });
});

/* ------------------------------- models ------------------------------- */
app.get('/api/models', async (_req, res) => {
  const toolchains = await toolchainStatus();
  res.json({
    models: MODELS,
    languages: LANGUAGE_LIST.map((l) => ({ ...l, ...(toolchains[l.id] || {}) })),
    engine: 'argon-local-1',
    node: process.versions.node,
    platform: `${process.platform} · sandbox Linux`,
    contextWindow: 1_000_000,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), ts: Date.now() });
});

/* -------------------------------- chat -------------------------------- */
// SSE stream: {"t":"chunk"} ... {"t":"done", tokens, model}
app.post('/api/chat', async (req, res) => {
  const { model: modelId = 'gemini-4-argon', messages = [] } = req.body || {};
  const model = getModel(modelId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let reply = composeReply({ modelId, messages });

  // Auto-run flow: the engine asked the sandbox to execute the user's code.
  if (reply.run) {
    send({ t: 'status', text: `Running ${reply.run.lang} in the Linux sandbox…` });
    const result = await runCode({ lang: reply.run.lang, code: reply.run.code });
    const out = result.stdout || result.stderr || '(no output)';
    reply = {
      text:
        `**${model.name}** executed your \`${reply.run.lang}\` code in the Linux sandbox:\n\n` +
        '```' + reply.run.lang + '\n' + reply.run.code.trim() + '\n```\n\n' +
        '**Sandbox output:**\n```text\n' + out + '\n```\n\n' +
        `Exit code \`${result.exitCode}\` · ${result.ms} ms` +
        (result.missingToolchain ? `\n> ⚠ toolchain \`${result.missingToolchain}\` unavailable here` : ''),
    };
  }

  const text = reply.text || '(empty reply)';
  const tokens = Math.ceil(text.length / 4);

  // Stream word-by-word with per-model cadence.
  const words = text.split(/(\s+)/);
  const delay = Math.max(2, Math.round(900 / (model.tokensPerSec / 12)));
  for (const w of words) {
    send({ t: 'chunk', w });
    await new Promise((r) => setTimeout(r, delay));
  }

  if (reply.artifact) {
    try {
      const name = await saveArtifact(reply.artifact.name, reply.artifact.code);
      send({ t: 'artifact', name, lang: reply.artifact.lang, preview: !!reply.preview });
    } catch (e) {
      send({ t: 'status', text: `artifact save failed: ${e.message}` });
    }
  } else if (reply.code) {
    send({ t: 'code', ...reply.code });
  }

  send({ t: 'done', tokens, model: model.id, tier: model.tier });
  res.end();
});

/* ------------------------------- sandbox ------------------------------ */
app.post('/api/run', async (req, res) => {
  const { lang = 'javascript', code = '', timeoutMs } = req.body || {};
  if (!code.trim()) return res.status(400).json({ error: 'code required' });
  const result = await runCode({ lang, code, timeoutMs });
  res.json(result);
});

app.get('/api/toolchains', async (_req, res) => {
  res.json({ languages: LANGUAGE_LIST, toolchains: await toolchainStatus() });
});

/* -------------------------------- files ------------------------------- */
app.get('/api/files', async (_req, res) => res.json(await listArtifacts()));

app.post('/api/files', async (req, res) => {
  try {
    const name = await saveArtifact(req.body?.name || 'untitled.txt', req.body?.content || '');
    res.json({ ok: true, name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/files/:name', async (req, res) => {
  try {
    res.json({ name: req.params.name, content: await readArtifact(req.params.name) });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

app.delete('/api/files/:name', async (req, res) => {
  try {
    await deleteArtifact(req.params.name);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

/* -------------------------------- github ------------------------------ */
app.get('/api/github', async (_req, res) => {
  const url = 'https://api.github.com/repos/gefrus112/gemini-4-argon';
  const parse = (d) => ({
    repo: d.full_name,
    url: d.html_url,
    description: d.description,
    stars: d.stargazers_count,
    forks: d.forks_count,
    language: d.language,
    defaultBranch: d.default_branch,
  });
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'gemini-4-argon', Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) throw new Error(`github ${r.status}`);
    res.json(parse(await r.json()));
    return;
  } catch {
    // Node's TLS store may not trust the sandbox CA chain — curl does.
  }
  try {
    const { execFile } = await import('node:child_process');
    const out = await new Promise((resolve, reject) =>
      execFile('curl', ['-s', '--max-time', '10', '-H', 'User-Agent: gemini-4-argon', url],
        (e, stdout) => (e ? reject(e) : resolve(stdout)))
    );
    res.json(parse(JSON.parse(out)));
  } catch (e) {
    res.json({ repo: 'gefrus112/gemini-4-argon', url: 'https://github.com/gefrus112/gemini-4-argon', offline: true, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✦ Gemini 4 Argon online → http://0.0.0.0:${PORT}`);
});
