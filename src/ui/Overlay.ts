import { iconFor } from './icons';
import type { Chip } from '../content/types';
import type { ScrollState } from '../scroll/VirtualScroll';
import type { Chapter } from '../world/Chapter';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A chip: a word, or a card that opens something, with its second line and its count when it has them. */
export function chipHtml(c: Chip | string): string {
  const chip = typeof c === 'string' ? { label: c } : c;
  const inner =
    esc(chip.label) +
    (chip.n && chip.n > 1 ? `<span class="chip__n">${chip.n}</span>` : '') +
    (chip.note ? `<span class="chip__note">${esc(chip.note)}</span>` : '');
  const card = chip.note ? ' chip--card' : '';
  if (chip.href) {
    const internal = chip.href.startsWith('#');
    return `<li><a class="chip chip--link${card}" href="${esc(chip.href)}"${internal ? '' : ' target="_blank" rel="noopener"'}>${inner}</a></li>`;
  }
  return `<li class="chip${card}">${inner}</li>`;
}

/** The HTML layer: gate, loader, brand corner, station texts, scroll hint. No meters, no counters. */
export class Overlay {
  private readonly gate = document.getElementById('gate') as HTMLDivElement;
  private readonly bar = document.getElementById('gate-bar') as HTMLSpanElement;
  private readonly status = document.getElementById('gate-status') as HTMLParagraphElement;
  private readonly note = document.getElementById('gate-note') as HTMLParagraphElement;
  private readonly brand = document.querySelector('.brand') as HTMLElement;
  private readonly hint = document.getElementById('hint') as HTMLDivElement;
  private readonly texts = document.getElementById('texts') as HTMLDivElement;
  private readonly nodes: { chapter: number; t: number; half: number; el: HTMLElement }[] = [];
  private hintShown = false;
  /** Fired for every link that points inside the descent (`#project:`, `#item:`, `#skill:`, `#go:`, `#ask`). */
  onLink?: (href: string) => void;
  /** The station text showing right now, for anything that must keep out of its way. */
  active: HTMLElement | null = null;

  constructor(chapters: Chapter[]) {
    const depth = document.getElementById('gate-depth');
    if (depth) depth.textContent = String(chapters.length);
    this.texts.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      this.onLink?.(a.getAttribute('href') ?? '');
    });
    chapters.forEach((c, k) => {
      const ts = c.texts.map((x) => x.t).sort((a, b) => a - b);
      let gap = 1;
      for (let i = 1; i < ts.length; i++) gap = Math.min(gap, ts[i] - ts[i - 1]);
      const half = Math.min(0.11, gap * 0.42);
      for (const txt of c.texts) {
        const el = document.createElement('div');
        const long = txt.title.replace(/<[^>]*>/g, '').length > 70;
        // A wall of chips (a skill group, a trio of certificates) gets a wider, quieter card.
        const wall = (txt.tags?.length ?? 0) > 4 && txt.tags!.some((t) => typeof t !== 'string' && (t.href || t.note));
        el.className = `text text--${txt.align}${long ? ' text--long' : ''}${wall ? ' text--wall' : ''}`;
        el.style.setProperty('--accent', `#${c.accent.getHexString()}`);
        const tags = txt.tags?.length ? `<ul class="text__tags">${txt.tags.map(chipHtml).join('')}</ul>` : '';
        const internal = txt.link?.href.startsWith('#') ?? false;
        const link = txt.link
          ? `<a class="text__link" href="${esc(txt.link.href)}"${internal ? '' : ' target="_blank" rel="noopener"'}>${esc(txt.link.label)} →</a>`
          : '';
        el.innerHTML =
          (txt.kicker ? `<p class="text__kicker mono">${esc(txt.kicker)}</p>` : '') +
          iconFor(txt.slug) +
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
    this.status.textContent = p < 0.72 ? 'building the chambers…' : p < 0.8 ? 'warming up…' : 'settling the picture…';
    this.bar.style.width = `${Math.round(p * 100)}%`;
    this.bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  /** The descent is ready: the gate opens by itself (there is nothing to click), the brand corner comes on. */
  ready(onStart: () => void): void {
    this.status.textContent = 'descending';
    this.bar.style.width = '100%';
    window.setTimeout(() => {
      this.gate.classList.add('is-off');
      this.brand.classList.add('is-on');
      onStart();
      window.setTimeout(() => {
        if (!this.hintShown) this.hint.classList.add('is-on');
      }, 2200);
    }, 350);
  }

  fail(message: string): void {
    this.status.textContent = 'unavailable';
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
