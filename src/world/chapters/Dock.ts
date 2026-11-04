import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { LightShafts } from '../../atmosphere/LightShafts';
import type { Section, SiteContent } from '../../content/types';
import { noise1 } from '../../util/noise';
import { BuildContext, Chapter, Grade, StationText } from '../Chapter';
import { bandMaterial, DUMMY, ENTRY_POSE, entryTube, exitPit, hallLights, PIT_R, sectionTexts } from '../chambers/common';
import { concreteMaterial, darkMetalMaterial, glassMaterial, lacquerMaterial, metalMaterial } from '../materials';

/** Spacing between moored pods, and between the closing stations after them. */
const SPACING = 9;
const STEP = 7;
const PIER_HALF = 3.4;
const WATER_Y = -0.7;
const POD_X = 5.9;
/** Gentle harbour water: a small boat heaves with a period near three seconds. */
const HEAVE_PERIOD = 2.9;
const HEAVE = 0.06;
const G = 9.81;
const UP = new Vector3(0, 1, 0);

interface Pod {
  group: Group;
  line: Mesh;
  cleat: Vector3;
  bollard: Vector3;
  lantern: MeshStandardMaterial;
  phase: number;
}

/**
 * The dock: a flooded loading bay where each service is a moored pod, lit by
 * its own lantern, ready to ship. A crane walks the bay overhead with its load
 * swinging on the cable; the pods heave on the water and tug at their lines.
 */
export class Dock extends Chapter {
  readonly id: string;
  readonly label: string;
  readonly fog = new Color(0x08201c);
  readonly fogDensity = 0.036;
  readonly grade: Grade = { shadow: new Color(0x062a22), highlight: new Color(0xe6f7e4), saturation: 0.96 };
  override readonly accent = new Color(0x7fe0b0);
  private readonly length: number;
  private readonly pods: Pod[] = [];
  private water?: ShaderMaterial;
  /** Every lantern, chamber-local; the water is shown the four nearest to you each frame. */
  private lanterns: Vector3[] = [];
  private readonly camLocal = new Vector3();
  private crane?: Group;
  private hook?: Group;
  private craneMid = 0;
  private craneSpan = 0;
  private shafts?: LightShafts;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly q = new Quaternion();

  constructor(
    private readonly section: Section,
    dock: SiteContent['dock'],
  ) {
    super();
    this.id = section.id;
    this.label = dock.label || section.label;
    const n = section.items.length;
    const m = dock.stations.length;
    this.length = 14 + SPACING * n + STEP * m + 8;
    const L = this.length;
    this.exit.set(0, -64, -L + 0.2);
    this.contentPx = 900 * (n + m + 1);

    const points: [Vector3, Vector3][] = [ENTRY_POSE];
    section.items.forEach((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      // Stand on the pier's far edge and look down at the pod moored on this side.
      points.push([new Vector3(-side * 1.0, 1.9, z + 5.2), new Vector3(side * 4.4, 0.5, z - 0.4)]);
    });
    const z0 = -(10 + SPACING * n);
    dock.stations.forEach((_, j) => {
      const z = z0 - STEP * j;
      const side = j % 2 === 0 ? 1 : -1;
      points.push([new Vector3(side * 0.8, 1.9, z + 4.5), new Vector3(-side * 0.6, 1.3, z - 7)]);
    });
    points.push([new Vector3(0, 1.9, -L + 6), new Vector3(0, 0.6, -L + 0.2)]);
    points.push([new Vector3(0, 2.4, -L + 0.2), new Vector3(0, -30, -L + 0.2)]);
    this.definePath(points);
    const fr = this.pathFractions(points.length);
    this.stations.push(0, ...fr.slice(1, 1 + n + m));
    const texts = sectionTexts({ ...section, label: this.label, intro: dock.intro || section.intro }, fr.slice(1, 1 + n));
    dock.stations.forEach((s, j) => {
      const t: StationText = {
        t: fr[1 + n + j],
        align: j === 0 ? 'center' : j % 2 === 1 ? 'left' : 'right',
        kicker: s.kicker,
        title: s.title,
        body: s.body,
        tags: s.tags,
        link: s.link,
      };
      texts.push(t);
    });
    this.texts.push(...texts);
  }

  build(ctx: BuildContext): void {
    const g = this.group;
    const L = this.length;
    const tex = ctx.textures;
    const concrete = concreteMaterial(tex, 0x1a211f);
    const dark = darkMetalMaterial(tex, 0x2f3a37);
    const metal = metalMaterial(tex, 0x6a7a76);
    const lacquer = lacquerMaterial(0x07120f);
    const band = bandMaterial(this.accent, 1.6);

    // --- the pier: a walkway down the middle, water either side, a platform round the pit ----------
    const pier = new Mesh(new BoxGeometry(PIER_HALF * 2, 1.4, L - 2), concrete);
    pier.position.set(0, -0.7, -(L - 2) / 2 + 10);
    pier.receiveShadow = true;
    g.add(pier);
    g.add(this.endPlatform(L, concrete));
    // Kerbs along both edges, and the rails above them.
    for (const s of [-1, 1]) {
      const kerb = new Mesh(new BoxGeometry(0.3, 0.16, L - 2), metal);
      kerb.position.set(s * (PIER_HALF - 0.15), 0.08, -(L - 2) / 2 + 10);
      g.add(kerb);
      const rail = new Mesh(new BoxGeometry(0.06, 0.05, L - 4), dark);
      rail.position.set(s * (PIER_HALF - 0.2), 1.0, -(L - 4) / 2 + 9);
      g.add(rail);
    }
    const posts = Math.ceil((L - 4) / 3);
    const post = new InstancedMesh(new CylinderGeometry(0.035, 0.045, 1.0, 6), dark, posts * 2);
    for (let i = 0; i < posts; i++) {
      for (const s of [-1, 1]) {
        DUMMY.position.set(s * (PIER_HALF - 0.2), 0.5, 8 - i * 3);
        DUMMY.rotation.set(0, 0, 0);
        DUMMY.scale.set(1, 1, 1);
        DUMMY.updateMatrix();
        post.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), DUMMY.matrix);
      }
    }
    g.add(post);

    // --- the water -----------------------------------------------------------------------------------
    const lamps: Vector3[] = [];
    this.water = new ShaderMaterial({
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uDeep: { value: new Color(0x020b0a) },
          uTint: { value: new Color(0x0e3a36) },
          uAccent: { value: this.accent.clone() },
          uLamps: { value: Array.from({ length: 4 }, () => new Vector3(0, -100, 0)) },
          uLampCount: { value: 0 },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uTint; uniform vec3 uAccent;
        uniform vec3 uLamps[4]; uniform int uLampCount;
        varying vec3 vWorld;
        // Three small swells crossing: the gradient of their sum tilts the surface normal.
        vec2 ripple(vec2 p, float t) {
          vec2 g = vec2(0.0);
          g += vec2(0.9, 0.4) * cos(dot(p, vec2(0.9, 0.4)) * 1.4 + t * 1.1) * 0.06;
          g += vec2(-0.5, 0.8) * cos(dot(p, vec2(-0.5, 0.8)) * 2.3 - t * 1.7) * 0.035;
          g += vec2(0.2, -0.9) * cos(dot(p, vec2(0.2, -0.9)) * 4.1 + t * 2.6) * 0.02;
          g += vec2(0.7, 0.7) * cos(dot(p, vec2(0.7, 0.7)) * 7.0 - t * 3.1) * 0.008;
          return g;
        }
        void main() {
          vec2 gr = ripple(vWorld.xz, uTime);
          vec3 n = normalize(vec3(-gr.x, 1.0, -gr.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          vec3 col = mix(uDeep, uTint, 0.12 + 0.88 * fres);
          // Each lantern lays a streak of glints on the water toward you.
          for (int i = 0; i < 4; i++) {
            if (i >= uLampCount) break;
            vec3 toL = uLamps[i] - vWorld;
            vec3 h = normalize(normalize(toL) + V);
            float nh = max(dot(n, h), 0.0);
            float s = pow(nh, 220.0) * 10.0 + pow(nh, 18.0) * 0.35;
            float att = 1.0 / (1.0 + 0.05 * dot(toL, toL));
            col += uAccent * s * att;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    const water = new Mesh(new PlaneGeometry(64, L + 50), this.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, WATER_Y, -L / 2 + 6);
    g.add(water);

    // --- one moored pod per service ------------------------------------------------------------------
    const hullGeo = new CapsuleGeometry(0.85, 3.0, 4, 16);
    hullGeo.rotateX(Math.PI / 2);
    const domeGeo = new SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const glass = glassMaterial(this.accent.getHex());
    glass.opacity = 0.45;
    const bollardGeo = new CylinderGeometry(0.16, 0.2, 0.7, 10);
    const lineGeo = new CylinderGeometry(0.02, 0.02, 1, 5);
    lineGeo.translate(0, 0.5, 0);
    this.section.items.forEach((it, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const z = -(10 + SPACING * i);
      const pod = new Group();
      pod.position.set(side * POD_X, WATER_Y, z);
      pod.rotation.y = side * 0.12;
      const hull = new Mesh(hullGeo, lacquer);
      hull.position.y = 0.25;
      hull.castShadow = true;
      pod.add(hull);
      // A band of the chamber's light round the waterline, and a brighter one for the featured pod.
      const waterline = new Mesh(new CylinderGeometry(0.88, 0.88, 0.06, 20, 1, true), band);
      waterline.rotation.x = Math.PI / 2;
      waterline.position.set(0, 0.25, 0.1);
      pod.add(waterline);
      const dome = new Mesh(domeGeo, glass);
      dome.position.set(0, 0.95, -0.35);
      pod.add(dome);
      const mast = new Mesh(new CylinderGeometry(0.03, 0.035, 1.9, 6), dark);
      mast.position.set(0, 1.9, 0.95);
      pod.add(mast);
      const lanternMat = new MeshStandardMaterial({ color: 0x0a0a0a, emissive: this.accent, emissiveIntensity: it.featured ? 3.0 : 2.2, roughness: 0.5 });
      const lantern = new Mesh(new SphereGeometry(0.15, 12, 8), lanternMat);
      lantern.position.set(0, 2.9, 0.95);
      pod.add(lantern);
      // Real lights for the first three pods; the rest glow by their emissive lanterns and the bloom.
      if (i < 3) {
        const light = new PointLight(this.accent, it.featured ? 60 : 42, 18, 2);
        light.position.copy(lantern.position);
        pod.add(light);
      }
      g.add(pod);
      lamps.push(new Vector3(pod.position.x, pod.position.y + 2.9, pod.position.z + 0.95));

      const bollard = new Mesh(bollardGeo, metal);
      bollard.position.set(side * (PIER_HALF - 0.4), 0.35, z + 1.6);
      g.add(bollard);
      const line = new Mesh(lineGeo, dark);
      g.add(line);
      this.pods.push({
        group: pod,
        line,
        cleat: new Vector3(-side * 0.7, 0.55, 1.3),
        bollard: new Vector3(bollard.position.x, 0.7, bollard.position.z),
        lantern: lanternMat,
        phase: i * 1.9,
      });
    });
    this.lanterns = lamps;
    this.water.uniforms.uLampCount.value = Math.min(4, lamps.length);

    // --- the bay walls: tall ribs fading into the fog ---------------------------------------------
    const ribs = Math.ceil((L + 10) / 4.5);
    const rib = new InstancedMesh(new BoxGeometry(0.5, 14, 0.5), dark, ribs * 2);
    for (let i = 0; i < ribs; i++) {
      for (const s of [-1, 1]) {
        DUMMY.position.set(s * 16.5, 6.3, 6 - i * 4.5);
        DUMMY.rotation.set(0, 0, 0);
        DUMMY.scale.set(1, 1, 1);
        DUMMY.updateMatrix();
        rib.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), DUMMY.matrix);
      }
    }
    g.add(rib);
    for (const s of [-1, 1]) {
      const ledge = new Mesh(new BoxGeometry(1.2, 0.5, L + 20), concrete);
      ledge.position.set(s * 16.5, 0.2, -L / 2 + 5);
      g.add(ledge);
    }

    // --- the crane: a bridge on two legs that walks the bay, its load swinging below ---------------
    this.crane = new Group();
    for (const s of [-1, 1]) {
      const leg = new Mesh(new CylinderGeometry(0.22, 0.28, 10.5, 10), dark);
      leg.position.set(s * 9.5, WATER_Y + 5.25, 0);
      this.crane.add(leg);
    }
    const bridge = new Mesh(new BoxGeometry(20, 0.6, 0.8), metal);
    bridge.position.y = 9.6;
    this.crane.add(bridge);
    const bridgeBand = new Mesh(new BoxGeometry(20.1, 0.08, 0.1), band);
    bridgeBand.position.set(0, 9.3, 0.45);
    this.crane.add(bridgeBand);
    const trolley = new Mesh(new BoxGeometry(1.2, 0.5, 0.9), dark);
    trolley.position.set(2.4, 9.05, 0);
    this.crane.add(trolley);
    this.hook = new Group();
    this.hook.position.set(2.4, 8.8, 0);
    const cable = new Mesh(new CylinderGeometry(0.025, 0.025, 4.2, 5), dark);
    cable.position.y = -2.1;
    this.hook.add(cable);
    const block = new Mesh(new BoxGeometry(0.5, 0.4, 0.4), metal);
    block.position.y = -4.4;
    this.hook.add(block);
    const crate = new Mesh(new BoxGeometry(1.6, 1.2, 1.2), lacquer);
    crate.position.y = -5.2;
    crate.castShadow = true;
    this.hook.add(crate);
    const crateBand = new Mesh(new BoxGeometry(1.62, 0.08, 1.22), band);
    crateBand.position.y = -5.2;
    this.hook.add(crateBand);
    this.crane.add(this.hook);
    this.craneMid = -(L - 10) / 2;
    this.craneSpan = Math.max(4, (L - 32) / 2);
    this.crane.position.z = this.craneMid;
    g.add(this.crane);

    entryTube(g, tex, this.accent);
    exitPit(g, tex, new Color(0xffb86b), -L + 0.2);
    hallLights(g, L, this.accent, ctx.quality.shadowMap, 2.4);
    this.shafts = new LightShafts(Math.max(2, ctx.quality.shafts - 3), this.accent.getHex(), 0.45);
    this.shafts.group.position.set(0, 0, -L / 2);
    this.shafts.group.scale.set(1.5, 1, 1.5);
    g.add(this.shafts.group);
  }

  /** The platform round the pit at the bay's end, with the pit cut out of it. */
  private endPlatform(L: number, mat: MeshStandardMaterial): Mesh {
    const shape = new Shape();
    const half = 12;
    shape.moveTo(-half, L - 12);
    shape.lineTo(half, L - 12);
    shape.lineTo(half, L + 10);
    shape.lineTo(-half, L + 10);
    shape.closePath();
    const hole = new Path();
    hole.absarc(0, L - 0.2, PIT_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new ShapeGeometry(shape, 40);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const m = new Mesh(geo, mat);
    m.receiveShadow = true;
    return m;
  }

  override update(dt: number, _t: number, elapsed: number, camera: PerspectiveCamera): void {
    void dt;
    this.shafts?.update(elapsed);
    if (this.water) {
      this.water.uniforms.uTime.value = elapsed;
      // The four lanterns nearest you, in world space, for the glints.
      this.camLocal.copy(camera.position).sub(this.group.position);
      const near = this.lanterns
        .map((l) => ({ l, d: l.distanceToSquared(this.camLocal) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      (this.water.uniforms.uLamps.value as Vector3[]).forEach((v, i) => {
        if (near[i]) v.copy(near[i].l).add(this.group.position);
      });
    }

    // Pods heave and pitch with the swell, each at its own phase, and the lines follow.
    const w = (Math.PI * 2) / HEAVE_PERIOD;
    for (const p of this.pods) {
      const ph = elapsed * w + p.phase;
      p.group.position.y = WATER_Y + Math.sin(ph) * HEAVE;
      p.group.rotation.x = Math.cos(ph) * 0.02;
      p.group.rotation.z = Math.sin(ph * 0.77 + 1.3) * 0.014;
      p.group.updateMatrix();
      this.tmp.copy(p.cleat).applyMatrix4(p.group.matrix);
      this.tmp2.subVectors(this.tmp, p.bollard);
      const len = this.tmp2.length();
      p.line.position.copy(p.bollard);
      p.line.quaternion.copy(this.q.setFromUnitVectors(UP, this.tmp2.divideScalar(len)));
      p.line.scale.y = len;
      p.lantern.emissiveIntensity = 2.2 + noise1(elapsed * 1.4, p.phase) * 0.35;
    }

    // The crane runs the bay on a slow harmonic; its load swings on the cable with the
    // quasi-static tilt of that acceleration plus a small free swing at the cable's own period.
    if (this.crane && this.hook) {
      const O = 0.07;
      this.crane.position.z = this.craneMid + this.craneSpan * Math.sin(elapsed * O);
      const accel = -this.craneSpan * O * O * Math.sin(elapsed * O);
      const w0 = Math.sqrt(G / 4.4);
      this.hook.rotation.x = accel / G + Math.sin(elapsed * w0 + 0.4) * 0.03;
    }
  }
}
