import * as THREE from "three";
import { CHARACTERS, ONE_SHOT, WALK_SPEED, RUN_SPEED, BODY_RADIUS } from "../config";
import { getClip, spawnCharacterModel } from "./Assets";
import type { Pt } from "./Collision";

// "mixamorig:LeftArm", "mixamorigLeftArm" and "LeftArm" all become "leftarm"
const key = (n: string) => n.replace(/^mixamorig\d*:?/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
export class Character {
  static log: (s: string) => void = () => {};

  readonly root = new THREE.Group();
  readonly radius = BODY_RADIUS;
  private model!: THREE.Group;
  private mixer!: THREE.AnimationMixer;
  private fitted = new Map<string, THREE.AnimationClip>();
  private boneByKey = new Map<string, string>();
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
      if ((o as THREE.Bone).isBone && !this.boneByKey.has(key(o.name))) this.boneByKey.set(key(o.name), o.name);
    });
    this.root.add(this.model);
    const hipsName = this.boneByKey.get("hips");
    const hips = hipsName ? this.model.getObjectByName(hipsName) : undefined;
    this.hipsY = hips ? hips.position.y : 100;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.mixer.addEventListener("finished", (e: any) => {
      if (e.action === this.current) void this.play("idle");
    });
    Character.log(`${this.name}: ${this.boneByKey.size} bones found`);
    await this.play("idle");
    // start downloading the two most used animations right away
    void getClip("walk").catch(() => {});
    void getClip("run").catch(() => {});
  }

  // shared animations are matched to this character's bones and body size
  async play(name: string, fade = 0.25) {
    const tok = ++this.token;
    try {
      let clip = this.fitted.get(name);
      if (!clip) {
        Character.log(`Loading animation ${name}…`);
        const src = await getClip(name);
        clip = src.clip.clone();
        const ratio = this.hipsY / src.hipsY;
        const kept: THREE.KeyframeTrack[] = [];
        const total = clip.tracks.length;
        for (const t of clip.tracks) {
          const dot = t.name.lastIndexOf(".");
          const node = t.name.slice(0, dot), prop = t.name.slice(dot);
          const real = this.boneByKey.get(key(node));
          if (!real) continue;
          t.name = real + prop;
          if (key(node) === "hips" && prop === ".position") {
            for (let i = 0; i < t.values.length; i++) t.values[i] *= ratio;
          }
          kept.push(t);
        }
        if (!kept.length) {
          const first = clip.tracks[0]?.name ?? "none";
          const sample = Array.from(this.boneByKey.values()).slice(0, 3).join(", ");
          throw new Error(`${name}: no bones match. Animation bone "${first}", character bones ${sample}`);
        }
        clip.tracks = kept;
        this.fitted.set(name, clip);
        Character.log(`${name}: ${kept.length}/${total} tracks match`);
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
    } catch (e) {
      Character.log((e as Error).message);
    }
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
