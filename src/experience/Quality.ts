import type { WebGLRenderer } from 'three';

export type Tier = 'full' | 'medium' | 'light';

export interface Quality {
  tier: Tier;
  dpr: number;
  bloom: boolean;
  shadowMap: number;
  particles: number;
  msaa: number;
  shafts: number;
  reducedMotion: boolean;
}

const WEAK_GPU = /swiftshader|llvmpipe|software|mali-4|mali-t|adreno [1-5]\d\d|intel.*hd graphics [2-5]\d\d|powervr/i;

export const TIER_ORDER: Tier[] = ['full', 'medium', 'light'];

export function makeQuality(tier: Tier, reducedMotion: boolean): Quality {
  const dpr = window.devicePixelRatio || 1;
  switch (tier) {
    case 'full':
      return { tier, dpr: Math.min(dpr, 1.5), bloom: true, shadowMap: 2048, particles: 1600, msaa: 0, shafts: 7, reducedMotion };
    case 'medium':
      return { tier, dpr: Math.min(dpr, 1), bloom: true, shadowMap: 1024, particles: 1100, msaa: 0, shafts: 5, reducedMotion };
    default:
      return { tier, dpr: Math.min(dpr, 0.9), bloom: false, shadowMap: 1024, particles: 700, msaa: 0, shafts: 3, reducedMotion };
  }
}

/** The tier one step below, or null at the bottom. */
export function stepDown(tier: Tier): Tier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

/** First guess from the GPU string and the device; the fps probe may step it down later. */
export function detectQuality(renderer: WebGLRenderer): Quality {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const forced = new URLSearchParams(location.search).get('tier') as Tier | null;
  let tier: Tier = 'full';
  if (WEAK_GPU.test(name)) tier = 'light';
  else if (coarse && small) tier = 'medium';
  if (forced && TIER_ORDER.includes(forced)) tier = forced;
  return makeQuality(tier, reduced);
}
