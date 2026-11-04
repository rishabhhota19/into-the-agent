"""Headless pass over the built demo: open the gate, visit stations, stop inside a plunge, land in the halls.

    python tools/shoot.py dist tools/out [desk|phone|reduced]
"""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
MODE = sys.argv[3] if len(sys.argv) > 3 else "desk"
OUT.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.daemon_threads = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

msgs = []
# (name, chapter, zone, fraction): zone "c" = content position, "p" = plunge position
SHOTS = [
    ("01-arrival", 0, "c", 0.0),
    ("02-wins", 0, "c", 0.42),
    ("03-edge", 0, "c", 0.82),
    ("04-plunge-stopped", 0, "p", 0.5),
    ("05-projects-intro", 1, "c", 0.0),
    ("06-project-1", 1, "c", "s1"),
    ("07-project-2", 1, "c", "s2"),
    ("08-projects-pit", 1, "p", 0.35),
    ("09-research-1", 2, "c", "s1"),
    ("10-experience-1", 3, "c", "s1"),
    ("11-writing-1", 4, "c", "s1"),
    ("12-services-1", 5, "c", "s1"),
    ("12b-services-how", 5, "c", "s8"),
    ("13-contact-1", 6, "c", "s1"),
]

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    if MODE == "phone":
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    elif MODE == "reduced":
        ctx = b.new_context(viewport={"width": 1100, "height": 700}, reduced_motion="reduce")
    else:
        ctx = b.new_context(viewport={"width": 1100, "height": 700})
    pg = ctx.new_page()
    pg.on("console", lambda m: msgs.append(f"{m.type}: {m.text[:300]}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: msgs.append(f"pageerror: {str(e)[:300]}"))
    pg.on("requestfailed", lambda r: msgs.append(f"failed: {r.url}"))
    pg.goto(f"http://127.0.0.1:{port}/index.html?tier=full", wait_until="load")
    pg.wait_for_selector("#gate-btn:not([disabled])", timeout=90000)
    pg.screenshot(path=str(OUT / f"{MODE}-00-gate.png"))
    pg.click("#gate-btn")
    pg.wait_for_timeout(3000)

    def state():
        return pg.evaluate("() => { const e = window.__ita; const s = e.scroll.state; return { ch: s.chapter, t: +s.t.toFixed(2), u: +s.u.toFixed(2), plunging: s.plunging, smear: +e.scroll.smear.toFixed(2), traveling: s.traveling, tier: e.quality.tier, texts: [...document.querySelectorAll('.text.is-on')].length }; }")

    def go(k, zone, frac):
        if isinstance(frac, str):  # station index
            frac = pg.evaluate("([k, i]) => window.__ita.chapters[k].stations[i]", [k, int(frac[1:])])
        pg.evaluate("([k, f, p]) => window.__ita.scroll.goTo(k, f, p)", [k, frac, zone == "p"])

    # Prove the plunge is scroll-driven and stoppable: scroll fast into it, then stop and wait.
    pg.mouse.move(550, 350)
    for name, k, zone, frac in SHOTS:
        go(k, zone, frac)
        pg.wait_for_timeout(5200)
        if zone == "c":
            # Slow headless GPUs chase the station late: wait for its text, then let it fade in.
            try:
                pg.wait_for_selector(".text.is-on", timeout=15000)
                pg.wait_for_timeout(900)
            except Exception:
                pass
        pg.screenshot(path=str(OUT / f"{MODE}-{name}.png"))
        print(name, state())
        if name == "03-edge":
            for _ in range(14):
                pg.mouse.wheel(0, 100)
                pg.wait_for_timeout(16)
            pg.wait_for_timeout(240)
            pg.screenshot(path=str(OUT / f"{MODE}-03b-plunge-moving.png"))
            print("03b-plunge-moving", state())
        if name == "06-project-1":
            # The project window: open from the station link, scroll its stage, move to the next, close.
            pg.click(".text.is-on a.text__link[href^='#project:']")
            pg.wait_for_timeout(2600)
            pg.screenshot(path=str(OUT / f"{MODE}-06b-window-open.png"))
            pg.evaluate("() => { const s = document.getElementById('proj-scroll'); s.scrollTop = (s.scrollHeight - s.clientHeight) * 0.55; }")
            pg.wait_for_timeout(2200)
            pg.screenshot(path=str(OUT / f"{MODE}-06c-window-mid.png"))
            print("06c-window", pg.evaluate("() => ({ open: window.__ita.window.isOpen, p: +window.__ita.window.progress.toFixed(2), title: document.getElementById('proj-title').textContent })"))
            pg.click("#proj-next")
            pg.wait_for_timeout(2600)
            pg.screenshot(path=str(OUT / f"{MODE}-06d-window-next.png"))
            print("06d-next", pg.evaluate("() => document.getElementById('proj-title').textContent"))
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(1500)
            print("06e-closed", state())
        if name == "13-contact-1":
            # The rail: click Home from the last chamber and warp back up through everything.
            print("13b-rail", pg.evaluate("() => ({ rail: [...document.querySelectorAll('.rail__btn')].map((b) => b.textContent.trim()), active: document.querySelector('.rail__btn[aria-current]')?.textContent.trim(), side: document.getElementById('rail').className })"))
            pg.click(".rail__btn[data-k='1']")
            pg.wait_for_timeout(900)
            pg.screenshot(path=str(OUT / f"{MODE}-13c-warp-moving.png"))
            print("13c-warp-moving", state())
            try:
                pg.wait_for_function("() => !window.__ita.scroll.state.traveling", timeout=20000)
                pg.wait_for_selector(".text.is-on", timeout=15000)
                pg.wait_for_timeout(900)
            except Exception:
                pass
            pg.screenshot(path=str(OUT / f"{MODE}-13d-warp-arrived.png"))
            print("13d-warp-arrived", state(), pg.evaluate("() => document.querySelector('.rail__btn[aria-current]')?.textContent.trim()"))
    b.close()
srv.shutdown()
print("console:", msgs[:12] if msgs else "clean")
