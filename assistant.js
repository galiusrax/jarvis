/* Jarvis personal assistant (offline): tells notes, appointments and reminders apart, keeps a calendar, tasks and a daily briefing.
 * Everything is stored in this browser. Alerts fire while the page is open (spoken + system notification if allowed). */
(function () {
  "use strict";
  const O = window.JarvisOffline; if (!O) return;
  const base = O.respond, K = "jarvis.assist";
  let S = { tasks: [], rem: [] }; try { S = Object.assign(S, JSON.parse(localStorage.getItem(K) || "{}")); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) { /* ignore */ } window.dispatchEvent(new Event("planner-change")); };
  const fmt = (t, es, time) => new Date(t).toLocaleString(es ? "es" : "en", Object.assign({ weekday: "short", day: "numeric", month: "short" }, time === false ? {} : { hour: "2-digit", minute: "2-digit" }));
  const U = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }, ICON = { appt: "📅", rem: "⏰", note: "📝" };
  const WD = { sunday: 0, domingo: 0, monday: 1, lunes: 1, tuesday: 2, martes: 2, wednesday: 3, miercoles: 3, "miércoles": 3, thursday: 4, jueves: 4, friday: 5, viernes: 5, saturday: 6, sabado: 6, "sábado": 6 };
  const WDRE = new RegExp("\\b(?:(?:on|el|este|next|proximo|próximo)\\s+)?(" + Object.keys(WD).join("|") + ")\\b", "i");
  const REMKW = /\b(?:remind me|recu[eé]rdame|av[ií]same)\b/i;
  const VERBS = /\b(?:set|schedule|book|add|create|make|put|pon|agrega|a[nñ]ade|programa|agenda|agendar|anota|apunta|remind me|recu[eé]rdame|av[ií]same)\s+(?:me\s+|mi\s+|una?\s+|an?\s+|nueva\s+|new\s+)*(?:appointment|meeting|event|reminder|note|cita|reuni[oó]n|evento|recordatorio|nota)?\b\s*(?:for|to|about|de|para|con|que|:|-)?/gi;

  function when(raw) { // natural-language time -> { t, text, timed } or null
    const now = new Date(); let text = raw, m, day = null, hh = null, mi = 0, wd = false;
    const cut = () => { text = text.replace(m[0], " "); };
    if ((m = text.match(/\b(?:in|en)\s+(\d+)\s*(seconds?|secs?|segundos?|minutes?|mins?|minutos?|hours?|horas?|days?|d[ií]as?)\b/i))) {
      const u = /^mi/i.test(m[2]) ? "m" : m[2][0].toLowerCase(); cut();
      return { t: +now + +m[1] * U[u], text: tidy(text), timed: true };
    }
    if ((m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) { day = new Date(+m[1], +m[2] - 1, +m[3]); cut(); }
    else if ((m = text.match(/\b(tomorrow|ma[ñn]ana)\b/i))) { day = new Date(now); day.setDate(day.getDate() + 1); cut(); }
    else if ((m = text.match(/\b(today|hoy)\b/i))) { day = new Date(now); cut(); }
    else if ((m = text.match(WDRE))) { day = new Date(now); day.setDate(day.getDate() + ((WD[m[1].toLowerCase()] - now.getDay() + 7) % 7)); wd = true; cut(); }
    if ((m = text.match(/\b(?:(?:at|a las?|las)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i))) {
      hh = +m[1]; mi = +(m[2] || 0); const ap = m[3].toLowerCase(); if (ap === "pm" && hh < 12) hh += 12; if (ap === "am" && hh === 12) hh = 0; cut();
    } else if ((m = text.match(/\b(?:at|a las?|las)\s+(\d{1,2})(?::(\d{2}))?\s*(?:h|hrs)?\b/i)) || (m = text.match(/\b(\d{1,2}):(\d{2})\b/))) { hh = +m[1]; mi = +(m[2] || 0); cut(); }
    if (hh !== null && (hh > 23 || mi > 59)) return null;
    if (!day && hh === null) return null;
    const t = new Date(day || now); t.setHours(hh === null ? 9 : hh, mi, 0, 0);
    if (t <= now) { if (!day) t.setDate(t.getDate() + 1); else if (wd && hh !== null) t.setDate(t.getDate() + 7); }
    return { t: +t, text: tidy(text), timed: hh !== null };
  }
  function tidy(s) {
    return s.replace(/^\s*(?:(?:please|por favor|hey|jarvis|oye)[,\s]+)*(?:note|nota)\b\s*[:\-]?/i, " ").replace(VERBS, " ").replace(/\b(?:please|por favor|jarvis|hey|oye)\b/gi, " ").replace(/\s+/g, " ")
      .replace(/^(?:\s|[,.:;-]|\b(?:on|at|for|to|el|a|la|las|para|de|que)\b)+/i, "").replace(/(?:\s|[,.:;-]|\b(?:on|at|for|to|el|a|la|las|para|de|que)\b)+$/i, "").trim();
  }

  function fire(r) {
    const k = r.kind || "rem", msg = (k === "appt" ? (r.es ? "Cita ahora: " : "Appointment now: ") : (r.es ? "Recordatorio: " : "Reminder: ")) + r.text;
    window.dispatchEvent(new CustomEvent("jarvis-say", { detail: msg }));
    try { if (window.Notification && Notification.permission === "granted") new Notification("Jarvis", { body: r.text }); } catch (e) { /* ignore */ }
  }
  function check() {
    const now = Date.now(); let ch = false;
    S.rem.forEach((r) => { if (r.kind !== "note" && !r.done && r.t <= now) { r.done = true; ch = true; fire(r); } });
    if (ch) { S.rem = S.rem.filter((r) => r.kind === "note" || !r.done || now - r.t < 30 * U.d); save(); }
  }
  setInterval(check, 15000); document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); }); setTimeout(check, 1500);
  const ask = () => { try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) { /* ignore */ } };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const line = (r, es) => `${ICON[r.kind || "rem"]} ${fmt(r.t, es, (r.kind || "rem") !== "note")}: ${r.text}`;
  const taskList = (es) => S.tasks.length ? S.tasks.map((t, i) => `${i + 1}. ${t.done ? "✓ " : ""}${t.text}`).join("\n") : (es ? "No tiene tareas." : "You have no tasks.");

  window.JarvisPlanner = { all: () => S.rem, add(o) { S.rem.push(o); if (o.kind !== "note") ask(); save(); }, remove(id) { S.rem = S.rem.filter((r) => r.id !== id); save(); } };

  O.respond = async function (raw, tools, opts) {
    const n = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(), A0 = (opts && opts.address) || "sir";
    const es = /[¿¡ñáéíóú]/i.test(raw) || /\b(tarea|tareas|recuerdame|avisame|recordatorio|manana|agenda|resumen|borra|hecho|completa|agrega|anade|cita|citas|jueves|lunes|martes|miercoles|viernes|sabado|domingo|nota)\b/.test(n);
    const A = es ? ({ sir: "señor", madam: "señora", "ma'am": "señora" }[A0.toLowerCase()] || A0) : A0, D = window.JarvisDash; let m;
    if (/^(?:hey,?\s+|oye,?\s+)?(?:i\s+(?:really\s+)?(?:like|love)|me\s+(?:gusta|encanta))\s+(?:that|this|it|eso|esto)\b/.test(n))
      return es ? `Me alegra, ${A}. Si desea guardarlo, diga "nota: ..." y lo anoto.` : `Glad to hear it, ${A}. Should you wish me to keep it, say "note: ..." and I shall file it.`;
    const w = when(raw);
    const nm = n.match(/^(?:(?:please|por favor|hey|jarvis|oye)[,\s]+)*(?:(?:add|create|make|take|write|save|jot|put|agrega|agregar|anade|anadir|crea|crear|guarda|guardar|escribe|apunta|anota|anotar)\s+(?:(?:a|an|another|the|new|one|una|otra|nueva|mi|my)\s+)*(?:note|nota)|(?:new|nueva)\s+(?:note|nota)|(?:write|jot)\s+down|note|nota|anota|apunta|anotar)\b\s*(?:to self|that|to|:|-|que|de)?\s*(.*)$/), noteStart = !!nm;
    const apptKw = /\b(appointments?|meetings?|events?|citas?|reunion|reuniones|evento|eventos|schedule|book|agendar|doctor|dentist|dentista)\b/.test(n);
    const listKw = /\b(show|list|what|which|my|mis|mi|muestra|cuales|cual|tengo|ver|do i have)\b/.test(n), calKw = /\b(appointments?|citas?|reminders?|recordatorios?|calendar|calendario|schedule|agenda|events?|eventos?)\b/.test(n);
    const makeKw = /\b(set|book|add|create|make|put|pon|agrega|anade|programa|agendar|remind|recuerdame|avisame)\b/.test(n);

    if (noteStart && w) { // a note with a date goes onto the calendar, without an alarm
      const text = w.text || (es ? "Nota" : "Note"); window.JarvisPlanner.add({ id: Date.now(), t: w.t, text, es, kind: "note" });
      return es ? `Nota guardada para el ${fmt(w.t, true, false)}: ${text}.` : `Noted for ${fmt(w.t, false, false)}: ${text}.`;
    }
    if (noteStart) { // plain note: hand the text to the note engine in a form it always understands
      const text = raw.slice(raw.length - nm[1].length).trim();
      if (!text) return es ? `¿Qué desea que anote, ${A}?` : `What shall I note, ${A}?`;
      return base((es ? "anota: " : "add a note: ") + text, tools, opts);
    }
    if (!noteStart && listKw && calKw && !makeKw) {
      const all = S.rem.slice().sort((a, b) => a.t - b.t), sel = w && !/\b(in|en)\s+\d/.test(n) ? all.filter((r) => sameDay(r.t, w.t)) : all.filter((r) => r.kind === "note" || !r.done);
      return sel.length ? (es ? "Su calendario:\n" : "Your calendar:\n") + sel.slice(0, 15).map((r) => line(r, es)).join("\n") : (es ? "No hay nada en su calendario." : "Nothing on your calendar.");
    }
    if (w && !noteStart && (apptKw || REMKW.test(raw))) {
      const kind = apptKw && !REMKW.test(raw) ? "appt" : "rem", text = w.text || (es ? "Cita" : "Appointment");
      window.JarvisPlanner.add({ id: Date.now(), t: w.t, text, es, kind });
      return es ? `Muy bien, ${A}. ${kind === "appt" ? "Cita agendada" : "Le recordaré"}: "${text}" el ${fmt(w.t, true)}${kind === "appt" ? ". Ya está en su calendario" : ""} (se avisa mientras esta página esté abierta).`
        : `Very good, ${A}. ${kind === "appt" ? "Appointment booked" : "I shall remind you"}: "${text}" on ${fmt(w.t)}${kind === "appt" ? ", and it is on your calendar" : ""} (alerts sound while this page is open).`;
    }
    if ((m = n.match(/^(?:add (?:a )?(?:task|todo|to-do)|new task|nueva tarea|tarea|agrega(?: una)? tarea|anade(?: una)? tarea)\s*[:\-]?\s*(?:to\s+)?(.+)$/))) {
      const text = raw.slice(raw.length - m[1].length).trim(); S.tasks.push({ text, done: false }); save();
      return es ? `Anotada la tarea ${S.tasks.length}: ${text}.` : `Task ${S.tasks.length} added: ${text}.`;
    }
    if (/^(?:show |list |what are |what is |muestra |lista |cuales son |ver )?(?:my |mis |mi )?(?:tasks|to-?do list|todos?|tareas|pendientes)\??$/.test(n)) return taskList(es);
    if ((m = n.match(/^(?:done|complete|completed|check off|hecho|completa|termine|listo)\s+(?:task |tarea )?(\d+|.+)$/)) && S.tasks.length) {
      const i = /^\d+$/.test(m[1]) ? +m[1] - 1 : S.tasks.findIndex((t) => t.text.toLowerCase().includes(m[1]));
      if (S.tasks[i]) { S.tasks[i].done = true; save(); return (es ? "Completada: " : "Completed: ") + S.tasks[i].text; }
    }
    if ((m = n.match(/^(?:delete|remove|borra|elimina)\s+(?:task|tarea)\s+(\d+)$/)) && S.tasks[m[1] - 1]) { const [t] = S.tasks.splice(m[1] - 1, 1); save(); return (es ? "Eliminada: " : "Removed: ") + t.text; }
    if (/^(?:clear|borra|limpia)\s+(?:completed|done|hechas|completadas)(?: tasks| tareas)?$/.test(n)) { S.tasks = S.tasks.filter((t) => !t.done); save(); return es ? "Tareas completadas eliminadas." : "Completed tasks cleared."; }
    if (/\b(briefing|brief me|plan my day|my day|resumen del dia|mi dia|resumen de hoy)\b/.test(n)) {
      const p = S.rem.filter((r) => r.kind !== "note" && !r.done && r.t - Date.now() < 2 * U.d).sort((a, b) => a.t - b.t), open = S.tasks.filter((t) => !t.done), out = [];
      out.push(new Date().toLocaleDateString(es ? "es" : "en", { weekday: "long", day: "numeric", month: "long" }) + ".");
      const wt = D && D.weatherText(es); if (wt) out.push(wt);
      out.push(p.length ? (es ? "Agenda próxima:\n" : "Coming up:\n") + p.map((r) => "- " + line(r, es)).join("\n") : (es ? "Sin citas ni recordatorios próximos." : "No upcoming appointments or reminders."));
      out.push(open.length ? (es ? "Tareas pendientes:\n" : "Open tasks:\n") + open.slice(0, 6).map((t) => "- " + t.text).join("\n") : (es ? "Sin tareas pendientes." : "No open tasks."));
      const h = D ? D.headlines(3) : []; if (h.length) out.push((es ? "Titulares:\n- " : "Headlines:\n- ") + h.join("\n- "));
      return out.join("\n");
    }
    return base(raw, tools, opts);
  };
})();
