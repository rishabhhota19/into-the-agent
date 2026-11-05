import type { ScrollState } from '../scroll/VirtualScroll';
import type { Chapter } from '../world/Chapter';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The HTML layer: gate, loader, brand corner, station texts, scroll hint. No meters, no counters. */
export class Overlay {
  private readonly gate = document.getElementById('gate') as HTMLDivElement;
  private readonly bar = document.getElementById('gate-bar') as HTMLSpanElement;
  private readonly btn = document.getElementById('gate-btn') as HTMLButtonElement;
  private readonly note = document.getElementById('gate-note') as HTMLParagraphElement;
  private readonly brand = document.querySelector('.brand') as HTMLElement;
  private readonly hint = document.getElementById('hint') as HTMLDivElement;
  private readonly texts = document.getElementById('texts') as HTMLDivElement;
  private readonly nodes: { chapter: number; t: number; half: number; el: HTMLElement }[] = [];
  private hintShown = false;
  private canEnter = false;
  private wantsIn = false;
  /** Fired when a station link points at a project window (`#project:slug`). */
  onProject?: (slug: string) => void;
  /** Fired when a station link points at another chamber (`#go:id`). */
  onGo?: (id: string) => void;
  /** The station text showing right now, for anything that must keep out of its way. */
  active: HTMLElement | null = null;

  constructor(chapters: Chapter[]) {
    this.texts.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a.text__link') as HTMLAnchorElement | null;
      const href = a?.getAttribute('href') ?? '';
      if (!a) return;
      if (href.startsWith('#project:')) {
        e.preventDefault();
        this.onProject?.(href.slice('#project:'.length));
      } else if (href.startsWith('#go:')) {
        e.preventDefault();
        this.onGo?.(href.slice('#go:'.length));
      }
    });
    chapters.forEach((c, k) => {
      const ts = c.texts.map((x) => x.t).sort((a, b) => a - b);
      let gap = 1;
      for (let i = 1; i < ts.length; i++) gap = Math.min(gap, ts[i] - ts[i - 1]);
      const half = Math.min(0.11, gap * 0.42);
      for (const txt of c.texts) {
        const el = document.createElement('div');
        const long = txt.title.replace(/<[^>]*>/g, '').length > 70;
        el.className = `text text--${txt.align}${long ? ' text--long' : ''}`;
        el.style.setProperty('--accent', `#${c.accent.getHexString()}`);
        const tags = txt.tags?.length ? `<ul class="text__tags">${txt.tags.map((t) => `<li class="chip">${esc(t)}</li>`).join('')}</ul>` : '';
        const internal = txt.link?.href.startsWith('#') ?? false;
        const link = txt.link
          ? `<a class="text__link" href="${esc(txt.link.href)}"${internal ? '' : ' target="_blank" rel="noopener"'}>${esc(txt.link.label)} →</a>`
          : '';
        el.innerHTML =
          (txt.kicker ? `<p class="text__kicker mono">${esc(txt.kicker)}</p>` : '') +
          `<h2 class="text__title">${txt.title}</h2>` +
          (txt.body ? `<p class="text__body">${esc(txt.body)}</p>` : '') +
          tags +
          link;
        this.texts.appendChild(el);
        this.nodes.push({ chapter: k, t: txt.t, half, el });
      }
    });
  }

  progress(p: number): void {
    this.btn.textContent = p < 0.72 ? 'building the chambers…' : p < 0.8 ? 'warming up…' : 'settling the picture…';
    this.bar.style.width = `${Math.round(p * 100)}%`;
    this.bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  ready(onStart: () => void): void {
    this.btn.disabled = false;
    this.btn.textContent = 'descend';
    this.btn.addEventListener(
      'click',
      () => {
        this.gate.classList.add('is-off');
        this.brand.classList.add('is-on');
        onStart();
        window.setTimeout(() => {
          if (!this.hintShown) this.hint.classList.add('is-on');
        }, 2200);
      },
      { once: true },
    );
    this.canEnter = true;
    if (this.wantsIn) this.btn.click();
  }

  /** Dumbledore is taking the visitor somewhere from the gate: go through it for them, as soon as it can open. */
  enter(): void {
    if (!this.canEnter) this.wantsIn = true;
    else if (!this.gate.classList.contains('is-off')) this.btn.click();
  }

  fail(message: string): void {
    this.btn.textContent = 'unavailable';
    this.note.textContent = message;
  }

  update(st: ScrollState, touched: boolean): void {
    if (touched && !this.hintShown) {
      this.hintShown = true;
      this.hint.classList.remove('is-on');
    }
    let active: HTMLElement | null = null;
    for (const n of this.nodes) {
      const on = !st.plunging && !st.traveling && n.chapter === st.chapter && Math.abs(n.t - st.t) < n.half;
      n.el.classList.toggle('is-on', on);
      if (on) active = n.el;
    }
    this.active = active;
  }
}
