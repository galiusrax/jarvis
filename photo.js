/* Jarvis file analysis (offline): photos -> size, brightness, contrast, sharpness, dominant colours; optional OCR; text/CSV files.
 * Nothing is uploaded anywhere. OCR loads Tesseract.js once (needs a connection the first time, then it is cached). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id), O = window.JarvisOffline, base = O && O.respond;
  const es = (navigator.language || "en").slice(0, 2) === "es", T = (e, s) => (es ? s : e);
  let last = null, lastData = "", lastAt = 0; const G = window.JarvisGH;
  const NAMES = [["black", "negro", 20, 20, 20], ["white", "blanco", 240, 240, 240], ["gray", "gris", 128, 128, 128], ["red", "rojo", 210, 40, 40], ["orange", "naranja", 240, 140, 30], ["yellow", "amarillo", 240, 220, 50], ["green", "verde", 50, 160, 70], ["cyan", "celeste", 60, 190, 220], ["blue", "azul", 40, 70, 200], ["purple", "morado", 130, 60, 170], ["pink", "rosado", 240, 130, 180], ["brown", "café", 120, 80, 50], ["beige", "beige", 215, 195, 160]];
  const cname = (r, g, b) => { let best = NAMES[0], bd = 1e9; for (const c of NAMES) { const d = (c[2] - r) ** 2 + (c[3] - g) ** 2 + (c[4] - b) ** 2; if (d < bd) { bd = d; best = c; } } return es ? best[1] : best[0]; };

  function post(kind, text, node) {
    const el = document.createElement("div"), log = $("log"); el.className = "msg " + kind;
    if (node) el.appendChild(node); if (text) el.appendChild(document.createTextNode(text));
    log.appendChild(el); while (log.children.length > 80) log.removeChild(log.firstChild); log.scrollTop = log.scrollHeight; return el;
  }
  function analyze(img, f) {
    const W = img.naturalWidth, H = img.naturalHeight, s = Math.min(1, 160 / Math.max(W, H)), w = Math.max(3, Math.round(W * s)), h = Math.max(3, Math.round(H * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), bins = {}; let sum = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const y = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; L[p] = y; sum += y;
      const k = (d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6), b = bins[k] || (bins[k] = [0, 0, 0, 0]); b[0]++; b[1] += d[i]; b[2] += d[i + 1]; b[3] += d[i + 2];
    }
    const N = w * h, mean = sum / N; let v = 0; for (let p = 0; p < N; p++) v += (L[p] - mean) ** 2; const sd = Math.sqrt(v / N);
    let lv = 0, lc = 0; for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) { const p = yy * w + xx, l = 4 * L[p] - L[p - 1] - L[p + 1] - L[p - w] - L[p + w]; lv += l * l; lc++; }
    const sharp = Math.sqrt(lv / Math.max(1, lc));
    const top = Object.values(bins).sort((a, b) => b[0] - a[0]).slice(0, 4).map((b) => [cname(b[1] / b[0], b[2] / b[0], b[3] / b[0]), Math.round((100 * b[0]) / N)]);
    const names = [...new Map(top.map((t) => [t[0], t])).values()];
    const kb = f.size / 1024, size = kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.round(kb) + " KB";
    const lines = [
      T("A quick look (done on your device):", "Un vistazo rápido (hecho en tu dispositivo):"),
      `- ${T("Brightness", "Brillo")}: ${mean < 70 ? T("dark", "oscura") : mean > 185 ? T("very bright", "muy clara") : T("balanced", "equilibrada")} (${Math.round(mean / 2.55)}%); ${T("contrast", "contraste")}: ${sd < 35 ? T("low", "bajo") : sd > 70 ? T("high", "alto") : T("medium", "medio")}`,
      `- ${T("Main colours", "Colores principales")}: ${names.map((t) => `${t[0]} ${t[1]}%`).join(", ")}`,
      T('To really interpret what is in the photo, save a GitHub token in Settings (Online brain). Say "read the text" to extract any writing in it.', 'Para interpretar de verdad lo que hay en la foto, guarda un token de GitHub en Settings (Online brain). Di "lee el texto" para extraer cualquier texto.'),
    ];
    return lines.join("\n");
  }
  const PROMPT = () => T("Look at this photo and interpret it for me in plain language: what is happening, the scene and setting, the people (describe them, never identify anyone), the key objects, any readable text, the mood, and anything notable or unusual. No technical details about the file or image quality. Answer in English.", "Mira esta foto e interprétala en lenguaje sencillo: qué está pasando, la escena y el lugar, las personas (descríbelas, nunca identifiques a nadie), los objetos clave, cualquier texto legible, el ambiente y cualquier cosa notable o inusual. Sin detalles técnicos del archivo ni de la calidad de la imagen. Responde en español.");
  function shrink(img) { try { const s = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.82); } catch (e) { return ""; } }
  async function interpret(question) {
    if (!lastData) return T("I could not prepare that photo for viewing.", "No pude preparar esa foto para verla.");
    try { return await G.vision(lastData, question); } catch (e) { return e.message; }
  }
  function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("script")); document.head.appendChild(s); }); }
  async function ocr() {
    if (!last) return T("Attach a photo first with the 📎 button.", "Primero adjunta una foto con el botón 📎.");
    if (!window.Tesseract) { try { await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"); } catch (e) { return T("The text reader needs a connection the first time to download. Please try again online.", "El lector de texto necesita conexión la primera vez para descargarse. Inténtalo de nuevo con internet."); } }
    try {
      const r = await Tesseract.recognize(last, es ? "spa+eng" : "eng"), txt = (r.data.text || "").trim();
      return txt ? T("Text found:\n", "Texto encontrado:\n") + txt.slice(0, 3000) : T("I found no readable text in that image.", "No encontré texto legible en esa imagen.");
    } catch (e) { return T("The text reader failed: ", "El lector de texto falló: ") + (e.message || e); }
  }
  async function textFile(f) {
    const t = (await f.text()).slice(0, 2e5), words = (t.match(/\S+/g) || []).length, lines = t.split(/\r?\n/).length;
    let out = T(`File ${f.name}: ${words} words, ${lines} lines.\n`, `Archivo ${f.name}: ${words} palabras, ${lines} líneas.\n`) + t.slice(0, 300).trim() + (t.length > 300 ? "…" : "");
    if (/\.csv$/i.test(f.name) && window.JarvisAnalysis) { const r = window.JarvisAnalysis.csv(t, es); if (r) return r; }
    if (/\.(txt|md)$/i.test(f.name) && window.JarvisAnalysis && !(G && G.has())) { const r = window.JarvisAnalysis.feedback(t, es); if (r) return out + "\n\n" + r; }
    const nums = (t.match(/-?\d+(?:\.\d+)?/g) || []).slice(0, 500);
    if (nums.length >= 3 && O) { try { out += "\n\n" + await O.respond("analyze " + nums.join(" "), { call: async () => ({}) }, { strict: false }); } catch (e) { /* skip */ } }
    return out;
  }
  const inp = $("file");
  if (inp) inp.addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 15e6) return post("error", T("That file is too large (15 MB maximum).", "Ese archivo es demasiado grande (máximo 15 MB)."));
    if (f.type.startsWith("image/")) {
      const im = new Image(), url = URL.createObjectURL(f); im.className = "thumb";
      im.onload = async () => {
        last = f; lastAt = Date.now(); lastData = shrink(im);
        if (G && G.has() && lastData) { post("jarvis", T("Let me take a look…", "Déjame mirar…")); post("jarvis", await interpret(PROMPT())); } else post("jarvis", analyze(im, f));
      };
      im.onerror = () => { URL.revokeObjectURL(url); post("error", T("I could not open that image format. Try JPG, PNG or WebP.", "No pude abrir ese formato. Prueba JPG, PNG o WebP.")); };
      im.src = url; post("user", "📎 " + f.name, im);
    } else if (/^text\/|\.(txt|md|csv)$/i.test(f.type + f.name)) {
      post("user", "📎 " + f.name); const rep = await textFile(f); post("jarvis", rep);
      if (G && G.has()) { // the local report is exact; the online brain adds the interpretation
        post("jarvis", T("Analysing it in depth…", "Analizándolo a fondo…"));
        try { post("jarvis", await G.ask([{ role: "system", content: "You are a careful data analyst. Reply in the user's language, concisely." }, { role: "user", content: "Analyse this file like an analyst: what it is about, the key findings, anything odd or likely to be a data-entry error, and what to check next. Exact statistics already computed on the device:\n" + rep + "\n\nFile content (truncated):\n" + (await f.text()).slice(0, 12000) }], { maxTokens: 700 })); }
        catch (e) { post("error", e.message); }
      }
    }
    else post("error", T("I can analyse photos and .txt, .md or .csv files.", "Puedo analizar fotos y archivos .txt, .md o .csv."));
  });
  if (O) O.respond = async function (raw, tools, opts) {
    const n = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (G && G.has() && lastData && Date.now() - lastAt < 6e5 && (/\b(photo|picture|image|pic|foto|imagen|fotografia)\b/.test(n) || /^(what|who|where|what's|que|donde|quien)\b.*\b(this|that|it|esto|eso)\b/.test(n))) return interpret(raw + "\n\n" + T("(Answer about the photo I sent earlier, in English.)", "(Responde sobre la foto que envié antes, en español.)"));
    if (/^ocr\b/.test(n) || /\b(read|extract|lee|leer|extrae|extraer)\b.*\b(text|texto|words|palabras)\b/.test(n)) return ocr();
    return base(raw, tools, opts);
  };
})();
