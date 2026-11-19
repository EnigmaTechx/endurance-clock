/*
 * Starfield: a few thousand points on a distant shell, each with its own
 * size, tint and twinkle phase. Parented to the sky group so it wheels
 * past as the ship spins.
 */
import * as THREE from 'three';

export function buildStars(count, reduceMotion) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const cool = new THREE.Color(0xdfe8ff);
  const warm = new THREE.Color(0xffd9b0);
  const blue = new THREE.Color(0xb9ccff);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // uniform on a sphere, radius 260..420
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 260 + Math.random() * 160;
    positions[i * 3] = s * Math.cos(t) * r;
    positions[i * 3 + 1] = s * Math.sin(t) * r;
    positions[i * 3 + 2] = u * r;

    const depth = Math.pow(Math.random(), 2.2); // few bright, many faint
    sizes[i] = 0.9 + depth * 3.2;
    phases[i] = Math.random() * Math.PI * 2;

    const pick = Math.random();
    tmp.copy(pick < 0.15 ? warm : pick < 0.3 ? blue : cool).multiplyScalar(0.35 + depth * 0.75);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: reduceMotion ? 0 : 1 },
      uBright: { value: 1 }
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime, uPixelRatio, uTwinkle;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        float tw = 1.0 - uTwinkle * 0.3 * (0.5 + 0.5 * sin(uTime * (0.6 + fract(aPhase) * 1.4) + aPhase));
        vAlpha = tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * tw;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uBright;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float a = smoothstep(1.0, 0.25, d);
        gl_FragColor = vec4(vColor, min(1.0, a * vAlpha * uBright));
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return {
    points,
    update(time, pixelRatio, bright) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uPixelRatio.value = pixelRatio;
      if (bright !== undefined) mat.uniforms.uBright.value = bright;
    }
  };
}
