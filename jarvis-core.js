/* Jarvis web core: Gemini REST client + tool-calling loop + browser-side tools.
 * No DOM access here, so it can be unit-tested with Node (see tests/web). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JarvisCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  const DEFAULT_MODEL = "gemini-3.8-flash";
  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

  const WMO = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "heavy freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light showers", 81: "showers", 82: "violent showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
  };

  // ------------------------------------------------------------------ tools
  const DECLARATIONS = [
    {
      name: "get_weather",
      description: "Get the current weather and today's forecast for a city.",
      parameters: {
        type: "OBJECT",
        properties: {
          city: { type: "STRING", description: 'City name, e.g. "Santiago" or "Madrid, Spain".' },
          units: { type: "STRING", description: '"celsius" (default) or "fahrenheit".' },
        },
        required: ["city"],
      },
    },
    {
      name: "get_current_time",
      description: "Get the current date and time, locally or in a given IANA timezone.",
      parameters: {
        type: "OBJECT",
        properties: {
          timezone: { type: "STRING", description: 'Optional IANA timezone such as "Asia/Tokyo". Empty = local time.' },
        },
      },
    },
    {
      name: "add_note",
      description: "Save a note, reminder or idea to the user's notes (stored in this browser).",
      parameters: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING", description: "The note content." },
          tag: { type: "STRING", description: 'Optional one-word category such as "todo" or "idea".' },
        },
        required: ["text"],
      },
    },
    {
      name: "list_notes",
      description: "Show the most recent saved notes.",
      parameters: {
        type: "OBJECT",
        properties: { limit: { type: "NUMBER", description: "How many latest notes to return (default 10, max 100)." } },
      },
    },
    {
      name: "search_notes",
      description: "Search saved notes for a word or phrase (case-insensitive).",
      parameters: {
        type: "OBJECT",
        properties: { query: { type: "STRING", description: "Text to look for." } },
        required: ["query"],
      },
    },
    {
      name: "get_device_info",
      description: "Get basic information about the browser/device Jarvis is running on.",
      parameters: { type: "OBJECT", properties: {} },
    },
  ];

  const NOTES_KEY = "jarvis.notes";

  function pad(n) { return String(n).padStart(2, "0"); }
  function stamp(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function createTools(env) {
    const doFetch = env.fetch;
    const storage = env.storage;
    const nav = env.navigator || (typeof navigator !== "undefined" ? navigator : {});
    const now = env.now || (() => new Date());

    async function getJson(url, params) {
      const qs = new URLSearchParams(params).toString();
      const res = await doFetch(`${url}?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      return res.json();
    }

    function readNotes() {
      try { return JSON.parse(storage.getItem(NOTES_KEY) || "[]"); } catch (e) { return []; }
    }
    const fmt = (n) => `- ${n.ts}${n.tag ? ` #${n.tag}` : ""} - ${n.text}`;

    const handlers = {
      async get_weather({ city, units }) {
        if (!city) return { error: "city is required." };
        const fahrenheit = String(units || "").trim().toLowerCase().startsWith("f");
        const name = String(city).split(",")[0].trim();
        const geo = await getJson(GEOCODE_URL, { name, count: 1, language: "en", format: "json" });
        const place = (geo.results || [])[0];
        if (!place) return { error: `Could not find a location called "${city}".` };
        const data = await getJson(FORECAST_URL, {
          latitude: place.latitude,
          longitude: place.longitude,
          current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
          daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
          timezone: "auto",
          forecast_days: 1,
          temperature_unit: fahrenheit ? "fahrenheit" : "celsius",
        });
        const c = data.current, d = data.daily, u = fahrenheit ? "°F" : "°C";
        return {
          location: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
          conditions: WMO[c.weather_code] || "unknown",
          temperature: `${c.temperature_2m}${u}`,
          feels_like: `${c.apparent_temperature}${u}`,
          humidity: `${c.relative_humidity_2m}%`,
          wind_kmh: c.wind_speed_10m,
          today_high: `${d.temperature_2m_max[0]}${u}`,
          today_low: `${d.temperature_2m_min[0]}${u}`,
          chance_of_precipitation: `${d.precipitation_probability_max[0]}%`,
        };
      },

      get_current_time({ timezone } = {}) {
        const tz = timezone ? String(timezone).trim() : "";
        const d = now();
        try {
          const opts = tz ? { timeZone: tz } : {};
          return {
            datetime: d.toLocaleString("sv-SE", opts),
            weekday: d.toLocaleDateString("en-US", { ...opts, weekday: "long" }),
            timezone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        } catch (e) {
          return { error: `Unknown timezone "${tz}". Use an IANA name like "Asia/Tokyo".` };
        }
      },

      add_note({ text, tag }) {
        const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
        if (!clean) return { error: "Note text is empty." };
        const cleanTag = String(tag || "").toLowerCase().replace(/[^\w-]/g, "");
        const notes = readNotes();
        const note = { ts: stamp(now()), tag: cleanTag, text: clean };
        notes.push(note);
        storage.setItem(NOTES_KEY, JSON.stringify(notes));
        return { saved: fmt(note) };
      },

      list_notes({ limit } = {}) {
        const n = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
        const notes = readNotes();
        return { total_notes: notes.length, notes: notes.slice(-n).map(fmt) };
      },

      search_notes({ query }) {
        const needle = String(query || "").trim().toLowerCase();
        if (!needle) return { error: "Query is empty." };
        const matches = readNotes().map(fmt).filter((l) => l.toLowerCase().includes(needle));
        return { matches: matches.slice(-50), count: matches.length };
      },

      async lookup_wikipedia({ topic, lang }) {
        if (!topic) return { error: "topic is required." };
        const l = lang === "es" ? "es" : "en"; // fixed allow-list: never build a host from user input
        const d = await getJson(`https://${l}.wikipedia.org/w/api.php`, {
          action: "query", generator: "search", gsrsearch: topic, gsrlimit: 1, prop: "extracts|info", exintro: 1,
          explaintext: 1, exsentences: 6, inprop: "url", redirects: 1, format: "json", origin: "*",
        });
        const page = d.query && d.query.pages && Object.values(d.query.pages)[0];
        if (!page || !page.extract) return { error: `No article found for "${topic}".` };
        return { title: page.title, summary: page.extract, url: page.fullurl };
      },

      get_device_info() {
        const scr = env.screen || (typeof screen !== "undefined" ? screen : {});
        return {
          language: nav.language || "unknown",
          platform: nav.platform || "unknown",
          online: nav.onLine !== undefined ? nav.onLine : true,
          screen: scr.width ? `${scr.width}x${scr.height}` : "unknown",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      },
    };

    return {
      declarations: DECLARATIONS.slice(),
      names: Object.keys(handlers),
      extend(decls, extra) { this.declarations.push(...decls); Object.assign(handlers, extra); this.names = Object.keys(handlers); },
      async call(name, args) {
        const fn = handlers[name];
        if (!fn) return { error: `Unknown tool "${name}".` };
        try { return await fn(args || {}); }
        catch (e) { return { error: `${e.name}: ${e.message}` }; }
      },
    };
  }

  // ------------------------------------------------------------------ brain
  function defaultSystemPrompt(userName, memText, address) {
    address = address || "sir";
    const now = new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
    return [
      "You are Jarvis, a classic British butler serving the user as a personal assistant inside their web browser: impeccably polite, composed, quietly witty, devoted and discreet. Speak in refined British English (British spellings) with understated dry humour, using phrases such as 'Very good, sir', 'If I may be so bold' and 'I shall see to it at once'. Address the user as '" + address + "'." + (userName ? ` Their name is ${userName}; use it only occasionally.` : ""),
      "Stay genuinely helpful and concise; never so servile or theatrical that it gets in the way. When the user writes in Spanish, answer in formal, courteous Spanish with the same butler manner (señor/señora).",
      `Current local date/time: ${now}.`,
      ...(memText ? ["", "Saved by the user about themselves (use naturally, never recite it all):", memText] : []),
      "",
      "Guidelines:",
      "- Reply in the same language the user writes in.",
      "- Your answers are often spoken aloud: use short, natural sentences. No markdown, no bullet symbols, no emoji, no URLs read out.",
      "- Use the provided tools whenever they give a more accurate or up-to-date answer (weather, time, notes, device info) instead of guessing.",
      "- Never invent tool results. If a tool returns an error, say so plainly.",
      "- You cannot run system commands or access files from the browser. Say so if asked.",
      "- Be conversational and attentive, like an excellent butler who remembers what the user has said. Build on earlier turns.",
      "- Keep answers short unless the user asks for detail.",
    ].join("\n");
  }

  function isPlainUserTurn(content) {
    return content && content.role === "user" && Array.isArray(content.parts) &&
      content.parts.length > 0 && content.parts.every((p) => typeof p.text === "string");
  }

  // "Think less" settings, tried in order (Gemini 3 style, then Gemini 2.5 style, then none).
  const THINK = [{ thinkingLevel: "low" }, { thinkingBudget: 0 }, null];

  class Jarvis {
    constructor(opts) {
      this.opts = Object.assign(
        { address: "sir", localLLM: null, onToken: null, onReset: null, maxOutputTokens: 800, memoryText: null, local: null, isComplex: null, offline: null, onProvider: null, apiKey: "", proxyUrl: "", accessCode: "", model: DEFAULT_MODEL, userName: "", temperature: 0.6, maxToolCalls: 8,
          maxHistory: 24, fetch: null, storage: null, onToolCall: null },
        opts || {}
      );
      this.history = [];
      this.cool = {}; this.errs = {};
      try { this.thinkIdx = Math.min(parseInt((this.opts.storage && this.opts.storage.getItem("jarvis.thinkIdx")) || "0", 10) || 0, THINK.length - 1); } catch (e) { this.thinkIdx = 0; }
      this.lastProvider = null;
      this._buildTools();
    }

    _buildTools() {
      this.tools = createTools({
        fetch: (...a) => this.opts.fetch(...a),
        storage: this.opts.storage,
        navigator: this.opts.navigator,
        screen: this.opts.screen,
        now: this.opts.now,
      });
    }

    update(patch) { Object.assign(this.opts, patch); }
    reset() { this.history = []; }

    // Calls Gemini. After an error it rests for a while (5 min for quota errors) and Jarvis answers offline meanwhile.
    async _generate() {
      const chain = [];
      if (this.opts.apiKey || this.opts.proxyUrl) chain.push({ name: "Gemini", run: () => this._geminiGenerate() });
      if (!chain.length) throw new Error("No API key set. Open Settings and paste your Gemini API key.");
      const live = chain.filter((c) => !(this.cool[c.name] > Date.now()));
      const errors = [];
      if (!live.length) throw new Error("All AI providers are cooling down after errors: " + chain.map((c) => this.errs[c.name]).filter(Boolean).join(" | "));
      for (const c of live) {
        try {
          const data = await c.run();
          if (this.lastProvider !== c.name) {
            const prev = this.lastProvider; this.lastProvider = c.name;
            if (prev && this.opts.onProvider) this.opts.onProvider(c.name, errors.length ? errors[errors.length - 1] : "previous provider cooling down");
          }
          return data;
        } catch (e) {
          errors.push(`${c.name}: ${e.message}`);
          this.errs[c.name] = `${c.name}: ${e.message}`;
          this.cool[c.name] = Date.now() + (/\b(429|402)\b|quota|exhausted|rate limit/i.test(e.message) ? 5 * 60 * 1000 : 45 * 1000);
        }
      }
      throw new Error(errors.join(" | "));
    }

    // Retries once per fallback if the model rejects the "think less" setting (older/other models).
    async _geminiGenerate() {
      for (let i = 0; i < THINK.length; i++) {
        try { return await this._geminiOnce(); }
        catch (e) {
          if (/\b400\b/.test(e.message) && /think/i.test(e.message) && this.thinkIdx < THINK.length - 1) {
            this.thinkIdx++;
            try { if (this.opts.storage) this.opts.storage.setItem("jarvis.thinkIdx", String(this.thinkIdx)); } catch (x) { /* ignore */ }
            continue;
          }
          throw e;
        }
      }
    }

    async _geminiOnce() {
      const { apiKey, model, userName, temperature, proxyUrl, accessCode, maxOutputTokens } = this.opts;
      const m = model || DEFAULT_MODEL, streaming = !!this.opts.onToken, think = THINK[this.thinkIdx];
      const generationConfig = { temperature, maxOutputTokens };
      if (think) generationConfig.thinkingConfig = think; // less "thinking" = much faster first word
      const payload = JSON.stringify({
        systemInstruction: { parts: [{ text: defaultSystemPrompt(userName, this.opts.memoryText ? this.opts.memoryText() : "", this.opts.address) }] },
        contents: this.history,
        tools: [{ functionDeclarations: this.tools.declarations }],
        generationConfig,
      });
      let url, headers;
      if (proxyUrl) {
        // Proxy mode: a server you control adds the API key, so none is needed in the browser.
        url = `${proxyUrl}${proxyUrl.includes("?") ? "&" : "?"}model=${encodeURIComponent(m)}${streaming ? "&stream=1" : ""}`;
        headers = { "Content-Type": "application/json" };
        if (accessCode) headers["X-Jarvis-Code"] = accessCode;
      } else {
        url = `${API_BASE}${encodeURIComponent(m)}:${streaming ? "streamGenerateContent?alt=sse" : "generateContent"}`;
        headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
      }
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), 25000); // fail fast so offline mode can take over
      let res;
      try { res = await this.opts.fetch(url, { method: "POST", headers, body: payload, signal: ctl ? ctl.signal : undefined }); }
      catch (e) { throw e && e.name === "AbortError" ? new Error("Gemini timed out") : e; }
      finally { if (timer) clearTimeout(timer); }
      if (res.ok && streaming && res.body && res.headers && /event-stream/.test(res.headers.get("content-type") || "")) return this._readStream(res);
      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON body */ }
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || res.statusText || "request failed";
        throw new Error(`Gemini API ${res.status}: ${msg}`);
      }
      return data;
    }

    // Reads Server-Sent Events and rebuilds one normal response; text is handed to onToken as it arrives.
    async _readStream(res) {
      const reader = res.body.getReader(), dec = new TextDecoder(), parts = [];
      let buf = "", finish = null, feedback = null;
      const add = (p) => {
        if (typeof p.text === "string" && !p.thought) {
          const last = parts[parts.length - 1];
          if (last && typeof last.text === "string" && !last.thought) { last.text += p.text; if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature; }
          else parts.push(Object.assign({}, p));
          if (p.text && this.opts.onToken) this.opts.onToken(p.text);
        } else if (!p.thought) parts.push(p);
      };
      const eat = (line) => {
        line = line.trim();
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        let ev; try { ev = JSON.parse(payload); } catch (e) { return; }
        if (ev.error) throw new Error(`Gemini API ${ev.error.code || ""}: ${ev.error.message}`);
        feedback = ev.promptFeedback || feedback;
        const c = ev.candidates && ev.candidates[0];
        if (!c) return;
        if (c.finishReason) finish = c.finishReason;
        for (const p of (c.content && c.content.parts) || []) add(p);
      };
      for (;;) {
        let tm, chunk;
        try { chunk = await Promise.race([reader.read(), new Promise((_, no) => { tm = setTimeout(() => no(new Error("Gemini timed out")), 20000); })]); }
        finally { clearTimeout(tm); }
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { eat(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      eat(buf);
      return { candidates: [{ content: { role: "model", parts }, finishReason: finish }], promptFeedback: feedback };
    }

    async ask(text) {
      // Routing: instant rules -> local AI (if loaded) -> Gemini. Hard requests skip straight to Gemini.
      const complex = !this.opts.offlineOnly && !!(this.opts.isComplex && this.opts.isComplex(text)); // no cloud AI: everything may use the local model
      const remember = (reply) => { this.history.push({ role: "user", parts: [{ text }] }, { role: "model", parts: [{ text: reply }] }); this._trim(); };
      if (this.opts.local && !complex) {
        let quick = null;
        try { quick = await this.opts.local(text, this.tools); } catch (e) { quick = null; }
        if (quick) { remember(quick); this.lastRoute = "instant"; return quick; }
      }
      if (this.opts.localLLM && !complex) {
        let out = null;
        try { out = await this.opts.localLLM(text, this.tools); } catch (e) { out = null; }
        if (out) { remember(out); this.lastRoute = "local AI"; return out; }
        if (this.opts.onReset) this.opts.onReset(); // drop any partial text from a local attempt that failed
      }
      if (this.opts.offlineOnly && this.opts.offline) { // no cloud AI at all: the offline brain answers everything
        const reply = await this.opts.offline(text, this.tools); remember(reply); this.lastRoute = "offline"; return reply;
      }
      const mark = this.history.length;
      this.history.push({ role: "user", parts: [{ text }] });
      let calls = 0;
      try {
        for (;;) {
          const data = await this._generate();
          const cand = data && data.candidates && data.candidates[0];
          if (!cand || !cand.content || !Array.isArray(cand.content.parts)) {
            const reason = (data && data.promptFeedback && data.promptFeedback.blockReason) ||
              (cand && cand.finishReason) || "empty response";
            this.history.length = mark;
            return `(No answer: ${reason})`;
          }
          // Keep the model turn exactly as returned (it may carry thought signatures).
          this.history.push(cand.content);
          const fcs = cand.content.parts.filter((p) => p.functionCall);
          if (!fcs.length) {
            const out = cand.content.parts.filter((p) => typeof p.text === "string" && !p.thought)
              .map((p) => p.text).join("").trim();
            this._trim();
            this.lastRoute = "Gemini";
            return out || "(Jarvis returned an empty response.)";
          }
          if (this.opts.onReset) this.opts.onReset(); // discard any partial text from a round that ended in tool calls
          if (calls + fcs.length > this.opts.maxToolCalls) {
            this.history.pop();
            this.history.push({ role: "model", parts: [{ text: "(Stopped: too many tool calls.)" }] });
            return "I stopped because I was making too many tool calls. Please try rephrasing.";
          }
          const responses = [];
          for (const p of fcs) {
            calls++;
            const { name, args } = p.functionCall;
            if (this.opts.onToolCall) this.opts.onToolCall(name, args);
            const result = await this.tools.call(name, args);
            responses.push({ functionResponse: { name, response: { result } } });
          }
          this.history.push({ role: "user", parts: responses });
        }
      } catch (e) {
        if (this.opts.onReset) this.opts.onReset();
        this.history.length = mark; // keep history valid after a failed request
        if (this.opts.offline) {
          const reply = await this.opts.offline(text, this.tools);
          this.history.push({ role: "user", parts: [{ text }] }, { role: "model", parts: [{ text: reply }] });
          this.lastRoute = "offline";
          if (this.lastProvider !== "Offline mode") {
            this.lastProvider = "Offline mode";
            if (this.opts.onProvider) this.opts.onProvider("Offline mode", e.message);
          }
          return reply;
        }
        throw e;
      }
    }

    _trim() {
      const limit = this.opts.maxHistory;
      if (limit <= 0 || this.history.length <= limit) return;
      for (let i = this.history.length - limit; i < this.history.length; i++) {
        if (isPlainUserTurn(this.history[i])) { this.history = this.history.slice(i); return; }
      }
    }
  }

  // ----------------------------------------------------------------- speech
  function speakableText(text) {
    return String(text)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*#+\s*/gm, "")
      .replace(/[*_~#>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function chunkForSpeech(text, max) {
    max = max || 180;
    const sentences = text.match(/[^.!?¡¿\n]+[.!?]*\s*/g) || [text];
    const chunks = [];
    let cur = "";
    for (const s of sentences) {
      if ((cur + s).length > max && cur) { chunks.push(cur.trim()); cur = ""; }
      cur += s;
      while (cur.length > max) {
        const cut = cur.lastIndexOf(" ", max);
        const at = cut > 40 ? cut : max;
        chunks.push(cur.slice(0, at).trim());
        cur = cur.slice(at);
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
  }

  return { Jarvis, createTools, speakableText, chunkForSpeech, DEFAULT_MODEL, API_BASE };
});
