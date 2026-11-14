/** A frame this long, alone in a sweep, is a hitch (a shader's first use, a garbage collection), not the machine's speed. */
const HITCH_MS = 500;

/**
 * The average frame time of a measuring sweep, in ms.
 *
 * `times` are the frames measured once the setting had settled; `ran` and `frames` are everything the
 * sweep drew while the tab was awake, settling included.
 *
 * One hitch is left out. Two or more frames that long are how the machine really draws, so they count:
 * leaving out every long frame scored a machine at two frames a second as perfect. And a sweep with no
 * settled frame at all drew too slowly to have one: it is scored by what it did draw, never as a pass.
 */
export function averageFrame(times: number[], ran: number, frames: number): number {
  const long = times.filter((t) => t >= HITCH_MS).length;
  const kept = long === 1 ? times.filter((t) => t < HITCH_MS) : times;
  if (kept.length) return kept.reduce((a, b) => a + b, 0) / kept.length;
  // Nothing drawn at all means the sweep was stopped before its first frame: there is nothing to judge.
  return frames ? ran / frames : 16;
}
