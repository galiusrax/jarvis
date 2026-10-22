/* Jarvis memory: facts about the user, stored ONLY in this browser (localStorage).
 * Saves simple, low-risk facts (name, home city, likes, favorites, work/study, birthday, preferences)
 * and anything the user asks to remember. Refuses sensitive details (passwords, health, money, etc.). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.JarvisMemory = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const KEY = "jarvis.memory", MAX = 60;
  const strip = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const SENSITIVE = /\b(password|passcode|contrasena|clave|pin|credit card|debit card|tarjeta|cvv|iban|ssn|social security|rut|passport|pasaporte|diagnos\w*|medicat\w*|disease|enfermedad\w*|therapy|terapia|depress\w*|suicid\w*|pregnan\w*|embaraz\w*|religio\w*|politic\w*|sexual\w*|salary|sueldo|income|ingresos?|debt|deuda|immigration|migrat\w*|criminal|arrest\w*|abuse|abuso)\b/;
  const STOP = new Set("what whats is my the a an of about that this me mi mis que cual cuales es el la los las de del sobre everything todo lo do you know".split(" "));
  const titled = (v) => (v === v.toLowerCase() ? v.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : v);
  const clean = (v) => v.replace(/\s+/g, " ").replace(/[.!\s]+$/, "").trim();
  const END = "\\s*[.!]*$";

  const PATTERNS = [
    ["name", new RegExp("^(?:(?:hi|hello|hola)[, ]+)?(?:my name is|my name's|call me|i am called|me llamo|mi nombre es|ll[aá]mame)\\s+(\\p{L}[\\p{L}'’ -]{1,30}?)" + END, "iu")],
    ["location", new RegExp("^(?:i live in|i'm living in|i'm from|i am from|vivo en|soy de|vengo de|resido en)\\s+(.{2,40}?)" + END, "iu")],
    ["dislike", new RegExp("^(?:i (?:really )?(?:hate|dislike|don't like|do not like)|no me gusta(?:n)?|odio)\\s+(.{2,60}?)" + END, "iu")],
    ["like", new RegExp("^(?:i (?:really |absolutely )?(?:like|love|enjoy)|me (?:gusta(?:n)?|encanta(?:n)?))\\s+(.{2,60}?)" + END, "iu")],
    ["favorite", new RegExp("^my favou?rite\\s+(\\p{L}[\\p{L} ]{1,24}?)\\s+is\\s+(.{1,50}?)" + END, "iu")],
    ["favorite", new RegExp("^mi\\s+(\\p{L}[\\p{L} ]{1,24}?)\\s+favorit[oa]\\s+es\\s+(.{1,50}?)" + END, "iu")],
    ["work", new RegExp("^(?:i work (?:as|at|in|for)|trabajo (?:como|en|de|para))\\s+(.{2,50}?)" + END, "iu")],
    ["study", new RegExp("^(?:i (?:study|am studying|'m studying)|estudio)\\s+(.{2,50}?)" + END, "iu")],
    ["birthday", new RegExp("^(?:my birthday is(?: on)?|mi cumplea[nñ]os es(?: el)?|cumplo a[nñ]os(?: el)?)\\s+(.{3,30}?)" + END, "iu")],
    ["prefer", new RegExp("^(?:i prefer|prefiero)\\s+(.{2,80}?)" + END, "iu")],
    ["explicit", new RegExp("^(?:please\\s+)?(?:remember|keep in mind|recuerda|ten en cuenta)(?:\\s+that|\\s+que)?\\s*:?\\s+((?:i|i'm|i've|my|me|mi|mis|yo|soy|tengo|vivo|prefiero)\\b.{2,150}?)" + END, "iu")],
  ];

  function parse(raw) {
    const t = String(raw).trim();
    for (const [kind, re] of PATTERNS) {
      const m = t.match(re);
      if (!m) continue;
      const v = clean(m[kind === "favorite" ? 2 : 1]);
      if (kind === "name") return { kind, key: "name", value: titled(v), text: "Name: " + titled(v) };
      if (kind === "location") return { kind, key: "location", value: titled(v), text: "Lives in " + titled(v) };
      if (kind === "like") return { kind, key: null, value: v, text: "Likes " + v };
      if (kind === "dislike") return { kind, key: null, value: v, text: "Dislikes " + v };
      if (kind === "favorite") { const th = clean(m[1]).toLowerCase(); return { kind, key: "fav:" + th, value: v, text: `Favorite ${th}: ${v}` }; }
      if (kind === "work") return { kind, key: "work", value: v, text: "Work: " + v };
      if (kind === "study") return { kind, key: "study", value: v, text: "Studies: " + v };
      if (kind === "birthday") return { kind, key: "birthday", value: v, text: "Birthday: " + v };
      if (kind === "prefer") return { kind, key: null, value: v, text: "Prefers " + v };
      return { kind, key: null, value: v, text: v.charAt(0).toUpperCase() + v.slice(1) };
    }
    return null;
  }

  function create(storage) {
    let enabled = true;
    const load = () => { try { const a = JSON.parse(storage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    const save = (a) => storage.setItem(KEY, JSON.stringify(a.slice(-MAX)));
    const terms = (q) => strip(q).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    return {
      get enabled() { return enabled; },
      set enabled(v) { enabled = !!v; },
      list: load,
      add(text, key, value) {
        if (!enabled) return { ok: false, reason: "off" };
        text = String(text).replace(/\s+/g, " ").trim().slice(0, 200);
        if (text.length < 3) return { ok: false, reason: "empty" };
        if (SENSITIVE.test(strip(text))) return { ok: false, reason: "sensitive" };
        const a = load(), rec = { text, key: key || null, value: value || null, ts: Date.now() };
        const i = rec.key ? a.findIndex((f) => f.key === rec.key) : a.findIndex((f) => f.text.toLowerCase() === text.toLowerCase());
        if (i >= 0) a[i] = rec; else a.push(rec);
        save(a);
        return { ok: true, fact: rec };
      },
      get(key) { const f = load().find((x) => x.key === key); return f ? f.value || f.text : ""; },
      find(query) {
        const q = terms(query); if (!q.length) return null;
        let best = null, bs = 0;
        for (const f of load()) { const hay = strip(f.text + " " + (f.key || "")); const s = q.filter((w) => hay.includes(w)).length; if (s > bs) { bs = s; best = f; } }
        return best;
      },
      forget(query) {
        const q = terms(query); if (!q.length) return 0;
        const a = load(), keep = a.filter((f) => { const hay = strip(f.text + " " + (f.key || "")); return !q.some((w) => hay.includes(w)); });
        save(keep); return a.length - keep.length;
      },
      removeAt(i) { const a = load(); a.splice(i, 1); save(a); },
      clear() { save([]); },
      summary() { return load().slice(-25).map((f) => "- " + f.text).join("\n"); },
    };
  }
  return { create, parse, isSensitive: (t) => SENSITIVE.test(strip(t)) };
});
