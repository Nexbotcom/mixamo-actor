import * as THREE from "three";

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Pt { x: number; z: number }

const EPS = 0.01;

// does the segment pass through the inside of the rectangle?
function segHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - (r.minX + EPS), r.maxX - EPS - ax, az - (r.minZ + EPS), r.maxZ - EPS - az];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return t0 < t1;
}

export class Colliders {
  boxes: Rect[] = [];

  // add a static solid piece (footprint from its bounding box)
  addMesh(obj: THREE.Object3D) {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    this.boxes.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
  }

  // push a circular body out of every solid piece
  resolve(p: THREE.Vector3, r: number) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const b of this.boxes) {
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          p.x += dx * k; p.z += dz * k;
        } else {
          const l = p.x - b.minX, rr = b.maxX - p.x, f = p.z - b.minZ, bk = b.maxZ - p.z;
          const m = Math.min(l, rr, f, bk);
          if (m === l) p.x = b.minX - r; else if (m === rr) p.x = b.maxX + r;
          else if (m === f) p.z = b.minZ - r; else p.z = b.maxZ + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  private pushOut(p: Pt, rects: Rect[]) {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const q of rects) {
        if (!(p.x > q.minX && p.x < q.maxX && p.z > q.minZ && p.z < q.maxZ)) continue;
        const l = p.x - q.minX, r = q.maxX - p.x, f = p.z - q.minZ, b = q.maxZ - p.z;
        const m = Math.min(l, r, f, b);
        if (m === l) p.x = q.minX - 0.02; else if (m === r) p.x = q.maxX + 0.02;
        else if (m === f) p.z = q.minZ - 0.02; else p.z = q.maxZ + 0.02;
        moved = true;
      }
      if (!moved) break;
    }
  }

  // Shortest walk around the solid pieces. Returns waypoints, or null if there is no way.
  route(ax: number, az: number, bx: number, bz: number, r: number): Pt[] | null {
    const minX = Math.min(ax, bx) - 8, maxX = Math.max(ax, bx) + 8;
    const minZ = Math.min(az, bz) - 8, maxZ = Math.max(az, bz) + 8;
    const rects: Rect[] = [];
    for (const b of this.boxes) {
      if (b.maxX + r > minX && b.minX - r < maxX && b.maxZ + r > minZ && b.minZ - r < maxZ) {
        rects.push({ minX: b.minX - r, maxX: b.maxX + r, minZ: b.minZ - r, maxZ: b.maxZ + r });
      }
    }
    const A: Pt = { x: ax, z: az }, B: Pt = { x: bx, z: bz };
    this.pushOut(A, rects);
    this.pushOut(B, rects); // a goal inside furniture becomes the nearest free spot
    const blocked = (p: Pt, q: Pt) => rects.some((rc) => segHitsRect(p.x, p.z, q.x, q.z, rc));

    const result: Pt[] = [];
    if (Math.hypot(A.x - ax, A.z - az) > 0.001) result.push({ x: A.x, z: A.z });
    if (!blocked(A, B)) { result.push(B); return result; }

    const nodes: Pt[] = [A, B];
    for (const q of rects) {
      for (const X of [q.minX - 0.05, q.maxX + 0.05]) {
        for (const Z of [q.minZ - 0.05, q.maxZ + 0.05]) {
          if (!rects.some((o) => X > o.minX && X < o.maxX && Z > o.minZ && Z < o.maxZ)) nodes.push({ x: X, z: Z });
        }
      }
    }
    const n = nodes.length;
    const dst = new Array<number>(n).fill(1e9), prev = new Array<number>(n).fill(-1), done = new Array<boolean>(n).fill(false);
    dst[0] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dst[i] < dst[u])) u = i;
      if (u < 0 || dst[u] >= 1e9) break;
      done[u] = true;
      if (u === 1) break;
      for (let v = 0; v < n; v++) {
        if (done[v]) continue;
        const w = dst[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z);
        if (w >= dst[v] || blocked(nodes[u], nodes[v])) continue;
        dst[v] = w; prev[v] = u;
      }
    }
    if (prev[1] < 0) return null;
    const mid: Pt[] = [];
    for (let c = prev[1]; c > 0; c = prev[c]) mid.unshift(nodes[c]);
    return [...result, ...mid, B];
  }
}
