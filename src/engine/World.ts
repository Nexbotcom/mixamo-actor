import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1500);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private sun: THREE.DirectionalLight;
  private ground: THREE.Mesh;
  private ratio = 16 / 9;
  private low = true;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private ndc = new THREE.Vector2();

  constructor(private stage: HTMLElement, private panel: HTMLElement) {
    const touch = matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: "high-performance" });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x8fb4d9);
    this.scene.fog = new THREE.Fog(0x8fb4d9, 60, 450);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x556644, 1.0));

    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -14; s.right = 14; s.top = 14; s.bottom = -14; s.near = 1; s.far = 90;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    // a huge tiled ground that follows the camera, so the world never ends
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6f8f5e"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#678656"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1000, 1000);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.camera.position.set(6, 3, 9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 120;
    this.controls.screenSpacePanning = true;

    this.setQuality(touch);
    new ResizeObserver(() => this.fit()).observe(panel);
    addEventListener("resize", () => this.fit());
  }

  setAspect(r: number) { this.ratio = r; this.fit(); }

  setQuality(low: boolean) {
    this.low = low;
    this.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    this.fit();
  }

  // the picture is always exactly 16:9 or 9:16, fitted above the control panel
  fit() {
    const availW = innerWidth, availH = Math.max(100, innerHeight - this.panel.offsetHeight);
    let w = availW, h = w / this.ratio;
    if (h > availH) { h = availH; w = h * this.ratio; }
    this.stage.style.height = availH + "px";
    this.renderer.setSize(Math.floor(w), Math.floor(h));
    this.camera.aspect = this.ratio;
    this.camera.updateProjectionMatrix();
  }

  // where on the ground a screen tap lands
  groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? this.hit.clone() : null;
  }

  start(cb: (dt: number) => void) {
    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      cb(dt);
      this.controls.update();
      const t = this.controls.target;
      this.sun.position.set(t.x + 20, 30, t.z + 15);
      this.sun.target.position.set(t.x, 0, t.z);
      this.ground.position.set(Math.round(t.x / 2) * 2, 0, Math.round(t.z / 2) * 2);
      this.renderer.render(this.scene, this.camera);
    });
  }
}
