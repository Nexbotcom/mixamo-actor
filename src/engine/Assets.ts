import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODEL_DIR } from "../config";

const loader = new FBXLoader();

function loadFBX(url: string, onProgress?: (frac: number) => void): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      (e) => { if (onProgress && e.total) onProgress(e.loaded / e.total); },
      () => reject(new Error("Could not load " + url))
    );
  });
}

// Each character file is downloaded once, then cloned for every copy on stage.
const charCache = new Map<string, Promise<THREE.Group>>();

export async function spawnCharacterModel(name: string, onProgress?: (f: number) => void): Promise<THREE.Group> {
  if (!charCache.has(name)) {
    const p = loadFBX(`${MODEL_DIR}${name}.fbx`, onProgress);
    p.catch(() => charCache.delete(name));
    charCache.set(name, p);
  }
  const src = await charCache.get(name)!;
  return cloneSkinned(src) as THREE.Group;
}

// Animations are shared by every character and loaded only when first used.
export interface ClipSource { clip: THREE.AnimationClip; hipsY: number }
const clipCache = new Map<string, Promise<ClipSource>>();

export function getClip(name: string): Promise<ClipSource> {
  if (!clipCache.has(name)) {
    const p = loadFBX(`${MODEL_DIR}${name}.fbx`).then((g) => {
      const clip = g.animations[0];
      if (!clip) throw new Error(name + ".fbx has no animation");
      const hips = g.getObjectByName("mixamorigHips");
      return { clip, hipsY: hips ? hips.position.y : 100 };
    });
    p.catch(() => clipCache.delete(name));
    clipCache.set(name, p);
  }
  return clipCache.get(name)!;
}
