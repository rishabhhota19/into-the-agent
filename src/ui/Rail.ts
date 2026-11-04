import type { ScrollState } from '../scroll/VirtualScroll';
import type { Chapter } from '../world/Chapter';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Below this width the rail is a row along the bottom edge instead of a column in a corner. */
const NARROW = 640;
/** Breathing room between the rail and a station text before the rail gives way. */
const MARGIN = 18;

/**
 * The rail: one button per chamber, standing in a lower corner. Click one and
 * the descent warps there. It keeps to the corner the current text leaves free,
 * so it is never under the words: left by default, right when the text is left.
 */
export class Rail {
  private readonly el = document.getElementById('rail') as HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private side: 'left' | 'right' = 'left';
  private active = -1;
  /** The chamber a click asked for, until the travel arrives. */
  private pending = -1;
  private pendingAt = 0;
  private enRoute = false;
  private tick = 0;
  private lastText: HTMLElement | null = null;

  constructor(
    private readonly chapters: Chapter[],
    private readonly onGo: (k: number) => void,
  ) {
    chapters.forEach((c, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rail__btn';
      b.dataset.k = String(k);
      b.setAttribute('aria-label', `Go to ${c.label}`);
      b.innerHTML = `<span class="rail__tick" aria-hidden="true"></span><span class="rail__label mono">${esc(c.label)}</span>`;
      b.addEventListener('click', () => this.go(k));
      this.el.appendChild(b);
      this.buttons.push(b);
    });
    // Number keys jump too: 1 is the surface, 2 the first chamber down.
    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
      const k = Number.parseInt(e.key, 10) - 1;
      if (Number.isInteger(k) && k >= 0 && k < this.chapters.length) this.go(k);
    });
    window.addEventListener('resize', () => this.place());
    this.setActive(0);
  }

  show(): void {
    this.el.classList.add('is-on');
    this.place();
  }

  /** Hidden while a project window covers the scene. */
  setCovered(covered: boolean): void {
    this.el.classList.toggle('is-covered', covered);
  }

  private go(k: number): void {
    this.pending = k;
    this.pendingAt = performance.now();
    this.enRoute = false;
    this.setActive(k);
    this.onGo(k);
  }

  private setActive(k: number): void {
    if (k === this.active) return;
    this.active = k;
    this.buttons.forEach((b, i) => {
      if (i === k) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    this.el.style.setProperty('--accent', `#${this.chapters[k].accent.getHexString()}`);
  }

  update(st: ScrollState, activeText: HTMLElement | null): void {
    let k = st.chapter;
    if (st.plunging && st.u > 0.5) k = Math.min(k + 1, this.chapters.length - 1);
    if (this.pending >= 0) {
      if (st.traveling) {
        this.enRoute = true;
        k = this.pending;
      } else if (this.enRoute || performance.now() - this.pendingAt > 4000) {
        this.pending = -1;
        this.enRoute = false;
      } else {
        k = this.pending;
      }
    }
    this.setActive(k);
    this.el.classList.toggle('is-traveling', st.traveling);

    // Give way to the words: check the berth the moment a text changes, otherwise now and then.
    const changed = activeText !== this.lastText;
    this.lastText = activeText;
    if (!changed && (this.tick++ & 7) !== 0) return;
    const want = this.berthFor(activeText);
    if (want !== this.side) {
      this.side = want;
      this.place();
    }
  }

  /** Which corner is free of the current text; the current one when both are. */
  private berthFor(text: HTMLElement | null): 'left' | 'right' {
    if (window.innerWidth < NARROW) return 'left';
    if (!text) return this.side;
    const r = text.getBoundingClientRect();
    if (r.width === 0) return this.side;
    const me = this.el.getBoundingClientRect();
    const gutter = this.el.offsetLeft;
    const w = this.el.offsetWidth;
    // The rail's box in either corner (same height and bottom, mirrored).
    const top = me.top - MARGIN;
    const bottom = me.bottom + MARGIN;
    const vertical = r.bottom > top && r.top < bottom;
    if (!vertical) return this.side;
    const leftFree = !(r.right > gutter - MARGIN && r.left < gutter + w + MARGIN);
    const rightFree = !(r.right > window.innerWidth - gutter - w - MARGIN && r.left < window.innerWidth - gutter + MARGIN);
    if (this.side === 'left' && leftFree) return 'left';
    if (this.side === 'right' && rightFree) return 'right';
    if (leftFree) return 'left';
    if (rightFree) return 'right';
    return this.side;
  }

  private place(): void {
    const right = this.side === 'right' && window.innerWidth >= NARROW;
    const x = right ? window.innerWidth - this.el.offsetWidth - 2 * this.el.offsetLeft : 0;
    this.el.style.setProperty('--rail-x', `${Math.max(0, Math.round(x))}px`);
    this.el.classList.toggle('rail--right', right);
  }
}
