/**
 * Custom postprocessing effects for VIBLOC
 * 1. Edge Detection (Sobel on depth buffer) — architectural outline look
 * 2. Gradient Fog — distance-based fog with manual depth linearization
 */
import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

// ─── Edge Detection ──────────────────────────────────────────────────────────
const edgeFragment = /* glsl */ `
uniform float uStrength;
uniform vec3 uColor;
uniform float uThreshold;

// Linearize raw depth buffer value
float linDepth(float d) {
  float near = cameraNear;
  float far = cameraFar;
  float ndc = 2.0 * d - 1.0;
  return (2.0 * near * far) / (far + near - ndc * (far - near));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 t = 1.0 / resolution;

  // 3×3 linearized depth neighbourhood
  float d00 = linDepth(texture2D(depthBuffer, uv + vec2(-t.x, -t.y)).r);
  float d10 = linDepth(texture2D(depthBuffer, uv + vec2( 0.0, -t.y)).r);
  float d20 = linDepth(texture2D(depthBuffer, uv + vec2( t.x, -t.y)).r);
  float d01 = linDepth(texture2D(depthBuffer, uv + vec2(-t.x,  0.0)).r);
  float dc  = linDepth(texture2D(depthBuffer, uv).r);
  float d21 = linDepth(texture2D(depthBuffer, uv + vec2( t.x,  0.0)).r);
  float d02 = linDepth(texture2D(depthBuffer, uv + vec2(-t.x,  t.y)).r);
  float d12 = linDepth(texture2D(depthBuffer, uv + vec2( 0.0,  t.y)).r);
  float d22 = linDepth(texture2D(depthBuffer, uv + vec2( t.x,  t.y)).r);

  // Normalize by center depth for scale-invariant edges
  float inv = 1.0 / max(dc, 1.0);

  // Sobel operator (on normalised linear depth)
  float sx = (d00 + 2.0*d01 + d02 - d20 - 2.0*d21 - d22) * inv;
  float sy = (d00 + 2.0*d10 + d20 - d02 - 2.0*d12 - d22) * inv;
  float edge = sqrt(sx*sx + sy*sy);

  // Fade edges with distance — thin out far edges
  float distFade = 1.0 - smoothstep(400.0, 1200.0, dc);
  // Hard cutoff: only show edges with strong depth discontinuity (buildings)
  edge = smoothstep(uThreshold * 0.8, uThreshold, edge) * uStrength * distFade;

  // Subtle white glow on building edges
  vec3 edgeCol = uColor * (1.0 + edge * 0.3);
  outputColor = vec4(mix(inputColor.rgb, edgeCol, min(edge, 1.0)), inputColor.a);
}
`;

export class EdgeDetectionEffect extends Effect {
  constructor({
    strength = 0.25,
    color = new Vector3(1.2, 1.2, 1.2),
    threshold = 0.25,
  } = {}) {
    super('EdgeDetectionEffect', edgeFragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uStrength', new Uniform(strength)],
        ['uColor', new Uniform(color)],
        ['uThreshold', new Uniform(threshold)],
      ]),
    });
  }
}

// ─── Gradient Fog ────────────────────────────────────────────────────────────
const fogFragment = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogExponent;
uniform float uVertical;  // 0 = side view, 1 = top-down

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float near = cameraNear;
  float far = cameraFar;
  float ndc = 2.0 * depth - 1.0;
  float linearDist = (2.0 * near * far) / (far + near - ndc * (far - near));

  float d = smoothstep(uFogNear, uFogFar, linearDist);
  float fog = 1.0 - exp(-pow(d * 2.5, uFogExponent));
  // When zoomed out / top-down, completely remove fog
  fog *= clamp(1.0 - uVertical * 1.5, 0.0, 1.0);
  outputColor = vec4(mix(inputColor.rgb, uFogColor, fog), inputColor.a);
}
`;

export class GradientFogEffect extends Effect {
  constructor({
    color = new Vector3(1.0, 1.0, 1.0),
    near = 800.0,
    far = 3000.0,
    exponent = 1.4,
  } = {}) {
    super('GradientFogEffect', fogFragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uFogColor', new Uniform(color)],
        ['uFogNear', new Uniform(near)],
        ['uFogFar', new Uniform(far)],
        ['uFogExponent', new Uniform(exponent)],
        ['uVertical', new Uniform(0.0)],
      ]),
    });
  }

  /** Call each frame with camera polar angle (0=top, PI/2=side) */
  setVertical(v: number) {
    (this.uniforms.get('uVertical') as Uniform).value = v;
  }
}
