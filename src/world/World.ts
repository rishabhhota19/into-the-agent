import { Color, DirectionalLight, FogExp2, HemisphereLight, Light, PerspectiveCamera, PointLight, Scene } from 'three';
import type { Pose } from '../camera/Rig';
import { makePose } from '../camera/Rig';
import type { ScrollState } from '../scroll/VirtualScroll';
import { easeInOutCubic, lerp, smoothstep } from '../util/noise';
import type { Chapter, Grade } from './Chapter';

export interface Atmosphere {
  fog: Color;
  density: number;
  grade: Grade;
}

/**
 * The most lights of each kind ever in view at once: three neighbouring chambers (see `update`). three.js rebuilds the
 * shader of every lit material whenever one of these counts changes, which froze the page for a second or two each time
 * a chamber came into view or left it. So the counts never change: dark spare lights fill in for whatever is out of view.
 * A chamber that brings more lights than this still works, it only freezes again: raise the number.
 */
const LIGHTS = { point: 11, directional: 1, shadowed: 3, hemisphere: 3 };
type LightKind = keyof typeof LIGHTS;
const KINDS = Object.keys(LIGHTS) as LightKind[];

function spareLight(kind: LightKind): Light {
  if (kind === 'point') return new PointLight(0, 0);
  if (kind === 'hemisphere') return new HemisphereLight(0, 0, 0);
  const light = new DirectionalLight(0, 0);
  if (kind === 'shadowed') {
    light.castShadow = true;
    light.shadow.autoUpdate = false; // no map and no shadow pass: it only holds the count
  }
  return light;
}

function kindOf(light: Light): LightKind | null {
  if (light instanceof PointLight) return 'point';
  if (light instanceof HemisphereLight) return 'hemisphere';
  if (light instanceof DirectionalLight) return light.castShadow ? 'shadowed' : 'directional';
  return null;
}

export class World {
  readonly fog: FogExp2;
  readonly atmosphere: Atmosphere;
  private readonly poseA = makePose();
  private readonly poseB = makePose();
  private readonly lightCounts = new Map<Chapter, Record<LightKind, number>>();
  private readonly spares = Object.fromEntries(
    KINDS.map((kind) => [kind, Array.from({ length: LIGHTS[kind] }, () => spareLight(kind))]),
  ) as Record<LightKind, Light[]>;

  constructor(readonly scene: Scene, readonly chapters: Chapter[]) {
    for (const kind of KINDS) scene.add(...this.spares[kind]);
    // Chain the chambers: each one's exit is the next one's origin.
    let x = 0;
    let y = 0;
    let z = 0;
    for (const c of chapters) {
      c.group.position.set(x, y, z);
      scene.add(c.group);
      x += c.exit.x;
      y += c.exit.y;
      z += c.exit.z;
    }
    const first = chapters[0];
    this.fog = new FogExp2(first.fog.clone(), first.fogDensity);
    scene.fog = this.fog;
    scene.background = first.fog.clone();
    this.atmosphere = {
      fog: first.fog.clone(),
      density: first.fogDensity,
      grade: { shadow: first.grade.shadow.clone(), highlight: first.grade.highlight.clone(), saturation: first.grade.saturation },
    };
  }

  poseAt(st: ScrollState, out: Pose): Pose {
    const a = this.chapters[st.chapter];
    if (!st.plunging) return a.poseAt(st.t, out);
    const b = this.chapters[Math.min(st.chapter + 1, this.chapters.length - 1)];
    a.poseAt(1, this.poseA);
    b.poseAt(0, this.poseB);
    const u = easeInOutCubic(st.u);
    out.position.lerpVectors(this.poseA.position, this.poseB.position, u);
    out.look.lerpVectors(this.poseA.look, this.poseB.look, u);
    return out;
  }

  /** Blend fog and grade across a plunge; apply to the scene. */
  applyAtmosphere(st: ScrollState): Atmosphere {
    const atm = this.atmosphere;
    const a = this.chapters[st.chapter];
    if (!st.plunging) {
      atm.fog.copy(a.fog);
      atm.density = a.fogDensity;
      atm.grade.shadow.copy(a.grade.shadow);
      atm.grade.highlight.copy(a.grade.highlight);
      atm.grade.saturation = a.grade.saturation;
    } else {
      const b = this.chapters[Math.min(st.chapter + 1, this.chapters.length - 1)];
      const u = smoothstep(0.3, 0.72, st.u);
      atm.fog.copy(a.fog).lerp(b.fog, u);
      // Thicker water in the middle of the drop.
      atm.density = lerp(a.fogDensity, b.fogDensity, u) + Math.sin(Math.PI * st.u) * 0.018;
      atm.grade.shadow.copy(a.grade.shadow).lerp(b.grade.shadow, u);
      atm.grade.highlight.copy(a.grade.highlight).lerp(b.grade.highlight, u);
      atm.grade.saturation = lerp(a.grade.saturation, b.grade.saturation, u);
    }
    this.fog.color.copy(atm.fog);
    this.fog.density = atm.density;
    (this.scene.background as Color).copy(atm.fog);
    return atm;
  }

  update(dt: number, elapsed: number, st: ScrollState, camera: PerspectiveCamera): void {
    this.chapters.forEach((c, i) => {
      const near = i === st.chapter || i === st.chapter + 1 || (i === st.chapter - 1 && st.t < 0.15);
      c.group.visible = near;
      if (near) c.update(dt, i === st.chapter ? st.t : i < st.chapter ? 1 : 0, elapsed, camera);
    });
    this.balanceLights();
  }

  /** A chamber has just been built: count its lights, so its shaders can be prepared with the counts they'll be drawn with. */
  chamberBuilt(c: Chapter): void {
    const counts: Record<LightKind, number> = { point: 0, directional: 0, shadowed: 0, hemisphere: 0 };
    c.group.traverse((o) => {
      const kind = o instanceof Light ? kindOf(o) : null;
      if (kind) counts[kind]++;
    });
    this.lightCounts.set(c, counts);
    this.balanceLights();
  }

  private balanceLights(): void {
    for (const kind of KINDS) {
      let inView = 0;
      for (const c of this.chapters) if (c.group.visible) inView += this.lightCounts.get(c)?.[kind] ?? 0;
      this.spares[kind].forEach((light, i) => (light.visible = i < LIGHTS[kind] - inView));
    }
  }
}
