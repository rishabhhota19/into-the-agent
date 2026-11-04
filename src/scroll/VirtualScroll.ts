import { clamp } from '../util/noise';

/**
 * Virtual scroll: the page never scrolls. Wheel, touch and keys move a target in
 * pixels; the position chases it with inertia, so every input feels pushed through water.
 *
 * Each chamber owns a content span (stations to rest at) followed by a plunge span.
 * The plunge is scroll-driven like everything else: you can slow it, stop in it and
 * come back up. `smear` grows with speed inside a plunge and fades when you stop.
 */
export interface ChapterSpan {
  content: number;
  plunge: number;
  /** Station positions, 0..1 of the content span. */
  stations: number[];
}

export interface ScrollState {
  chapter: number;
  /** 0..1 through the chamber's content. */
  t: number;
  /** 0..1 through the plunge after it, 0 outside one. */
  u: number;
  plunging: boolean;
  /** True while a rail click is carrying you to another chamber. */
  traveling: boolean;
}

interface Bounds {
  start: number;
  mid: number;
  end: number;
}

/** Scroll speed (px/s) at which the smear reaches full strength. */
const SMEAR_SPEED = 2600;

export class VirtualScroll {
  position = 0;
  target = 0;
  /** px per second, signed. */
  velocity = 0;
  /** 0..1 travel intensity for the post pipeline. */
  smear = 0;
  enabled = false;
  touched = false;
  readonly state: ScrollState = { chapter: 0, t: 0, u: 0, plunging: false, traveling: false };
  private traveling = false;
  readonly bounds: Bounds[] = [];
  readonly total: number;

  private lastInput = 0;
  private pointer: { y: number; t: number; v: number } | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly spans: ChapterSpan[],
    private readonly reducedMotion: boolean,
  ) {
    let p = 0;
    spans.forEach((s, i) => {
      const plunge = i === spans.length - 1 ? 0 : s.plunge;
      this.bounds.push({ start: p, mid: p + s.content, end: p + s.content + plunge });
      p += s.content + plunge;
    });
    this.total = p;
  }

  attach(): void {
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    this.el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  detach(): void {
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    this.el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  /** Push the target by wheel pixels. */
  push(px: number): void {
    if (!this.enabled) return;
    this.target = clamp(this.target + px, 0, this.total);
    this.lastInput = performance.now();
    this.touched = true;
  }

  /** Jump the target to a chamber's content position (0..1) or plunge position. */
  goTo(chapter: number, t: number, plunge = false): void {
    const b = this.bounds[clamp(chapter, 0, this.bounds.length - 1)];
    this.target = plunge ? b.mid + t * (b.end - b.mid) : b.start + t * (b.mid - b.start);
    this.lastInput = performance.now();
  }

  /**
   * Carry the descent to a chamber's content position: the same chase as any scroll, so the
   * camera really passes through everything between, smeared by its own speed.
   */
  travel(chapter: number, t: number): void {
    this.goTo(chapter, t);
    this.traveling = Math.abs(this.target - this.position) > 60;
    this.touched = true;
  }

  /**
   * @param dt   frame time clamped for motion that must stay controllable
   * @param raw  the real frame time: a travel covers real time, so a slow device still arrives on time
   */
  update(dt: number, raw = dt): void {
    const prev = this.position;
    const rate = this.reducedMotion ? 10 : this.traveling ? 2.3 : this.state.plunging ? 3.4 : 2.6;
    const step = this.traveling ? Math.min(raw, 0.5) : dt;
    this.position += (this.target - this.position) * (1 - Math.exp(-step * rate));
    this.velocity = dt > 0 ? (this.position - prev) / dt : 0;
    if (this.traveling && Math.abs(this.target - this.position) < 40) this.traveling = false;
    this.compute();
    this.state.traveling = this.traveling;

    // Rest on the nearest station once the hand is off the wheel (never inside a plunge or a travel).
    if (!this.traveling && !this.state.plunging && performance.now() - this.lastInput > 320) {
      const b = this.bounds[this.state.chapter];
      const len = b.mid - b.start;
      let best: number | undefined;
      let bestD = len * 0.07;
      for (const s of this.spans[this.state.chapter].stations) {
        const px = b.start + s * len;
        const d = Math.abs(px - this.target);
        if (d < bestD) {
          bestD = d;
          best = px;
        }
      }
      if (best !== undefined) this.target += (best - this.target) * (1 - Math.exp(-dt * 3.2));
    }

    const st = this.state;
    const speed = clamp(Math.abs(this.velocity) / SMEAR_SPEED, 0, 1);
    const goal = this.reducedMotion ? 0 : this.traveling ? speed : st.plunging ? speed * Math.pow(Math.sin(Math.PI * st.u), 0.6) : 0;
    this.smear += (goal - this.smear) * (1 - Math.exp(-dt * (goal > this.smear ? 10 : 5)));
    if (this.smear < 0.001) this.smear = 0;
  }

  private compute(): void {
    this.stateAt(this.position, this.state);
  }

  /** The chamber, content progress and plunge progress at any pixel position of the route. */
  stateAt(position: number, st: ScrollState): ScrollState {
    let k = 0;
    for (let i = 0; i < this.bounds.length; i++) if (position >= this.bounds[i].start) k = i;
    const b = this.bounds[k];
    if (b.end > b.mid && position >= b.end && k < this.bounds.length - 1) k += 1;
    const bb = this.bounds[k];
    st.chapter = k;
    if (bb.end === bb.mid || position < bb.mid) {
      st.t = clamp((position - bb.start) / Math.max(1, bb.mid - bb.start), 0, 1);
      st.u = 0;
      st.plunging = false;
    } else {
      st.t = 1;
      st.u = clamp((position - bb.mid) / (bb.end - bb.mid), 0, 1);
      st.plunging = st.u > 0 && st.u < 1;
    }
    return st;
  }

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    this.push(clamp(dy, -140, 140));
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        this.push(700);
        break;
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault();
        this.push(-700);
        break;
      case 'Home':
        e.preventDefault();
        this.push(-this.total);
        break;
      case 'End':
        e.preventDefault();
        this.push(this.total);
        break;
    }
  };

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || e.pointerType === 'mouse') return;
    this.pointer = { y: e.clientY, t: performance.now(), v: 0 };
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.pointer) return;
    const now = performance.now();
    const dy = this.pointer.y - e.clientY;
    const dt = Math.max(1, now - this.pointer.t);
    this.pointer.v = this.pointer.v * 0.6 + (dy / dt) * 0.4;
    this.pointer = { y: e.clientY, t: now, v: this.pointer.v };
    this.push(dy * 2.4);
  };

  private onUp = (): void => {
    if (!this.pointer) return;
    this.push(clamp(this.pointer.v, -3, 3) * 260);
    this.pointer = null;
  };
}
