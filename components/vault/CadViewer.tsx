"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { extensionOf } from "@/lib/vault/kinds";
import { isLightTheme } from "@/lib/settings/themes";

const AXIS_VIEW_SIZE = 64;
const ORIGIN = new THREE.Vector3(0, 0, 0);

function viewerBackgroundColor() {
  const theme = document.documentElement.getAttribute("data-theme");
  return isLightTheme(theme) ? 0xffffff : 0x000000;
}

export function CadViewer({ url, filename }: { url: string; filename: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const axisHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mountEl = hostRef.current;
    const axisMountEl = axisHostRef.current;
    if (!mountEl || !axisMountEl) return;
    const mount: HTMLDivElement = mountEl;
    const axisMount: HTMLDivElement = axisMountEl;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(viewerBackgroundColor());
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(2, 1.4, 2);
    camera.lookAt(ORIGIN);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // updateStyle must stay true: otherwise the buffer is pixelRatio-scaled but the
    // canvas CSS size is not, and overflow clipping makes the model look off-center.
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);

    const axisRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    axisRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    axisRenderer.setClearColor(0x000000, 0);
    axisRenderer.setSize(AXIS_VIEW_SIZE, AXIS_VIEW_SIZE);
    axisMount.appendChild(axisRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(ORIGIN);
    controls.update();

    scene.add(new THREE.AmbientLight(0xf3efe6, 0.55));
    const key = new THREE.DirectionalLight(0xe08a4a, 1.1);
    key.position.set(3, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ea0b5, 0.5);
    fill.position.set(-4, -1, -2);
    scene.add(fill);

    let grid = createGrid(10);
    scene.add(grid);

    const material = new THREE.MeshStandardMaterial({
      color: 0xc9b8a6,
      metalness: 0.15,
      roughness: 0.45,
    });

    const { axisScene, axisCamera, disposeAxis } = createAxisGroup();
    const modelRoot = new THREE.Group();
    scene.add(modelRoot);

    let frame = 0;
    let disposed = false;
    let modelReady = false;
    let hasFramed = false;

    function syncSize() {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      axisRenderer.setSize(AXIS_VIEW_SIZE, AXIS_VIEW_SIZE);
      return w > 1 && h > 1;
    }

    function placeModelAtOrigin(object: THREE.Object3D) {
      modelRoot.clear();
      modelRoot.position.copy(ORIGIN);
      modelRoot.rotation.set(0, 0, 0);
      modelRoot.scale.set(1, 1, 1);
      modelRoot.add(object);

      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.computeBoundingBox();
          child.geometry.computeBoundingSphere();
        }
      });
      object.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(object, true);
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      object.position.x -= center.x;
      object.position.y -= center.y;
      object.position.z -= center.z;
      object.updateMatrixWorld(true);

      const settled = new THREE.Box3().setFromObject(modelRoot, true);
      if (!settled.isEmpty()) {
        modelRoot.position.sub(settled.getCenter(new THREE.Vector3()));
        modelRoot.updateMatrixWorld(true);
      }

      fitGridToModel();
    }

    function fitGridToModel() {
      modelRoot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(modelRoot, true);
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.z, 1e-6);
      const gridSize = Math.max(span * 4, 2);

      scene.remove(grid);
      disposeGrid(grid);
      grid = createGrid(gridSize);
      grid.position.y = box.min.y;
      scene.add(grid);
    }

    function frameCameraOnOrigin() {
      if (!syncSize()) return false;

      modelRoot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(modelRoot, true);
      if (box.isEmpty()) return false;

      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 1e-6);

      const halfFovY = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const distY = radius / Math.sin(halfFovY);
      const halfFovX = Math.atan(Math.tan(halfFovY) * Math.max(camera.aspect, 1e-6));
      const distX = radius / Math.sin(halfFovX);
      const distance = Math.max(distX, distY) * 1.35;

      const offset = new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(distance);

      controls.target.copy(ORIGIN);
      camera.up.set(0, 1, 0);
      camera.position.copy(offset);
      camera.near = Math.max(distance / 100, 0.01);
      camera.far = Math.max(distance * 100, 100);
      camera.lookAt(ORIGIN);
      camera.updateProjectionMatrix();
      controls.update();
      hasFramed = true;
      return true;
    }

    function showObject(object: THREE.Object3D) {
      placeModelAtOrigin(object);
      modelReady = true;
      if (!frameCameraOnOrigin()) {
        hasFramed = false;
      }
    }

    async function load() {
      const ext = extensionOf(filename);
      if (ext === "stl") {
        const loader = new STLLoader();
        const geometry = await loader.loadAsync(url);
        geometry.center();
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(ORIGIN);
        showObject(mesh);
      } else {
        const loader = new OBJLoader();
        const group = await loader.loadAsync(url);
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = material;
            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
          }
        });
        showObject(group);
      }
    }

    function tick() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);

      axisCamera.position.copy(camera.position).sub(controls.target).setLength(2.4);
      axisCamera.up.copy(camera.up);
      axisCamera.lookAt(ORIGIN);
      axisRenderer.render(axisScene, axisCamera);

      frame = requestAnimationFrame(tick);
    }

    syncSize();
    const observer = new ResizeObserver(() => {
      const sized = syncSize();
      // Frame once the layout has a real size (common on first paint).
      if (modelReady && sized && !hasFramed) {
        frameCameraOnOrigin();
      }
    });
    observer.observe(mount);
    const themeObserver = new MutationObserver(() => {
      scene.background = new THREE.Color(viewerBackgroundColor());
      const size = grid.userData.gridSize as number;
      const y = grid.position.y;
      scene.remove(grid);
      disposeGrid(grid);
      grid = createGrid(size);
      grid.position.y = y;
      scene.add(grid);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    load().catch(() => undefined);
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      controls.dispose();
      disposeAxis();
      disposeGrid(grid);
      material.dispose();
      renderer.dispose();
      axisRenderer.dispose();
      mount.removeChild(renderer.domElement);
      axisMount.removeChild(axisRenderer.domElement);
    };
  }, [url, filename]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full" />
      <div
        ref={axisHostRef}
        className="pointer-events-none absolute top-2 right-2 overflow-hidden rounded-md [&>canvas]:block"
        style={{ width: AXIS_VIEW_SIZE, height: AXIS_VIEW_SIZE }}
        aria-hidden
      />
    </div>
  );
}

function gridColors() {
  const light = isLightTheme(document.documentElement.getAttribute("data-theme"));
  // Faint lines just off the background so the grid reads without competing with the model.
  return light
    ? { center: 0xc8c8c8, grid: 0xe0e0e0 }
    : { center: 0x2e2e2e, grid: 0x1c1c1c };
}

function createGrid(size: number) {
  const { center, grid: gridColor } = gridColors();
  const divisions = 20;
  const helper = new THREE.GridHelper(size, divisions, center, gridColor);
  helper.userData.gridSize = size;

  const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
  for (const mat of materials) {
    mat.transparent = true;
    mat.opacity = 0.45;
    mat.depthWrite = false;
  }

  return helper;
}

function disposeGrid(grid: THREE.GridHelper) {
  grid.geometry.dispose();
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const mat of materials) mat.dispose();
}

function createAxisGroup() {
  const axisScene = new THREE.Scene();
  const axisCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  axisCamera.position.set(0, 0, 2.4);

  const axes: { dir: THREE.Vector3; color: number; label: string }[] = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xe05858, label: "X" },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x5aa86a, label: "Y" },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x5a7ec8, label: "Z" },
  ];

  const disposables: { dispose: () => void }[] = [];

  for (const axis of axes) {
    const arrow = new THREE.ArrowHelper(axis.dir, ORIGIN, 0.7, axis.color, 0.18, 0.11);
    axisScene.add(arrow);

    const sprite = makeAxisLabel(axis.label, axis.color);
    sprite.position.copy(axis.dir).multiplyScalar(0.88);
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
  sprite.scale.setScalar(0.32);
  return sprite;
}
