/* Gemini 4 Argon — frontend */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const state = {
    models: [],
    languages: [],
    model: null,
    chats: [],          // [{id,title,model,messages:[{role,content,ts}],createdAt,updatedAt}]
    currentId: null,
    busy: false,
    tokens: 0,
    streamBuffer: '',
  };

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const fmtNum = (n) => n.toLocaleString('en-US');

  /* =================== brand icons (real marks, inline SVG) =================== */
  const ICONS = {
    // Google Gemini — four-point sparkle, Google gradient
    gemini: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="gemGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#4E8CFF"/><stop offset=".5" stop-color="#9B72FF"/><stop offset="1" stop-color="#D965C8"/>
      </linearGradient></defs>
      <path fill="url(#gemGrad)" d="M32 2c2 16 12 26 28 30-16 4-26 14-28 30-2-16-12-26-28-30C20 28 30 18 32 2z"/>
    </svg>`,
    // Google — the four-colour G
    google: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`,
    // Qwen (Alibaba) — gradient Q mark in the Qwen purple-blue palette
    qwen: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="qwenGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#615CED"/><stop offset="1" stop-color="#3BA7FF"/>
      </linearGradient></defs>
      <circle cx="31" cy="29" r="17.5" fill="none" stroke="url(#qwenGrad)" stroke-width="9"/>
      <rect x="34" y="41" width="21" height="9" rx="4.5" fill="url(#qwenGrad)" transform="rotate(45 34 41)"/>
    </svg>`,
    // fallback sparkle
    spark: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path fill="#7aa2ff" d="M32 2c2 16 12 26 28 30-16 4-26 14-28 30-2-16-12-26-28-30C20 28 30 18 32 2z"/>
    </svg>`,
  };
  const iconFor = (m) => ICONS[m?.icon] || ICONS.spark;
  const providerMark = (m) => (m?.provider === 'Google' ? ICONS.google : m?.provider === 'Alibaba' ? ICONS.qwen : ICONS.spark);

  /* =================== persistence (localStorage + Supabase) =================== */
  const LS_KEY = 'argon-chats-v1';

  function loadLocal() {
    try { state.chats = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { state.chats = []; }
  }
  function saveLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(state.chats));
  }

  const supaCfg = window.ARGON_CONFIG || {};
  const supaHeaders = () => ({
    apikey: supaCfg.supabaseKey,
    Authorization: `Bearer ${supaCfg.supabaseKey}`,
    'Content-Type': 'application/json',
  });

  async function supaSaveChat(chat) {
    if (!supaCfg.supabaseUrl || !supaCfg.supabaseKey) return;
    try {
      const base = `${supaCfg.supabaseUrl}/rest/v1`;
      await fetch(`${base}/gemini_chats?on_conflict=id`, {
        method: 'POST',
        headers: { ...supaHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: chat.id, title: chat.title, model: chat.model,
          created_at: chat.createdAt, updated_at: chat.updatedAt,
        }),
      });
      await fetch(`${base}/gemini_messages?chat_id=eq.${chat.id}`, {
        method: 'DELETE', headers: supaHeaders(),
      });
      if (chat.messages.length) {
        await fetch(`${base}/gemini_messages`, {
          method: 'POST',
          headers: { ...supaHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify(chat.messages.map((m, i) => ({
            id: `${chat.id}-${i}`, chat_id: chat.id, role: m.role,
            content: m.content, model: chat.model, created_at: m.ts,
          }))),
        });
      }
    } catch (e) { console.warn('supabase sync skipped:', e.message); }
  }

  async function supaLoadChats() {
    if (!supaCfg.supabaseUrl || !supaCfg.supabaseKey) return null;
    try {
      const base = `${supaCfg.supabaseUrl}/rest/v1`;
      const r = await fetch(`${base}/gemini_chats?select=*,gemini_messages(*)&order=updated_at.desc`, {
        headers: supaHeaders(),
      });
      if (!r.ok) throw new Error(String(r.status));
      const rows = await r.json();
      return rows.map((c) => ({
        id: c.id, title: c.title, model: c.model,
        createdAt: c.created_at, updatedAt: c.updated_at,
        messages: (c.gemini_messages || [])
          .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
          .map((m) => ({ role: m.role, content: m.content, ts: m.created_at })),
      }));
    } catch (e) {
      console.warn('supabase load skipped:', e.message);
      return null;
    }
  }

  /* =================== markdown (lightweight) =================== */
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mdToHtml(md) {
    const blocks = [];
    let text = md.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const id = blocks.length;
      blocks.push({ lang: (lang || 'text').toLowerCase(), code: code.replace(/\n$/, '') });
      return `\u0000CB${id}\u0000`;
    });

    text = esc(text);
    // headings
    text = text.replace(/^### (.*)$/gm, '<h3>$1</h3>')
               .replace(/^## (.*)$/gm, '<h2>$1</h2>')
               .replace(/^# (.*)$/gm, '<h1>$1</h1>');
    // blockquote
    text = text.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');
    // tables (simple)
    text = text.replace(/((?:^\|.+\|\n)+)/gm, (tbl) => {
      const rows = tbl.trim().split('\n').filter((r) => !/^\|[\s:-]+\|$/.test(r));
      const html = rows.map((r, i) => {
        const cells = r.slice(1, -1).split('|').map((c) => c.trim());
        const tag = i === 0 ? 'th' : 'td';
        return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
      }).join('');
      return `<table>${html}</table>`;
    });
    // inline code / bold / italic
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
               .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
               .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // lists
    text = text.replace(/((?:^[-*] .*\n?)+)/gm, (l) =>
      '<ul>' + l.trim().split('\n').map((li) => `<li>${li.replace(/^[-*] /, '')}</li>`).join('') + '</ul>');
    text = text.replace(/((?:^\d+\. .*\n?)+)/gm, (l) =>
      '<ol>' + l.trim().split('\n').map((li) => `<li>${li.replace(/^\d+\. /, '')}</li>`).join('') + '</ol>');
    // paragraphs
    text = text.split(/\n{2,}/).map((p) =>
      /^(<(h\d|ul|ol|table|blockquote|pre|div))/.test(p.trim()) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`
    ).join('\n');

    // re-insert code blocks
    text = text.replace(/\u0000CB(\d+)\u0000/g, (_, i) => renderCodeBlock(blocks[+i]));
    return text;
  }

  function renderCodeBlock({ lang, code }) {
    const runnable = !['html', 'css', 'text', 'output', 'svg'].includes(lang);
    const previewable = ['html', 'svg', 'css'].includes(lang);
    return `<div class="codeblock" data-lang="${esc(lang)}">
      <div class="cb-head">
        <span class="cb-lang">${esc(lang)}</span>
        <div class="cb-actions">
          <button class="cb-btn" data-act="copy">Copy</button>
          ${runnable ? '<button class="cb-btn primary" data-act="run">▶ Run</button>' : ''}
          ${previewable ? '<button class="cb-btn primary" data-act="preview">▶ Preview</button>' : ''}
          <button class="cb-btn" data-act="save">Save file</button>
        </div>
      </div>
      <pre><code>${esc(code)}</code></pre>
    </div>`;
  }

  /* =================== boot: models =================== */
  async function loadModels() {
    const r = await fetch('/api/models');
    const d = await r.json();
    state.models = d.models;
    state.languages = d.languages || [];
    state.model = state.models[0];

    const saved = localStorage.getItem('argon-model');
    if (saved) state.model = state.models.find((m) => m.id === saved) || state.model;
    renderModelPicker();
    renderModelGrid();

    const sel = $('#quickLang');
    for (const l of state.languages) {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.label;
      sel.appendChild(o);
    }
    const runSel = $('#runLang');
    for (const l of state.languages.filter((x) => x.runnable || x.preview)) {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.label + (x_available(l) ? '' : ' (no toolchain)');
      runSel.appendChild(o);
    }
    runSel.value = 'python';

    // languages pane
    $('#langList').innerHTML = state.languages.map((l) => `
      <li class="lang-item">
        <span class="dot ${l.available ? '' : 'off'}"></span>
        <span class="lname">${esc(l.label)}</span>
        <span class="ltool">${l.available ? esc(l.toolchain || l.id) : 'not installed'}</span>
      </li>`).join('');
  }
  function x_available(l) { return l.available || l.preview; }

  function renderModelPicker() {
    const m = state.model;
    $('#mpName').textContent = m.name;
    $('#mpBadge').textContent = m.badge;
    $('#mpIcon').innerHTML = iconFor(m);
    $('#cmName').textContent = m.name;
    $('#cmTier').textContent = m.tier;
    $('#cmIcon').innerHTML = iconFor(m);

    const menuHtml = state.models.map((x) => `
      <div class="mp-item ${x.id === m.id ? 'selected' : ''}" data-id="${x.id}">
        <div class="row1">
          <span class="m-icon">${iconFor(x)}</span>
          <b>${esc(x.name)}</b>
          <span class="tier">${esc(x.tier)}</span>
        </div>
        <div class="desc">${esc(x.provider || x.family)} · ${fmtNum(x.context)} tok · ${esc((x.description || '').slice(0, 60))}…</div>
      </div>`).join('');
    $('#mpMenu').innerHTML = menuHtml;
    $('#composerMenu').innerHTML = menuHtml;

    $$('#mpMenu .mp-item, #composerMenu .mp-item').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      state.model = state.models.find((x) => x.id === el.dataset.id);
      localStorage.setItem('argon-model', state.model.id);
      renderModelPicker(); renderModelGrid();
      $('#modelPicker').classList.remove('open');
      $('#composerModel').classList.remove('open');
    }));
  }

  function renderModelGrid() {
    $('#modelGrid').innerHTML = state.models.map((x) => `
      <div class="model-card ${x.id === state.model?.id ? 'selected' : ''}">
        <div class="mc-head">
          <span class="m-icon lg">${iconFor(x)}</span>
          <span class="mc-name">${esc(x.name)}</span>
          <span class="mc-tier">${esc(x.tier)}</span>
        </div>
        <div class="mc-provider"><span class="m-icon sm">${providerMark(x)}</span> ${esc(x.provider || x.family)} · ${esc(x.family)} family</div>
        <div class="mc-desc">${esc(x.description)}</div>
        <div class="mc-stats">
          <span class="mc-stat">${fmtNum(x.context)} context</span>
          <span class="mc-stat">${fmtNum(x.maxOutput)} max out</span>
          <span class="mc-stat">~${fmtNum(x.tokensPerSec)} tok/s</span>
          <span class="mc-stat">${esc(x.speed)}</span>
          ${x.strengths.map((s) => `<span class="mc-stat">${esc(s)}</span>`).join('')}
        </div>
        <button class="mc-select" data-id="${x.id}">${x.id === state.model?.id ? '✓ Selected' : 'Use this model'}</button>
      </div>`).join('');
    $$('.mc-select').forEach((b) => b.addEventListener('click', () => {
      state.model = state.models.find((x) => x.id === b.dataset.id);
      localStorage.setItem('argon-model', state.model.id);
      renderModelPicker(); renderModelGrid();
    }));
  }

  /* =================== history sidebar =================== */
  function renderHistory(filter = '') {
    const list = $('#historyList');
    const f = filter.toLowerCase();
    const items = state.chats
      .filter((c) => !f || c.title.toLowerCase().includes(f))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    const groups = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] };
    const now = Date.now();
    for (const c of items) {
      const age = now - new Date(c.updatedAt || c.createdAt).getTime();
      const d = age / 86400000;
      if (d < 1) groups.Today.push(c);
      else if (d < 2) groups.Yesterday.push(c);
      else if (d < 7) groups['Previous 7 days'].push(c);
      else groups.Older.push(c);
    }

    list.innerHTML = Object.entries(groups)
      .filter(([, arr]) => arr.length)
      .map(([label, arr]) => `
        <div class="history-group">${label}</div>
        ${arr.map((c) => `
          <div class="history-item ${c.id === state.currentId ? 'active' : ''}" data-id="${c.id}">
            <span class="title">${esc(c.title)}</span>
            <button class="del" title="Delete">✕</button>
          </div>`).join('')}
      `).join('');

    $$('.history-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('del')) {
          e.stopPropagation();
          deleteChat(el.dataset.id);
          return;
        }
        openChat(el.dataset.id);
      });
    });
  }

  function deleteChat(id) {
    state.chats = state.chats.filter((c) => c.id !== id);
    saveLocal();
    fetch(`/api/history/${id}`, { method: 'DELETE' }).catch(() => {});
    if (supaCfg.supabaseUrl && supaCfg.supabaseKey) {
      fetch(`${supaCfg.supabaseUrl}/rest/v1/gemini_chats?id=eq.${id}`, {
        method: 'DELETE', headers: supaHeaders(),
      }).catch(() => {});
    }
    if (state.currentId === id) newChat();
    renderHistory($('#historySearch').value);
  }

  function openChat(id) {
    const chat = state.chats.find((c) => c.id === id);
    if (!chat) return;
    state.currentId = id;
    // restore the model this chat was using — with its icon
    const chatModel = state.models.find((x) => x.id === chat.model);
    if (chatModel) {
      state.model = chatModel;
      localStorage.setItem('argon-model', chatModel.id);
      renderModelPicker();
    }
    $('#hero').hidden = true;
    $('#thread').hidden = false;
    renderThread(chat);
    renderHistory($('#historySearch').value);
    updateCtxMeter();
  }

  function newChat() {
    state.currentId = null;
    state.tokens = 0;
    $('#thread').innerHTML = '';
    $('#thread').hidden = true;
    $('#hero').hidden = false;
    renderHistory($('#historySearch').value);
    updateCtxMeter();
    $('#input').focus();
  }

  function ensureChat() {
    if (state.currentId) return state.chats.find((c) => c.id === state.currentId);
    const chat = {
      id: uid(), title: 'New chat', model: state.model.id,
      messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    state.chats.unshift(chat);
    state.currentId = chat.id;
    $('#hero').hidden = true;
    $('#thread').hidden = false;
    return chat;
  }

  /* =================== thread rendering =================== */
  function renderThread(chat) {
    const t = $('#thread');
    t.innerHTML = '';
    for (const m of chat.messages) {
      appendMsg(m.role, m.content, { final: true, modelId: m.modelId || chat.model });
    }
    t.scrollTop = t.scrollHeight;
  }

  function appendMsg(role, content, { final = false, model, modelId } = {}) {
    const t = $('#thread');
    const div = document.createElement('div');
    div.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
    if (role === 'user') {
      div.innerHTML = `<div class="bubble">${esc(content)}</div>`;
    } else {
      const m = model || state.models.find((x) => x.id === modelId) || state.model;
      div.innerHTML = `
        <div class="head">
          <div class="avatar model-av">${iconFor(m)}</div>
          <span class="who">${esc(m.name)}</span>
          <span class="tier-chip">${esc(m.tier)} · ${fmtNum(m.context)} tok ctx</span>
        </div>
        <div class="body">${final ? mdToHtml(content) : '<p><span class="cursor"></span></p>'}</div>`;
    }
    t.appendChild(div);
    t.scrollTop = t.scrollHeight;
    return div;
  }

  function updateStreamBody(el, md) {
    const body = el.querySelector('.body');
    body.innerHTML = mdToHtml(md) + '<p><span class="cursor"></span></p>';
    $('#thread').scrollTop = $('#thread').scrollHeight;
  }

  function finalizeStreamBody(el, md) {
    const body = el.querySelector('.body');
    body.innerHTML = mdToHtml(md);
  }

  function updateCtxMeter() {
    const chars = state.chats
      .filter((c) => c.id === state.currentId)
      .flatMap((c) => c.messages)
      .reduce((n, m) => n + (m.content?.length || 0), 0);
    state.tokens = Math.ceil(chars / 4);
    $('#ctxMeter').textContent = `${fmtNum(state.tokens)} / 1,000,000 tokens`;
  }

  /* =================== chat send =================== */
  async function send(promptText) {
    const input = $('#input');
    const text = (promptText ?? input.value).trim();
    if (!text || state.busy) return;

    const langPref = $('#quickLang').value;
    const finalText = langPref && !state.languages.some((l) => l.id === langPref && text.toLowerCase().includes(l.label.toLowerCase()))
      ? `${text}\n\n(please write it in ${state.languages.find((l) => l.id === langPref)?.label || langPref})`
      : text;

    input.value = '';
    input.style.height = 'auto';
    const chat = ensureChat();
    if (chat.messages.length === 0) {
      chat.title = text.length > 42 ? text.slice(0, 42) + '…' : text;
    }
    chat.messages.push({ role: 'user', content: text, ts: new Date().toISOString() });
    chat.updatedAt = new Date().toISOString();

    appendMsg('user', text);
    const botEl = appendMsg('bot', '');
    state.busy = true;
    $('#sendBtn').disabled = true;

    let acc = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: state.model.id, messages: chat.messages }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.t === 'chunk') {
            acc += evt.w;
            updateStreamBody(botEl, acc);
          } else if (evt.t === 'status') {
            updateStreamBody(botEl, acc + `\n\n> ${evt.text}`);
          } else if (evt.t === 'artifact') {
            acc += `\n\n> 💾 Saved as \`${evt.name}\` — open the **Preview** panel.`;
            updateStreamBody(botEl, acc);
            refreshFiles();
            if (evt.preview) showPreview(`/artifacts/${evt.name}`, evt.name);
          } else if (evt.t === 'done') {
            chat.messages.push({ role: 'bot', content: acc, ts: new Date().toISOString(), modelId: evt.model || state.model.id });
            chat.model = evt.model || chat.model || state.model.id;
            saveLocal();
            supaSaveChat(chat);
            fetch('/api/history', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat }),
            }).catch(() => {});
            renderHistory($('#historySearch').value);
            updateCtxMeter();
          }
        }
      }
    } catch (e) {
      acc += `\n\n> ⚠ stream error: ${e.message}`;
    }
    finalizeStreamBody(botEl, acc || '(no response)');
    state.busy = false;
    $('#sendBtn').disabled = false;
  }

  /* =================== dock: preview / files / run =================== */
  function openDock(tab = 'preview') {
    document.body.classList.add('dock-open');
    $$('.dock-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.dock-pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${tab}`));
    if (tab === 'files') refreshFiles();
    if (tab === 'preview' && !$('#previewFrame').src) {
      showPreview('/three-preview.html', 'three.js — Argon Core');
    }
  }

  function showPreview(url, title) {
    $('#previewEmpty').style.display = 'none';
    const frame = $('#previewFrame');
    frame.classList.add('visible');
    frame.src = url;
    $('#previewTitle').textContent = title || url;
    const open = $('#previewOpen');
    open.href = url; open.hidden = false;
    openDock('preview');
  }

  async function refreshFiles() {
    try {
      const r = await fetch('/api/files');
      const files = await r.json();
      $('#fileList').innerHTML = files.length ? files.map((f) => `
        <li class="file-item" data-name="${esc(f.name)}">
          <span class="fname">${esc(f.name)}</span>
          <span class="fsize">${(f.bytes / 1024).toFixed(1)} KB</span>
          <button class="mini-btn" data-act="view">View</button>
          <button class="mini-btn" data-act="del">✕</button>
        </li>`).join('') : '<li class="lang-item"><span class="lname" style="color:var(--dim)">No artifacts yet — ask for an image or 3D scene.</span></li>';

      $$('#fileList .file-item').forEach((el) => {
        el.addEventListener('click', async (e) => {
          const act = e.target.dataset?.act;
          const name = el.dataset.name;
          if (act === 'del') {
            await fetch(`/api/files/${name}`, { method: 'DELETE' });
            refreshFiles();
          } else if (act === 'view' || !act) {
            if (/\.(html?|svg)$/i.test(name)) showPreview(`/artifacts/${name}`, name);
            else {
              const r = await fetch(`/api/files/${name}`);
              const d = await r.json();
              $('#previewEmpty').style.display = 'none';
              const frame = $('#previewFrame');
              frame.classList.remove('visible');
              frame.removeAttribute('src');
              $('#previewTitle').textContent = name;
              const pre = document.createElement('pre');
              pre.className = 'run-output';
              pre.textContent = d.content || '(empty)';
              $('#pane-preview').appendChild(pre);
              setTimeout(() => pre.remove(), 60000);
              openDock('preview');
            }
          }
        });
      });
    } catch { /* offline */ }
  }

  async function runSandbox() {
    const lang = $('#runLang').value;
    const code = $('#runCode').value;
    if (!code.trim()) return;
    const out = $('#runOutput');
    out.textContent = '⏳ running in Linux sandbox…';
    out.classList.remove('err');
    try {
      const r = await fetch('/api/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, code }),
      });
      const d = await r.json();
      const lines = (d.stdout || d.stderr || '(no output)').split('\n');
      const shown = lines.slice(0, 20).join('\n');
      out.textContent =
        `$ ${lang} · exit ${d.exitCode} · ${d.ms} ms` +
        (lines.length > 20 ? ` · showing 20/${lines.length} lines` : '') +
        '\n' + shown + (lines.length > 20 ? '\n… (expand console for more)' : '') +
        (lines.length > 20 ? `\n${lines.slice(20).join('\n')}` : '');
      if (!d.ok) out.classList.add('err');
      $('#runMeta').textContent = `${lang} · exit ${d.exitCode} · ${d.ms} ms`;
    } catch (e) {
      out.textContent = '⚠ ' + e.message;
      out.classList.add('err');
    }
  }

  /* =================== code block actions =================== */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.cb-btn');
    if (!btn) return;
    const block = btn.closest('.codeblock');
    const lang = block.dataset.lang;
    const code = block.querySelector('code').textContent;
    const act = btn.dataset.act;

    if (act === 'copy') {
      await navigator.clipboard.writeText(code).catch(() => {});
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = 'Copy'), 1200);
    } else if (act === 'run') {
      openDock('run');
      $('#runLang').value = ['javascript', 'python', 'bash', 'c', 'cpp', 'rust', 'go', 'java', 'typescript', 'perl'].includes(lang) ? lang : 'python';
      $('#runCode').value = code;
      runSandbox();
    } else if (act === 'preview') {
      const r = await fetch('/api/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `snippet-${Date.now()}.html`, content: code }),
      });
      const d = await r.json();
      showPreview(`/artifacts/${d.name}`, 'code preview');
      refreshFiles();
    } else if (act === 'save') {
      const ext = { javascript: 'mjs', python: 'py', rust: 'rs', html: 'html', css: 'css' }[lang] || 'txt';
      const r = await fetch('/api/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `snippet-${Date.now()}.${ext}`, content: code }),
      });
      const d = await r.json();
      btn.textContent = `Saved ${d.name}`;
      refreshFiles();
      setTimeout(() => (btn.textContent = 'Save file'), 1600);
    }
  });

  /* =================== wire up UI =================== */
  function init() {
    loadLocal();
    loadModels().catch(console.warn);
    renderHistory();

    // history server merge (server copy fills gaps on new devices)
    fetch('/api/history').then((r) => r.json()).then((serverChats) => {
      if (!Array.isArray(serverChats) || !serverChats.length) return;
      const known = new Set(state.chats.map((c) => c.id));
      let changed = false;
      for (const c of serverChats) {
        if (!known.has(c.id) && c.messages?.length) { state.chats.push(c); changed = true; }
      }
      if (changed) { saveLocal(); renderHistory(); }
    }).catch(() => {});
    supaLoadChats().then((cloud) => {
      if (!cloud?.length) return;
      const known = new Set(state.chats.map((c) => c.id));
      let changed = false;
      for (const c of cloud) {
        if (!known.has(c.id) && c.messages?.length) { state.chats.push(c); changed = true; }
      }
      if (changed) { saveLocal(); renderHistory(); }
    });

    // composer
    const input = $('#input');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $('#sendBtn').addEventListener('click', () => send());

    // hero cards
    $$('.card').forEach((c) => c.addEventListener('click', () => send(c.dataset.prompt)));

    // sidebar
    $('#newChatBtn').addEventListener('click', newChat);
    $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('collapsed'));
    $('#historySearch').addEventListener('input', (e) => renderHistory(e.target.value));

    // model pickers (topbar + composer)
    $('#modelPicker').addEventListener('click', () => $('#modelPicker').classList.toggle('open'));
    $('#composerModel').addEventListener('click', () => $('#composerModel').classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#modelPicker')) $('#modelPicker').classList.remove('open');
      if (!e.target.closest('#composerModel')) $('#composerModel').classList.remove('open');
    });

    // modals
    $('#modelsBtn').addEventListener('click', () => { $('#modelsModal').hidden = false; renderModelGrid(); });
    $('#modelsClose').addEventListener('click', () => ($('#modelsModal').hidden = true));
    $('#modelsModal').addEventListener('click', (e) => {
      if (e.target === $('#modelsModal')) $('#modelsModal').hidden = true;
    });

    // dock
    $('#sandboxBtn').addEventListener('click', () => openDock('run'));
    $('#previewBtn').addEventListener('click', () => openDock('preview'));
    $('#dockClose').addEventListener('click', () => document.body.classList.remove('dock-open'));
    $$('.dock-tab').forEach((t) => t.addEventListener('click', () => openDock(t.dataset.tab)));
    $('#runBtn').addEventListener('click', runSandbox);
    $('#refreshFiles').addEventListener('click', refreshFiles);
    $('#runLang').addEventListener('change', () => {
      const lang = $('#runLang').value;
      if (!$('#runCode').value.trim()) {
        $('#runCode').placeholder = `// write ${lang} here, then press Run`;
      }
    });

    // repo meta
    fetch('/api/github').then((r) => r.json()).then((d) => {
      $('#repoMeta').textContent = d.offline
        ? 'GitHub · offline'
        : `★ ${d.stars} · ${d.language || 'JS'} · ${d.defaultBranch}`;
    }).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
