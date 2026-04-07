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

  // Aggressive distance fade — kill far-field edges entirely to prevent flicker
  float distFade = 1.0 - smoothstep(200.0, 600.0, dc);
  // Very wide smoothstep band — eliminates sub-pixel edge pop-in/out
  edge = smoothstep(uThreshold * 0.4, uThreshold * 2.0, edge) * uStrength * distFade;
  // Clamp to prevent overbrightening
  edge = min(edge, 0.6);

  // Subtle edge overlay (additive blend to avoid darkening artifacts)
  outputColor = vec4(inputColor.rgb + uColor * edge * 0.15, inputColor.a);
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
  // When looking straight down, gently reduce fog (keep some depth cue)
  fog *= mix(1.0, 0.15, uVertical);
  outputColor = vec4(mix(inputColor.rgb, uFogColor, fog), inputColor.a);
}
`;

export class GradientFogEffect extends Effect {
  constructor({
    color = new Vector3(1.0, 1.0, 1.0),
    near = 1200.0,
    far = 4000.0,
    exponent = 1.2,
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
