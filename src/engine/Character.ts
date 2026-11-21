import * as THREE from "three";
import { CHARACTERS, ONE_SHOT, WALK_SPEED, RUN_SPEED, BODY_RADIUS } from "../config";
import { getClip, spawnCharacterModel } from "./Assets";
import type { Pt } from "./Collision";

export class Character {
  readonly root = new THREE.Group();
  readonly radius = BODY_RADIUS;
  private model!: THREE.Group;
  private mixer!: THREE.AnimationMixer;
  private fitted = new Map<string, THREE.AnimationClip>();
  private hipsY = 100;
  private current?: THREE.AnimationAction;
  private currentName = "";
  private token = 0;
  private path: Pt[] = [];
  private running = false;

  private constructor(readonly name: string, readonly label: string) {}

  static async create(name: string, label: string, onProgress?: (f: number) => void) {
    const c = new Character(name, label);
    await c.init(onProgress);
    return c;
  }

  private async init(onProgress?: (f: number) => void) {
    this.model = await spawnCharacterModel(this.name, onProgress);
    this.model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.model);
    const h = box.max.y - box.min.y;
    const target = CHARACTERS[this.name]?.height ?? 1.7;
    this.model.scale.setScalar(target / (h || 170));
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; }
    });
    this.root.add(this.model);
    const hips = this.model.getObjectByName("mixamorigHips");
    this.hipsY = hips ? hips.position.y : 100;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.mixer.addEventListener("finished", (e: any) => {
      if (e.action === this.current) void this.play("idle");
    });
    await this.play("idle");
  }

  // shared animations are adjusted to this character's body size
  async play(name: string, fade = 0.25) {
    const tok = ++this.token;
    let clip = this.fitted.get(name);
    if (!clip) {
      const src = await getClip(name);
      clip = src.clip.clone();
      const ratio = this.hipsY / src.hipsY;
      for (const t of clip.tracks) {
        if (t.name.endsWith("Hips.position")) for (let i = 0; i < t.values.length; i++) t.values[i] *= ratio;
      }
      this.fitted.set(name, clip);
    }
    if (tok !== this.token) return; // a newer request replaced this one
    const next = this.mixer.clipAction(clip);
    const once = ONE_SHOT.has(name);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.setEffectiveWeight(1);
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    this.currentName = name;
  }

  stop() { this.path = []; }

  walkTo(path: Pt[], run: boolean) {
    this.path = path.slice();
    this.running = run;
    if (this.path.length) {
      const gait = run ? "run" : "walk";
      if (this.currentName !== gait) void this.play(gait);
    }
  }

  update(dt: number) {
    this.mixer.update(dt);
    if (!this.path.length) return;
    const p = this.root.position, t = this.path[0];
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    const step = (this.running ? RUN_SPEED : WALK_SPEED) * dt;
    if (d <= Math.max(step, 0.02)) {
      p.x = t.x; p.z = t.z;
      this.path.shift();
      if (!this.path.length) void this.play("idle");
    } else {
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      let diff = Math.atan2(dx, dz) - this.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.root.rotation.y += diff * Math.min(1, 10 * dt);
    }
  }
}
