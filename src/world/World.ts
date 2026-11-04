import { Color, FogExp2, PerspectiveCamera, Scene } from 'three';
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

export class World {
  readonly fog: FogExp2;
  readonly atmosphere: Atmosphere;
  private readonly poseA = makePose();
  private readonly poseB = makePose();

  constructor(readonly scene: Scene, readonly chapters: Chapter[]) {
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
  }
}
