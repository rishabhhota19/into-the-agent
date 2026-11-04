import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

/**
 * Suspended matter: slow-sinking motes that drift and sway, wrapped in a box
 * around the camera so the water is never empty wherever you are.
 */
export class Particles {
  readonly points: Points;
  private readonly material: ShaderMaterial;

  constructor(count: number, dpr: number) {
    const geo = new BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const box = new Vector3(56, 40, 56);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * box.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box.z;
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
        uBox: { value: box },
        uSize: { value: 26 * dpr },
        uColor: { value: new Color(0xbfe6ea) },
        uOpacity: { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uSize;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y -= uTime * (0.12 + 0.3 * aSeed);
          p.x += sin(uTime * 0.28 + aSeed * 6.2831) * 0.5;
          p.z += cos(uTime * 0.22 + aSeed * 3.1) * 0.5;
          // Wrap around the camera.
          p = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = length(p - uCam);
          vA = (0.35 + 0.65 * aSeed) * smoothstep(uBox.x * 0.5, uBox.x * 0.18, d) * smoothstep(0.6, 3.0, d);
          gl_PointSize = uSize * (0.35 + aSeed * 0.9) / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          float a = smoothstep(0.5, 0.08, r);
          a *= a;
          gl_FragColor = vec4(uColor * a, a * vA * uOpacity);
        }`,
    });

    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setColor(c: Color): void {
    (this.material.uniforms.uColor.value as Color).copy(c);
  }

  update(elapsed: number, camera: PerspectiveCamera): void {
    this.material.uniforms.uTime.value = elapsed;
    (this.material.uniforms.uCam.value as Vector3).copy(camera.position);
  }
}
