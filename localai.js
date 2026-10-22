/* Local AI, built to be safe on every device:
 *  - runs in a background Web Worker, so the page never freezes (and an out-of-memory crash can't take the page down)
 *  - picks a model size for the device (phones/tablets get the smallest one)
 *  - loads only when needed, unloads itself when idle, checks free storage first, gives up cleanly on stalls */
(function () {
  "use strict";
  const UA = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const mem = navigator.deviceMemory || (mobile ? 3 : 8), cores = navigator.hardwareConcurrency || 4;
  // The SmolLM2 ONNX files live in the HuggingFaceTB repos (confirmed for 360M); the old onnx-community addresses are kept only as a fallback.
  const TIERS = { tiny: ["HuggingFaceTB/SmolLM2-135M-Instruct", 120], light: ["HuggingFaceTB/SmolLM2-360M-Instruct", 300], balanced: ["onnx-community/Qwen2.5-0.5B-Instruct", 600] };
  const ALTS = { "HuggingFaceTB/SmolLM2-135M-Instruct": ["onnx-community/SmolLM2-135M-Instruct"], "HuggingFaceTB/SmolLM2-360M-Instruct": ["onnx-community/SmolLM2-360M-Instruct"] };
  const NOT_FOUND = /unauthorized|not found|404|could not locate|forbidden|401|403/i;

  function profile() {
    const tier = mobile || mem < 4 ? "tiny" : mem < 8 || cores < 6 ? "light" : "balanced";
    return { mobile, mem, cores, webgpu: !!navigator.gpu, tier, model: TIERS[tier][0], sizeMB: TIERS[tier][1] };
  }

  // ---- the worker (its source is built from this function, so there is no extra file to host)
  function workerMain() {
    let T = null, gen = null;
    const VERSIONS = ["3.7.6", "3.5.1", "3.0.0"];
    async function lib() {
      let last;
      for (const v of VERSIONS) { try { return await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@" + v); } catch (e) { last = e; } }
      throw new Error("Could not load the AI library (" + (last && last.message) + ")");
    }
    self.onmessage = async (e) => {
      const m = e.data;
      try {
        if (m.type === "load") {
          T = T || await lib();
          T.env.allowLocalModels = false;
          try { T.env.backends.onnx.wasm.numThreads = m.threads || 1; } catch (x) { /* ignore */ }
          const files = {};
          const cb = (p) => {
            if (!p || p.status !== "progress" || !p.file) return;
            files[p.file] = [p.loaded || 0, p.total || 0];
            let l = 0, t = 0; for (const k in files) { l += files[k][0]; t += files[k][1]; }
            if (t) postMessage({ type: "progress", pct: Math.round((l / t) * 100), mb: Math.round(t / 1048576) });
          };
          const build = (dev) => T.pipeline("text-generation", m.model, { dtype: m.dtype || "q4", device: dev, progress_callback: cb });
          let dev = m.device;
          try { gen = await build(dev); } catch (err) { if (dev === "webgpu") { dev = "wasm"; gen = await build("wasm"); } else throw err; }
          postMessage({ type: "ready", device: dev });
        } else if (m.type === "chat") {
          const streamer = new T.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => postMessage({ type: "token", id: m.id, text: t }) });
          const out = await gen(m.messages, { max_new_tokens: m.max, do_sample: false, repetition_penalty: 1.1, streamer });
          postMessage({ type: "done", id: m.id, text: String(out[0].generated_text[out[0].generated_text.length - 1].content || "").trim() });
        }
      } catch (err) { postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) }); }
    };
  }

  let w = null, state = "off", device = "", loadingP = null, failMsg = "", seq = 0, idleT = 0, hideT = 0;
  const FAIL_KEY = "jarvis.localAiFail.v2"; // new key: failures recorded by older versions are ignored
  const busy = (b) => { try { document.dispatchEvent(new CustomEvent("jarvis:busy", { detail: b })); } catch (e) { /* ignore */ } };
  function kill() { if (w) { try { w.terminate(); } catch (e) { /* ignore */ } w = null; } state = "off"; clearTimeout(idleT); }
  function touch() { clearTimeout(idleT); idleT = setTimeout(kill, (mobile ? 3 : 20) * 60 * 1000); } // free the memory when idle
  function registerSW() { if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {}); }
  document.addEventListener("visibilitychange", () => {
    clearTimeout(hideT);
    if (document.hidden && mobile) hideT = setTimeout(kill, 30000); // phones: don't hold hundreds of MB in the background
  });
  addEventListener("pagehide", kill);

  function startWorker(model, onProgress) {
    const url = URL.createObjectURL(new Blob(["(" + workerMain.toString() + ")();"], { type: "text/javascript" }));
    w = new Worker(url, { type: "module" });
    return new Promise((resolve, reject) => {
      let dog; const arm = (ms) => { clearTimeout(dog); dog = setTimeout(() => reject(new Error("The download stalled.")), ms); };
      arm(120000);
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") { arm(90000); if (onProgress) onProgress(m.pct, m.mb); }
        else if (m.type === "ready") { clearTimeout(dog); device = m.device; resolve(); }
        else if (m.type === "error" && !m.id) { clearTimeout(dog); reject(new Error(m.message)); }
      };
      w.onerror = (e) => { clearTimeout(dog); reject(new Error((e && e.message) || "The background worker stopped (most likely out of memory).")); };
      w.postMessage({ type: "load", model, dtype: "q4", device: navigator.gpu ? "webgpu" : "wasm", threads: self.crossOriginIsolated ? Math.max(1, Math.min(4, cores - 1)) : 1 });
    });
  }

  function enable(model, onProgress) {
    if (state === "ready") return Promise.resolve();
    if (loadingP) return loadingP;
    failMsg = "";
    loadingP = (async () => {
      busy(true);
      try {
        if (typeof Worker === "undefined") throw new Error("This browser cannot run background workers.");
        const p = profile();
        const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
        if (est && est.quota && est.quota - (est.usage || 0) < p.sizeMB * 1.3 * 1048576) throw new Error("There is not enough free storage on this device (about " + Math.round(p.sizeMB * 1.3) + " MB needed).");
        registerSW();
        const candidates = [model].concat(ALTS[model] || []);
        let lastErr = null;
        for (const m of candidates) {
          try { await startWorker(m, onProgress); lastErr = null; break; }
          catch (e) { lastErr = e; kill(); if (!NOT_FOUND.test(e.message)) break; } // only try the next address when the model was not found
        }
        if (lastErr) throw lastErr;
        state = "ready"; touch();
        try { localStorage.removeItem(FAIL_KEY); } catch (e) { /* ignore */ }
      } catch (e) {
        kill(); failMsg = /unauthorized|401|403|not found|404|could not locate/i.test(e.message) ? "The model \"" + model + "\" was not found on Hugging Face. Clear the Model box in Settings to use the automatic choice." : e.message;
        try { localStorage.setItem(FAIL_KEY, String(Date.now())); } catch (x) { /* ignore */ }
        throw e;
      } finally { busy(false); loadingP = null; }
    })();
    return loadingP;
  }

  function chat(messages, o) {
    o = o || {};
    if (state !== "ready" || !w) return Promise.reject(new Error("Local AI is not loaded."));
    touch(); busy(true);
    const id = ++seq, worker = w;
    return new Promise((resolve, reject) => {
      let first = false, text = "";
      const finish = (fn, v) => { clearTimeout(ft); worker.removeEventListener("message", onMsg); busy(false); touch(); fn(v); };
      const ft = setTimeout(() => { if (!first) { worker.removeEventListener("message", onMsg); busy(false); kill(); reject(new Error("Local AI was too slow.")); } }, o.firstTokenMs || 15000);
      const onMsg = (e) => {
        const m = e.data;
        if (m.id !== id) return;
        if (m.type === "token") { first = true; text += m.text; if (o.onToken) o.onToken(m.text); }
        else if (m.type === "done") finish(resolve, m.text || text);
        else if (m.type === "error") finish(reject, new Error(m.message));
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ type: "chat", id, messages, max: o.maxTokens || 160 });
    });
  }

  window.JarvisLocalAI = {
    profile, enable, chat,
    ready: () => state === "ready",
    loading: () => !!loadingP,
    device: () => device,
    failed: () => failMsg || (function () { try { const t = +localStorage.getItem(FAIL_KEY); return t && Date.now() - t < 864e5 ? "A previous attempt failed on this device (tap Load now to retry)." : ""; } catch (e) { return ""; } })(),
    unload: kill,
    async deleteModel() { kill(); return window.caches ? caches.delete("transformers-cache") : false; },
  };
})();
