/* Jarvis offline brain: heuristic intent rules + local math/statistics. No network, no AI model.
 * Used automatically when every AI provider fails (or no key is set). English + Spanish. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.JarvisOffline = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const f = (x) => String(+Number(x).toFixed(2));
  const ES = new Set("llamo llamame nombre soy vivo que como cual cuanto cuantos clima hora fecha nota notas dias hasta promedio media muestra dime hola gracias por favor mis mi el la los las de en para es hay tengo cuando donde dame cuales estoy muy triste soy quiero necesito puedes cuentame chiste dato curioso noches tardes ayer hoy manana cansado cansada feliz bien mal contento aburrido adios chao bueno buena porque con sin pero tambien yo tu usted nos hambre".split(" "));
  const EN = new Set("the what how is are my show me in of for to and please weather time notes today give much many i m feeling sad happy hungry tired good great fine thanks hello hi hey you your very really".split(" "));
  const TZ = { tokyo: "Asia/Tokyo", london: "Europe/London", londres: "Europe/London", madrid: "Europe/Madrid", paris: "Europe/Paris", berlin: "Europe/Berlin", "new york": "America/New_York", "nueva york": "America/New_York", "los angeles": "America/Los_Angeles", santiago: "America/Santiago", "mexico city": "America/Mexico_City", mexico: "America/Mexico_City", "buenos aires": "America/Argentina/Buenos_Aires", bogota: "America/Bogota", lima: "America/Lima", "sao paulo": "America/Sao_Paulo", sydney: "Australia/Sydney", dubai: "Asia/Dubai" };
  const UNITS = { km: [1000, "l"], m: [1, "l"], cm: [.01, "l"], mm: [.001, "l"], mi: [1609.344, "l"], ft: [.3048, "l"], in: [.0254, "l"], yd: [.9144, "l"], kg: [1, "w"], g: [.001, "w"], lb: [.45359237, "w"], oz: [.028349523, "w"], l: [1, "v"], ml: [.001, "v"], gal: [3.785411784, "v"], c: [0, "t"], f: [0, "t"] };
  const ALIAS = { kilometers: "km", kilometres: "km", kilometros: "km", kilometro: "km", meters: "m", metres: "m", metros: "m", metro: "m", miles: "mi", mile: "mi", milla: "mi", millas: "mi", feet: "ft", foot: "ft", pies: "ft", pie: "ft", inches: "in", inch: "in", pulgadas: "in", pulgada: "in", kilograms: "kg", kilogramos: "kg", kilos: "kg", kilo: "kg", pounds: "lb", pound: "lb", lbs: "lb", libras: "lb", libra: "lb", ounces: "oz", onzas: "oz", grams: "g", gramos: "g", liters: "l", litres: "l", litros: "l", litro: "l", gallons: "gal", galones: "gal", celsius: "c", fahrenheit: "f", centimeters: "cm", centimetros: "cm", yards: "yd" };

  // ---- safe arithmetic (recursive descent, never uses eval)
  function calc(src) {
    const tok = src.match(/\d+\.?\d*|\.\d+|sqrt|[()+\-*/^]/g) || []; let i = 0;
    const peek = () => tok[i], next = () => tok[i++];
    function expr() { let v = term(); while (peek() === "+" || peek() === "-") v = next() === "+" ? v + term() : v - term(); return v; }
    function term() { let v = pow(); while (peek() === "*" || peek() === "/") v = next() === "*" ? v * pow() : v / pow(); return v; }
    function pow() { const b = unary(); if (peek() === "^") { next(); return Math.pow(b, pow()); } return b; }
    function unary() { if (peek() === "-") { next(); return -unary(); } if (peek() === "+") { next(); return unary(); } return atom(); }
    function atom() {
      const t = next();
      if (t === "(") { const v = expr(); if (next() !== ")") throw new Error("paren"); return v; }
      if (t === "sqrt") return Math.sqrt(atom());
      const v = parseFloat(t); if (isNaN(v)) throw new Error("num"); return v;
    }
    const v = expr(); if (i !== tok.length) throw new Error("trailing"); return v;
  }
  function mathFrom(n) {
    const s = n.replace(/square root of|raiz cuadrada de/g, " sqrt ").replace(/to the power of|elevado a/g, "^").replace(/squared|al cuadrado/g, "^2")
      .replace(/\b(plus|mas)\b/g, "+").replace(/\b(minus|menos)\b/g, "-").replace(/\b(times|multiplied by|por)\b|×/g, "*")
      .replace(/(\d)\s*x\s*(\d)/g, "$1*$2").replace(/\b(divided by|entre|sobre)\b|÷/g, "/");
    const found = (s.match(/(?:sqrt|[\d.+\-*/^()\s])+/g) || []).map((x) => x.trim()).filter((x) => /\d/.test(x) && (/[+\-*/^]|sqrt/.test(x)));
    found.sort((a, b) => b.length - a.length);
    for (const c of found) { try { const v = calc(c); if (isFinite(v)) return { expr: c, v }; } catch (e) { /* try next */ } }
    return null;
  }

  // ---- statistics / data analysis
  const pctl = (a, p) => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  function analyze(nums, labeled, say) {
    const n = nums.length, s = [...nums].sort((a, b) => a - b), sum = nums.reduce((a, b) => a + b, 0), mean = sum / n;
    const sd = n > 1 ? Math.sqrt(nums.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
    const q1 = pctl(s, .25), med = pctl(s, .5), q3 = pctl(s, .75), iqr = q3 - q1;
    const out = nums.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr);
    const cnt = {}; nums.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
    const top = Math.max(...Object.values(cnt)), mode = top > 1 ? Object.keys(cnt).filter((k) => cnt[k] === top).join(", ") : null;
    const xm = (n - 1) / 2; let sxy = 0, sxx = 0, syy = 0;
    nums.forEach((y, i) => { sxy += (i - xm) * (y - mean); sxx += (i - xm) ** 2; syy += (y - mean) ** 2; });
    const slope = sxx ? sxy / sxx : 0, r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0, next = mean + slope * (n - xm);
    const dir = Math.abs(slope) < (sd || 1) * .05 ? say("flat", "estable") : slope > 0 ? say("rising", "creciente") : say("falling", "decreciente");
    const L = [
      say(`Analysis of ${n} values:`, `Análisis de ${n} valores:`),
      say(`Sum ${f(sum)} | mean ${f(mean)} | median ${f(med)}` + (mode ? ` | mode ${mode}` : ""), `Suma ${f(sum)} | media ${f(mean)} | mediana ${f(med)}` + (mode ? ` | moda ${mode}` : "")),
      say(`Min ${f(s[0])} | max ${f(s[n - 1])} | range ${f(s[n - 1] - s[0])} | std dev ${f(sd)}`, `Mín ${f(s[0])} | máx ${f(s[n - 1])} | rango ${f(s[n - 1] - s[0])} | desv. est. ${f(sd)}`),
      say(`Quartiles ${f(q1)} / ${f(med)} / ${f(q3)}`, `Cuartiles ${f(q1)} / ${f(med)} / ${f(q3)}`),
      out.length ? say(`Possible outliers: ${out.map(f).join(", ")}`, `Posibles valores atípicos: ${out.map(f).join(", ")}`) : say("No outliers detected.", "Sin valores atípicos."),
    ];
    if (n >= 3) L.push(say(`Trend (in order): ${dir}, slope ${f(slope)} per step, fit R² ${f(r2)}. Linear forecast for the next value: ${f(next)}.`,
      `Tendencia (en orden): ${dir}, pendiente ${f(slope)} por paso, ajuste R² ${f(r2)}. Pronóstico lineal del siguiente valor: ${f(next)}.`));
    if (labeled && labeled.length >= 3) {
      const hi = labeled.reduce((a, b) => (b[1] > a[1] ? b : a)), lo = labeled.reduce((a, b) => (b[1] < a[1] ? b : a));
      L.push(say(`Highest: ${hi[0]} (${f(hi[1])}). Lowest: ${lo[0]} (${f(lo[1])}).`, `Mayor: ${hi[0]} (${f(hi[1])}). Menor: ${lo[0]} (${f(lo[1])}).`));
    }
    return L.join("\n");
  }

  function analyzeNotes(lines, say) {
    if (!lines.length) return say(`You have no notes on file as yet, ${say.A || "sir"}.`, `Aún no tiene notas anotadas, ${say.A || "señor"}.`);
    const tags = {}, days = {}, wc = {}, stop = new Set("that this with from have para pero como esto esta una unos the and for you your".split(" "));
    for (const l of lines) {
      const m = l.match(/^- (\d{4}-\d{2}-\d{2}) \d{2}:\d{2}(?: #([\w-]+))? - (.*)$/);
      if (!m) continue;
      days[m[1]] = (days[m[1]] || 0) + 1; if (m[2]) tags[m[2]] = (tags[m[2]] || 0) + 1;
      strip(m[3].toLowerCase()).split(/\W+/).filter((w) => w.length > 3 && !stop.has(w)).forEach((w) => { wc[w] = (wc[w] || 0) + 1; });
    }
    const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, b]) => `${a} (${b})`).join(", ") || "-";
    return [say(`${lines.length} notes across ${Object.keys(days).length} days.`, `${lines.length} notas en ${Object.keys(days).length} días.`),
      say(`Busiest day: ${top(days, 1)}`, `Día con más notas: ${top(days, 1)}`), say(`Tags: ${top(tags, 5)}`, `Etiquetas: ${top(tags, 5)}`),
      say(`Frequent words: ${top(wc, 6)}`, `Palabras frecuentes: ${top(wc, 6)}`), say(`Latest: ${lines[lines.length - 1]}`, `Última: ${lines[lines.length - 1]}`)].join("\n");
  }

  // ---- semantic-ish note retrieval: light stemming + synonym groups (EN/ES) + TF-IDF ranking
  const STOP = new Set("what when where who which did do does have has had need needs i my me mine the a an of about on in to for is are was and or note notes noted que cuando donde quien cual cuales tengo mi mis el la los las un una de del sobre en por para es son y o nota notas anote guarde apunte dime muestrame show tell give find search busca how muestra mostrar lista ver list display from today yesterday hoy ayer this week last semana esta pasada all any some with that these those".split(" "));
  const GROUPS = ["buy purchase shop shopping store comprar compra compras mercado super supermercado", "meeting reunion meet cita appointment call llamar llamada phone", "doctor dentist dentista medico hospital clinic salud checkup", "study exam homework estudiar examen prueba tarea class clase universidad test", "money pay payment bill pagar pago cuenta factura dinero rent arriendo", "gym workout train entrenar entrenamiento ejercicio correr run", "idea project proyecto plan", "birthday cumpleanos gift regalo party fiesta", "travel trip viaje flight vuelo hotel", "food eat dinner lunch comida almuerzo cena cook cocinar"].map((g) => g.split(" "));
  const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|ly|mente|ando|iendo|es|s)$/, "") : w);
  const GMAP = {}; GROUPS.forEach((g, i) => g.forEach((w) => { GMAP[stem(w)] = "g" + i; }));
  function terms(text) {
    const out = [];
    for (const w of strip(text.toLowerCase()).split(/[^a-z0-9]+/)) {
      if (w.length < 3 || STOP.has(w)) continue;
      const t = stem(w); out.push(t); if (GMAP[t]) out.push(GMAP[t]);
    }
    return out;
  }
  function rank(q, lines) {
    const docs = lines.map((l) => ({ l, t: terms(l.replace(/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}/, "")) })), df = {};
    docs.forEach((d) => new Set(d.t).forEach((t) => { df[t] = (df[t] || 0) + 1; }));
    return docs.map((d) => {
      let s = 0;
      for (const t of new Set(q)) { const tf = d.t.filter((x) => x === t).length; if (tf) s += Math.log(1 + docs.length / df[t]) * (1 + Math.log(tf)); }
      return { l: d.l, s };
    }).sort((a, b) => b.s - a.s);
  }
  function dateRange(n) {
    const now = new Date(), p2 = (x) => String(x).padStart(2, "0");
    const day = (k) => { const d = new Date(now); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
    const mon = -((now.getDay() + 6) % 7);
    if (/\b(today|hoy)\b/.test(n)) return [day(0), day(0)];
    if (/\b(yesterday|ayer)\b/.test(n)) return [day(-1), day(-1)];
    if (/\b(this week|esta semana)\b/.test(n)) return [day(mon), day(0)];
    if (/\b(last week|semana pasada)\b/.test(n)) return [day(mon - 7), day(mon - 1)];
    return null;
  }
  async function fromNotes(n, say, call, strict) {
    const r = await call("list_notes", { limit: 100 }); let lines = (r && r.notes) || [];
    if (!lines.length) return strict ? null : say(`You have no notes on file as yet, ${say.A || "sir"}.`, `Aún no tiene notas anotadas, ${say.A || "señor"}.`);
    const range = dateRange(n), tm = n.match(/#([\w-]+)/);
    if (range) lines = lines.filter((l) => l.slice(2, 12) >= range[0] && l.slice(2, 12) <= range[1]);
    if (tm) lines = lines.filter((l) => l.includes("#" + tm[1]));
    const q = terms(n.replace(/#[\w-]+/g, ""));
    let hits = lines;
    if (q.length) hits = rank(q, lines).filter((x) => x.s > 0).slice(0, 3).map((x) => x.l);
    else if (strict && !range && !tm) return null;
    if (!hits.length) return strict ? null : say("I found no matching notes.", "No encontré notas relacionadas.");
    return say(`From your notes, ${say.A || "sir"}:\n`, `De sus notas, ${say.A || "señor"}:\n`) + hits.slice(-10).join("\n");
  }

  // ---- web knowledge: several free sources, follow-ups and light conversation context
  const ctx = { last: null, more: null };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const CUR = { dollar: "USD", dollars: "USD", dolar: "USD", dolares: "USD", usd: "USD", euro: "EUR", euros: "EUR", eur: "EUR", clp: "CLP", "peso chileno": "CLP", "pesos chilenos": "CLP", mxn: "MXN", "peso mexicano": "MXN", "pesos mexicanos": "MXN", ars: "ARS", "peso argentino": "ARS", "pesos argentinos": "ARS", cop: "COP", "peso colombiano": "COP", "pesos colombianos": "COP", pen: "PEN", sol: "PEN", soles: "PEN", brl: "BRL", real: "BRL", reales: "BRL", gbp: "GBP", pound: "GBP", pounds: "GBP", yen: "JPY", jpy: "JPY", yuan: "CNY", cny: "CNY", cad: "CAD", aud: "AUD", chf: "CHF", uyu: "UYU" };
  const fmtN = (x, es) => new Intl.NumberFormat(es ? "es" : "en").format(Math.round(x));
  const noArt = (t) => t.replace(/^(?:the|a|an|el|la|los|las|un|una)\s+/, "").trim();

  async function knowledge(n, say, es, call, soft, personal) {
    const A = say.A || "sir";
    const lang = es ? "es" : "en", q = n.replace(/[?.!¿¡]+/g, " ").replace(/\s+/g, " ").trim();
    const web = (args) => call("web_lookup", Object.assign({ lang }, args));
    const down = () => (soft ? null : navigator.onLine === false ? say(`I am offline just now, ${A}, and that lies beyond what I know by heart. I can still help with the time, calendar, notes, tasks, sums, conversions and data analysis.`, `Estoy sin conexión, ${A}, y eso excede lo que sé de memoria. Aún puedo ayudar con la hora, el calendario, notas, tareas, cálculos, conversiones y análisis de datos.`) : say(`I regret I could not reach the web for that, ${A}. Might you check your connection?`, `Lamento no haberme podido conectar a la web, ${A}. ¿Podría revisar su conexión?`));
    const miss = (what) => (soft ? null : say(`I regret I could find nothing reliable on "${what}", ${A}. Might you rephrase?`, `Lamento no hallar nada fiable sobre "${what}", ${A}. ¿Podría reformularlo?`));
    const bad = (r, what) => (!r ? down() : /^(?:No results|No data|Country not found|Unknown)/.test(r.error || "") ? miss(what) : down());
    const dateFmt = (iso) => { const d = new Date(iso + "T00:00:00Z"); return isNaN(d) ? iso : d.toLocaleDateString(es ? "es" : "en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }); };
    const years = (a, b) => { const x = new Date(a), y = b ? new Date(b) : new Date(); let k = y.getUTCFullYear() - x.getUTCFullYear(); if (y.getUTCMonth() < x.getUTCMonth() || (y.getUTCMonth() === x.getUTCMonth() && y.getUTCDate() < x.getUTCDate())) k--; return k; };

    async function answer(topic) {
      const r = await web({ query: topic });
      if (!r || r.error) return bad(r, topic);
      const sents = (r.text.replace(/\s+/g, " ").match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) || [r.text]).map((x) => x.trim()).filter(Boolean), rest = sents.slice(3);
      ctx.last = { kind: "answer" }; ctx.more = { rest };
      const also = r.others && r.others.length ? say(` (Also: ${r.others.join(", ")}.)`, ` (También: ${r.others.join(", ")}.)`) : "";
      return pick([say(`If I may, ${A}: `, `Si me permite, ${A}: `), say(`Certainly, ${A}. `, `Por supuesto, ${A}. `), ""]) + sents.slice(0, 3).join(" ") + also + `\n— ${r.source}${r.url ? ": " + r.url : ""}` + (rest.length ? say('\nDo say "more" should you wish me to continue.', '\nDiga "más" si desea que continúe.') : "");
    }
    async function run(kind, subject, fact) {
      ctx.last = { kind, fact };
      if (kind === "weather") {
        const r = await call("get_weather", { city: cap(subject), units: "celsius" });
        return !r || r.error ? say("I couldn't get the weather there.", "No pude obtener el clima de ahí.") : `${r.location}: ${r.temperature}, ${r.conditions}. ${say("Today", "Hoy")}: ${r.today_low}–${r.today_high}.`;
      }
      if (kind === "country") {
        const r = await web({ kind: "country", query: subject });
        if (!r || r.error) return fact === "population" ? run("fact", subject, "population") : bad(r, subject);
        const nm = r.name, cap2 = r.capital || "?";
        if (fact === "capital") return say(`The capital of ${nm} is ${cap2}.`, `La capital de ${nm} es ${cap2}.`);
        if (fact === "population") return say(`${nm} has about ${fmtN(r.population, es)} people.`, `${nm} tiene unos ${fmtN(r.population, es)} habitantes.`);
        if (fact === "currency") return say(`${nm} uses the ${r.currencies.join(" / ")}.`, `${nm} usa ${r.currencies.join(" / ")}.`);
        if (fact === "language") return say(`People in ${nm} speak ${r.languages.join(", ")}.`, `En ${nm} se habla ${r.languages.join(", ")}.`);
        if (fact === "area") return say(`${nm} covers about ${fmtN(r.area, es)} km².`, `${nm} ocupa unos ${fmtN(r.area, es)} km².`);
        return say(`${nm} is in ${r.region}. Capital: ${cap2}. Population: about ${fmtN(r.population, es)}. Languages: ${r.languages.join(", ")}. Currency: ${r.currencies.join(" / ")}.`, `${nm} está en ${r.region}. Capital: ${cap2}. Población: unos ${fmtN(r.population, es)}. Idiomas: ${r.languages.join(", ")}. Moneda: ${r.currencies.join(" / ")}.`);
      }
      if (kind === "fact") {
        const r = await web({ kind: "fact", fact, query: subject });
        if (!r || r.error) return bad(r, subject);
        const s = r.subject || subject;
        if ((fact === "age" || fact === "born") && r.born) {
          if (fact === "born") return say(`${s} was born on ${dateFmt(r.born)}.`, `${s} nació el ${dateFmt(r.born)}.`);
          const y = years(r.born, r.died);
          return r.died ? say(`${s} was born on ${dateFmt(r.born)} and died on ${dateFmt(r.died)}, aged ${y}.`, `${s} nació el ${dateFmt(r.born)} y murió el ${dateFmt(r.died)}, a los ${y} años.`) : say(`${s} is ${y} years old (born ${dateFmt(r.born)}).`, `${s} tiene ${y} años (nació el ${dateFmt(r.born)}).`);
        }
        if (fact === "died" && r.died) return say(`${s} died on ${dateFmt(r.died)}.`, `${s} murió el ${dateFmt(r.died)}.`);
        if (fact === "population" && r.value) return say(`${s} has a population of about ${fmtN(r.value, es)}.`, `${s} tiene una población de unos ${fmtN(r.value, es)}.`);
        if (r.names && r.names.length) {
          const who = r.names.join(es ? " y " : " and ");
          return ({ author: say(`${s} was written by ${who}.`, `${s} fue escrito por ${who}.`), director: say(`${s} was directed by ${who}.`, `${s} fue dirigida por ${who}.`), founder: say(`${s} was founded by ${who}.`, `${s} fue fundado por ${who}.`), birthplace: say(`${s} was born in ${who}.`, `${s} nació en ${who}.`) })[fact];
        }
        return miss(subject);
      }
      if (kind === "define") {
        const r = await web({ kind: "define", query: subject });
        if (!r || r.error || !r.meanings.length) return bad(r, subject);
        return say(`"${r.word}": `, `"${r.word}": `) + r.meanings.map((m) => `(${m.pos}) ${m.def}`).join(" ");
      }
      return answer(subject);
    }

    // follow-ups ("more", "what about Peru?")
    if (/^(?:tell me more|more|go on|continue|keep going|cuentame mas|mas|sigue|continua|y que mas)$/.test(q) && ctx.more) {
      const rest = ctx.more.rest;
      if (!rest.length) return say(`That is the sum of it, ${A}. Shall I look into something else?`, `Eso es todo, ${A}. ¿Investigo algo más?`);
      const chunk = rest.splice(0, 3).join(" ");
      return chunk + (rest.length ? say('\nDo say "more" for the remainder.', '\nDiga "más" para el resto.') : "");
    }
    const fu = q.match(/^(?:and|what about|how about|y|que tal|y que hay de|y en|y de)\s+(.+)$/);
    if (fu && ctx.last && ctx.last.kind !== "answer") return run(ctx.last.kind, noArt(fu[1]), ctx.last.fact);
    if (personal) return null;

    let m;
    const FACTS = [[/^(?:how old (?:is|was)|cuantos anos tiene|que edad tiene|cual es la edad de)\s+(.+)$/, "age"], [/^when (?:was|is)\s+(.+?)\s+born$/, "born"], [/^(?:birthday of|birth date of|cuando nacio|fecha de nacimiento de)\s+(.+)$/, "born"],
      [/^when did\s+(.+?)\s+die$/, "died"], [/^cuando murio\s+(.+)$/, "died"], [/^where was\s+(.+?)\s+born$/, "birthplace"], [/^donde nacio\s+(.+)$/, "birthplace"],
      [/^(?:who (?:wrote|authored)|quien escribio)\s+(.+)$/, "author"], [/^(?:who directed|quien dirigio)\s+(.+)$/, "director"], [/^(?:who (?:founded|created|started)|quien (?:fundo|creo))\s+(.+)$/, "founder"]];
    for (const [re, f] of FACTS) if ((m = q.match(re))) return run("fact", noArt(m[1]), f);
    if ((m = q.match(/\b(capital|currency|moneda|languages?|idiomas?|area|superficie|population|poblacion)\s+(?:of|de|del)\s+(.+)$/)))
      return run("country", noArt(m[2]), { capital: "capital", currency: "currency", moneda: "currency", language: "language", languages: "language", idioma: "language", idiomas: "language", area: "area", superficie: "area", population: "population", poblacion: "population" }[m[1]]);
    if ((m = q.match(/^(?:how many people live in|cuantos habitantes tiene)\s+(.+)$/))) return run("country", noArt(m[1]), "population");
    if ((m = q.match(/^(?:define|definition of|meaning of|definicion de|significado de|que significa)\s+(.+)$/)) || (m = q.match(/^what does\s+(.+?)\s+mean$/))) return run("define", noArt(m[1]));
    if ((m = q.match(/^(?:convert |how much is |cuanto es |cuanto vale |cuanto son )?(?:a |an |one |un |una )?(\d+(?:\.\d+)?)?\s*([a-z ]{2,16}?)\s+(?:to|in|into|a|en)\s+([a-z ]{2,16})$/))) {
      const code = (s) => CUR[s.trim()] || CUR[s.trim().split(" ").pop()];
      const from = code(m[2]), to = code(m[3]);
      if (from && to && from !== to) {
        const amount = m[1] ? Number(m[1]) : 1, r = await web({ kind: "currency", query: from + to, amount, from, to });
        if (!r || r.error) return down();
        return say(`${fmtN(amount, false)} ${from} is about ${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(r.result)} ${to} (rate ${+r.rate.toFixed(4)}, updated ${r.date}).`, `${fmtN(amount, true)} ${from} son unos ${new Intl.NumberFormat("es", { maximumFractionDigits: 2 }).format(r.result)} ${to} (tasa ${+r.rate.toFixed(4)}, actualizado ${r.date}).`);
      }
    }
    if ((m = q.match(/^(?:search|look up|google|busca|buscame|investiga)\s+(?:for\s+|about\s+|sobre\s+)?(.+)$/))) return answer(noArt(m[1]));
    m = q.match(/^(?:who is|who was|who are|who'?s|what is|what are|what was|what were|what'?s|tell me about|tell me something about|define|explain|describe|quien es|quien fue|quienes son|que es|que son|que fue|hablame de|hablame sobre|cuentame sobre|cuentame de|dime sobre|explicame|donde esta|where is|when was|cuando fue)\s+(.+)$/);
    if (!m) return null;
    const topic = noArt(m[1]);
    if (!topic || /\b(my|mi|mis|your|tu|you|yo|me)\b/.test(topic) || topic.split(" ").length > 6) return null;
    // "current" questions need live data that an encyclopedia intro can't give: let the full AI handle them
    if (soft && /\b(current|currently|president|prime minister|primer ministro|presidente|ceo|mayor|alcalde|champion|campeon|latest|newest|ultimo|actual|today|hoy)\b/.test(q)) return null;
    return answer(topic);
  }

  const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  async function respond(raw, tools, opts) {
    opts = opts || {};
    const n = strip(raw.toLowerCase()), words = n.split(/\W+/).filter(Boolean);
    const esN = words.filter((w) => ES.has(w)).length + (/[¿¡ñáéíóú]/i.test(raw) ? 2 : 0), enN = words.filter((w) => EN.has(w)).length, es = esN > enN || (esN > 0 && esN === enN); // ties go to Spanish ("me llamo X")
    const say = (e, s) => (es ? s : e);
    const addr = String(opts.address || "sir").trim() || "sir";
    const A = es ? ({ sir: "señor", madam: "señora", "ma'am": "señora", miss: "señorita" }[addr.toLowerCase()] || addr) : addr;
    say.A = A;
    const has = (re) => re.test(n);
    const call = (name, args) => tools.call(name, args || {});
    const err = (r) => r && r.error;
    const mem = opts.memory || null, MP = () => (typeof self !== "undefined" ? self : globalThis).JarvisMemory || null;
    const memParse = (t) => (MP() ? MP().parse(t) : null), memSens = (t) => !!(MP() && MP().isSensitive(t));
    const C = (typeof self !== "undefined" ? self : globalThis).JarvisChat || null;
    const cenv = { es, A, mem: mem && mem.enabled ? mem : null, name: mem && mem.enabled ? mem.get("name") : "" };
    const greetP = (t) => {
      const h = new Date().getHours(), tod = es ? (h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches") : (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
      return t.replace(/^(Good day\.|Buen día\.)/, `${tod}, ${A}.`) + (C ? C.askName(cenv) : "");
    };
    { const pc = C ? C.pre(raw, n, words, cenv) : null; if (pc) return pc; } // answers to a question Jarvis just asked

    if (has(/^(hi|hello|hey|hola|buenas|buenos dias|buenas tardes|buenas noches|good morning|good afternoon|good evening)\b/))
      return greetP(say("Good day. Jarvis at your service. I may assist with the weather, the time, your notes, sums, conversions, or a little data analysis.", "Buen día. Jarvis a su servicio. Puedo ayudarle con el clima, la hora, sus notas, cálculos, conversiones o un poco de análisis de datos."));
    if (has(/\b(thanks|thank you|gracias)\b/)) return pick([say(`Not at all, ${A}.`, `En absoluto, ${A}.`), say("My pleasure.", "Un placer."), say(`Think nothing of it, ${A}.`, `No hay de qué, ${A}.`)]);
    if (has(/\b(what'?s up|que onda|que hay|como andas)\b/)) return say(`All is in order, ${A}. How may I be of service?`, `Todo en orden, ${A}. ¿En qué puedo servirle?`);
    if (has(/\b(are you (?:an? )?(?:ai|robot|real|human|bot)|eres (?:una? )?(?:ia|robot|real|humano|bot))\b/)) return say(`I am, in point of fact, an artificial intelligence, ${A}, though I trust a well-mannered one. I attend to simple matters directly and consult a larger intellect when a question wants proper deliberation.`, `Soy, en rigor, una inteligencia artificial, ${A}, aunque confío en que de buenos modales. Atiendo lo sencillo directamente y consulto a un intelecto mayor cuando algo requiere deliberación.`);
    if (has(/\b(i'?m|i am|estoy|me siento)\s+(?:so |very |really |muy )?(tired|bored|stressed|cansad[oa]|aburrid[oa]|estresad[oa])\b/)) return say(`I am sorry to hear it, ${A}. Might I suggest a brief jest, or shall I arrange the next hour so that it weighs a little lighter?`, `Lamento oírlo, ${A}. ¿Le sugiero un breve chiste, o le organizo la próxima hora para que pese menos?`);
    if (has(/\b(how are you|how'?s it going|como estas|que tal|como te va)\b/)) return pick([say(`Quite well, thank you for asking, ${A}. How may I be of service?`, `Muy bien, gracias por preguntar, ${A}. ¿En qué puedo servirle?`), say(`Perfectly well, ${A}. What might I do for you?`, `Perfectamente, ${A}. ¿Qué puedo hacer por usted?`)]);
    if (has(/\b(who are you|what'?s your name|what is your name|quien eres|como te llamas|cual es tu nombre)\b/)) return say(`I am Jarvis, ${A}, your butler of the digital variety. I deal with simple matters directly and consult a more considerable intellect for the weightier questions.`, `Soy Jarvis, ${A}, su mayordomo digital. Resuelvo lo sencillo directamente y consulto a un intelecto mayor para lo más serio.`);
    if (has(/\b(joke|chiste)\b/)) {
      const J = es ? ["¿Por qué los programadores prefieren el modo oscuro? Porque la luz atrae bugs.", "¿Cuál es el colmo de un electricista? Que su mujer se llame Luz y no lo ilumine.", "Hay 10 tipos de personas: las que entienden binario y las que no."]
        : ["Why do programmers prefer dark mode? Because light attracts bugs.", "Why did the scarecrow win an award? He was outstanding in his field.", "There are 10 kinds of people: those who understand binary and those who don't."];
      return say(`If I may, ${A}: `, `Si me permite, ${A}: `) + J[Math.floor(Math.random() * J.length)];
    }
    if (has(/\b(bye|goodbye|see you|chao|adios|hasta luego|nos vemos)\b/)) return say(`Very good, ${A}. I shall be here should you require anything further.`, `Muy bien, ${A}. Estaré aquí si requiere algo más.`);
    if (has(/\b(help|ayuda|what can you do|que puedes)\b/))
      return say("At your service, I can attend to: general knowledge ('who is Marie Curie', 'capital of Japan'; needs internet), questions about your notes ('what did I note about the dentist?', 'notes from yesterday'), weather (\"weather in Madrid\"), time (\"time in Tokyo\"), notes (\"note: buy milk\", \"show my notes\", \"analyze my notes\"), math (\"(12+8)*3\", \"15% of 200\"), conversions (\"10 km to miles\"), date math (\"days until 2026-12-25\") and statistics (\"average of 4, 8, 15, 16\").",
        "A su servicio, puedo encargarme de: conocimiento general ('quién es Gabriela Mistral', 'capital de Japón'; requiere internet), preguntas sobre tus notas ('qué anoté sobre el dentista', 'notas de ayer'), clima (\"clima en Madrid\"), hora (\"hora en Tokio\"), notas (\"nota: comprar leche\", \"muestra mis notas\", \"analiza mis notas\"), cálculos (\"(12+8)*3\", \"15% de 200\"), conversiones (\"10 km a millas\"), fechas (\"días hasta 2026-12-25\") y estadística (\"promedio de 4, 8, 15, 16\").");

    if (mem) {
      const L = () => mem.list();
      if (has(/\b(forget everything|forget all|olvida todo|borra mi memoria|clear my memory|erase my memory)\b/)) { mem.clear(); return say(`Very good, ${A}. I have forgotten everything I knew of you.`, `Muy bien, ${A}. He olvidado todo lo que sabía de usted.`); }
      if (has(/^(?:what do you (?:know|remember) about me|what have you learned about me|que sabes de mi|que recuerdas de mi|que sabes sobre mi)/))
        return L().length ? say(`Here is what I have on file, ${A}:\n`, `Esto es lo que tengo anotado, ${A}:\n`) + L().map((f) => "- " + f.text).join("\n") + say('\nDo say "forget" and a subject should you wish me to strike something.', '\nDiga "olvida" y un tema si desea que borre algo.')
          : say(`I know very little of you as yet, ${A}. Tell me your name or your preferences and I shall remember them.`, `Sé muy poco de usted por ahora, ${A}. Dígame su nombre o sus gustos y los recordaré.`);
      const fg = n.match(/^(?:forget|olvida|borra)\s+(?:that\s+|que\s+|about\s+|sobre\s+|mi\s+|my\s+)?(.+?)[?.! ]*$/);
      if (fg && !has(/\b(notes?|notas?)\b/)) { const k = mem.forget(fg[1]); return k ? say(`Very good, ${A}. I have forgotten ${k} thing${k > 1 ? "s" : ""} about "${fg[1]}".`, `Muy bien, ${A}. He olvidado ${k} cosa(s) sobre "${fg[1]}".`) : say(`I have nothing on file about "${fg[1]}", ${A}.`, `No tengo nada anotado sobre "${fg[1]}", ${A}.`); }
      if (has(/^(?:what'?s my name|what is my name|do you know my name|como me llamo|cual es mi nombre)/)) { const v = mem.get("name"); return v ? say(`Your name is ${v}, ${A}.`, `Su nombre es ${v}, ${A}.`) : say("I am afraid I do not yet know your name. How might I address you?", "Me temo que aún no sé su nombre. ¿Cómo debo dirigirme a usted?"); }
      if (has(/^(?:where do i live|where am i from|donde vivo|de donde soy)/)) { const v = mem.get("location"); return v ? say(`You reside in ${v}, ${A}.`, `Usted reside en ${v}, ${A}.`) : say("You haven't told me where you live yet.", "Aún no me dices dónde vives."); }
      if (has(/^(?:what do i like|what are my likes|que me gusta)/)) { const l = L().filter((f) => /^Likes /.test(f.text)); return l.length ? say("You are partial to: ", "Le gusta: ") + l.map((f) => f.text.slice(6)).join(", ") + "." : say("You haven't told me what you like yet.", "Aún no me dices qué te gusta."); }
      const wm = n.match(/^(?:what'?s|what is|cual es|que es)\s+(?:my|mi)\s+(.+?)[?.! ]*$/);
      if (wm) { const f = mem.find(wm[1]); return f ? f.text + "." : say(`I don't know your ${wm[1]} yet. Tell me and I'll remember it.`, `Aún no sé tu ${wm[1]}. Dímelo y lo recordaré.`); }
      const gentle = say(`Thank you for confiding in me, ${A}. I do not keep sensitive particulars on file, but I am entirely at your disposal should you wish to talk or require assistance.`, `Gracias por confiármelo, ${A}. No guardo datos sensibles, pero estoy a su entera disposición si desea hablar o necesita ayuda.`);
      if (!/\?\s*$/.test(raw) && words.length <= 12 && /^(?:my [a-z ]{2,25} is|i (?:have|am|take|suffer|was diagnosed|got)|mi [a-z ]{2,25} es|tengo|soy|remember|recuerda)\b/.test(n) && memSens(raw)) return gentle;
      const pr = /\?\s*$/.test(raw) ? null : memParse(raw);
      if (pr) {
        if (!mem.enabled) return say("Memory is switched off in Settings, so I shall not keep that, though I did hear you.", "La memoria está desactivada en Ajustes, así que no lo guardaré, aunque lo escuché.");
        const res = mem.add(pr.text, pr.key, pr.value);
        if (!res.ok) return gentle;
        const v = pr.value;
        return ({ name: say(`A pleasure to make your acquaintance, ${v}. I shall remember your name.`, `Un placer conocerle, ${v}. Recordaré su nombre.`), location: say(`Noted, ${A}: you reside in ${v}. I shall use that for the weather.`, `Anotado, ${A}: usted reside en ${v}. Lo usaré para el clima.`),
          like: say(`Very good, ${A}. ${v} it is. I shall make a note of it.`, `Muy bien, ${A}. ${v}. Lo anotaré.`), dislike: say(`Noted, ${A}: ${v} is not to your taste.`, `Anotado, ${A}: ${v} no es de su agrado.`), favorite: say(`An excellent choice. I shall remember: ${pr.text}.`, `Una excelente elección. Recordaré: ${pr.text}.`),
          work: say(`Most interesting, ${A}: ${v}. I shall bear it in mind.`, `Muy interesante, ${A}: ${v}. Lo tendré presente.`), study: say(`Admirable, ${A}: ${v}. I wish you every success.`, `Admirable, ${A}: ${v}. Le deseo todo el éxito.`), birthday: say(`I shall remember your birthday: ${v}.`, `Recordaré su cumpleaños: ${v}.`),
          prefer: say(`Understood, ${A}. I shall remember that you prefer ${v}.`, `Entendido, ${A}. Recordaré que usted prefiere ${v}.`), explicit: say(`Very good, ${A}. I shall remember that.`, `Muy bien, ${A}. Lo recordaré.`) })[pr.kind];
      }
    }

    { const ci = C ? C.intent(raw, n, words, cenv) : null; if (ci) return ci; } // everyday conversation

    // date arithmetic
    const dm = n.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dm) {
      const t = new Date(+dm[1], +dm[2] - 1, +dm[3]), now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (!isNaN(t)) {
        const days = Math.round((t - d0) / 864e5), wd = t.toLocaleDateString(es ? "es" : "en", { weekday: "long" });
        return days >= 0 ? say(`${days} days until ${dm[0]} (${wd}).`, `Faltan ${days} días para el ${dm[0]} (${wd}).`) : say(`${-days} days ago (${wd}).`, `Hace ${-days} días (${wd}).`);
      }
    }

    // notes
    if (has(/\b(notes?|notas?)\b/) && has(/\b(analy|summar|resum|stat|estadist|pattern|patron|insight)/)) {
      const r = await call("list_notes", { limit: 100 }); return err(r) ? r.error : analyzeNotes(r.notes || [], say);
    }
    const am = n.match(/^(?:(?:please|por favor|hey|jarvis|oye)[,\s]+)*\b(add a note|take a note|note|remind me to|remind me|remember that|remember to|remember|save|anota|anotar|apunta|guarda|recuerdame|recuerda)\b\s*(?:that|to|:|-|que|de|esto)?\s*(.+)$/);
    if (am && !has(/\b(show|list|search|find|busca|muestra|lista|what|que)\b.*\b(notes?|notas?)\b/)) {
      const start = n.length - am[2].length; let text = raw.slice(start).trim(), tag = "";
      const tm = text.match(/(?:#|\btag\s+|\betiqueta\s+)([\w-]+)/i); if (tm) { tag = tm[1]; text = text.replace(tm[0], "").replace(/[,;\s]+$/, "").trim(); }
      const r = await call("add_note", { text, tag }); return err(r) ? r.error : pick([say("Very good — ", "Muy bien — "), say(`Noted, ${A} — `, `Anotado, ${A} — `), say("Duly recorded — ", "Debidamente anotado — ")]) + String(r.saved).replace(/^-?\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}\s*(?:#\w+\s*)?-?\s*/, "");
    }
    if (has(/\b(notes?|notas?)\b/)) {
      if (has(/\b(search|find|busca|buscar|encuentra|about|sobre|related|relacionad)/) || dateRange(n) || /#[\w-]+/.test(n)) return await fromNotes(n, say, call, false);
      const r = await call("list_notes", { limit: 10 });
      return err(r) ? r.error : r.notes.length ? say(`Your last ${r.notes.length} notes (of ${r.total_notes}):\n`, `Tus últimas ${r.notes.length} notas (de ${r.total_notes}):\n`) + r.notes.join("\n") : say(`You have no notes on file as yet, ${say.A || "sir"}.`, `Aún no tiene notas anotadas, ${say.A || "señor"}.`);
    }

    // weather
    if (has(/\b(weather|clima|temperatura|temperature|llueve|rain|forecast|pronostico)\b/)) {
      let cm = n.match(/\b(?:in|en|de|for|para|at)\s+([a-z][a-z .,'-]{1,40}?)(?=\s+(?:today|hoy|now|ahora|please|por favor|tomorrow|manana|in fahrenheit|in celsius)\b|[?.!]*$)/);
      ctx.last = { kind: "weather" };
      const home = mem && mem.enabled && mem.get("location"); if (!cm && home) cm = [null, home.toLowerCase()];
      if (!cm) return say("Which city? Try: \"weather in Santiago\".", "¿Qué ciudad? Prueba: \"clima en Santiago\".");
      const r = await call("get_weather", { city: cap(cm[1].trim()), units: /fahrenheit|farenheit/.test(n) ? "fahrenheit" : "celsius" });
      return err(r) ? (/offline|network|fetch|failed|timeout|reach/i.test(String(r.error)) ? say(`I need an internet connection for the weather in ${cap(cm[1].trim())}, ${A}.`, `Necesito conexión a internet para el clima de ${cap(cm[1].trim())}, ${A}.`) : r.error)
        : `${say(`In ${r.location}, ${A}, it is presently ${r.temperature} with ${r.conditions}`, `En ${r.location}, ${A}, hay ${r.temperature} y ${r.conditions}`)}. ${say("Feels like", "Sensación")} ${r.feels_like}, ${say("humidity", "humedad")} ${r.humidity}, ${say("wind", "viento")} ${r.wind_kmh} km/h. ${say("Today", "Hoy")}: ${r.today_low}–${r.today_high}, ${say("rain chance", "prob. de lluvia")} ${r.chance_of_precipitation}.`;
    }

    // time
    if (has(/\b(what time|time is it|current time|que hora|hora es|hora en|time in|date today|today'?s date|fecha de hoy|que fecha|que dia es|what day is)\b/)) {
      const tzKey = Object.keys(TZ).find((k) => n.includes(k)); const r = await call("get_current_time", { timezone: tzKey ? TZ[tzKey] : "" });
      return err(r) ? r.error : (() => { let f = r.datetime; try { f = new Date().toLocaleString(es ? "es" : "en", { timeZone: r.timezone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); } catch (e) { /* keep raw */ } return say(`It is ${f}, ${A} (${r.timezone}).`, `Son las ${f}, ${A} (${r.timezone}).`); })();
    }
    if (has(/\b(device|dispositivo|system info|info del sistema)\b/)) { const r = await call("get_device_info"); return err(r) ? r.error : Object.entries(r).map(([k, v]) => `${k}: ${v}`).join("\n"); }

    // statistics with keyword
    const nums = (n.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const labeled = [...n.matchAll(/([a-z][a-z ]{0,20}?)\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)].map((m) => [m[1].trim(), +m[2]]);
    const statKw = has(/\b(average|mean|median|mode|analy|statistic|trend|sum|total|max|min|maximum|minimum|deviation|variance|forecast|predict|promedio|media|mediana|moda|analiz|estadist|tendencia|suma|maximo|minimo|desviacion|varianza|pronostic|prediccion)/);
    if (statKw && nums.length >= 2 && (words.length <= 14 || nums.length / words.length >= 0.3)) return analyze(nums, labeled, say); // long prose with a few numbers is not a data set

    // percent, units, math
    const pm = n.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|de)\s*(\d+(?:\.\d+)?)/);
    if (pm) return `${pm[1]}% ${say("of", "de")} ${pm[2]} = ${f((+pm[1] * +pm[2]) / 100)}`;
    const um = n.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*)?([a-z]+)\s+(?:to|in|into|a|en)\s+(?:°\s*)?([a-z]+)/);
    if (um) {
      const a = ALIAS[um[2]] || um[2], b = ALIAS[um[3]] || um[3], v = +um[1];
      if (UNITS[a] && UNITS[b] && UNITS[a][1] === UNITS[b][1]) {
        let r; if (UNITS[a][1] === "t") r = a === "c" ? v * 9 / 5 + 32 : (v - 32) * 5 / 9; else r = (v * UNITS[a][0]) / UNITS[b][0];
        return `${f(v)} ${a} = ${f(r)} ${b}`;
      }
    }
    const mm = mathFrom(n); if (mm) return `${mm.expr.replace(/\s+/g, " ")} = ${f(mm.v)}`;

    const personal = has(/\b(i|my|me|mi|mis|yo|tengo|anote|guarde|apunte)\b/);
    { const k = await knowledge(n, say, es, call, !!(opts.llm || opts.strict), personal); if (k) return k; }

    // bare list of numbers -> analyze
    if (nums.length >= 3 && words.filter((w) => !/^-?\d/.test(w)).length <= 4) return analyze(nums, labeled, say);

    // heuristic fallback: try to answer from the user's own notes by meaning
    const fn = await fromNotes(n, say, call, true); if (fn) return fn;
    if (C && (!opts.geminiChat || !opts.strict)) { const cf = C.fallback(raw, n, words, cenv); if (cf) return cf; } // keep a chat going without any cloud call
    if (opts.strict) return null; // no rule matched: let the big AI decide
    if (opts.llm) { try { const a = await opts.llm(raw, es); if (a) return a; } catch (e) { /* fall through to the message below */ } }
    return say("I do beg your pardon, I did not quite catch your meaning. Do say \"help\" and I shall list what I can manage.", "Le ruego me disculpe, no entendí bien. Diga \"ayuda\" y le indicaré lo que puedo hacer.");
  }

  // Router: hard requests (reasoning, writing, long text) skip the local engine and go straight to the API.
  function isComplex(raw) {
    const n = strip(String(raw).toLowerCase()), words = n.split(/\s+/).filter(Boolean);
    if (/^(note|add a note|take a note|anota|apunta|guarda|remind|recuerda|remember|save)\b/.test(n)) return false;
    if (words.length > 28) return true;
    return /\b(explain|why|how (?:does|do|did|can|could|would|should)|compare|difference between|pros and cons|write|essay|poem|story|summari[sz]e|code|program|script|translate|plan|strategy|recommend|advice|opinion|step by step|in detail|detailed|brainstorm|debug|rewrite|draft|por que|porque|explica|explicame|compara|diferencia entre|escribe|redacta|resume|resumen|traduce|programa|codigo|estrategia|recomienda|consejo|opinion|paso a paso|en detalle|detallad|lluvia de ideas|corrige)\b/.test(n);
  }

  return { respond, calc, isComplex };
});
