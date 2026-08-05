// Tripo 生成的棋子角色资产：统一预加载、归一化与阵营色处理。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TYPES = ['general', 'advisor', 'elephant', 'horse', 'chariot', 'cannon', 'soldier'];
const MODEL_HEIGHT = {
  general: 2.45,
  advisor: 2.18,
  elephant: 2.36,
  horse: 2.35,
  chariot: 2.45,
  cannon: 2.16,
  soldier: 2.24,
};
const MODEL_SINK = {
  general: 0.05,
  advisor: 0.2,
  elephant: 0.05,
  horse: 0.18,
  chariot: 0.16,
  cannon: 0.05,
  soldier: 0.05,
};
const TEAM_TINT = {
  red: new THREE.Color(1.0, 0.78, 0.7),
  black: new THREE.Color(0.64, 0.78, 1.0),
};

const loader = new GLTFLoader();
const templates = new Map();
const materialVariants = new Map();

function normalizeModel(scene, type) {
  const root = new THREE.Group();
  root.name = `tripo-${type}`;
  root.add(scene);

  // Tripo 资产以 +X 为正面；项目的朝向与攻击动画统一以 +Z 为正面。
  scene.rotateY(-Math.PI / 2);
  scene.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(scene);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const scale = MODEL_HEIGHT[type] / Math.max(sourceSize.y, 0.001);
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(scene);
  const center = scaledBox.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  // 轻微下沉，使 Tripo 偶尔生成的薄底台与原有汉字底座自然重合。
  scene.position.y -= scaledBox.min.y + MODEL_SINK[type];

  scene.traverse(obj => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.geometry.computeBoundingSphere();
  });
  root.userData.generatedModel = true;
  root.userData.rig = {};
  return root;
}

function teamMaterial(source, type, color) {
  const key = `${type}:${color}:${source.uuid}`;
  if (!materialVariants.has(key)) {
    const material = source.clone();
    material.color.multiply(TEAM_TINT[color]);
    material.roughness = Math.max(material.roughness ?? 0.6, 0.42);
    material.envMapIntensity = 0.82;
    materialVariants.set(key, material);
  }
  return materialVariants.get(key);
}

export async function preloadPieceModels(onProgress) {
  let completed = 0;
  await Promise.all(TYPES.map(async type => {
    try {
      const gltf = await loader.loadAsync(`assets/models/${type}.glb`);
      templates.set(type, normalizeModel(gltf.scene, type));
    } catch (error) {
      console.warn(`Tripo ${type} model unavailable; using procedural fallback`, error);
    } finally {
      completed++;
      onProgress?.(completed, TYPES.length);
    }
  }));
  return templates.size;
}

export function createGeneratedFigure(type, color) {
  const template = templates.get(type);
  if (!template) return null;
  const figure = template.clone(true);
  figure.traverse(obj => {
    if (!obj.isMesh) return;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map(material => teamMaterial(material, type, color))
      : teamMaterial(obj.material, type, color);
  });
  figure.userData.generatedModel = true;
  figure.userData.rig = {};
  return figure;
}
