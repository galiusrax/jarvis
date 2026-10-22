/* Jarvis precision layer (offline): typo correction for commands + rigorous data analysis (lists and CSV) with error detection.
 * Loaded last so it wraps everything: it fixes typos first, then handles data requests, then hands over to the rest. */
(function () {
  "use strict";
  const O = window.JarvisOffline; if (!O) return;
  const base = O.respond, norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const VOCAB = ("weather forecast temperature calendar appointment appointments reminder reminders meeting remind tomorrow thursday tuesday wednesday friday saturday sunday monday note notes task tasks average median deviation analyze analyse analysis statistics outliers trend correlation summary briefing headlines news convert translate calculate percentage timer dentist doctor schedule " +
    "clothes clothing outfit recommendation recomendacion recommend umbrella clima tiempo fecha calendario recordatorio recordatorios reunion manana jueves martes miercoles viernes sabado domingo lunes nota notas tarea tareas promedio mediana desviacion analizar analisis estadisticas estadistica tendencia correlacion resumen noticias titulares convertir calcular temporizador dentista agenda").split(" ");
  const VSET = new Set(VOCAB);

  function dist(a, b) { // Damerau-Levenshtein (adjacent swaps count as one edit)
    const m = a.length, n = b.length, d = [];
    for (let i = 0; i <= m; i++) d[i] = [i]; for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function spell(raw) { // only fixes words that are clearly a mistyped command word (same first letter, unique closest match)
    const ch = [];
    const text = raw.replace(/[A-Za-zÀ-ÿñÑ]{6,}/g, (w) => {
      const n = norm(w); if (VSET.has(n)) return w;
      const lim = n.length >= 7 ? 2 : 1; let best = null, bd = 9, tie = false;
      for (const v of VOCAB) { if (v[0] !== n[0] || Math.abs(v.length - n.length) > lim) continue; const d = dist(n, v); if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd) tie = true; }
      if (best && bd <= lim && !tie) { ch.push([w, best]); return best; }
      return w;
    });
    return { text, ch };
  }

  // ---------- numbers
  const f = (x) => String(+Number(x).toPrecision(6)), NUM = /^-?\d+(\.\d+)?$/, FIX = { O: "0", o: "0", l: "1", I: "1", S: "5", B: "8", Z: "2" };
  const q = (s, p) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  function parseNums(text) {
    let t = text; const ct = t.split(/\s+/).filter((x) => /\d,\d/.test(x)), decOnly = ct.length >= 2 && ct.every((x) => /^\d+,\d{1,2}$/.test(x)); // "3,5 4,5 6,0" = decimal commas
    if (decOnly || /,\s|;|\n/.test(t)) t = t.replace(/(\d),(\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2");
    const vals = [], bad = [], fixed = [];
    t.split(/[\s,;]+/).forEach((tok) => {
      tok = tok.replace(/^[(\[]+|[)\].:!?]+$/g, ""); if (!tok) return;
      if (NUM.test(tok)) vals.push(+tok);
      else if (/^[\dOolISBZ.\-]*\d[\dOolISBZ.\-]*$/.test(tok) && /[OolISBZ]/.test(tok)) { const g = tok.replace(/[OolISBZ]/g, (c) => FIX[c]); if (NUM.test(g)) { vals.push(+g); fixed.push([tok, g]); } else bad.push(tok); }
    });
    return { vals, bad, fixed };
  }
  function describe(v) {
    const n = v.length, s = v.slice().sort((a, b) => a - b), sum = v.reduce((a, b) => a + b, 0), mean = sum / n, med = q(s, .5);
    const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0, q1 = q(s, .25), q3 = q(s, .75), iqr = q3 - q1;
    const mad = q(s.map((x) => Math.abs(x - med)).sort((a, b) => a - b), .5);
    const out = n < 5 ? [] : v.map((x, i) => [x, i]).filter(([x]) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr || (mad > 0 && Math.abs(.6745 * (x - med) / mad) > 3.5));
    const cnt = {}; v.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; }); const modes = Object.entries(cnt).filter((e) => e[1] > 1).sort((a, b) => b[1] - a[1]);
    let sx = 0, sy = 0, sxy = 0, sxx = 0; v.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sxx += i * i; });
    const den = n * sxx - sx * sx, slope = den ? (n * sxy - sx * sy) / den : 0, ic = (sy - slope * sx) / n;
    const ssr = v.reduce((a, y, i) => a + (y - ic - slope * i) ** 2, 0), sst = v.reduce((a, y) => a + (y - mean) ** 2, 0);
    return { n, sum, mean, med, sd, min: s[0], max: s[n - 1], q1, q3, out, modes, slope, ic, r2: sst ? 1 - ssr / sst : 0 };
  }
  function hint(x, med, es) { // an outlier ~10x/100x (or 1/10) the median often means a misplaced decimal
    if (!med) return ""; const r = x / med;
    return [10, 100, 1000, .1, .01].some((k) => Math.abs(r / k - 1) < .06) ? (es ? " (¿coma decimal mal puesta?)" : " (misplaced decimal?)") : "";
  }
  function lines(d, es, label) {
    const L = [], T = (e, s) => (es ? s : e);
    L.push(`${label ? label + ": " : ""}n=${d.n}, ${T("sum", "suma")} ${f(d.sum)}, ${T("mean", "media")} ${f(d.mean)}, ${T("median", "mediana")} ${f(d.med)}, ${T("std dev (sample)", "desv. estándar (muestral)")} ${f(d.sd)}`);
    L.push(`  min ${f(d.min)}, Q1 ${f(d.q1)}, Q3 ${f(d.q3)}, max ${f(d.max)}${d.mean ? `, CV ${f(100 * d.sd / Math.abs(d.mean))}%` : ""}`);
    if (d.modes.length) L.push("  " + T("Repeated values", "Valores repetidos") + ": " + d.modes.slice(0, 3).map((m) => `${m[0]} ×${m[1]}`).join(", "));
    if (d.out.length) L.push("  " + T("Possible outliers", "Posibles valores atípicos") + ": " + d.out.slice(0, 5).map(([x, i]) => `${f(x)} (#${i + 1})${hint(x, d.med, es)}`).join(", "));
    else if (d.n >= 5) L.push("  " + T("No outliers detected (IQR and robust z-score).", "Sin valores atípicos (IQR y z-score robusto)."));
    if (d.n >= 4) L.push("  " + T("Trend", "Tendencia") + `: ${d.slope >= 0 ? "+" : ""}${f(d.slope)} ${T("per step", "por paso")}, R²=${f(d.r2)}` + (d.r2 >= .5 ? `; ${T("next ≈", "siguiente ≈")} ${f(d.ic + d.slope * d.n)}` : ` (${T("weak, not predictive", "débil, no predictiva")})`));
    return L;
  }
  function numReport(p, es) {
    const T = (e, s) => (es ? s : e), L = [];
    if (p.fixed.length) L.push(T("Probable typos, read as numbers: ", "Posibles erratas, leídas como números: ") + p.fixed.map((x) => `${x[0]}→${x[1]}`).join(", "));
    if (p.bad.length) L.push(T("Ignored invalid entries: ", "Entradas inválidas ignoradas: ") + p.bad.join(", "));
    return L.concat(lines(describe(p.vals), es)).join("\n");
  }

  // ---------- CSV
  const MISSING = /^(|na|n\/a|nan|null|none|-|--)$/i;
  function parseCSV(text) {
    const ls = text.trim().split(/\r?\n/).filter((l) => l.trim()); if (ls.length < 3) return null;
    const dl = [",", ";", "\t", "|"].map((d) => [d, ls[0].split(d).length]).sort((a, b) => b[1] - a[1])[0]; if (dl[1] < 2) return null;
    const split = (l) => { const r = []; let c = "", qt = false; for (const ch of l) { if (ch === '"') qt = !qt; else if (ch === dl[0] && !qt) { r.push(c.trim()); c = ""; } else c += ch; } r.push(c.trim()); return r; };
    const rows = ls.map(split), w = rows[0].length; if (rows.filter((r) => r.length === w).length < rows.length * .8) return null;
    return { rows, w, dec: dl[0] !== "," };
  }
  function csvReport(text, es) {
    const c = parseCSV(text); if (!c) return null; const T = (e, s) => (es ? s : e);
    const cell = (x) => { x = c.dec ? x.replace(/(\d),(\d)/, "$1.$2") : x; return NUM.test(x) ? +x : NaN; };
    const hasHead = c.rows[0].every((x) => isNaN(cell(x))) && c.rows.slice(1).some((r) => r.some((x) => !isNaN(cell(x)))), head = hasHead ? c.rows[0] : c.rows[0].map((_, i) => "col" + (i + 1)), body = hasHead ? c.rows.slice(1) : c.rows, off = hasHead ? 2 : 1;
    const cols = head.map((h, j) => ({ h, j, v: body.map((r) => (r[j] === undefined ? "" : r[j])) }));
    const L = [T(`Table: ${body.length} rows × ${c.w} columns.`, `Tabla: ${body.length} filas × ${c.w} columnas.`)], numeric = [];
    const keys = body.map((r) => r.join("\u0001").toLowerCase()), dupRows = keys.length - new Set(keys).size;
    if (dupRows) L.push(T(`⚠ ${dupRows} duplicate row(s).`, `⚠ ${dupRows} fila(s) duplicada(s).`));
    cols.slice(0, 8).forEach((col) => {
      const miss = col.v.map((x, i) => (MISSING.test(x) ? i : -1)).filter((i) => i >= 0), present = col.v.map((x, i) => [x, i]).filter(([x]) => !MISSING.test(x));
      const nums = present.filter(([x]) => !isNaN(cell(x)));
      if (present.length && nums.length / present.length >= .8) {
        const vals = nums.map(([x]) => cell(x)); numeric.push({ col, vals: col.v.map((x) => (MISSING.test(x) ? NaN : cell(x))) });
        L.push(...lines(describe(vals), es, col.h));
        const wrong = present.filter(([x]) => isNaN(cell(x))); if (wrong.length) L.push("  ⚠ " + T("Non-numeric cells: ", "Celdas no numéricas: ") + wrong.slice(0, 5).map(([x, i]) => { const g = x.replace(/[OolISBZ]/g, (ch) => FIX[ch]); return `"${x}" (${T("row", "fila")} ${i + off})${NUM.test(g) ? " → " + g + "?" : ""}`; }).join(", "));
      } else {
        const uniq = {}; present.forEach(([x]) => { uniq[x] = (uniq[x] || 0) + 1; }); const u = Object.keys(uniq);
        L.push(`${col.h}: ${T("text", "texto")}, ${u.length} ${T("distinct", "distintos")}${u.length ? `, ${T("most common", "más común")} "${u.sort((a, b) => uniq[b] - uniq[a])[0]}"` : ""}`);
        const pairs = []; for (let a = 0; a < Math.min(u.length, 150); a++) for (let b = a + 1; b < Math.min(u.length, 150); b++) { const x = norm(u[a]).trim(), y = norm(u[b]).trim(); if (x.length >= 4 && dist(x, y) <= 1) pairs.push(`"${u[a]}" ≈ "${u[b]}"`); }
        if (pairs.length) L.push("  ⚠ " + T("Possible misspelt duplicates: ", "Posibles duplicados con errata: ") + pairs.slice(0, 4).join(", "));
      }
      if (miss.length) L.push(`  ⚠ ${miss.length} ${T("missing value(s), rows", "valor(es) vacío(s), filas")} ${miss.slice(0, 6).map((i) => i + off).join(", ")}${miss.length > 6 ? "…" : ""}`);
    });
    const cor = []; for (let a = 0; a < Math.min(numeric.length, 5); a++) for (let b = a + 1; b < Math.min(numeric.length, 5); b++) {
      const p = numeric[a].vals.map((x, i) => [x, numeric[b].vals[i]]).filter(([x, y]) => !isNaN(x) && !isNaN(y)); if (p.length < 5) continue;
      const mx = p.reduce((s, z) => s + z[0], 0) / p.length, my = p.reduce((s, z) => s + z[1], 0) / p.length;
      let sxy = 0, sxx = 0, syy = 0; p.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
      const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; if (Math.abs(r) >= .6) cor.push(`${numeric[a].col.h}–${numeric[b].col.h}: r=${f(r)}`);
    }
    if (cor.length) L.push(T("Correlations (|r|≥0.6; correlation is not causation): ", "Correlaciones (|r|≥0,6; correlación no implica causalidad): ") + cor.join(", "));
    return L.join("\n").slice(0, 3500);
  }
  window.JarvisAnalysis = { feedback, csv: csvReport, numbers: (t, es) => { const p = parseNums(t); return p.vals.length >= 3 ? numReport(p, es) : null; } };


  // ---------- questions the built-in brain cannot really answer: never reply with filler like "Pray continue"
  const FILLER = /pray continue|do go on|tell me more|what prompted that|i do beg your pardon|le ruego me disculpe|contin[uú]e,|ya veo|cu[eé]nteme m[aá]s/i;
  const QLEAD = /^(should|which|what|why|how|is|are|do|does|can|could|would|will|recommend|compare|choose|pick|better|prefer|cual|que|por que|como|conviene|recomienda|elige|prefieres|mejor|debo|puedo|vale la pena)\b/;
  const asksYou = (t) => { const n = norm(t), tail = n.slice(-110); return /\?/.test(n) || /\b(do|does|did|can|could|would|should|will|is|are|am)\s+(you|ya|u|she|he|they|i|it|this|that)\b/.test(tail) || /\b(you|ya)\s+(think|know|believe|feel|see|say)\b/.test(tail) || /\b(crees|piensas|opinas|sera que|me quiere|le gusto|debo|deberia|te parece)\b/.test(tail); }; // a question aimed at Jarvis, even without a question mark
  const isQuestion = (t) => { const n = norm(t).trim(), w = n.split(/\s+/).length; return w >= 3 && (/\?\s*$/.test(n) || QLEAD.test(n) || /\s(or|o)\s/.test(n) || asksYou(t)); };
  const STOP = new Set("so well hey jarvis please ok which what que cual is es better best mejor to eat have get pick choose buy take go with do you prefer would rather should i for me one like prefieres elige escoge recomiendas conviene debo comer pedir tomar elegir the el la un una a an".split(" "));
  const TAIL = new Set("today hoy now ahora tonight esta for para".split(" "));
  function choice(text) { // "A or B" / "A o B" -> [A, B]
    const raw = text.replace(/[¿?!¡.,;:]/g, " ").split(/\s+/).filter(Boolean), n = raw.map((x) => norm(x)), k = n.findIndex((x, i) => i > 0 && i < n.length - 1 && (x === "or" || x === "o" || x === "u"));
    if (k < 0) return null; let l = raw.slice(0, k), ln = n.slice(0, k); while (ln.length > 1 && STOP.has(ln[0])) { l.shift(); ln.shift(); }
    const r = []; for (let i = k + 1; i < raw.length && r.length < 3; i++) { if (TAIL.has(n[i])) break; r.push(raw[i]); }
    const left = l.slice(-2).join(" "), right = r.join(" "); return left && right ? [left, right] : null;
  }
  function needsBrain(text, es) {
    const GH = window.JarvisGH, c = choice(text), T = (e, s) => (es ? s : e), LA = window.JarvisLocalAI, ld = LA && LA.loading && LA.loading() ? T(" (My local language model is still loading and may help shortly.)", " (Mi modelo de lenguaje local aún se está cargando y podría ayudar pronto.)") : "";
    if (GH && GH.hasToken()) return T("My online brain is not answering just now (offline or rate-limited), sir. Please try again shortly.", "Mi cerebro en línea no responde por ahora (sin conexión o límite alcanzado), señor. Inténtelo de nuevo en un momento.");
    const hint = T("Save a GitHub token in Settings (Online brain) and I shall give you a proper comparison.", "Guarde un token de GitHub en Settings (Online brain) y le daré una comparación de verdad.");
    if (c) { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0; const pick = c[Math.abs(h) % 2];
      return T(`If I must pick, sir: ${pick}. Mind, that is a tie-break rather than expertise, as my analytical brain is not connected. ${hint}${ld}`, `Si debo elegir, señor: ${pick}. Eso sí, es un desempate y no un análisis, porque mi cerebro analítico no está conectado. ${hint}${ld}`); }
    return T(`That calls for real reasoning, sir, and my analytical brain is not connected yet. ${hint} Meanwhile I can manage notes, the calendar, data analysis, maths and lookups.${ld}`, `Eso requiere razonamiento de verdad, señor, y mi cerebro analítico aún no está conectado. ${hint} Mientras tanto puedo ayudar con notas, calendario, análisis de datos, cálculos y consultas.${ld}`);
  }


  // ---------- writing feedback (offline): form, clarity and mechanics. Content and tone are left to the online brain.
  const SW_EN = new Set("the and that with this from have were been their they there would about which when what your will into than then them these those just very really also more some such only over other could should because while where being does done each most much many after before again against".split(" "));
  const SW_ES = new Set("para como pero porque cuando donde desde hasta entre sobre tambien esto esta este estos estas esas esos aqui allí ellos ellas nosotros tiene tienen hacer hace ser fue fueron todo todos toda todas muy mas menos solo otro otra otros otras cada mismo misma cual cuales quien".split(" "));
  const FILL_EN = new Set("very really just actually basically literally quite maybe stuff things thing".split(" ")), FILL_ES = new Set("muy realmente basicamente literalmente tipo cosas cosa entonces bueno".split(" "));
  const syl = (w, es) => { w = w.toLowerCase(); if (es) return Math.max(1, (w.match(/[aeiouáéíóúü]+/g) || []).length); let c = (w.replace(/[^a-z]/g, "").match(/[aeiouy]+/g) || []).length; if (/[^l]e$/.test(w) && c > 1) c--; return Math.max(1, c); };
  function feedback(text, es0) {
    let body = text.replace(/^\s*(?:please\s+|por favor\s+)?(?:(?:can you |could you |give me |dame |quiero |necesito )+)?(?:feedback|review|critique|your thoughts|thoughts|proofread|retroalimentaci[oó]n|comentarios|revisa|corrige|qu[eé] te parece)(?:\s+(?:on|about|of|sobre|de|del|a))?\s*(?:this|my|el|mi|este|esta)?\s*(?:texto?|writing|essay|ensayo|paragraph|p[aá]rrafo)?\s*[:\-]?\s*/i, "").trim();
    const words = body.match(/[\p{L}\p{N}'’-]+/gu) || [], n = words.length; if (n < 12) return null;
    const lw = words.map((w) => norm(w)), es = es0 === undefined ? lw.filter((w) => SW_ES.has(w) || /^(el|la|los|las|de|en|que|y|un|una|es|por|con|se|del)$/.test(w)).length > lw.filter((w) => SW_EN.has(w) || /^(the|of|and|to|a|in|is|it|you|for|on|are)$/.test(w)).length : es0;
    const T = (e, sp) => (es ? sp : e), sents = body.split(/(?<=[.!?…])\s+|\n+/).map((x) => x.trim()).filter(Boolean), sl = sents.map((x) => (x.match(/[\p{L}\p{N}'’-]+/gu) || []).length);
    const avg = n / sents.length, longest = Math.max(...sl), sd = Math.sqrt(sl.reduce((a, b) => a + (b - avg) ** 2, 0) / sl.length), sy = words.reduce((a, w) => a + syl(w, es), 0);
    const score = es ? 206.84 - 0.6 * (100 * sy / n) - 1.02 * (100 * sents.length / n) : 206.835 - 1.015 * avg - 84.6 * (sy / n);
    const level = score >= 70 ? T("easy to read", "fácil de leer") : score >= 50 ? T("standard", "de dificultad media") : score >= 30 ? T("fairly demanding", "bastante exigente") : T("very demanding", "muy exigente");
    const good = [], fix = [], SW = es ? SW_ES : SW_EN, FL = es ? FILL_ES : FILL_EN;
    const cnt = {}; lw.forEach((w) => { if (w.length >= 5 && !SW.has(w)) cnt[w] = (cnt[w] || 0) + 1; });
    const rep = Object.entries(cnt).filter((e) => e[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => `"${e[0]}" ×${e[1]}`);
    const dbl = [...new Set((body.match(/\b(\p{L}{2,})\s+\1\b/giu) || []).map((x) => x.toLowerCase()))].slice(0, 3);
    const lowStart = sents.filter((x) => /^\p{Ll}/u.test(x)).length, noEnd = sents.filter((x, i) => i === sents.length - 1 && !/[.!?…"”)]$/.test(x)).length;
    const missSp = (body.match(/\p{Ll}[,;:]\p{L}/gu) || []).length, caps = words.filter((w) => w.length >= 4 && w === w.toUpperCase() && /\p{L}/u.test(w)).length, bang = (body.match(/[!?]{2,}/g) || []).length;
    const fills = lw.filter((w) => FL.has(w)).length, passive = es ? 0 : (body.match(/\b(?:is|are|was|were|been|being|be)\s+\w+ed\b/gi) || []).length, loneI = es ? 0 : (body.match(/(?:^|[\s(])i(?=[\s,.!?'])/g) || []).length;
    const longN = sl.filter((x) => x > 30).length;
    if (avg >= 9 && avg <= 22) good.push(T("Sentence length is comfortable.", "El largo de las oraciones es cómodo."));
    if (sents.length >= 4 && sd >= 5) good.push(T("Good rhythm: sentence lengths vary.", "Buen ritmo: el largo de las oraciones varía."));
    if (!lowStart && !missSp && !dbl.length && !caps && !loneI) good.push(T("Clean mechanics: capitals, spacing and repeated words look fine.", "Mecánica limpia: mayúsculas, espacios y palabras repetidas se ven bien."));
    if (longN) fix.push(T(`${longN} sentence(s) run past 30 words (longest ${longest}). Split them in two.`, `${longN} oración(es) pasan de 30 palabras (la más larga ${longest}). Divídelas en dos.`));
    if (avg < 7 && sents.length >= 4) fix.push(T("Sentences are very short and may read choppy; join a few.", "Las oraciones son muy cortas y pueden sonar entrecortadas; une algunas."));
    if (dbl.length) fix.push(T("Repeated words in a row (likely typos): ", "Palabras repetidas seguidas (posibles erratas): ") + dbl.map((x) => `"${x}"`).join(", "));
    if (rep.length) fix.push(T("Overused words: ", "Palabras muy repetidas: ") + rep.join(", ") + T(". Vary them or cut some.", ". Varíalas o elimina algunas."));
    if (lowStart) fix.push(T(`${lowStart} sentence(s) start in lowercase.`, `${lowStart} oración(es) empiezan con minúscula.`));
    if (loneI) fix.push(T('Write the pronoun "I" in capitals.', 'Escribe el pronombre "I" en mayúscula.'));
    if (noEnd) fix.push(T("The text ends without closing punctuation.", "El texto termina sin signo de puntuación final."));
    if (missSp) fix.push(T(`${missSp} place(s) are missing a space after a comma, colon or semicolon.`, `Faltan espacios después de coma, dos puntos o punto y coma en ${missSp} lugar(es).`));
    if (caps >= 2) fix.push(T("Several ALL-CAPS words read as shouting; use them sparingly.", "Varias palabras en MAYÚSCULAS suenan a grito; úsalas poco."));
    if (bang) fix.push(T("Repeated !! or ?? marks; one is enough.", "Signos repetidos (!! o ??); basta con uno."));
    if (fills / n > 0.03) fix.push(T("Many filler words (" + [...new Set(lw.filter((w) => FL.has(w)))].slice(0, 4).join(", ") + "); cutting them makes it sharper.", "Muchas muletillas (" + [...new Set(lw.filter((w) => FL.has(w)))].slice(0, 4).join(", ") + "); quitarlas lo hace más directo."));
    if (passive >= 3) fix.push(T(`${passive} passive constructions; active voice is usually clearer.`, `${passive} construcciones pasivas; la voz activa suele ser más clara.`));
    if (score < 30) fix.push(T("It is quite dense; shorter sentences and simpler words would help.", "Es bastante denso; oraciones más cortas y palabras más simples ayudarían."));
    const L = [T("Feedback on your text (automatic review of form):", "Retroalimentación de tu texto (revisión automática de la forma):"),
      T(`- ${n} words, ${sents.length} sentence(s), about ${f(avg)} words each; readability ${level} (approx. ${Math.round(score)}/100).`, `- ${n} palabras, ${sents.length} oración(es), unas ${f(avg)} palabras cada una; lectura ${level} (aprox. ${Math.round(score)}/100).`)];
    if (good.length) L.push(T("What works:", "Lo que funciona:"), ...good.map((x) => "  + " + x));
    L.push(fix.length ? T("To improve:", "Para mejorar:") : T("Nothing needs fixing on form.", "No hay nada que corregir en la forma."), ...fix.slice(0, 6).map((x) => "  - " + x));
    L.push(T("This reviews form only. For feedback on ideas, tone and structure, save a GitHub token in Settings (Online brain).", "Esto revisa solo la forma. Para opinar sobre ideas, tono y estructura, guarda un token de GitHub en Settings (Online brain)."));
    return L.join("\n");
  }

  const KW = /\b(analy[sz]e|analiz\w*|statistics|stats|estadist\w*|average|promedio|median|mediana|deviation|desviacion|outliers?|atipicos?|trend|tendencia|correlation|correlacion)\b/;
  O.respond = async function (raw, tools, opts) {
    raw = raw.replace(/^(?:ya|u)\s+(like|love|know|want|think|play|watch|speak|have|got)\b/i, "do you $1").replace(/\b(do|did|would|can|could|are|will|how|what|why)\s+(ya|u)\b/gi, "$1 you").replace(/\b(ya|u)\s+(like|think|know|want|feel|mean|get|love|believe|sound|have)\b/gi, "you $2").replace(/\bur\b/gi, "your").replace(/\b(pls|plz)\b/gi, "please").replace(/\b(thx|ty)\b/gi, "thanks"); // chat slang
    const sp = (raw.match(/\S+/g) || []).length <= 8 ? spell(raw) : { text: raw, ch: [] }, es = /[¿¡ñáéíóú]/i.test(raw) || /\b(analiza|analizar|promedio|mediana|desviacion|datos|revisa|errores|tendencia)\b/.test(norm(sp.text));
    const pre = sp.ch.length ? (es ? "Interpreté " : "I read ") + sp.ch.map((c) => `«${c[0]}»→«${c[1]}»`).join(", ") + ".\n" : "";
    const wc = (raw.match(/\S+/g) || []).length, GHon = window.JarvisGH && window.JarvisGH.has(), FB = /\b(feedback|review|critique|opinion|thoughts|proofread|retroalimentaci\w*|comentarios|revisa|corrige|que te parece|opina)\b/.test(norm(sp.text));
    if (FB && wc < 8 && /^(?:please |por favor |can you |could you |give me |dame |quiero )*(?:feedback|review|critique|retroalimentaci|revisa|corrige)/.test(norm(sp.text).trim())) return pre + (es ? "Pegue el texto después de los dos puntos, señor (por ejemplo: feedback: su texto aquí) y lo reviso." : "Paste the text after a colon, sir (for example: feedback: your text here) and I shall review it.");
    if (FB && wc >= 12 && GHon && opts && opts.strict) return null; // the online brain reviews it, not an instant rule
    if (FB && wc >= 12 && !GHon) { const r = feedback(raw, es); if (r) return pre + r; }
    const csv = csvReport(raw, es); if (csv) return pre + csv;
    if (KW.test(norm(sp.text))) { const p = parseNums(raw); if (p.vals.length >= 3 && (p.vals.length / wc >= 0.4 || wc <= 25)) return pre + numReport(p, es); } // prose with a few years in it is not a data set
    const out = await base(sp.text, tools, opts);
    if (typeof out === "string" && FILLER.test(out) && isQuestion(sp.text)) return pre + needsBrain(sp.text, es);
    if (typeof out === "string" && FILLER.test(out) && wc >= 35 && !asksYou(raw) && !GHon) { const r = feedback(raw, es); if (r) return pre + (es ? "Eso parece un texto para revisar, así que aquí va mi retroalimentación:\n" : "That reads like a text for review, so here is my feedback:\n") + r; }
    return pre && typeof out === "string" ? pre + out : out;
  };
})();
