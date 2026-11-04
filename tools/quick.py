"""Quick load check: serve a folder, open the gate, descend, report console errors and what got built.
    python tools/quick.py <folder> <out.png> [viewport WxH]"""
import functools, http.server, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(sys.argv[1]).resolve(); OUT = Path(sys.argv[2]).resolve()
W, H = (int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "1100x700").split("x"))
HEADERS = []
_vj = ROOT.parent / "vercel.json" if (ROOT.parent / "vercel.json").exists() else Path("vercel.json")
if _vj.exists():
    import json
    HEADERS = [(h["key"], h["value"]) for rule in json.loads(_vj.read_text(encoding="utf-8")).get("headers", []) for h in rule["headers"]]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        for k, v in HEADERS: self.send_header(k, v)
        super().end_headers()
socketserver.ThreadingTCPServer.daemon_threads = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
port = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
msgs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_context(viewport={"width": W, "height": H}).new_page()
    pg.on("console", lambda m: msgs.append(f"{m.type}: {m.text[:200]}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: msgs.append(f"pageerror: {str(e)[:200]}"))
    pg.on("requestfailed", lambda r: msgs.append(f"failed: {r.url}"))
    pg.on("response", lambda r: msgs.append(f"{r.status}: {r.url.split('/', 3)[-1]}") if r.status >= 400 else None)
    pg.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
    pg.wait_for_selector("#gate-btn:not([disabled])", timeout=90000)
    print("gate:", pg.evaluate("() => document.getElementById('gate-btn').textContent"))
    pg.click("#gate-btn"); pg.wait_for_timeout(9000)
    print(pg.evaluate("() => { const e = window.__ita; let meshes = 0; e.chapters[0].group.traverse(o => { if (o.isMesh) meshes++; }); return { built: e.built, tier: e.quality.tier, fps: +e.fps.toFixed(1), meshes, chapter: e.scroll.state.chapter }; }"))
    pg.screenshot(path=str(OUT))
    b.close()
srv.shutdown()
print("console:", msgs if msgs else "clean")
