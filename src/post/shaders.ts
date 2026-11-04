import { Color, Vector2 } from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/**
 * Travel pass: a vertical smear in the direction of the plunge, a short glitch
 * at its peak and an RGB split. Only enabled while `uSmear` > 0.
 */
export const TravelShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSmear: { value: 0 },
    uTime: { value: 0 },
    uDir: { value: new Vector2(0, 1) },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSmear; uniform float uTime; uniform vec2 uDir;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    void main() {
      vec2 uv = vUv;
      float s = uSmear;
      float g = smoothstep(0.35, 0.9, s);
      // Horizontal slices tear sideways at the peak.
      float rows = 10.0 + 30.0 * hash(floor(uTime * 9.0));
      float band = floor(uv.y * rows);
      float on = step(0.62, hash(band * 3.17 + floor(uTime * 7.0)));
      uv.x += (hash(band + floor(uTime * 13.0)) - 0.5) * 0.16 * g * on;
      // Smear along the travel direction.
      float len = s * s * 0.16;
      vec3 acc = vec3(0.0);
      const int N = 16;
      for (int i = 0; i < N; i++) {
        float f = float(i) / float(N - 1) - 0.5;
        acc += texture2D(tDiffuse, uv + uDir * f * len).rgb;
      }
      acc /= float(N);
      // Colour split grows with the glitch.
      vec2 ca = vec2(0.014 * g, 0.0) + uDir * len * 0.25;
      float r = texture2D(tDiffuse, uv + ca).r;
      float b = texture2D(tDiffuse, uv - ca).b;
      vec3 split = vec3(r, acc.g, b);
      vec3 col = mix(acc, split, g * 0.85);
      // Static.
      col += (hash(dot(uv, vec2(12.9898, 78.233)) + fract(uTime)) - 0.5) * 0.05 * g;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Final look: a slow refraction wobble, chromatic aberration at the edges, a
 * split-tone grade (shadows one way, highlights the other), vignette and grain.
 * Runs in linear light; the OutputPass after it tone-maps and converts to sRGB.
 */
export const LookShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWobble: { value: 1 },
    uAberration: { value: 0.5 },
    uGrain: { value: 0.03 },
    uVignette: { value: 0.42 },
    uShadow: { value: new Color(0x0a2a33) },
    uHighlight: { value: new Color(0xf2e6d2) },
    uSaturation: { value: 0.95 },
    uLift: { value: 0.012 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uWobble; uniform float uAberration;
    uniform float uGrain; uniform float uVignette; uniform vec3 uShadow; uniform vec3 uHighlight;
    uniform float uSaturation; uniform float uLift;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // Water in front of the lens: a very slow, very small wobble.
      uv += uWobble * 0.0022 * vec2(sin(uv.y * 13.0 + uTime * 0.55) * 0.6, cos(uv.x * 9.0 - uTime * 0.42));
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * 0.05 * uAberration;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - off).b;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone.
      c += uShadow * (1.0 - smoothstep(0.0, 0.28, lum)) * 0.07;
      c = mix(c, c * uHighlight * 1.08, smoothstep(0.25, 1.2, lum) * 0.4);
      c = mix(vec3(lum), c, uSaturation);
      c += uLift;
      c *= 1.0 - uVignette * smoothstep(0.18, 0.95, r2 * 1.7);
      c += (hash(uv * (1.0 + fract(uTime * 7.0))) - 0.5) * uGrain * (0.6 + 0.4 * (1.0 - lum));
      // Last line of defence: a NaN anywhere upstream must not black out the frame.
      c = clamp(c, vec3(0.0), vec3(64.0));
      if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};
