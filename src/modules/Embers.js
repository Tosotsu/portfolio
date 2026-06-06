import * as THREE from 'three';

const VERT = `
uniform float uTime;
attribute float aOffset;
attribute float aRandom;
varying float vAlpha;

void main() {
  vec3 pos = position;
  float rise = mod(uTime * 0.35 + aOffset * 8.0, 8.0);
  pos.y += rise;
  pos.x += sin(uTime * 0.6 + aOffset * 6.28) * 1.2;
  pos.z += cos(uTime * 0.5 + aOffset * 4.71) * 0.8;

  vAlpha = (1.0 - rise / 8.0) * 0.85;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (1.2 + aRandom * 1.6) * (80.0 / -mvPos.z);
  gl_PointSize = clamp(gl_PointSize, 0.5, 3.0);
  gl_Position  = projectionMatrix * mvPos;
}
`;

const FRAG = `
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = dot(uv, uv) * 4.0;
  float circle = exp(-d * 8.0);
  vec3 col = mix(vec3(0.9, 0.30, 0.04), vec3(1.0, 0.65, 0.22), circle);
  gl_FragColor = vec4(col, circle * vAlpha);
}
`;

export function createEmbers(scene) {
  const COUNT = 600;
  const positions = new Float32Array(COUNT * 3);
  const offsets   = new Float32Array(COUNT);
  const randoms   = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 160;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    offsets[i] = Math.random();
    randoms[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aOffset',  new THREE.BufferAttribute(offsets, 1));
  geo.setAttribute('aRandom',  new THREE.BufferAttribute(randoms, 1));

  const uniforms = { uTime: { value: 0.0 } };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   VERT,
    fragmentShader: FRAG,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    transparent: true,
  });

  const mesh = new THREE.Points(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return { mesh, uniforms };
}
