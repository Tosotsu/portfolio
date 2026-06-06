import * as THREE from 'three';

export function createStarField(scene) {
  const COUNT = 3000;
  const positions = new Float32Array(COUNT * 3);
  const sizes     = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    // Upper hemisphere scatter: phi=0 (zenith) to PI/2 (horizon)
    const phi   = Math.acos(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const r     = 70 + Math.random() * 210;   // 70..280 units from origin

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 6;   // lifted +6Y above terrain
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    sizes[i] = 0.3 + Math.random() * 1.7;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color:          0xffffff,
    size:           0.8,
    sizeAttenuation: true,
    transparent:    true,
    opacity:        0.65,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
  });

  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);

  return stars;
}
