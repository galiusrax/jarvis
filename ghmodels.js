/* Online brain: GitHub Models (hosted by GitHub, OpenAI-compatible). Used for real analysis, open questions and photo interpretation.
 * The token is yours and lives only in this browser (localStorage). Nothing else is hosted anywhere but GitHub Pages. */
(function () {
  "use strict";
  const KT = "jarvis.ghToken", KM = "jarvis.ghModel", ENDPOINT = "https://models.github.ai/inference/chat/completions", DEFAULT = "openai/gpt-4o-mini";
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* ignore */ } };
  const STATUS = { 401: "GitHub rejected the token. Check that it is a fine-grained token with the Models (read) permission.", 403: "GitHub refused the request (the token may lack the Models permission).", 404: "That model was not found on GitHub Models. Check the model name in Settings.", 413: "That request was too large for GitHub Models.", 429: "GitHub Models rate limit reached. Try again in a little while." };

  async function ask(messages, o) {
    o = o || {}; const token = get(KT); if (!token) throw new Error("No GitHub token saved.");
    const c = new AbortController(), t = setTimeout(() => c.abort(), o.timeoutMs || 45000); let r;
    try {
      r = await fetch(ENDPOINT, { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ model: get(KM) || DEFAULT, messages, max_tokens: o.maxTokens || 600, temperature: o.temperature == null ? 0.4 : o.temperature }) });
    } catch (e) { throw new Error(e && e.name === "AbortError" ? "GitHub Models took too long to answer." : "The browser could not reach GitHub Models (no connection, or the browser blocked the request)."); }
    finally { clearTimeout(t); }
    if (!r.ok) throw new Error(STATUS[r.status] || "GitHub Models returned error " + r.status + ".");
    let d; try { d = await r.json(); } catch (e) { throw new Error("GitHub Models sent an unreadable answer."); }
    const txt = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!txt) throw new Error("GitHub Models returned an empty answer."); return String(txt).trim();
  }
  const vision = (dataUrl, question, o) => ask([
    { role: "system", content: "You are Jarvis, a courteous assistant. Interpret photos like a perceptive person would. Never identify real people by name or from their face; describe them instead." },
    { role: "user", content: [{ type: "text", text: question }, { type: "image_url", image_url: { url: dataUrl } }] },
  ], Object.assign({ maxTokens: 500 }, o));

  window.JarvisGH = {
    ask, vision, DEFAULT,
    hasToken: () => !!get(KT), has: () => !!get(KT) && navigator.onLine !== false,
    setToken: (v) => put(KT, String(v || "").trim()), model: () => get(KM) || DEFAULT, setModel: (v) => put(KM, String(v || "").trim()),
  };
})();
