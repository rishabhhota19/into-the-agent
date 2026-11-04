/**
 * The same visit as the written site keeps (its lib/visit.ts): one browser tab is one visit, saved
 * in sessionStorage under "visit", so a visitor who goes on from here to the written pages stays one
 * visit, and this page's time counts. Runs only when the page is served at the portfolio's own
 * address (/3d): at its own address the analytics Worker refuses the origin and the site's routes
 * are not there. Nothing the visitor typed is ever sent.
 */

const SITE = 'https://rishabh-hota.vercel.app';
const WORKER = 'https://rishabh-analytics.rishabh-hota.workers.dev';
const KEY = 'visit';
const MAX = 60;
/** Public ids: every visitor's browser receives them. */
const CF_BEACON_TOKEN = '4420083a9c9e4768b0bb66d9448c73d5';
const UMAMI_WEBSITE_ID = '95f9eb0f-b4fc-4ca7-80be-a196b4c9beee';
/** Presence pings stop once the visitor has been still this long. */
const IDLE_AFTER = 3 * 60_000;

interface Saved {
  sessionId: string;
  startedAt: string;
  pages: string[];
  actions: string[];
  referrer: string;
  utm: string;
  screen: string;
  language: string;
  timezone: string;
  activeMs: number;
}

let visit: Saved | null = null;
let visibleSince: number | null = null;
let lastSent = '';
let pinged = false;
let lastMoved = Date.now();

function save(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(visit));
  } catch {
    // private mode: the visit still works for this page
  }
}

function referrerHost(): string {
  try {
    const host = new URL(document.referrer).hostname;
    return host === location.hostname ? '' : host;
  } catch {
    return '';
  }
}

function utmTags(): string {
  const q = new URLSearchParams(location.search);
  return ['utm_source', 'utm_medium', 'utm_campaign']
    .map((k) => q.get(k))
    .filter(Boolean)
    .join(' / ')
    .slice(0, 200);
}

function current(): Saved {
  if (!visit) {
    try {
      visit = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved | null;
    } catch {
      visit = null;
    }
    visit ??= {
      sessionId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      pages: [],
      actions: [],
      referrer: referrerHost(),
      utm: utmTags(),
      screen: `${screen.width}×${screen.height}`,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      activeMs: 0,
    };
    visibleSince ??= document.visibilityState === 'visible' ? Date.now() : null;
    save();
  }
  return visit;
}

function addPage(path: string): void {
  const v = current();
  if (v.pages[v.pages.length - 1] !== path && v.pages.length < MAX) {
    v.pages.push(path);
    save();
  }
}

/** Something the visitor did here, in the same list the written site keeps. */
export function addAction(name: string): void {
  if (location.origin !== SITE) return;
  const v = current();
  if (v.actions.length < MAX) {
    v.actions.push(name);
    save();
  }
}

/** Counts time only while the tab is visible. */
function setVisible(visible: boolean): void {
  const v = current();
  if (!visible && visibleSince !== null) {
    v.activeMs += Date.now() - visibleSince;
    visibleSince = null;
    save();
  } else if (visible && visibleSince === null) {
    visibleSince = Date.now();
  }
}

/** Presence for the dashboard: on load and every 30 s, while the tab is visible and the visitor is about. */
function ping(): void {
  const v = current();
  const page = v.pages[v.pages.length - 1];
  if (!page || document.visibilityState !== 'visible' || Date.now() - lastMoved > IDLE_AFTER) return;
  const body = JSON.stringify({ sessionId: v.sessionId, page, first: !pinged, referrer: v.referrer, utm: v.utm });
  pinged = true;
  const viaSite = (): void => {
    fetch('/api/visit/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  // Straight to the Worker as text/plain, so the browser sends no preflight; the site's route is the fallback.
  fetch(`${WORKER}/live`, { method: 'POST', body, keepalive: true }).catch(viaSite);
}

/** The visit report, when the tab is hidden or closed. Skipped when nothing much changed. */
function sendVisit(): void {
  const { activeMs, ...rest } = current();
  const activeSeconds = Math.round(activeMs / 1000);
  const changed = `${rest.pages.length}:${rest.actions.length}:${Math.floor(activeSeconds / 30)}`;
  if (changed === lastSent || rest.pages.length === 0) return;
  lastSent = changed;
  const body = JSON.stringify({ ...rest, activeSeconds });
  const sent = navigator.sendBeacon?.('/api/visit', new Blob([body], { type: 'application/json' }));
  if (!sent) {
    fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}

/** The two analytics beacons the written site carries, added once the page is idle. */
function beacons(): void {
  const add = (src: string, attrs: Record<string, string>): void => {
    const s = document.createElement('script');
    s.defer = true;
    s.src = src;
    for (const [k, val] of Object.entries(attrs)) s.setAttribute(k, val);
    document.head.appendChild(s);
  };
  add('https://static.cloudflareinsights.com/beacon.min.js', { 'data-cf-beacon': JSON.stringify({ token: CF_BEACON_TOKEN }) });
  add('https://cloud.umami.is/script.js', {
    'data-website-id': UMAMI_WEBSITE_ID,
    'data-domains': 'rishabh-hota.vercel.app',
    'data-do-not-track': 'true',
  });
}

export function startAnalytics(): void {
  if (location.origin !== SITE) return;
  addPage(location.pathname);
  setVisible(document.visibilityState === 'visible');
  const moved = (): void => {
    lastMoved = Date.now();
  };
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, moved, { passive: true });
  ping();
  window.setInterval(ping, 30_000);
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    setVisible(visible);
    if (visible) ping();
    else sendVisit();
  });
  window.addEventListener('pagehide', () => {
    setVisible(false);
    sendVisit();
  });
  const idle = (cb: () => void): void => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 4000 });
    else window.setTimeout(cb, 1500);
  };
  if (document.readyState === 'complete') idle(beacons);
  else window.addEventListener('load', () => idle(beacons), { once: true });
}
