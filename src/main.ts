import * as THREE from "three";
import { World } from "./engine/World";
import { Colliders } from "./engine/Collision";
import { Character } from "./engine/Character";
import { CHARACTERS, ANIMATIONS } from "./config";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (s: string) => { $("msg").textContent = s; };

const world = new World($("stage"), $("panel"));
const colliders = new Colliders();
const chars: Character[] = [];
let active: Character | null = null;
let run = false, follow = true, portrait = false, low = matchMedia("(pointer: coarse)").matches;

// ---- test furniture built in code (real GLB items come in the next stage) ----
function block(w: number, h: number, d: number, x: number, z: number, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.set(x, h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  world.scene.add(m);
  colliders.addMesh(m);
}
block(1.6, 0.8, 0.9, 3, 0, 0x8b5a2b);   // table
block(1, 2, 0.6, -3, 2, 0x5b4636);       // wardrobe
block(8, 2.5, 0.25, 0, -4, 0xb8b2a6);    // long wall to test going around
block(2, 0.9, 0.9, 0, 1.5, 0x7a1f1f);    // sofa

// ---- controls ----
const pick = $<HTMLSelectElement>("pick"), who = $<HTMLSelectElement>("active"), anim = $<HTMLSelectElement>("anim");
Object.keys(CHARACTERS).forEach((n) => pick.add(new Option(n, n)));
ANIMATIONS.forEach((n) => anim.add(new Option(n, n)));

function setActive(c: Character) { active = c; who.value = c.label; }

$("add").onclick = async () => {
  const name = pick.value;
  msg(`Loading ${name}…`);
  try {
    const c = await Character.create(name, `${name}_${chars.length + 1}`, (f) => msg(`Loading ${name} ${Math.round(f * 100)}%`));
    const p = c.root.position;
    p.set(-2 + chars.length * 1.2, 0, 4);
    for (let i = 0; i < 6; i++) {
      colliders.resolve(p, c.radius);
      for (const o of chars) if (Math.hypot(p.x - o.root.position.x, p.z - o.root.position.z) < c.radius * 2) p.x += c.radius * 2;
    }
    chars.push(c);
    world.scene.add(c.root);
    who.add(new Option(c.label, c.label));
    setActive(c);
    msg(`${c.label} ready. Tap the ground to walk.`);
  } catch (e) { msg((e as Error).message); }
};
who.onchange = () => { const c = chars.find((x) => x.label === who.value); if (c) active = c; };
$("play").onclick = () => { if (active) { active.stop(); void active.play(anim.value); } };
$("gait").onclick = () => { run = !run; $("gait").textContent = run ? "Run" : "Walk"; };
$("follow").onclick = () => { follow = !follow; $("follow").textContent = "Follow: " + (follow ? "on" : "off"); };
$("aspect").onclick = () => { portrait = !portrait; $("aspect").textContent = portrait ? "9:16" : "16:9"; world.setAspect(portrait ? 9 / 16 : 16 / 9); };
$("quality").onclick = () => { low = !low; $("quality").textContent = "Quality: " + (low ? "low" : "high"); world.setQuality(low); };
$("quality").textContent = "Quality: " + (low ? "low" : "high");

// ---- tap the ground to walk (a drag is the camera, not a tap) ----
const dom = world.renderer.domElement;
let down: { x: number; y: number; t: number } | null = null, pointers = 0;
dom.addEventListener("pointerdown", (e) => { pointers++; down = pointers === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
dom.addEventListener("pointercancel", () => { pointers = 0; down = null; });
dom.addEventListener("pointerup", (e) => {
  pointers = Math.max(0, pointers - 1);
  if (down && pointers === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 350) {
    if (!active) { msg("Add a character first."); }
    else {
      const pt = world.groundPoint(e.clientX, e.clientY);
      if (pt) {
        const p = active.root.position;
        const path = colliders.route(p.x, p.z, pt.x, pt.z, active.radius);
        if (!path) msg("No way round: the furniture blocks every route.");
        else { active.walkTo(path, run); msg(""); }
      }
    }
  }
  down = null;
});

// ---- frame loop ----
const tgt = new THREE.Vector3();
world.start((dt) => {
  for (const c of chars) c.update(dt);
  // people never stand inside each other or inside furniture
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i].root.position, b = chars[j].root.position;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = chars[i].radius + chars[j].radius;
      if (d < min) {
        if (d > 1e-4) { const k = (min - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
        else b.x += min;
      }
    }
  }
  for (const c of chars) colliders.resolve(c.root.position, c.radius);
  if (follow && active) {
    tgt.set(active.root.position.x, 1.1, active.root.position.z).sub(world.controls.target).multiplyScalar(1 - Math.exp(-4 * dt));
    world.controls.target.add(tgt);
    world.camera.position.add(tgt);
  }
});
