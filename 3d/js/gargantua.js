/*
 * Gargantua: a stylised black hole with a hot accretion disc, a photon
 * ring, and the lensed halo of the disc's far side above and below the
 * shadow. Built from geometry and shaders rather than ray-traced
 * lensing, so it stays cheap on phones.
 *
 * Local frame: the halo faces +Z (towards the camera); the disc is
 * tilted nearly edge-on around X.
 */
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */`
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
`;

function discMaterial(inner, outer, doppler) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uDoppler: { value: doppler }
    },
    vertexShader: /* glsl */`
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime, uInner, uOuter, uDoppler;
      varying vec2 vPos;
      ${NOISE_GLSL}
      void main() {
        float r = length(vPos);
        float a = atan(vPos.y, vPos.x);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);

        // Keplerian shear: inner material orbits faster
        float ang = a + uTime * 0.18 / (0.25 + t * 1.2);
        float n = noise(vec2(ang * 5.0, t * 16.0)) * 0.6
                + noise(vec2(ang * 13.0 + 7.0, t * 38.0 + 3.0)) * 0.3
                + noise(vec2(ang * 29.0 + 2.0, t * 80.0)) * 0.1;
        float bands = 0.5 + 0.9 * n;

        float bright = pow(1.0 - t, 1.6) * 1.25 + 0.05;
        float fadeIn = smoothstep(0.0, 0.07, t);
        float fadeOut = 1.0 - smoothstep(0.7, 1.0, t);

        vec3 hot = vec3(1.0, 0.95, 0.85);
        vec3 mid = vec3(1.0, 0.62, 0.26);
        vec3 cool = vec3(0.55, 0.16, 0.05);
        vec3 col = mix(hot, mid, smoothstep(0.0, 0.3, t));
        col = mix(col, cool, smoothstep(0.3, 1.0, t));

        // relativistic beaming: the side moving towards us is brighter
        float beam = 1.0 + uDoppler * sin(a);

        float alpha = fadeIn * fadeOut * clamp(bands, 0.0, 1.3);
        gl_FragColor = vec4(col * bright * bands * beam, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

function haloMaterial(ringR) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uR: { value: ringR } },
    vertexShader: /* glsl */`
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime, uR;
      varying vec2 vPos;
      ${NOISE_GLSL}
      void main() {
        float r = length(vPos);
        float a = atan(vPos.y, vPos.x);
        // thin photon ring hugging the shadow, plus a broader lensed band outside it
        float d1 = (r - uR) / 0.12;
        float photon = exp(-d1 * d1) * 1.5;
        float d2 = (r - uR - 0.55) / 0.75;
        float band = exp(-d2 * d2) * 0.6;
        float n = noise(vec2(a * 6.0 + uTime * 0.05, r * 4.0)) * 0.5 + 0.6;
        // the lensed far side is brightest straight above and below the shadow
        float topBottom = 0.35 + 0.65 * abs(sin(a));
        float beam = 1.0 + 0.5 * cos(a);
        float v = (photon + band * n * topBottom) * beam;
        vec3 col = mix(vec3(1.0, 0.6, 0.25), vec3(1.0, 0.92, 0.8), clamp(photon, 0.0, 1.0));
        gl_FragColor = vec4(col * v, clamp(v, 0.0, 1.0));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

export function buildGargantua() {
  const group = new THREE.Group();
  const SHADOW_R = 3.0;

  // the event horizon shadow: an opaque black sphere
  const shadow = new THREE.Mesh(
    new THREE.SphereGeometry(SHADOW_R, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  group.add(shadow);

  // accretion disc, nearly edge-on
  const discInner = SHADOW_R + 0.9;
  const discOuter = 13.5;
  const discMat = discMaterial(discInner, discOuter, 0.45);
  const disc = new THREE.Mesh(new THREE.RingGeometry(discInner, discOuter, 160, 6), discMat);
  disc.rotation.x = THREE.MathUtils.degToRad(-78);
  disc.rotation.z = THREE.MathUtils.degToRad(-12);
  group.add(disc);

  // lensed halo and photon ring, facing the viewer
  const haloMat = haloMaterial(SHADOW_R + 0.15);
  const halo = new THREE.Mesh(new THREE.RingGeometry(SHADOW_R, SHADOW_R + 2.6, 160, 3), haloMat);
  halo.renderOrder = 1;
  group.add(halo);

  // warm ambient bloom around the whole object
  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(discOuter * 0.9, 64),
    new THREE.ShaderMaterial({
      uniforms: { uR: { value: discOuter * 0.9 } },
      vertexShader: 'varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uR; varying vec2 vPos; void main(){ float t = length(vPos)/uR; float v = pow(1.0 - clamp(t,0.0,1.0), 2.5) * 0.22; gl_FragColor = vec4(vec3(1.0,0.55,0.25)*v, v); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  haze.position.z = -1;
  group.add(haze);

  function update(time) {
    discMat.uniforms.uTime.value = time;
    haloMat.uniforms.uTime.value = time;
  }

  /** Keep the halo facing the camera (billboard around the shadow). */
  const _q = new THREE.Quaternion();
  function face(camera) {
    group.getWorldQuaternion(_q).invert();
    halo.quaternion.copy(_q).multiply(camera.quaternion);
    haze.quaternion.copy(halo.quaternion);
  }

  return { group, update, face };
}
