/* Jarvis dashboard: clock (local), weather (Open-Meteo) and local news (GDELT). No keys, no proxy, runs on GitHub Pages.
 * Everything is cached in localStorage, so offline it still shows the last data. Timers pause when the tab is hidden. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id), K = "jarvis.dash";
  let S = {}; try { S = JSON.parse(localStorage.getItem(K) || "{}"); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  const loc = navigator.language || "en-US", es = loc.slice(0, 2) === "es", region = (loc.split("-")[1] || "").toUpperCase();
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  const G = [[0, "☀️", "Clear", "Despejado"], [2, "⛅", "Partly cloudy", "Parcial"], [3, "☁️", "Overcast", "Nublado"], [48, "🌫️", "Fog", "Niebla"], [57, "🌦️", "Drizzle", "Llovizna"], [67, "🌧️", "Rain", "Lluvia"], [77, "❄️", "Snow", "Nieve"], [82, "🌧️", "Showers", "Chubascos"], [86, "❄️", "Snow showers", "Nevadas"], [99, "⛈️", "Thunderstorm", "Tormenta"]];
  const wx = (c) => G.find((g) => c <= g[0]) || G[2], lbl = (g) => (es ? g[3] : g[2]);
  const hm = (t) => new Date(t).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });

  const fT = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit" }), fS = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit", second: "2-digit" }), fD = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" });
  let ti = 0, lastMin = -1; // the strip updates once a minute; seconds only tick while the dashboard is open
  function tick() {
    const d = new Date(), m = d.getMinutes();
    if (m !== lastMin) { lastMin = m; $("sClock").textContent = fT.format(d); }
    if ($("dashDlg").open) { $("dClock").textContent = fS.format(d); $("dDate").textContent = fD.format(d) + " · " + tz.replace(/_/g, " "); }
  }
  function runClock() { clearTimeout(ti); tick(); if (!document.hidden) ti = setTimeout(runClock, $("dashDlg").open ? 1000 : 60000 - (Date.now() % 60000) + 50); }

  async function j(u) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
    try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  async function geocode(name) {
    const d = await j("https://geocoding-api.open-meteo.com/v1/search?count=1&language=" + (es ? "es" : "en") + "&name=" + encodeURIComponent(name));
    const p = d.results && d.results[0]; if (!p) throw new Error("not found");
    return { lat: p.latitude, lon: p.longitude, name: p.name, cc: (p.country_code || "").toUpperCase() };
  }

  function drawWx() {
    const p = S.place, el = $("dWx"); $("dPlace").textContent = p ? p.name : "—";
    $("sWx").textContent = "";
    if (!S.wx) { el.textContent = p ? (es ? "Sin datos (sin conexión)" : "No data yet (offline)") : (es ? "Elige una ciudad" : "Pick a city"); return; }
    const c = S.wx.d.current, dl = S.wx.d.daily, g = wx(c.weather_code), old = Date.now() - S.wx.t > 36e5;
    $("sWx").textContent = g[1] + " " + Math.round(c.temperature_2m) + "°C" + (p ? " · " + p.name : "");
    let days = "";
    for (let i = 1; i < dl.time.length; i++) days += `<span title="${lbl(wx(dl.weather_code[i]))}">${new Date(dl.time[i] + "T12:00").toLocaleDateString(loc, { weekday: "short" })} ${wx(dl.weather_code[i])[1]} ${Math.round(dl.temperature_2m_min[i])}°/${Math.round(dl.temperature_2m_max[i])}°</span>`;
    el.innerHTML = `<div class="temp">${g[1]} ${Math.round(c.temperature_2m)}°C</div><div class="sub">${lbl(g)} · ${es ? "sens." : "feels"} ${Math.round(c.apparent_temperature)}° · ${Math.round(c.relative_humidity_2m)}% · ${Math.round(c.wind_speed_10m)} km/h</div><div class="days">${days}</div><div class="sub">${old ? (es ? "Sin conexión · datos de " : "Offline · data from ") : (es ? "Actualizado " : "Updated ")}${hm(S.wx.t)}</div>`;
  }
  async function weather() {
    const p = S.place; if (!p) return;
    try {
      S.wx = { t: Date.now(), d: await j(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`) };
      save();
    } catch (e) { /* keep cache */ }
    drawWx();
  }

  function drawNews() {
    const ul = $("dNews"), n = S.news; ul.textContent = "";
    if (!n || !n.items.length) { const li = document.createElement("li"); li.textContent = es ? "Sin titulares aún (requiere conexión)." : "No headlines yet (needs a connection)."; ul.appendChild(li); $("dNewsMeta").textContent = ""; return; }
    n.items.forEach((x) => {
      const li = document.createElement("li"), a = document.createElement("a"), s = document.createElement("small");
      a.href = /^https?:/.test(x.u) ? x.u : "#"; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = x.t;
      s.textContent = x.s; li.append(a, s); ul.appendChild(li);
    });
    $("dNewsMeta").textContent = (n.label ? (n.scope === "local" ? "📍 " : "") + n.label + " · " : "") + hm(n.t) + (Date.now() - n.t > 36e5 ? " (cache)" : "");
  }
  const clean = (arr) => { const seen = new Set(), out = []; for (const x of arr) { const t = String(x.t || "").trim(), k = t.toLowerCase().slice(0, 40); if (t.length > 15 && /^https?:/.test(x.u) && !seen.has(k)) { seen.add(k); out.push({ t, u: x.u, s: x.s || "" }); } if (out.length >= 8) break; } return out; };
  const fromFile = async () => clean((await j("news.json?v=" + Math.floor(Date.now() / 6e5))).items || []); // built by the GitHub Action
  const gdelt = async (q, span) => clean(((await j("https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&maxrecords=25&format=json&sort=datedesc&timespan=" + span + "&query=" + encodeURIComponent(q))).articles || []).map((a) => ({ t: a.title, u: a.url, s: a.domain })));
  async function wikinews() {
    const l = es ? "es" : "en", d = await j(`https://${l}.wikinews.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(es ? "Categoría:Publicado" : "Category:Published")}&cmlimit=10&cmsort=timestamp&cmdir=desc&format=json&origin=*`);
    return clean(((d.query && d.query.categorymembers) || []).map((m) => ({ t: m.title, u: `https://${l}.wikinews.org/wiki/` + encodeURIComponent(m.title.replace(/ /g, "_")), s: "Wikinews" })));
  }
  let newsGen = 0;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  async function news() {
    const gen = ++newsGen, p = S.place || {}, cc = p.cc || region; let country = "", cname = "";
    try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc).toLowerCase().replace(/[^a-z]/g, ""); cname = new Intl.DisplayNames([loc], { type: "region" }).of(cc); } catch (e) { /* worldwide */ }
    const lang = "sourcelang:" + (es ? "spanish" : "english"), ctry = country ? " sourcecountry:" + country : "";
    const tries = [];
    if (p.name) tries.push(["local", p.name, 3, true, () => gdelt('"' + p.name + '"' + ctry + " " + lang, "7d")]); // headlines that mention your city
    tries.push(["national", cname, 1, true, () => gdelt((country ? "sourcecountry:" + country + " " : "") + lang, "2d")], ["national", cname, 1, false, fromFile], ["world", es ? "Mundo" : "World", 1, false, wikinews]);
    let err = "", prevG = false;
    for (const [scope, label, min, isG, fn] of tries) {
      if (prevG && isG) await nap(5200); // GDELT asks for one request every 5 seconds
      if (gen !== newsGen) return; // a newer refresh (e.g. you moved) replaced this one
      prevG = isG;
      try { const items = await fn(); if (gen !== newsGen) return; if (items.length >= min) { S.news = { t: Date.now(), items, scope, label }; err = ""; save(); break; } err = scope + ": " + (items.length ? "too few" : "empty"); } catch (e) { err = scope + ": " + (e.message || "failed"); }
    }
    S.newsErr = err; drawNews();
  }

  let rt = 0, rForce = false;
  function refresh(force) { rForce = rForce || !!force; clearTimeout(rt); rt = setTimeout(() => { const f = rForce; rForce = false; refreshNow(f); }, 350); } // bursts of triggers become one fetch
  async function refreshNow(force) {
    if (!S.place) { try { S.place = await geocode(tz.split("/").pop().replace(/_/g, " ")); save(); } catch (e) { /* offline */ } }
    drawWx(); drawNews();
    if (!navigator.onLine || document.hidden) return;
    if (force || !S.wx || Date.now() - S.wx.t > 9e5) await weather();
    if (force || !S.news || Date.now() - S.news.t > 12e5) await news();
  }

  $("dCityForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const v = $("dCity").value.trim(); if (!v) return;
    try { S.place = await geocode(v); S.wx = S.news = null; save(); $("dCity").value = ""; refresh(true); } catch (x) { $("dWx").textContent = es ? "No encontré esa ciudad." : "City not found."; }
  });
  $("dNewsReload").addEventListener("click", () => { if (navigator.onLine) { $("dNewsMeta").textContent = "…"; news(); } });
  async function reverse(lat, lon) { // OpenStreetMap: turns coordinates into your town/commune and country
    try { const a = (await j(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=${es ? "es" : "en"}&lat=${lat}&lon=${lon}`)).address || {}; return { name: a.city || a.town || a.village || a.municipality || a.suburb || a.county || a.state || "", cc: (a.country_code || "").toUpperCase() }; } catch (e) { return {}; }
  }
  function geo(manual) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude, r = await reverse(lat, lon), o = S.place || {};
      S.place = { lat, lon, name: r.name || o.name || (es ? "Mi ubicación" : "My location"), cc: r.cc || o.cc || region, geo: true };
      S.wx = S.news = null; save(); refresh(true);
    }, () => { if (manual) $("dWx").textContent = es ? "Permiso de ubicación denegado." : "Location permission denied."; }, { timeout: 10000, maximumAge: 6e5 });
  }
  $("dGeo").addEventListener("click", () => geo(true));
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then((r) => { if (r.state === "granted" && !(S.place && S.place.geo)) geo(false); }).catch(() => {});
  const dlg = $("dashDlg"), openDash = () => { if (!dlg.open) dlg.showModal(); runClock(); refresh(); if (!S.geoAsked && !(S.place && S.place.geo)) { S.geoAsked = true; save(); geo(false); } }; // first open asks once for your location
  dlg.addEventListener("close", runClock);
  $("dashBtn").addEventListener("click", openDash); $("dStrip").addEventListener("click", openDash); $("dashClose").addEventListener("click", () => dlg.close());
  document.addEventListener("visibilitychange", () => { runClock(); if (!document.hidden) refresh(); });
  window.addEventListener("online", () => refresh(true));
  setInterval(() => { if (!document.hidden) refresh(); }, 3e5);
  runClock(); (window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1500))(() => refresh());

  window.JarvisDash = {
    headlines(n) { return S.news ? S.news.items.slice(0, n || 5).map((x) => x.t) : []; },
    outfit(spa) { // what to wear, from today's forecast (works offline from the last data)
      if (!S.wx) return null; const c = S.wx.d.current, d = S.wx.d.daily, mx = d.temperature_2m_max[0], mn = d.temperature_2m_min[0], code = c.weather_code, wind = c.wind_speed_10m;
      const ref = (c.apparent_temperature + (mx + mn) / 2) / 2, T = (e, sp) => (spa ? sp : e), L = [];
      L.push(ref < 5 ? T("Heavy coat, scarf, gloves and a warm hat.", "Abrigo grueso, bufanda, guantes y gorro.")
        : ref < 12 ? T("A warm coat or padded jacket over a sweater, and long trousers.", "Abrigo o chaqueta gruesa sobre un suéter, y pantalón largo.")
        : ref < 18 ? T("A light jacket or sweater with long trousers.", "Una chaqueta liviana o suéter con pantalón largo.")
        : ref < 24 ? T("A T-shirt or light shirt; trousers or jeans are fine.", "Polera o camisa liviana; pantalón o jeans están bien.")
        : ref < 29 ? T("Light, breathable clothes: shorts or a thin shirt.", "Ropa liviana y fresca: short o camisa delgada.")
        : T("Very light, loose clothes, a hat, and plenty of water.", "Ropa muy liviana y suelta, gorro y harta agua."));
      if (mx - mn >= 10) L.push(T(`It swings ${Math.round(mn)}° to ${Math.round(mx)}° today, so dress in layers you can remove.`, `Hoy varía de ${Math.round(mn)}° a ${Math.round(mx)}°, así que vístase en capas que pueda sacarse.`));
      if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) L.push(T("Rain is likely: take an umbrella or a waterproof jacket.", "Probable lluvia: lleve paraguas o una chaqueta impermeable."));
      else if ((code >= 71 && code <= 77) || code === 85 || code === 86) L.push(T("Snow: waterproof boots and warm layers.", "Nieve: botas impermeables y capas abrigadoras."));
      if (wind >= 30) L.push(T("It is windy; a windbreaker helps.", "Hay viento; un cortaviento ayuda."));
      if (code <= 1 && mx >= 22) L.push(T("Sunny: sunglasses and sunscreen.", "Soleado: lentes de sol y bloqueador."));
      return L.join(" ");
    },
    weatherText(spa) {
      if (!S.wx || !S.place) return null; const c = S.wx.d.current, g = wx(c.weather_code), d = S.wx.d.daily;
      return spa ? `En ${S.place.name}: ${Math.round(c.temperature_2m)}°C, ${g[3].toLowerCase()}. Hoy ${Math.round(d.temperature_2m_min[0])}°–${Math.round(d.temperature_2m_max[0])}°.`
        : `In ${S.place.name}: ${Math.round(c.temperature_2m)}°C, ${g[2].toLowerCase()}. Today ${Math.round(d.temperature_2m_min[0])}°–${Math.round(d.temperature_2m_max[0])}°.`;
    },
  };
})();
