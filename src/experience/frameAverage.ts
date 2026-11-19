/** A frame this long, alone in a sweep, is a hitch (a shader's first use, a garbage collection), not the machine's speed. */
const HITCH_MS = 500;
/** A hitch is forgiven only beside at least this many ordinary frames (a third of a second at 60 Hz). */
const ENOUGH_FRAMES = 20;
/** A gap this long, on its own, means the page was not being drawn at all: another tab, a covered window, a closed lid. */
const SLEEP_MS = 1000;
/** Left out after a change of setting, and again after the page wakes. */
const SETTLE_MS = 300;
/** After this many sleeps in one sweep, long gaps are taken as how the machine draws, so the sweep always ends. */
const MAX_NAPS = 4;

/**
 * The average frame time of a measuring sweep, in ms.
 *
 * `times` are the frames measured once the setting had settled; `ran` and `frames` are everything the
 * sweep drew while the page was awake, settling included.
 *
 * One hitch is left out, when there are enough ordinary frames beside it to judge by. Two or more frames
 * that long are how the machine really draws, so they count: leaving out every long frame scored a
 * machine at two frames a second as perfect. And a sweep with no settled frame at all drew too slowly to
 * have one: it is scored by what it did draw, never as a pass.
 */
export function averageFrame(times: number[], ran: number, frames: number): number {
  const long = times.filter((t) => t >= HITCH_MS).length;
  const kept = long === 1 && times.length > ENOUGH_FRAMES ? times.filter((t) => t < HITCH_MS) : times;
  if (kept.length) return kept.reduce((a, b) => a + b, 0) / kept.length;
  // Nothing drawn at all means the sweep was stopped before its first frame: there is nothing to judge.
  return frames ? ran / frames : 16;
}

/**
 * Keeps the time of one measuring sweep: fed the gap before each frame, it says how far the sweep has run
 * and, at the end, the average frame.
 *
 * Only time the page was awake counts. A page that is not being drawn gets no frames, and on the wall
 * clock it came back to a sweep that had already "finished" with nothing measured, which read as a
 * perfect score and kept the heaviest setting on any machine. A gap is taken as sleep, not as a frame,
 * when the browser said the tab was hidden during it, or when it is a second or more on its own (some
 * browsers stop drawing a covered or minimised window without saying so). Long gaps one after another
 * are the machine itself, and count.
 */
export class SweepMeter {
  private readonly times: number[] = [];
  private ran = 0;
  private frames = 0;
  private settling = SETTLE_MS;
  private longGaps = 0;
  private naps = 0;

  /** `ms`: how long the sweep lasts, in time awake. */
  constructor(private readonly ms: number) {}

  /** The gap before one frame; `hidden` if the browser reported the tab hidden during it. Returns how far the sweep is, 0 to 1. */
  frame(gap: number, hidden: boolean): number {
    const long = gap >= SLEEP_MS;
    this.longGaps = long && !hidden ? this.longGaps + 1 : 0;
    const nap = long && this.longGaps === 1 && this.naps < MAX_NAPS;
    if (hidden || nap) {
      if (nap && !hidden) this.naps++;
      this.settling = SETTLE_MS;
    } else {
      this.ran += gap;
      this.frames++;
      if (this.settling > 0) this.settling -= gap;
      else this.times.push(gap);
    }
    return Math.min(1, this.ran / this.ms);
  }

  get average(): number {
    return averageFrame(this.times, this.ran, this.frames);
  }

  /** The ordinary frame: half the settled frames were quicker. Infinity when none settled. */
  get median(): number {
    if (!this.times.length) return Infinity;
    const sorted = [...this.times].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /**
   * The steady frame: the mean of the settled frames with the slowest twentieth left out. The mean alone was
   * carried over the budget by the few frames that are not the machine's pace (a collection, the overlay's
   * raster as a text appears) and sent a machine that holds 60 Hz down a rung, or through a second sweep.
   * The same as `average` when nothing settled.
   */
  get steady(): number {
    if (!this.times.length) return this.average;
    const sorted = [...this.times].sort((a, b) => a - b);
    const kept = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.95)));
    return kept.reduce((a, b) => a + b, 0) / kept.length;
  }
}

/** The descent's watch looks at this many seconds of frames at a time. */
const WINDOW_S = 5;
/** A frame longer than this restarts the window: one of them is a stall, not a speed. */
const STALL_S = 0.5;
/** Frames up to this long are the steady ones; longer ones are hitches. */
const STEADY_S = 0.1;
/** This many stalls in a row, with the page in view, are the machine's speed after all. */
const STALLS_IN_A_ROW = 5;

/**
 * The watch kept during the descent: fed each frame's time while the page is visible, it gives the frame
 * rate of every five seconds. Hitches are left out, so one slow moment is not a slow machine.
 *
 * But where most of a window is slow frames, they are the speed and they count: with every frame over
 * 100 ms left out, a machine drawing five frames a second read as sixty and was never stepped down or
 * handed to the written site. Likewise a run of frames each over half a second: each used to restart the
 * window, so a machine that slow was never judged at all.
 */
export class FpsProbe {
  private t = 0;
  private steady = 0; // frames of STEADY_S or less
  private busy = 0; // and the time they took
  private all = 0; // every frame in the window
  private stalls = 0; // frames over STALL_S, in a row

  /** The page was hidden, or the watch starts again. */
  reset(): void {
    this.t = this.steady = this.busy = this.all = this.stalls = 0;
  }

  /** One frame's time in seconds. Returns the frame rate when this frame completes a window, null until then. */
  frame(dt: number): number | null {
    if (dt > STALL_S) {
      const stalls = this.stalls + 1;
      this.reset();
      if (stalls < STALLS_IN_A_ROW) {
        this.stalls = stalls;
        return null;
      }
      return 1 / dt;
    }
    this.stalls = 0;
    this.t += dt;
    this.all += 1;
    if (dt <= STEADY_S) {
      this.steady += 1;
      this.busy += dt;
    }
    if (this.t < WINDOW_S) return null;
    const fps = this.busy >= this.t / 2 ? this.steady / this.busy : this.all / this.t;
    this.reset();
    return fps;
  }
}
