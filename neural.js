/* Neural-network background: drifting nodes, links, and signals that fire along them.
 * Reacts to Jarvis's state (idle / listening / thinking / speaking) and to the pointer. */
(function () {
  "use strict";
  const orb = document.getElementById("orb");
  const cv = document.createElement("canvas");
  cv.id = "neural"; cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none";
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  const lite = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) || (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4 || !!(navigator.connection && navigator.connection.saveData);
  const veryLow = (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
  const reduce = veryLow || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); // weak devices get a still background
  const MODES = { idle: [.55, [54, 209, 255]], listening: [.9, [61, 220, 151]], thinking: [1.4, [123, 108, 255]], speaking: [.8, [54, 209, 255]], error: [1.1, [255, 93, 115]] };
  let W = 0, H = 0, dpr = 1, nodes = [], pulses = [], energy = .55, target = .55, cur = MODES.idle[1].slice(), want = cur.slice(), col = cur.join(","), raf = 0;
  const ptr = { x: -9999, y: -9999 };

  function setMode() {
    const m = MODES[(orb && orb.dataset.state) || "idle"] || MODES.idle;
    target = m[0]; want = m[1];
  }
  if (orb) new MutationObserver(setMode).observe(orb, { attributes: true, attributeFilter: ["data-state"] });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = lite ? Math.max(16, Math.min(28, Math.round((W * H) / 30000))) : Math.max(28, Math.min(70, Math.round((W * H) / 20000)));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, r: 1.2 + Math.random() * 1.8,
    }));
    pulses = [];
    if (reduce) draw(0);
  }

  function draw(step) {
    ctx.clearRect(0, 0, W, H);
    energy += (target - energy) * .03;
    for (let i = 0; i < 3; i++) cur[i] += (want[i] - cur[i]) * .035; // colors fade smoothly between states
    col = cur.map(Math.round).join(",");
    const D = Math.max(90, Math.min(170, Math.min(W, H) * .22)), D2 = D * D;
    const adj = nodes.map(() => []), links = [];

    for (const p of nodes) {
      p.x += p.vx * energy * step * .6; p.y += p.vy * energy * step * .6;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < D2) {
          ctx.strokeStyle = `rgba(${col},${(1 - Math.sqrt(d2) / D) * .32})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          adj[i].push(j); adj[j].push(i); links.push([i, j]);
        }
      }
      const px = a.x - ptr.x, py = a.y - ptr.y, pd = Math.sqrt(px * px + py * py);
      if (pd < D * 1.2) {
        ctx.strokeStyle = `rgba(${col},${(1 - pd / (D * 1.2)) * .5})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ptr.x, ptr.y); ctx.stroke();
      }
    }
    for (const p of nodes) {
      const near = Math.hypot(p.x - ptr.x, p.y - ptr.y) < D;
      ctx.fillStyle = `rgba(${col},${near ? .95 : .55})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (near ? 1.5 : 1), 0, 6.283); ctx.fill();
    }
    if (reduce) return;

    if (links.length && Math.random() < .035 * energy && pulses.length < (lite ? 18 : 60)) {
      const [a, b] = links[(Math.random() * links.length) | 0];
      pulses.push(Math.random() < .5 ? { a, b, t: 0 } : { a: b, b: a, t: 0 });
    }
    pulses = pulses.filter((s) => {
      s.t += (.006 + .005 * energy) * step;
      const A = nodes[s.a], B = nodes[s.b];
      if (s.t >= 1) {
        const next = adj[s.b].filter((k) => k !== s.a);
        if (next.length && Math.random() < .75) { s.a = s.b; s.b = next[(Math.random() * next.length) | 0]; s.t = 0; return true; }
        return false;
      }
      const x = A.x + (B.x - A.x) * s.t, y = A.y + (B.y - A.y) * s.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, `rgba(${col},.95)`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
      return true;
    });
  }

  let last = 0;
  function loop(ts) {
    if (ts - last < (lite ? 48 : energy < .7 ? 33 : 0)) { raf = requestAnimationFrame(loop); return; } // ~30 fps on phones and tablets
    const step = Math.min((ts - last) / 16.7 || 1, 3); last = ts;
    draw(step);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!reduce && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
  addEventListener("pointerleave", () => { ptr.x = ptr.y = -9999; });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  document.addEventListener("jarvis:busy", (e) => { if (lite) { if (e.detail) stop(); else start(); } }); // pause the background while the local AI works
  resize(); setMode(); start();
})();
