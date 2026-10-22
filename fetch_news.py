"""Builds news.json from Google News RSS (server side, so the browser never hits CORS). Runs in GitHub Actions."""
import json, os, time, urllib.request, xml.etree.ElementTree as ET

hl, gl = os.environ.get("NEWS_HL", "es-419"), os.environ.get("NEWS_GL", "CL")  # language and country
url = f"https://news.google.com/rss?hl={hl}&gl={gl}&ceid={gl}:{hl}"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (jarvis-news-bot)"})
root = ET.fromstring(urllib.request.urlopen(req, timeout=30).read())
items, seen = [], set()
for it in root.iter("item"):
    title, link, src = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip(), (it.findtext("source") or "").strip()
    if src and title.endswith(" - " + src):
        title = title[: -len(src) - 3]
    elif not src and " - " in title:
        title, src = title.rsplit(" - ", 1)
    key = title.lower()[:40]
    if len(title) > 15 and link.startswith("http") and key not in seen:
        seen.add(key)
        items.append({"t": title, "u": link, "s": src})
    if len(items) >= 15:
        break
if items:  # never overwrite good data with an empty result
    with open("news.json", "w", encoding="utf-8") as f:
        json.dump({"t": int(time.time() * 1000), "items": items}, f, ensure_ascii=False)
