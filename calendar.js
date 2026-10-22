/* Small calendar: month grid + day list. Shows appointments, reminders and notes (dated notes and notes taken that day). */
(function () {
  "use strict";
  const P = window.JarvisPlanner, $ = (id) => document.getElementById(id); if (!P || !$("cal")) return;
  const loc = navigator.language || "en-US", es = loc.slice(0, 2) === "es", ICON = { appt: "📅", rem: "⏰", note: "📝" };
  let cur = new Date(); cur.setDate(1); let sel = new Date();
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  function items(k) {
    const out = P.all().filter((r) => ymd(new Date(r.t)) === k).map((r) => ({ id: r.id, t: r.t, kind: r.kind || "rem", text: r.text, done: r.done }));
    try { JSON.parse(localStorage.getItem("jarvis.notes") || "[]").forEach((n) => { if (String(n.ts).slice(0, 10) === k) out.push({ t: new Date(String(n.ts).replace(" ", "T")).getTime(), kind: "note", text: n.text, ro: 1 }); }); } catch (e) { /* ignore */ }
    return out.sort((a, b) => a.t - b.t);
  }
  function render() {
    const y = cur.getFullYear(), m = cur.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), today = ymd(new Date());
    $("calTitle").textContent = cur.toLocaleDateString(loc, { month: "long", year: "numeric" });
    let h = ""; for (let i = 0; i < 7; i++) h += `<b>${new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "narrow" })}</b>`;
    for (let i = 0; i < first; i++) h += "<i></i>";
    for (let d = 1; d <= days; d++) { const k = ymd(new Date(y, m, d)); h += `<button type="button" data-d="${k}" class="${k === today ? "today " : ""}${k === ymd(sel) ? "sel " : ""}${items(k).length ? "has" : ""}">${d}</button>`; }
    $("calGrid").innerHTML = h;
    $("calDay").textContent = sel.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });
    const ul = $("calList"); ul.textContent = "";
    const list = items(ymd(sel)); if (!list.length) { const li = document.createElement("li"); li.textContent = es ? "Nada este día." : "Nothing this day."; ul.appendChild(li); }
    list.forEach((r) => {
      const li = document.createElement("li"), sp = document.createElement("span");
      sp.textContent = `${ICON[r.kind]} ${r.kind === "note" ? "" : new Date(r.t).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) + " "}${r.text}`; if (r.done) sp.style.opacity = .5; li.appendChild(sp);
      if (!r.ro) { const b = document.createElement("button"); b.type = "button"; b.className = "ghost sm"; b.textContent = "✕"; b.setAttribute("aria-label", "Delete"); b.onclick = () => P.remove(r.id); li.appendChild(b); }
      ul.appendChild(li);
    });
  }
  $("calGrid").addEventListener("click", (e) => { const b = e.target.closest("button[data-d]"); if (!b) return; const [y, m, d] = b.dataset.d.split("-"); sel = new Date(+y, +m - 1, +d); render(); });
  $("calPrev").onclick = () => { cur.setMonth(cur.getMonth() - 1); render(); };
  $("calNext").onclick = () => { cur.setMonth(cur.getMonth() + 1); render(); };
  $("calForm").addEventListener("submit", (e) => {
    e.preventDefault(); const text = $("calText").value.trim(); if (!text) return;
    const [hh, mm] = ($("calTime").value || "09:00").split(":"), t = new Date(sel); t.setHours(+hh, +mm, 0, 0);
    P.add({ id: Date.now(), t: +t, text, es, kind: $("calKind").value }); $("calText").value = "";
  });
  window.addEventListener("planner-change", () => { if ($("cal").open) render(); });
  $("calBtn").addEventListener("click", () => { sel = new Date(); cur = new Date(sel.getFullYear(), sel.getMonth(), 1); render(); if (!$("cal").open) $("cal").showModal(); });
  $("calClose").onclick = () => $("cal").close();
})();
