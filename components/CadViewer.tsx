"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { extensionOf } from "@/lib/kinds";

export function CadViewer({ url, filename }: { url: string; filename: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = hostRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171a1d);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(2, 1.4, 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

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

    let frame = 0;
    let disposed = false;

    function resize() {
      const node = hostRef.current;
      if (!node) return;
      const w = node.clientWidth || 480;
      const h = Math.max(node.clientHeight, 360);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [url, filename]);

  return <div ref={hostRef} className="h-[70vh] w-full" />;
}
