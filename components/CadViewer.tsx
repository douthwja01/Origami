"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { extensionOf } from "@/lib/kinds";

const AXIS_VIEW_SIZE = 96;

export function CadViewer({ url, filename }: { url: string; filename: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const axisHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = hostRef.current;
    const axisMount = axisHostRef.current;
    if (!mount || !axisMount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171a1d);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(2, 1.4, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const axisRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    axisRenderer.setPixelRatio(window.devicePixelRatio);
    axisRenderer.setClearColor(0x000000, 0);
    axisRenderer.setSize(AXIS_VIEW_SIZE, AXIS_VIEW_SIZE);
    axisMount.appendChild(axisRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xf3efe6, 0.55));
    const key = new THREE.DirectionalLight(0xe08a4a, 1.1);
    key.position.set(3, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ea0b5, 0.5);
    fill.position.set(-4, -1, -2);
    scene.add(fill);

    const material = new THREE.MeshStandardMaterial({
      color: 0xc9b8a6,
      metalness: 0.15,
      roughness: 0.45,
    });

    const { axisScene, axisCamera, disposeAxis } = createAxisGroup();

    let frame = 0;
    let disposed = false;

    function resize() {
      const node = hostRef.current;
      if (!node) return;
      const w = Math.max(node.clientWidth, 1);
      const h = Math.max(node.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      axisRenderer.setSize(AXIS_VIEW_SIZE, AXIS_VIEW_SIZE);
    }

    function frameObject(object: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(size * 0.6, size * 0.45, size * 0.6));
      camera.near = size / 100;
      camera.far = size * 10;
      camera.updateProjectionMatrix();
    }

    async function load() {
      const ext = extensionOf(filename);
      if (ext === "stl") {
        const loader = new STLLoader();
        const geometry = await loader.loadAsync(url);
        geometry.center();
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        frameObject(mesh);
      } else {
        const loader = new OBJLoader();
        const group = await loader.loadAsync(url);
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
          }
        });
        scene.add(group);
        frameObject(group);
      }
    }

    function tick() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);

      axisCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(2.4);
      axisCamera.up.copy(camera.up);
      axisCamera.lookAt(0, 0, 0);
      axisRenderer.render(axisScene, axisCamera);

      frame = requestAnimationFrame(tick);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    load().catch(() => undefined);
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeAxis();
      material.dispose();
      renderer.dispose();
      axisRenderer.dispose();
      mount.removeChild(renderer.domElement);
      axisMount.removeChild(axisRenderer.domElement);
    };
  }, [url, filename]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="h-full w-full [&>canvas]:block" />
      <div
        ref={axisHostRef}
        className="pointer-events-none absolute top-2 right-2 overflow-hidden rounded-md [&>canvas]:block"
        style={{ width: AXIS_VIEW_SIZE, height: AXIS_VIEW_SIZE }}
        aria-hidden
      />
    </div>
  );
}

function createAxisGroup() {
  const axisScene = new THREE.Scene();
  const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  axisCamera.position.set(0, 0, 2.4);

  const origin = new THREE.Vector3(0, 0, 0);
  const axes: { dir: THREE.Vector3; color: number; label: string }[] = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xe05858, label: "X" },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x5aa86a, label: "Y" },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x5a7ec8, label: "Z" },
  ];

  const disposables: { dispose: () => void }[] = [];

  for (const axis of axes) {
    const arrow = new THREE.ArrowHelper(axis.dir, origin, 0.85, axis.color, 0.22, 0.14);
    axisScene.add(arrow);

    const sprite = makeAxisLabel(axis.label, axis.color);
    sprite.position.copy(axis.dir).multiplyScalar(1.05);
    axisScene.add(sprite);
    if (sprite.material.map) disposables.push(sprite.material.map);
    disposables.push(sprite.material);
  }

  return {
    axisScene,
    axisCamera,
    disposeAxis() {
      for (const item of disposables) item.dispose();
    },
  };
}

function makeAxisLabel(text: string, color: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = "700 36px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(text, 32, 34);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillText(text, 32, 34);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(0.38);
  return sprite;
}
