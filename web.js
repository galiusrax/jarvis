/* Jarvis web lookups: several free, key-less sources, queried in parallel with short timeouts and a cache.
 * Wikipedia (best-match + disambiguation aware), Wikidata facts, REST Countries, dictionary, exchange rates, DuckDuckGo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.JarvisWeb = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const declaration = {
    name: "web_lookup",
    description: "Look up facts on the web: Wikipedia, Wikidata, country data, dictionary, exchange rates.",
    parameters: { type: "OBJECT", properties: {
      query: { type: "STRING", description: "Topic, word, country or place." },
      kind: { type: "STRING", description: "answer (default), country, define, currency or fact." },
      lang: { type: "STRING", description: "en or es." },
      fact: { type: "STRING", description: "kind=fact: born, died, age, population, author, director, founder, birthplace." },
      amount: { type: "NUMBER", description: "kind=currency amount." }, from: { type: "STRING", description: "Currency code." }, to: { type: "STRING", description: "Currency code." },
    }, required: ["query"] },
  };
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const STOPW = new Set("the a an of el la los las de del un una".split(" "));
  const qs = (o) => new URLSearchParams(o).toString();

  function create(doFetch) {
    const cache = new Map();
    async function getJson(url) {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = ctl && setTimeout(() => ctl.abort(), 5000); // fail fast
      try {
        const r = await doFetch(url, ctl ? { signal: ctl.signal } : undefined);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } finally { if (t) clearTimeout(t); }
    }

    async function wiki(topic, lang) {
      const d = await getJson(`https://${lang}.wikipedia.org/w/api.php?` + qs({
        action: "query", generator: "search", gsrsearch: topic, gsrlimit: 5, prop: "extracts|info|pageprops", exintro: 1, explaintext: 1,
        exsentences: 8, exlimit: 5, inprop: "url", ppprop: "disambiguation", redirects: 1, format: "json", origin: "*" }));
      const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index);
      const ok = pages.filter((p) => p.extract && !(p.pageprops && "disambiguation" in p.pageprops));
      if (!ok.length) return null;
      const t = norm(topic), tt = t.split(" ").filter((w) => !STOPW.has(w));
      const nt = (p) => norm(p.title);
      const best = ok.find((p) => nt(p) === t) || ok.find((p) => tt.length && tt.every((w) => nt(p).includes(w))) || ok[0];
      return { title: best.title, text: best.extract, url: best.fullurl, strong: nt(best) === t || (tt.length > 0 && tt.every((w) => nt(best).includes(w))), others: ok.filter((p) => p !== best).slice(0, 2).map((p) => p.title) };
    }
    async function ddg(topic) {
      const d = await getJson("https://api.duckduckgo.com/?" + qs({ q: topic, format: "json", no_html: 1, skip_disambig: 1, t: "jarvis" }));
      return { answer: d.Answer || "", abstract: d.AbstractText || d.Definition || "", url: d.AbstractURL || "" };
    }
    async function country(name) {
      const F = "?fields=name,capital,population,area,languages,currencies,region,subregion";
      let list = null;
      try { list = await getJson("https://restcountries.com/v3.1/name/" + encodeURIComponent(name) + F); } catch (e) { list = null; }
      if (!list || !list.length) { try { list = await getJson("https://restcountries.com/v3.1/translation/" + encodeURIComponent(name) + F); } catch (e) { return null; } }
      const t = norm(name);
      const c = list.find((x) => norm(x.name.common) === t || norm(x.name.official) === t) || (t.length >= 4 ? list[0] : null);
      if (!c) return null;
      return { name: c.name.common, capital: (c.capital || [])[0], population: c.population, area: c.area, region: c.subregion || c.region,
        languages: Object.values(c.languages || {}), currencies: Object.values(c.currencies || {}).map((x) => x.name + (x.symbol ? " (" + x.symbol + ")" : "")) };
    }
    async function define(word, lang) {
      const strip = (h) => String(h).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (lang === "es") {
        const d = await getJson("https://es.wiktionary.org/api/rest_v1/page/definition/" + encodeURIComponent(word));
        const sec = d.es || d[Object.keys(d)[0]] || [];
        return { word, meanings: sec.slice(0, 3).map((m) => ({ pos: m.partOfSpeech, def: strip((m.definitions[0] || {}).definition || "") })).filter((m) => m.def) };
      }
      const d = await getJson("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word));
      return { word, meanings: ((d[0] && d[0].meanings) || []).slice(0, 3).map((m) => ({ pos: m.partOfSpeech, def: (m.definitions[0] || {}).definition })).filter((m) => m.def) };
    }
    async function currency(amount, from, to) {
      const d = await getJson("https://open.er-api.com/v6/latest/" + encodeURIComponent(from));
      if (d.result !== "success" || !d.rates || !d.rates[to]) return null;
      return { amount, from, to, rate: d.rates[to], result: amount * d.rates[to], date: String(d.time_last_update_utc || "").slice(0, 16) };
    }
    const PROPS = { born: "P569", died: "P570", population: "P1082", author: "P50", director: "P57", founder: "P112", birthplace: "P19" };
    async function fact(topic, lang, which) {
      const base = "https://www.wikidata.org/w/api.php?";
      const s = await getJson(base + qs({ action: "wbsearchentities", search: topic, language: lang, uselang: lang, limit: 1, format: "json", origin: "*" }));
      const hit = s.search && s.search[0];
      if (!hit) return null;
      const e = await getJson(base + qs({ action: "wbgetentities", ids: hit.id, props: "claims", format: "json", origin: "*" }));
      const claims = e.entities[hit.id].claims || {};
      const vals = (p) => (claims[p] || []).filter((c) => c.mainsnak && c.mainsnak.datavalue).map((c) => c.mainsnak.datavalue.value);
      const time = (v) => (v && v.time ? v.time.replace(/^\+/, "").slice(0, 10) : null);
      const out = { subject: hit.label, description: hit.description };
      if (which === "age" || which === "born") out.born = time(vals("P569")[0]);
      if (which === "age" || which === "died") out.died = time(vals("P570")[0]);
      if (which === "population") { const v = vals("P1082"); out.value = v.length ? Number(v[v.length - 1].amount) : null; }
      if (["author", "director", "founder", "birthplace"].includes(which)) {
        const ids = vals(PROPS[which]).filter((v) => v.id).slice(0, 3).map((v) => v.id);
        if (ids.length) {
          const l = await getJson(base + qs({ action: "wbgetentities", ids: ids.join("|"), props: "labels", languages: lang + "|en", format: "json", origin: "*" }));
          out.names = ids.map((id) => { const L = l.entities[id].labels; return (L[lang] || L.en || {}).value; }).filter(Boolean);
        }
      }
      return out;
    }

    async function lookup(a) {
      const lang = a.lang === "es" ? "es" : "en", kind = a.kind || "answer", q = String(a.query || "").trim();
      if (!q) return { error: "query is required." };
      const key = JSON.stringify([kind, lang, q, a.fact, a.amount, a.from, a.to]);
      if (cache.has(key)) return cache.get(key);
      let r;
      if (kind === "country") r = (await country(q)) || { error: "Country not found." };
      else if (kind === "define") r = await define(q, lang);
      else if (kind === "currency") r = (await currency(Number(a.amount) || 1, String(a.from).toUpperCase(), String(a.to).toUpperCase())) || { error: "Unknown currency." };
      else if (kind === "fact") r = (await fact(q, lang, a.fact)) || { error: `No data for "${q}".` };
      else {
        // general question: ask Wikipedia and DuckDuckGo at the same time, keep the more precise result
        const [w, d] = await Promise.allSettled([wiki(q, lang), ddg(q)]);
        const W = w.status === "fulfilled" ? w.value : null, D = d.status === "fulfilled" ? d.value : null;
        if (D && D.answer) r = { source: "DuckDuckGo", title: q, text: D.answer, url: D.url };
        else if (W && (W.strong || !(D && D.abstract))) r = { source: "Wikipedia", title: W.title, text: W.text, url: W.url, others: W.others };
        else if (D && D.abstract) r = { source: "DuckDuckGo", title: q, text: D.abstract, url: D.url };
        else if (w.status === "rejected" && d.status === "rejected") r = { error: "Could not reach the web: " + w.reason.message };
        else r = { error: `No results for "${q}".` };
      }
      if (!r.error) cache.set(key, r);
      return r;
    }
    return { lookup };
  }
  return { create, declaration };
});
