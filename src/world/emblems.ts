import { AdditiveBlending, CanvasTexture, Color, Group, SRGBColorSpace, Sprite, SpriteMaterial, type WebGLRenderer } from 'three';
import { ICON_PATHS } from '../ui/icons';
import { radialTexture } from './chapters/Gantry';

// The real marks for the two networks (Simple Icons, CC0), filled; everything else is the site's line icon.
const BRANDS: Record<string, string> = {
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
};

// The official logos for the ways to reach him, in their own colours, drawn with no tile behind them.
// LinkedIn: the blue "in" box. GitHub: the white Invertocat (GitHub's mark for dark backgrounds). Gmail: the
// four-colour M. The résumé has no brand, so it is a page with a red PDF band.
const LOGOS: Record<string, { viewBox: string; body: string }> = {
  linkedin: { viewBox: '0 0 24 24', body: `<rect x="1.5" y="1.5" width="21" height="21" rx="2" fill="#fff"/><path fill="#0A66C2" d="${BRANDS.linkedin}"/>` },
  github: { viewBox: '0 0 24 24', body: `<path fill="#fff" d="${BRANDS.github}"/>` },
  email: {
    viewBox: '52 42 88 66',
    body:
      '<path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/><path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>' +
      '<path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/><path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>' +
      '<path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/>',
  },
  resume: {
    viewBox: '0 0 24 24',
    body:
      '<path fill="#f4f1ea" d="M5 1.5h10l5 5V22.5H5z"/><path fill="#cfc8bb" d="M15 1.5v5h5z"/>' +
      '<rect x="3" y="12.5" width="15" height="6" rx="1" fill="#e5322d"/>' +
      '<text x="10.5" y="17.3" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="4.6" fill="#fff">PDF</text>' +
      '<path stroke="#9a9384" stroke-width="0.9" stroke-linecap="round" d="M8 8h6M8 10.2h8M8 20.6h8"/>',
  },
};

/** Draws an SVG string into a canvas texture (256 px). Null if the browser can't draw it. */
async function texture(svg: string, size = 256): Promise<CanvasTexture | null> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return map;
}

/**
 * An official logo floating free (no tile): the mark itself and a faint glow behind it. Starts hidden: the chapter
 * fades it in as you come near (see reveal()).
 */
export async function logo(slug: string, color: Color, renderer?: WebGLRenderer): Promise<Group | null> {
  const l = LOGOS[slug];
  if (!l) return null;
  const map = await texture(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${l.viewBox}">${l.body}</svg>`, 512);
  if (!map) return null;
  renderer?.initTexture(map); // uploaded now, while loading, not in the frame where it first appears
  const g = new Group();
  const halo = new Sprite(new SpriteMaterial({ map: radialTexture(), color, blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }));
  halo.scale.setScalar(6);
  // No fog and no tone mapping: the brand colours come through at full strength, however deep in the haze.
  // Kept under the bloom threshold (0.8, post/Pipeline.ts) so the logo stays crisp and coloured, not glowing white.
  const mark = new Sprite(new SpriteMaterial({ map, color: 0xd1d1d1, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
  mark.scale.setScalar(3.6);
  g.add(halo, mark);
  return g; // stays in the scene at opacity 0 until you come near, so nothing new is prepared mid-scroll
}

/** Whether this item has a floating emblem. */
export const hasEmblem = (slug?: string): boolean => !!slug && (slug in BRANDS || slug in ICON_PATHS);

/**
 * An item's logo floating in the chamber: a glass tile with the mark in the chamber's light and a soft halo behind
 * it. Two sprites (always facing the camera), drawn once into a 256 px texture: next to nothing per frame.
 * Resolves to null if the item has no icon or the picture can't be drawn.
 */
export async function emblem(slug: string, color: Color): Promise<Group | null> {
  const hex = `#${color.getHexString()}`;
  const mark = BRANDS[slug]
    ? `<path d="${BRANDS[slug]}" fill="${hex}"/>`
    : ICON_PATHS[slug]
      ? `<g fill="none" stroke="${hex}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[slug].replaceAll('currentColor', hex)}</g>`
      : '';
  if (!mark) return null;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect x="14" y="14" width="228" height="228" rx="56" fill="rgba(10,12,16,0.72)" stroke="${hex}" stroke-opacity="0.75" stroke-width="5"/>` +
    `<g transform="translate(68 68) scale(5)">${mark}</g></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;

  const g = new Group();
  const halo = new Sprite(new SpriteMaterial({ map: radialTexture(), color, blending: AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false }));
  halo.scale.setScalar(3.2);
  const tile = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
  tile.scale.setScalar(1.35);
  g.add(halo, tile);
  return g;
}

/** Bobs and sways a set of emblems; call from the chapter's update. */
export function floatEmblems(items: { group: Group; y: number; phase: number }[], elapsed: number): void {
  for (const it of items) {
    it.group.position.y = it.y + Math.sin(elapsed * 0.9 + it.phase) * 0.18;
    (it.group.children[1] as Sprite).material.rotation = Math.sin(elapsed * 0.6 + it.phase) * 0.08;
  }
}
