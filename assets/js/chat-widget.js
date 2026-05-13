(function () {
  const PROJECT_NAMES = {
    bdj: 'Bosques de Jalapa',
    bdp: 'Bosques de Pinula',
    bse: 'Bosques de Santa Elena',
    clc: 'Condado La Ceiba',
    cse: 'Condado Santa Elena',
    hlq: 'Hacienda La Querencia',
    hsl: 'Hacienda El Sol',
    rdb: 'Reserva del Bosque',
  };

  const EDGE_URL = 'https://iipgrojliqeyycvgnkrc.supabase.co/functions/v1/ai-agent';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpcGdyb2psaXFleXljdmdua3JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzA1NzYsImV4cCI6MjA5MTM0NjU3Nn0.Y6FQ-1qWd7HPMvTnK4alpKxM-YLJ5CsKmkorAZKMJrg';

  const projectKey  = window.POWERBI_PROJECT_KEY || '';
  const projectName = PROJECT_NAMES[projectKey] || 'todos los proyectos';
  const isGlobal    = !projectKey;

  // ── CSS ──────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
  #chat-fab {
    position: fixed; bottom: 24px; right: 24px; z-index: 1000;
    width: 52px; height: 52px; border-radius: 50%;
    background: linear-gradient(135deg, #C9A84C, #a8832e);
    border: none; cursor: pointer;
    box-shadow: 0 4px 20px rgba(201,168,76,0.45);
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s, box-shadow .2s; color: #fff;
  }
  #chat-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(201,168,76,0.6); }
  #chat-fab svg { width: 24px; height: 24px; fill: currentColor; }

  #chat-panel {
    position: fixed; bottom: 86px; right: 24px; z-index: 1000;
    width: 360px; height: 500px;
    background: #0f172a; border: 1px solid rgba(201,168,76,0.28);
    border-radius: 16px; display: flex; flex-direction: column;
    box-shadow: 0 16px 56px rgba(0,0,0,0.55);
    overflow: hidden;
    transform: scale(0.92) translateY(14px); opacity: 0; pointer-events: none;
    transition: transform .22s ease, opacity .22s ease;
  }
  #chat-panel.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }

  .cp-header {
    background: linear-gradient(90deg, #0f172a, #1e293b);
    border-bottom: 1px solid rgba(201,168,76,0.2);
    padding: 13px 14px; display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .cp-icon {
    width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
    background: rgba(201,168,76,0.13); border: 1px solid rgba(201,168,76,0.28);
    display: flex; align-items: center; justify-content: center; font-size: 15px;
  }
  .cp-title { font-size: 0.82rem; font-weight: 700; color: #fff; }
  .cp-sub { font-size: 0.6rem; color: rgba(201,168,76,0.65); margin-top: 1px; }
  .cp-close {
    margin-left: auto; background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.35); padding: 4px; border-radius: 6px;
    display: flex; transition: color .15s, background .15s;
  }
  .cp-close:hover { color: #fff; background: rgba(255,255,255,0.07); }
  .cp-close svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; }

  .cp-messages {
    flex: 1; overflow-y: auto; padding: 14px 14px 6px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .cp-messages::-webkit-scrollbar { width: 4px; }
  .cp-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

  .cp-msg { display: flex; flex-direction: column; max-width: 86%; }
  .cp-msg.user { align-self: flex-end; align-items: flex-end; }
  .cp-msg.assistant { align-self: flex-start; align-items: flex-start; }

  .cp-bubble {
    padding: 9px 13px; border-radius: 12px;
    font-size: 0.77rem; line-height: 1.55; color: #fff;
    white-space: pre-wrap; word-break: break-word;
  }
  .cp-msg.user .cp-bubble {
    background: linear-gradient(135deg, #C9A84C, #a8832e);
    border-bottom-right-radius: 4px;
  }
  .cp-msg.assistant .cp-bubble {
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
    border-bottom-left-radius: 4px;
  }

  .cp-typing { display: flex; gap: 4px; padding: 9px 13px; }
  .cp-typing span {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(201,168,76,0.55); animation: cpBounce .9s infinite;
  }
  .cp-typing span:nth-child(2) { animation-delay: .18s; }
  .cp-typing span:nth-child(3) { animation-delay: .36s; }
  @keyframes cpBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }

  .cp-footer {
    border-top: 1px solid rgba(255,255,255,0.07);
    padding: 10px 12px; display: flex; gap: 8px; flex-shrink: 0;
    background: rgba(0,0,0,0.18);
  }
  #cp-input {
    flex: 1; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.13);
    border-radius: 10px; padding: 8px 12px; color: #fff; font-size: 0.77rem;
    font-family: inherit; outline: none; resize: none; line-height: 1.45;
    transition: border-color .15s;
  }
  #cp-input::placeholder { color: rgba(255,255,255,0.28); }
  #cp-input:focus { border-color: rgba(201,168,76,0.45); }
  #cp-send {
    width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #C9A84C, #a8832e); border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    align-self: flex-end; transition: opacity .15s;
  }
  #cp-send:hover { opacity: 0.85; }
  #cp-send:disabled { opacity: 0.38; cursor: not-allowed; }
  #cp-send svg { width: 15px; height: 15px; fill: #fff; }
  `;
  document.head.appendChild(style);

  // ── HTML ─────────────────────────────────────────────────────────
  const titleText = isGlobal ? 'Asistente IA' : `Asistente ${projectKey.toUpperCase()}`;
  const greeting  = isGlobal
    ? 'Hola 👋 Soy tu asistente financiero. Puedo responderte sobre presupuesto, ejecución y avance de cualquier proyecto. ¿En qué te ayudo?'
    : `Hola 👋 Soy tu asistente para ${projectName}. Puedo responderte sobre presupuesto, ejecución, áreas y etapas del proyecto. ¿En qué te ayudo?`;
  const placeholder = isGlobal
    ? 'Ej: ¿Cuál es el presupuesto de CLC?'
    : 'Ej: ¿Cuánto hemos ejecutado en Urbanización?';

  document.body.insertAdjacentHTML('beforeend', `
  <button id="chat-fab" title="Asistente IA">
    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 10H6v-2h12v2zm0-3H6V7h12v2z"/></svg>
  </button>
  <div id="chat-panel">
    <div class="cp-header">
      <div class="cp-icon">🤖</div>
      <div>
        <div class="cp-title">${titleText}</div>
        <div class="cp-sub">Datos en tiempo real desde Power BI</div>
      </div>
      <button class="cp-close" id="cp-close">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="cp-messages" id="cp-messages">
      <div class="cp-msg assistant">
        <div class="cp-bubble">${greeting}</div>
      </div>
    </div>
    <div class="cp-footer">
      <textarea id="cp-input" rows="2" placeholder="${placeholder}"></textarea>
      <button id="cp-send">
        <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
      </button>
    </div>
  </div>
  `);

  // ── LOGIC ────────────────────────────────────────────────────────
  const fab      = document.getElementById('chat-fab');
  const panel    = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('cp-close');
  const messages = document.getElementById('cp-messages');
  const input    = document.getElementById('cp-input');
  const sendBtn  = document.getElementById('cp-send');
  let history    = [];

  const SESSION_KEY = 'cp_chat_session';

  function isLoggedIn() {
    try {
      const s = JSON.parse(localStorage.getItem('sb-iipgrojliqeyycvgnkrc-auth-token') || 'null');
      return !!(s?.access_token);
    } catch { return false; }
  }

  function saveSession() {
    if (!isLoggedIn()) return;
    const msgs = Array.from(messages.querySelectorAll('.cp-msg')).map(el => ({
      role: el.classList.contains('user') ? 'user' : 'assistant',
      text: el.querySelector('.cp-bubble')?.textContent ?? ''
    }));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ history, msgs }));
  }

  function restoreSession() {
    try {
      if (!isLoggedIn()) return;
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      history = data.history || [];
      if (data.msgs && data.msgs.length > 1) {
        messages.innerHTML = '';
        data.msgs.forEach(m => addMsg(m.role, m.text));
      }
    } catch { /* ignorar */ }
  }

  fab.addEventListener('click', () => panel.classList.add('open'));
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  function addMsg(role, text) {
    const wrap   = document.createElement('div');
    wrap.className = `cp-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'cp-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function addTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'cp-msg assistant';
    wrap.id = 'cp-typing';
    wrap.innerHTML = '<div class="cp-bubble cp-typing"><span></span><span></span><span></span></div>';
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return wrap;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;

    input.value = '';
    sendBtn.disabled = true;
    addMsg('user', text);
    const typing = addTyping();

    try {
      const session = JSON.parse(localStorage.getItem('sb-iipgrojliqeyycvgnkrc-auth-token') || 'null');
      const token   = session?.access_token ?? '';

      const res  = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({ message: text, project_key: projectKey || null, history }),
      });

      const json  = await res.json();
      typing.remove();
      const reply = json.reply || json.error || 'Sin respuesta del servidor.';
      addMsg('assistant', reply);

      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: reply });
      if (history.length > 12) history = history.slice(-12);
      saveSession();

    } catch {
      typing.remove();
      addMsg('assistant', 'Error al conectar. Verifica tu conexión e intenta de nuevo.');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // Restaurar conversación de la sesión activa
  restoreSession();
})();
