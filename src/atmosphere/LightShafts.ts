import { AdditiveBlending, Color, CylinderGeometry, Group, Mesh, ShaderMaterial } from 'three';

/**
 * Light from the surface, far above: soft cones that fade with depth and
 * breathe slowly. Additive, no depth write, so they read as volume not solid.
 */
export class LightShafts {
  readonly group = new Group();
  private readonly materials: ShaderMaterial[] = [];

  constructor(count: number, color = 0x9fd9e3, intensity = 0.5) {
    const geo = new CylinderGeometry(0.9, 3.8, 52, 20, 1, true);
    for (let i = 0; i < count; i++) {
      const mat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(color) },
          uIntensity: { value: intensity * (0.7 + Math.random() * 0.6) },
          uPhase: { value: Math.random() * 10 },
        },
        vertexShader: /* glsl */ `
          varying float vY; varying vec3 vN; varying vec3 vV; varying float vU; varying vec3 vAxis;
          void main() {
            vY = position.y / 52.0 + 0.5;
            vU = uv.x;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; uniform float uIntensity; uniform float uPhase;
          varying float vY; varying vec3 vN; varying vec3 vV; varying float vU; varying vec3 vAxis;
          void main() {
            vec3 v = normalize(vV);
            // Clamp both dot products: a hair over 1.0 turns pow() into NaN, and bloom smears NaN over the whole frame.
            float facing = clamp(abs(dot(normalize(vN), v)), 0.0, 1.0);
            float edge = pow(facing, 2.4);
            // A beam is only a beam from the side: looking down its axis it must vanish.
            float side = pow(clamp(1.0 - abs(dot(normalize(vAxis), v)), 0.0, 1.0), 1.8);
            float depth = pow(vY, 1.6);
            float breathe = 0.7 + 0.3 * sin(vY * 7.0 - uTime * 0.45 + uPhase + vU * 12.566);
            float ripple = 0.85 + 0.15 * sin(vU * 25.13 + uTime * 0.8 + uPhase);
            float a = edge * side * depth * breathe * ripple * uIntensity;
            gl_FragColor = vec4(uColor * a, a);
          }`,
      });
      const mesh = new Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const radius = 4 + Math.random() * 9;
      mesh.position.set(Math.cos(angle) * radius, 12, Math.sin(angle) * radius);
      mesh.rotation.z = (Math.random() - 0.5) * 0.28;
      mesh.rotation.x = (Math.random() - 0.5) * 0.28;
      this.group.add(mesh);
      this.materials.push(mat);
    }
  }

  update(elapsed: number): void {
    for (const m of this.materials) m.uniforms.uTime.value = elapsed;
  }
}
