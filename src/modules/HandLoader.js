// Loads the real hand GLB and samples COUNT points uniformly from its surface.
// Returns a promise resolving to Float32Array (count*3) in XYZ interleaved format.
// Uses GLTFLoader + manual triangle-area-weighted random sampling (no MeshSurfaceSampler
// needed — three.js 0.165 ships without it in jsm/utils).

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

function sampleMeshSurface(geometry, count) {
  // Build a flat position array from all triangles in the geometry.
  // Supports both indexed and non-indexed BufferGeometry.
  const posAttr = geometry.attributes.position;
  const index   = geometry.index;

  const triCount = index ? index.count / 3 : posAttr.count / 3;
  const areas    = new Float32Array(triCount);
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const cross = new THREE.Vector3();

  let totalArea = 0;
  for (let t = 0; t < triCount; t++) {
    let ia, ib, ic;
    if (index) {
      ia = index.getX(t * 3);
      ib = index.getX(t * 3 + 1);
      ic = index.getX(t * 3 + 2);
    } else {
      ia = t * 3; ib = t * 3 + 1; ic = t * 3 + 2;
    }
    vA.fromBufferAttribute(posAttr, ia);
    vB.fromBufferAttribute(posAttr, ib);
    vC.fromBufferAttribute(posAttr, ic);
    cross.crossVectors(vB.clone().sub(vA), vC.clone().sub(vA));
    const area = cross.length() * 0.5;
    areas[t] = area;
    totalArea += area;
  }

  // Build CDF for area-weighted sampling.
  const cdf = new Float32Array(triCount);
  let cumul = 0;
  for (let t = 0; t < triCount; t++) {
    cumul += areas[t] / totalArea;
    cdf[t] = cumul;
  }

  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Binary-search into CDF for the triangle index.
    const r = Math.random();
    let lo = 0, hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1; else hi = mid;
    }
    const t = lo;

    let ia, ib, ic;
    if (index) {
      ia = index.getX(t * 3);
      ib = index.getX(t * 3 + 1);
      ic = index.getX(t * 3 + 2);
    } else {
      ia = t * 3; ib = t * 3 + 1; ic = t * 3 + 2;
    }
    vA.fromBufferAttribute(posAttr, ia);
    vB.fromBufferAttribute(posAttr, ib);
    vC.fromBufferAttribute(posAttr, ic);

    // Random barycentric point inside the triangle.
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    out[i * 3]     = vA.x * w + vB.x * u + vC.x * v;
    out[i * 3 + 1] = vA.y * w + vB.y * u + vC.y * v;
    out[i * 3 + 2] = vA.z * w + vB.z * u + vC.z * v;
  }
  return out;
}

export function loadHandPositions(count) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load('/hand.glb', (gltf) => {
      // Collect all meshes inside the GLB.
      const meshes = [];
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.geometry) meshes.push(child);
      });

      if (meshes.length === 0) {
        console.warn('HandLoader: no meshes found in hand.glb — falling back');
        resolve(null);
        return;
      }

      // Merge all meshes into one geometry so sampling is proportional to
      // total surface area. Apply the mesh's world transform so bones/scale/
      // rotation baked in the scene are preserved.
      let allGeoms = [];
      meshes.forEach((m) => {
        const g = m.geometry.clone();
        m.updateWorldMatrix(true, false);
        g.applyMatrix4(m.matrixWorld);
        allGeoms.push(g);
      });

      // Use the first geometry (most GLBs have a single hand mesh).
      // If there are multiple, sample from the largest one.
      let biggestGeom = allGeoms[0];
      if (allGeoms.length > 1) {
        let maxVerts = 0;
        allGeoms.forEach((g) => {
          if (g.attributes.position.count > maxVerts) {
            maxVerts = g.attributes.position.count;
            biggestGeom = g;
          }
        });
      }

      // Compute bounding box to auto-scale + center the hand.
      biggestGeom.computeBoundingBox();
      const box = biggestGeom.boundingBox;
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Scale so the tallest axis (likely Y for an upright hand) = 14 units.
      const targetHeight = 14.0;
      const scale = targetHeight / Math.max(size.x, size.y, size.z);

      const raw = sampleMeshSurface(biggestGeom, count);

      // Center and scale every sampled point.
      for (let i = 0; i < count; i++) {
        raw[i * 3]     = (raw[i * 3]     - center.x) * scale;
        raw[i * 3 + 1] = (raw[i * 3 + 1] - center.y) * scale;
        raw[i * 3 + 2] = (raw[i * 3 + 2] - center.z) * scale;
      }

      resolve(raw);
    }, undefined, (err) => {
      console.warn('HandLoader: failed to load hand.glb —', err);
      resolve(null);
    });
  });
}
