import { CatmullRomCurve3, Color, Group, PerspectiveCamera, Texture, Vector3, WebGLRenderer } from 'three';
import type { Pose } from '../camera/Rig';
import type { Link } from '../content/types';
import type { Quality } from '../experience/Quality';
import type { ProceduralTextures } from './materials';

export interface Grade {
  /** Colour the shadows lean toward. */
  shadow: Color;
  /** Colour the highlights lean toward. */
  highlight: Color;
  saturation: number;
}

export interface StationText {
  /** Content-local position (0..1) where this text is fully on. */
  t: number;
  align: 'left' | 'right' | 'center';
  kicker?: string;
  /** May contain <em> for a dimmed run. */
  title: string;
  body?: string;
  tags?: string[];
  link?: Link;
}

export interface BuildContext {
  quality: Quality;
  textures: ProceduralTextures;
  env: Texture;
  renderer: WebGLRenderer;
}

/**
 * One chamber of the descent. Chambers are chained in one scene: each one's
 * `exit` says where the next one's origin sits, so every plunge is a real drop
 * through real geometry. Each owns a camera path, stations, texts and an atmosphere.
 */
export abstract class Chapter {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly fog: Color;
  abstract readonly fogDensity: number;
  abstract readonly grade: Grade;
  /** The chamber's signature colour; the text layer takes it for kickers, emphasis and chips. */
  readonly accent = new Color(0x7fd3e0);
  readonly stations: number[] = [];
  readonly texts: StationText[] = [];
  /** Offset from this chamber's origin to the next chamber's origin. */
  readonly exit = new Vector3(0, -64, 0);
  /** True when something in the chamber casts a shadow that moves (the shadow maps are redrawn while it is in view). */
  readonly movingShadows: boolean = false;
  /** Wheel pixels across the content and across the plunge that follows it. */
  contentPx = 2600;
  plungePx = 1100;

  readonly group = new Group();
  private posCurve!: CatmullRomCurve3;
  private lookCurve!: CatmullRomCurve3;

  protected definePath(points: [Vector3, Vector3][]): void {
    this.posCurve = new CatmullRomCurve3(points.map((p) => p[0]), false, 'centripetal');
    this.lookCurve = new CatmullRomCurve3(points.map((p) => p[1]), false, 'centripetal');
  }

  /** Arc-length position (0..1) of each path point, for placing stations on the points. */
  protected pathFractions(count: number): number[] {
    const lengths = this.posCurve.getLengths(400);
    const total = lengths[lengths.length - 1] || 1;
    return Array.from({ length: count }, (_, j) => {
      const u = j / Math.max(1, count - 1);
      return lengths[Math.round(u * 400)] / total;
    });
  }

  /** World-space pose at content-local progress t (arc length along the position path). */
  poseAt(t: number, out: Pose): Pose {
    this.posCurve.getPointAt(t, out.position);
    // The look curve has its own arc lengths; sample it by the same curve parameter, not by its distance.
    const u = this.posCurve.getUtoTmapping(t, 0);
    this.lookCurve.getPoint(u, out.look);
    out.position.add(this.group.position);
    out.look.add(this.group.position);
    return out;
  }

  abstract build(ctx: BuildContext): Promise<void> | void;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_dt: number, _t: number, _elapsed: number, _camera: PerspectiveCamera): void {}
}
