"""Frame-time sample on the real GPU: a headed browser, the gate, then wheel-driven scrolling.

    python tools/perf.py <url-or-folder> [WxH]

Prints, for a 6 s sample through the first chamber and plunge and a second through the vault:
frames, fps, average, p95 and worst frame (ms), frames over 33 and 50 ms, draw calls, and the
state at the worst frame. A folder is served locally; a URL is opened as is.
"""
import functools, http.server, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

target = sys.argv[1]
SIZE = sys.argv[2] if len(sys.argv) > 2 else "1456x816"
W, H = (int(x) for x in SIZE.split("x")[:2])
DPR = float(SIZE.split("x")[2]) if SIZE.count("x") == 2 else 1.0  # e.g. 1536x864x1.25 = 1920x1080 device pixels
srv = None
if not target.startswith("http"):
    root = Path(target).resolve()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    socketserver.ThreadingTCPServer.daemon_threads = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    target = f"http://127.0.0.1:{srv.server_address[1]}/index.html"

SAMPLE = """
([secs, pushPx]) => new Promise((res) => {
  const e = window.__ita; const times = []; const worst = { ms: 0, state: null };
  let last = performance.now(); const t0 = last;
  const tick = () => {
    const now = performance.now(); const d = now - last; last = now; times.push(d);
    if (d > worst.ms) { worst.ms = d; worst.state = { ...e.scroll.state, built: e.built }; }
    if (pushPx) e.scroll.push(pushPx);
    if (now - t0 < secs * 1000) requestAnimationFrame(tick);
    else {
      times.shift(); const s = [...times].sort((a, b) => a - b); const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const gl = e.renderer.getContext();
      res({ frames: times.length, fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(1), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(1),
            worstMs: +worst.ms.toFixed(1), over33: times.filter((t) => t > 33).length, over50: times.filter((t) => t > 50).length,
            calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles, tier: e.quality.tier, worstAt: worst.state });
    }
  };
  requestAnimationFrame(tick);
})
"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=False, args=["--ignore-gpu-blocklist", f"--window-size={int(W * DPR)},{int(H * DPR) + 90}", "--window-position=0,0"])
    pg = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR).new_page()
    errors = []
    pg.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" else None)
    import time
    t_nav = time.time()
    pg.goto(target, wait_until="load")
    pg.wait_for_selector("#gate-btn:not([disabled])", timeout=90000)
    print(f"gate ready after {time.time() - t_nav:.1f} s;", pg.evaluate("() => { const e = window.__ita; return { tier: e.quality.tier, scale: e['pipeline'].renderScale, fpsUnderGate: +e.fps.toFixed(1), built: e.built }; }"))
    print("gpu:", pg.evaluate("() => { const gl = window.__ita.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; }"))
    pg.click("#gate-btn")
    pg.wait_for_timeout(5000)
    import os
    if os.environ.get("PERF_JS"):
        print("js:", pg.evaluate("(js) => { try { return String(eval(js)); } catch (e) { return 'err ' + e; } }", os.environ["PERF_JS"]))
    if len(sys.argv) > 3:
        pg.evaluate(f"() => {{ window.__ita.shadowEvery = {int(sys.argv[3])}; }}")
        print("shadowEvery:", sys.argv[3])
    print("size:", pg.evaluate("() => [innerWidth, innerHeight, devicePixelRatio]"), "tier after probe:", pg.evaluate("() => window.__ita.quality.tier"))
    print("A gantry→plunge→vault, 6 s wheel:", pg.evaluate(SAMPLE, [6, 55]))
    if os.environ.get("PERF_LONG"):
        pg.evaluate("() => { const e = window.__ita; e.scroll.goTo(0, 0); }"); pg.wait_for_timeout(3000)
        print("L whole descent, 36 s wheel:", pg.evaluate(SAMPLE, [36, 60]))
    pg.evaluate("() => { const e = window.__ita; e.scroll.goTo(1, e.chapters[1].stations[2]); }")
    pg.wait_for_timeout(3500)
    print("B vault, 6 s wheel:", pg.evaluate(SAMPLE, [6, 45]))
    pg.evaluate("() => { const e = window.__ita; e.scroll.goTo(5, e.chapters[5].stations[1]); }")
    pg.wait_for_timeout(3500)
    print("C dock, 6 s wheel:", pg.evaluate(SAMPLE, [6, 45]))
    print("D idle at a station, 3 s:", pg.evaluate(SAMPLE, [3, 0]))
    print("console errors:", errors or "none")
    b.close()
if srv: srv.shutdown()
