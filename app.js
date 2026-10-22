/* Jarvis web UI: voice in (SpeechRecognition), voice out (speechSynthesis), chat log, settings. */
(function () {
  "use strict";
  const Core = window.JarvisCore;
  const Offline = window.JarvisOffline || { respond: async () => null, isComplex: () => true };
  const NoMemory = { create: () => ({ enabled: false, list: () => [], get: () => "", add: () => ({ ok: false, reason: "off" }), summary: () => "", clear() {}, removeAt() {}, find: () => null, forget: () => 0 }) };
  const MemoryLib = window.JarvisMemory || NoMemory;
  const WebLib = window.JarvisWeb || null;
  const $ = (id) => document.getElementById(id);

  // ---------- safe storage (private mode / blocked storage must not break the app)
  const mem = {};
  function store(kind) {
    return {
      getItem(k) { try { return window[kind].getItem(k); } catch (e) { return mem[kind + k] === undefined ? null : mem[kind + k]; } },
      setItem(k, v) { try { window[kind].setItem(k, v); } catch (e) { mem[kind + k] = v; } },
      removeItem(k) { try { window[kind].removeItem(k); } catch (e) { delete mem[kind + k]; } },
    };
  }
  const local = store("localStorage");
  const session = store("sessionStorage");
  const CFG = window.JARVIS_CONFIG || {};
  const PROXY = (CFG.proxyUrl || "").trim();
  const KEY = "jarvis.apiKey";
  const CODE = "jarvis.code";
  const SETTINGS = "jarvis.settings";

  const LANGS = [
    ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["es-CL", "Español (Chile)"],
    ["es-ES", "Español (España)"], ["es-MX", "Español (México)"], ["es-AR", "Español (Argentina)"],
    ["pt-BR", "Português (Brasil)"], ["fr-FR", "Français"], ["de-DE", "Deutsch"], ["it-IT", "Italiano"],
  ];

  function defaultLang() {
    const l = (navigator.language || "en-US");
    if (LANGS.some(([c]) => c === l)) return l;
    const same = LANGS.find(([c]) => c.slice(0, 2) === l.slice(0, 2));
    return same ? same[0] : "en-US";
  }

  let settings = Object.assign(
    { model: Core.DEFAULT_MODEL, userName: "", address: "sir", geminiChat: false, memory: true, localAi: false, localModel: "", lang: defaultLang(), voiceURI: "", rate: 1, speak: true, convo: false },
    (() => { try { return JSON.parse(local.getItem(SETTINGS) || "{}"); } catch (e) { return {}; } })()
  );
  settings.localAi = true; // the local AI is always on: not configurable
  // Migrate users whose saved settings still point at the retired model.
  if (settings.model === "gemini-2.5-flash") settings.model = Core.DEFAULT_MODEL;

  function getKey() { return session.getItem(KEY) || local.getItem(KEY) || ""; }
  function getCode() { return session.getItem(CODE) || local.getItem(CODE) || ""; }
  function announceProvider(name, why) {
    if (name === "Offline mode") degraded = true; addMsg("system", "My apologies, I have switched to " + name + " (" + String(why).slice(0, 140) + ")"); }
  function ready() { return true; } // fully offline: no API key needed
  try { sessionStorage.removeItem("jarvis.backupKey"); localStorage.removeItem("jarvis.backupKey"); } catch (e) { /* ignore */ }
  function saveSettings() { local.setItem(SETTINGS, JSON.stringify(settings)); }

  const jarvis = new Core.Jarvis({
    offlineOnly: true, apiKey: "", proxyUrl: "", accessCode: "", onProvider: announceProvider, memoryText: () => (memory.enabled ? memory.summary() : ""),
    local: (t, tools) => Offline.respond(t, tools, { strict: true, memory, address: settings.address, geminiChat: settings.geminiChat }), isComplex: Offline.isComplex, localLLM: (t) => smartChat(t),
    offline: (t, tools) => Offline.respond(t, tools, { memory, address: settings.address, geminiChat: settings.geminiChat, llm: settings.localAi && window.JarvisLocalAI ? localReply : null }), model: settings.model, userName: settings.userName, address: settings.address,
    fetch: (...a) => window.fetch(...a), storage: local, navigator, screen,
    onToolCall: (name) => addMsg("tool", `Using ${name.replace(/_/g, " ")}…`),
  });

  window.addEventListener("jarvis-say", (e) => { addMsg("jarvis", e.detail); speak(e.detail); }); // timers
  window.__jarvis = jarvis; // used by integrations.js
  if (WebLib) { const web = WebLib.create((...a) => window.fetch(...a)); jarvis.tools.extend([WebLib.declaration], { web_lookup: (args) => web.lookup(args) }); }
  const memory = MemoryLib.create(local);
  memory.enabled = settings.memory !== false;
  jarvis.tools.extend([{ name: "remember_fact", description: "Save a lasting fact or preference the user wants remembered about themselves (never sensitive data).",
    parameters: { type: "OBJECT", properties: { fact: { type: "STRING", description: "Short statement, e.g. 'Prefers short answers'." } }, required: ["fact"] } }], {
    remember_fact: ({ fact }) => { const r = memory.add(fact); return r.ok ? { saved: r.fact.text } : { error: r.reason === "sensitive" ? "Refused: sensitive details are never stored." : "Could not save (" + r.reason + ")." }; } });

  // keep the conversation between visits (text turns only, this browser only)
  const CHAT = "jarvis.chat";
  function saveChat() {
    if (!memory.enabled) { local.removeItem(CHAT); return; }
    const turns = jarvis.history.filter((c) => (c.parts || []).length && c.parts.every((p) => typeof p.text === "string")).slice(-20)
      .map((c) => ({ role: c.role, text: c.parts.map((p) => p.text).join("") }));
    local.setItem(CHAT, JSON.stringify(turns));
  }
  function restoreChat() {
    if (!memory.enabled) return false;
    let t; try { t = JSON.parse(local.getItem(CHAT) || "[]"); } catch (e) { t = []; }
    while (t.length && t[0].role !== "user") t.shift();
    if (!t.length) return false;
    jarvis.history = t.map((x) => ({ role: x.role, parts: [{ text: x.text }] }));
    t.slice(-8).forEach((x) => addMsg(x.role === "user" ? "user" : "jarvis", x.text));
    return true;
  }

  // ---------- UI helpers
  const log = $("log"), statusEl = $("status"), orb = $("orb"), input = $("input"), sendBtn = $("send");
  let state = "idle";

  const STATUS = { idle: "At your service. Tap the orb and speak", listening: "I am listening…", thinking: "One moment, if you please…", speaking: "Speaking… (tap to interrupt)", error: "I do beg your pardon, something went awry" };
  function setState(s, text) {
    state = s;
    orb.dataset.state = s;
    statusEl.textContent = text || STATUS[s];
  }
  let degraded = false;
  function flashError(text, ms) {
    setState("error", text);
    setTimeout(() => { if (state === "error") setState("idle"); }, ms || 4000);
  }
  function addMsg(kind, text) {
    const el = document.createElement("div");
    el.className = "msg " + kind;
    el.textContent = text; // textContent: model/tool output can never inject HTML
    log.appendChild(el); while (log.children.length > 120) log.removeChild(log.firstChild);
    while (log.children.length > 80) log.removeChild(log.firstChild); // keep the page light on long chats
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // ---------- speech output
  const synth = window.speechSynthesis;
  let voices = [];
  function loadVoices() { voices = synth ? synth.getVoices() : []; fillVoiceSelect(); }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

  function voicesForLang(lang) {
    const base = lang.slice(0, 2).toLowerCase();
    const exact = voices.filter((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
    const sameLang = voices.filter((v) => v.lang.slice(0, 2).toLowerCase() === base);
    return exact.length ? exact.concat(sameLang.filter((v) => !exact.includes(v))) : sameLang;
  }
  // Browsers don't expose a voice's gender, so "male" is detected from common voice names.
  const MALE = /\b(david|mark|james|george|daniel|alex|fred|ryan|guy|davis|tony|jason|brandon|christopher|eric|roger|steffan|male|jorge|diego|pablo|raul|alvaro|enrique|carlos|miguel|juan|andres|rodrigo|lorenzo|antonio|thomas|oliver|arthur|aaron|ralph|rishi|gordon|bruce|jorg|stefan|hans|luca|cosimo|felipe|nicolas)\b/i;
  const FEMALE = /\b(female|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|helena|laura|paulina|monica|sabina|elena|lucia|catalina|paloma|jenny|aria|sara|ana|helen|sonia|libby|natasha|clara|salome|camila|valentina|isabella|google .* female)\b/i;
  const isMale = (v) => !!v && MALE.test(v.name) && !FEMALE.test(v.name);
  function pickVoice() {
    const byUri = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (byUri && byUri.lang.slice(0, 2).toLowerCase() === settings.lang.slice(0, 2).toLowerCase()) return byUri;
    const list = voicesForLang(settings.lang);
    const gb = settings.lang.slice(0, 2) === "en" ? voices.filter((v) => /^en[-_]GB/i.test(v.lang)) : []; // a butler sounds British
    return gb.find(isMale) || list.find(isMale) || gb[0] || list[0] || null;
  }
  let speakToken = 0;
  function stopSpeaking() { speakToken++; if (synth) synth.cancel(); }

  function speak(text) {
    return new Promise((resolve) => {
      if (!synth || !settings.speak) return resolve();
      const chunks = Core.chunkForSpeech(Core.speakableText(text));
      if (!chunks.length) return resolve();
      const token = ++speakToken;
      synth.cancel();
      const voice = pickVoice();
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = voice ? voice.lang : settings.lang; u.rate = settings.rate;
        u.pitch = settings.voiceURI ? 1 : isMale(voice) ? 0.9 : 0.75; // automatic mode: deeper voice
        if (voice) u.voice = voice;
        const done = () => { if (i === chunks.length - 1 || token !== speakToken) resolve(); };
        u.onend = done; u.onerror = done;
        if (token === speakToken) synth.speak(u);
      });
    });
  }

  // Streaming speech: starts talking at the first complete sentence while the answer is still being written.
  function makeSpeaker() {
    const token = ++speakToken, voice = pickVoice();
    let buf = "", pending = 0, ended = false, resolveDone = null;
    const check = () => { if (ended && pending === 0 && resolveDone) resolveDone(); };
    function say(seg) {
      if (token !== speakToken) return;
      const clean = Core.speakableText(seg);
      if (!clean) return;
      for (const c of Core.chunkForSpeech(clean)) {
        const u = new SpeechSynthesisUtterance(c);
        u.lang = voice ? voice.lang : settings.lang; u.rate = settings.rate; if (voice) u.voice = voice;
        u.pitch = settings.voiceURI ? 1 : isMale(voice) ? 0.9 : 0.75;
        pending++;
        const d = () => { pending--; check(); };
        u.onend = d; u.onerror = d;
        synth.speak(u);
      }
    }
    function flush(final) {
      const re = /[.!?…]+["')\]]*\s+|\n+/g; let last = 0, m;
      while ((m = re.exec(buf))) { const end = m.index + m[0].length; if (buf.slice(last, end).trim().length >= 25) { say(buf.slice(last, end)); last = end; } }
      buf = buf.slice(last);
      if (final && buf.trim()) { say(buf); buf = ""; }
    }
    return {
      push(t) { buf += t; flush(false); },
      done() { flush(true); ended = true; return new Promise((r) => { resolveDone = r; check(); }); },
      cancel() { ended = true; buf = ""; if (resolveDone) resolveDone(); },
    };
  }

  // ---------- speech input
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, finalText = "", heardError = "", silentRetries = 0;

  function stopListening() { if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } rec = null; } }

  function startListening() {
    if (!SR) {
      addMsg("system", "Voice input isn't supported in this browser. Use Chrome, Edge or Safari, or type instead.");
      return;
    }
    if (busy) return;
    stopSpeaking(); stopListening();
    finalText = ""; heardError = "";
    rec = new SR();
    rec.lang = settings.lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onstart = () => setState("listening");
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    rec.onerror = (e) => { heardError = e.error || "error"; };
    rec.onend = () => {
      rec = null;
      const text = finalText.trim();
      input.value = "";
      if (text) { silentRetries = 0; handleUser(text); return; }
      if (heardError === "not-allowed" || heardError === "service-not-allowed") {
        addMsg("error", "Microphone access is blocked. Allow the microphone for this site in your browser, then tap the orb again.");
        setConvo(false); flashError("I am afraid the microphone is blocked"); return;
      }
      if (heardError === "aborted") { setState("idle"); return; }
      if (settings.convo && silentRetries < 2 && state === "listening") { silentRetries++; startListening(); return; }
      silentRetries = 0;
      if (settings.convo) setConvo(false);
      setState("idle", heardError === "no-speech" || !heardError ? "Didn't catch that. Tap the orb to try again." : "Voice error: " + heardError);
    };
    try { rec.start(); } catch (e) { setState("idle"); }
  }

  // ---------- main flow
  let busy = false, warnedOffline = false;
  async function handleUser(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    if (!ready() && !warnedOffline) {
      warnedOffline = true;
      addMsg("system", "No API key as yet, so I shall answer in offline mode. Add a key in Settings for my full faculties.");
    }
    busy = true; sendBtn.disabled = true;
    stopListening(); stopSpeaking();
    addMsg("user", text);
    setState("thinking");
    let ok = false, failed = false;
    try {
      let streamEl = null, streamText = "", sp = null;
      jarvis.update({
        onToken: (t) => {
          if (!streamEl) { streamEl = addMsg("jarvis", ""); setState("speaking"); if (settings.speak && synth) sp = makeSpeaker(); }
          streamText += t; streamEl.textContent = streamText; log.scrollTop = log.scrollHeight;
          if (sp) sp.push(t);
        },
        onReset: () => { if (streamEl) { streamEl.remove(); streamEl = null; } streamText = ""; if (sp) { sp.cancel(); sp = null; } stopSpeaking(); },
      });
      const reply = await jarvis.ask(text);
      ok = true;
      if (streamEl) { streamEl.textContent = reply; streamEl.dataset.src = jarvis.lastRoute || ""; saveChat(); if (sp) await sp.done(); }
      else {
        addMsg("jarvis", reply).dataset.src = jarvis.lastRoute || ""; saveChat();
        setState(degraded ? "error" : "speaking", degraded ? "My larger intellect is unavailable; I shall manage as best I can" : undefined);
        degraded = false;
        await speak(reply);
      }
    } catch (e) {
      let msg = e.message || String(e);
      if (/\b401\b/.test(msg) && PROXY) { msg += " (Open Settings and enter your access code.)"; openSettings(); }
      if (/\b404\b/.test(msg)) msg += " (Tip: open Settings and change the model name.)";
      if (/\b(400|403)\b/.test(msg) && /key/i.test(msg)) msg += " (Check your API key in Settings.)";
      if (e instanceof TypeError) msg = "Network error: couldn't reach Google. Check your connection. (" + msg + ")";
      addMsg("error", msg); failed = true;
    } finally {
      jarvis.update({ onToken: null, onReset: null });
      busy = false; sendBtn.disabled = false;
      if (failed) flashError(); else setState("idle");
      if (ok && settings.convo) startListening(); else if (!ok && settings.convo) setConvo(false);
    }
  }

  orb.addEventListener("click", () => {
    if (state === "listening") { stopListening(); setState("idle"); }
    else if (state === "speaking") { stopSpeaking(); setState("idle"); }
    else if (state === "idle" || state === "error") startListening();
  });
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value; input.value = "";
    handleUser(text);
  });

  function setConvo(on) { settings.convo = on; $("convo").checked = on; saveSettings(); }
  $("convo").checked = settings.convo;
  $("convo").addEventListener("change", (e) => {
    setConvo(e.target.checked);
    if (e.target.checked && state === "idle") startListening();
    if (!e.target.checked && state === "listening") { stopListening(); setState("idle"); }
  });

  // ---------- settings dialog
  const dlg = $("settings");
  function fillLangSelect() {
    const sel = $("lang");
    sel.innerHTML = "";
    const list = LANGS.some(([c]) => c === settings.lang) ? LANGS : LANGS.concat([[settings.lang, settings.lang]]);
    list.forEach(([code, label]) => sel.add(new Option(label, code)));
    sel.value = settings.lang;
  }
  function fillVoiceSelect() {
    const sel = $("voice");
    if (!sel) return;
    sel.innerHTML = "";
    sel.add(new Option("Automatic (male voice)", ""));
    voicesForLang($("lang").value || settings.lang).forEach((v) => sel.add(new Option(`${v.name} (${v.lang})`, v.voiceURI)));
    sel.value = settings.voiceURI;
    if (sel.value !== settings.voiceURI) sel.value = "";
  }
  function openSettings() {
    $("keyBlock").hidden = !!PROXY; $("codeBlock").hidden = !PROXY;
    $("apiKey").value = getKey();
    $("remember").checked = !!local.getItem(KEY);
    $("accessCode").value = getCode();
    $("rememberCode").checked = !!local.getItem(CODE);
    $("memOn").checked = settings.memory !== false; renderMem();
    $("localAi").checked = !!settings.localAi; $("localModel").value = settings.localModel === "onnx-community/Qwen2.5-0.5B-Instruct" ? "" : settings.localModel; localStatus();
    $("model").value = settings.model;
    $("userName").value = settings.userName; $("address").value = settings.address || "sir"; $("geminiChat").checked = !!settings.geminiChat;
    fillLangSelect(); fillVoiceSelect();
    $("rate").value = settings.rate; $("rateOut").textContent = Number(settings.rate).toFixed(1);
    $("speak").checked = settings.speak;
    if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
  }
  $("settingsBtn").addEventListener("click", openSettings);
  $("lang").addEventListener("change", () => { settings.lang = $("lang").value; settings.voiceURI = ""; fillVoiceSelect(); });
  $("rate").addEventListener("input", () => { $("rateOut").textContent = Number($("rate").value).toFixed(1); });

  $("settingsForm").addEventListener("submit", (e) => {
    const action = e.submitter && e.submitter.value;
    if (action !== "save") return; // "close" just closes the dialog
    const key = PROXY ? "" : $("apiKey").value.trim();
    const code = PROXY ? $("accessCode").value.trim() : "";
    if (!PROXY) { session.removeItem(KEY); local.removeItem(KEY); if (key) (($("remember").checked) ? local : session).setItem(KEY, key); }
    else { session.removeItem(CODE); local.removeItem(CODE); if (code) (($("rememberCode").checked) ? local : session).setItem(CODE, code); }
    settings.memory = $("memOn").checked; memory.enabled = settings.memory; if (!settings.memory) local.removeItem(CHAT);
    settings.localAi = true; settings.localModel = $("localModel").value.trim();
    settings.model = $("model").value.trim() || Core.DEFAULT_MODEL;
    settings.userName = $("userName").value.trim(); settings.address = $("address").value.trim() || "sir"; settings.geminiChat = $("geminiChat").checked;
    settings.lang = $("lang").value;
    settings.voiceURI = $("voice").value;
    settings.rate = parseFloat($("rate").value) || 1;
    settings.speak = $("speak").checked;
    saveSettings();
    warmLocal(false);
    jarvis.update({ model: settings.model, userName: settings.userName, address: settings.address });
    addMsg("system", "Very good. Your settings have been saved.");
  });

  $("testVoice").addEventListener("click", () => {
    settings.lang = $("lang").value; settings.voiceURI = $("voice").value;
    settings.rate = parseFloat($("rate").value) || 1; settings.speak = true;
    speak(settings.lang.startsWith("es") ? "Hola, soy Jarvis. ¿En qué puedo ayudarte?" : "Hello, I'm Jarvis. How can I help you?");
  });
  $("forgetBtn").addEventListener("click", () => {
    [KEY, CODE].forEach((k) => { session.removeItem(k); local.removeItem(k); });
    $("apiKey").value = ""; $("accessCode").value = ""; jarvis.update({ apiKey: "", accessCode: "" });
    addMsg("system", "Saved key/code removed from this browser.");
  });
  $("clearBtn").addEventListener("click", () => { local.removeItem(CHAT); jarvis.reset(); log.innerHTML = ""; addMsg("system", "Conversation cleared."); });
  $("exportBtn").addEventListener("click", () => {
    let notes = [];
    try { notes = JSON.parse(local.getItem("jarvis.notes") || "[]"); } catch (e) { /* empty */ }
    const body = "# Jarvis Notes\n\n" + notes.map((n) => `- ${n.ts}${n.tag ? " #" + n.tag : ""} - ${n.text}`).join("\n") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
    a.download = "jarvis-notes.md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- memory list in Settings
  function renderMem() {
    const ul = $("memList"); ul.innerHTML = "";
    const facts = memory.list();
    if (!facts.length) { const li = document.createElement("li"); li.textContent = "Nothing yet. Try: my name is…, I live in…, I like…"; ul.appendChild(li); return; }
    facts.forEach((f, i) => {
      const li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("button");
      sp.textContent = f.text; b.type = "button"; b.className = "ghost"; b.textContent = "Delete"; b.setAttribute("aria-label", "Delete " + f.text);
      b.onclick = () => { memory.removeAt(i); renderMem(); };
      li.append(sp, b); ul.appendChild(li);
    });
  }
  $("memClear").addEventListener("click", () => { memory.clear(); local.removeItem(CHAT); renderMem(); addMsg("system", "I've forgotten everything I knew about you."); });

  // ---------- local AI (runs in a background worker, so the page never freezes)
  const L = window.JarvisLocalAI, prof = L ? L.profile() : { tier: "none", model: "", sizeMB: 0, mobile: false };
  const LOCAL_SYSTEM = "You are Jarvis, a courteous, dry-witted British butler running fully offline in the user's browser; address the user as sir. Answer in at most 3 short sentences, in the user's language. If you are not sure, say you don't know. Never invent facts, numbers or sources.";
  const OLD_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
  const localModel = () => (settings.localModel && settings.localModel !== OLD_MODEL && !/^onnx-community\/SmolLM2-/.test(settings.localModel) ? settings.localModel : prof.model);
  function localStatus(text) {
    const el = $("localAiStatus");
    if (!el) return;
    el.textContent = text || (!L ? "Not available in this page." : L.ready() ? "Loaded and ready (" + L.device() + ")." : L.loading() ? "Loading…" : L.failed() ? "Not available: " + L.failed() : settings.localAi ? "Enabled. It loads in the background when needed." : "Off.");
  }
  async function warmLocal(manual) {
    if (!L || L.ready() || L.loading()) return;
    if (!manual && L.failed()) return; // never retry automatically after a failure
    localStatus("Downloading local AI… 0%");
    try {
      await L.enable(localModel(), (pc, mb) => localStatus("Downloading local AI… " + pc + "%" + (mb ? " of about " + mb + " MB" : "")));
      addMsg("system", "The local AI is ready (" + L.device() + ").");
    } catch (e) { addMsg("system", "The local AI could not start: " + e.message + " I shall carry on without it."); }
    localStatus();
  }
  function localMessages(q) {
    const hist = [];
    for (const c of jarvis.history.slice(-6)) {
      const t = (c.parts || []).filter((p) => typeof p.text === "string").map((p) => p.text).join("");
      if (t) hist.push({ role: c.role === "model" ? "assistant" : "user", content: t });
    }
    return [{ role: "system", content: LOCAL_SYSTEM }, ...hist, { role: "user", content: q }];
  }
  // Everyday chat goes to the local model when it is ready; otherwise it starts loading in the background and Gemini answers this one.
  async function localChat(q) {
    if (!settings.localAi || !L) return null;
    if (!L.ready()) { warmLocal(false); return null; }
    return L.chat(localMessages(q), { maxTokens: prof.mobile ? 110 : 160, firstTokenMs: 12000, onToken: (t) => { if (jarvis.opts.onToken) jarvis.opts.onToken(t); } });
  }
  // ---------- online brain (GitHub Models): used first when a token is saved; the local brain is the fallback
  const GH = window.JarvisGH;
  const GH_SYSTEM = "You are Jarvis, a courteous, sharp assistant with a light British-butler manner; address the user as sir unless told otherwise. Think carefully and give genuinely useful analysis: weigh the options, state your assumptions, point out risks and mistakes, and give a clear recommendation. Be concise (under 150 words unless asked for more). Reply in the user's language. Never invent facts, numbers or sources; say when you are unsure.";
  let ghWarnAt = 0;
  async function smartChat(q) {
    if (GH && GH.has()) {
      try {
        const m = localMessages(q); m[0] = { role: "system", content: GH_SYSTEM + " Current date and time: " + new Date().toLocaleString(navigator.language, { dateStyle: "full", timeStyle: "short" }) + "." };
        return await GH.ask(m, { maxTokens: 700 });
      } catch (e) { if (Date.now() - ghWarnAt > 60000) { ghWarnAt = Date.now(); addMsg("system", "Online brain unavailable: " + e.message + " Using the local brain."); } }
    }
    const r = await localChat(q);
    return typeof r === "string" && /currently offline|unable to assist|as an ai\b|language model|i (?:cannot|can't|am unable to) (?:assist|help|access)|try again\??$/i.test(r) ? null : r; // the small model sometimes invents refusals: drop them
  }
  function ghUi() {
    if (!GH) return; $("ghToken").value = ""; $("ghToken").placeholder = GH.hasToken() ? "Saved. Paste a new token to replace it." : "github_pat_…"; $("ghModel").value = GH.model() === GH.DEFAULT ? "" : GH.model();
    $("ghStatus").textContent = GH.hasToken() ? "A token is saved: Jarvis uses GitHub Models whenever you are online." : "No token yet: Jarvis uses its built-in and local brains only.";
  }
  if (GH) {
    ghUi(); $("settingsBtn").addEventListener("click", ghUi);
    $("ghSave").addEventListener("click", async () => {
      const v = $("ghToken").value.trim(); if (v) GH.setToken(v); GH.setModel($("ghModel").value.trim());
      if (!GH.hasToken()) { $("ghStatus").textContent = "Paste a token first."; return; }
      $("ghStatus").textContent = "Testing the connection…";
      try { await GH.ask([{ role: "user", content: "Reply with the single word OK." }], { maxTokens: 5, timeoutMs: 20000 }); $("ghStatus").textContent = "Connected to GitHub Models (" + GH.model() + "). Jarvis is now much smarter."; $("ghToken").value = ""; }
      catch (e) { $("ghStatus").textContent = "Saved, but the test failed: " + e.message; }
    });
    $("ghRemove").addEventListener("click", () => { GH.setToken(""); ghUi(); });
  }
  async function localReply(q) { // used inside the offline brain; never makes the user wait for a download
    if (!L.ready()) { if (!L.loading() && !L.failed()) warmLocal(false); return ""; } // the caller then gives an honest answer
    return L.chat(localMessages(q), { maxTokens: prof.mobile ? 110 : 160 });
  }
  if ($("localAiRec")) $("localAiRec").textContent = L ? `Recommended for this device: ${prof.tier} model (${prof.model}, about ${prof.sizeMB} MB).` : "";
  (function autoWarm() { // preload quietly once the page is idle, unless the connection looks metered or slow
    if (!L || prof.mem < 2 || (window.JarvisGH && JarvisGH.hasToken())) return; // with an online token the local model only loads if it is needed
    const c = navigator.connection || {};
    if (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || "")) return; // then it loads on the first chat instead
    const go = () => (window.requestIdleCallback ? requestIdleCallback(() => warmLocal(false), { timeout: 8000 }) : setTimeout(() => warmLocal(false), 4000));
    if (document.readyState === "complete") setTimeout(go, 2500); else addEventListener("load", () => setTimeout(go, 2500), { once: true });
  })();
  $("localAiLoad").addEventListener("click", () => warmLocal(true));
  $("localAiUnload").addEventListener("click", () => { if (L) L.unload(); localStatus(); });
  $("localAiDelete").addEventListener("click", async () => { if (L) await L.deleteModel(); localStatus("Downloaded model deleted."); });

  // ---------- first run
  if (!window.JarvisOffline) addMsg("system", "This browser is too old for my instant brain, but Gemini still works. Updating the browser will restore it.");
  if (!SR) addMsg("system", "Voice input needs Chrome, Edge or Safari. You can still type, and Jarvis can still speak.");
  const restored = restoreChat(), who = memory.enabled && memory.get("name");
  if (restored) addMsg("system", who ? "Welcome back, " + who + ". I have kept our last conversation on file." : "Welcome back. I have kept our last conversation on file.");
  else addMsg("jarvis", ready()
    ? (who ? "Good day, " + who + ". Jarvis at your service. Tap the orb and speak, or type a message." : "Good day. Jarvis at your service. Tap the orb and speak, or type a message.")
    : "Good day. I am Jarvis. Were you to open Settings and enter your Gemini API key, I should be fully at your service; until then I can manage simpler matters.");
  if (!ready()) setTimeout(openSettings, 400);
})();
