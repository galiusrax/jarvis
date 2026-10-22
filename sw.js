/* Service worker: lets Jarvis open and run with no connection after the first visit.
 * Caches this site's files and the AI library from jsdelivr. Model files are cached by Transformers.js itself.
 * API calls (Gemini, Wikipedia, weather) are never cached. */
const CACHE = "jarvis-shell-v10";
const SHELL = ["./", "index.html", "style.css", "config.js", "jarvis-core.js", "offline.js", "chat.js", "memory.js", "web.js", "localai.js", "app.js", "neural.js", "dash.js", "ghmodels.js", "assistant.js", "calendar.js", "analysis.js", "photo.js", "brain.js", "icon-512.png", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET") return;
  const same = u.origin === location.origin, cdn = u.hostname === "cdn.jsdelivr.net";
  if (!same && !cdn) return;
  const store = (r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; };
  if (cdn) { // library files never change for a pinned version: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(store)));
  } else { // our own files: network first, cache when offline
    e.respondWith(fetch(req).then(store).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
  }
});
