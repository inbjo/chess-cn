// 棋子建模：Tripo 角色 + Three.js 汉字底座 + 头顶身份令牌；基础几何角色保留为加载失败回退。
// 每个棋子 = 汉字底座 + 角色 + 镜头朝向身份令牌。角色正面朝 +z，由 main.js 按阵营转向。
import * as THREE from 'three';
import { GLYPH } from './rules.js?v=20260901.3';
import { createGeneratedFigure } from './model-assets.js?v=20260901.3';

const SIDE = {
  red: {
    armor: 0x9c2420, cloth: 0x6d1512, trim: 0xd9a441, accent: 0xffd27a,
    base: 0x7a1a16, baseRing: 0xe8b45a, skin: 0xe9b98d, plume: 0xe23b2e,
    beard: 0x2a1a12, weapon: 0xd8dce4, elephant: 0xb08d7a,
  },
  black: {
    armor: 0x3d5470, cloth: 0x27374c, trim: 0xc8d4e4, accent: 0x9fc0e8,
    base: 0x2c3c50, baseRing: 0x9fb2c8, skin: 0xdbb288, plume: 0x5a8cc5,
    beard: 0x1a1410, weapon: 0xc8ccd4, elephant: 0x939dac,
  },
};

const MATERIAL_CACHE = new Map();
const GEOMETRY_CACHE = new Map();
const GLYPH_TEXTURE_CACHE = new Map();
const GLYPH_MATERIAL_CACHE = new Map();
const BADGE_TEXTURE_CACHE = new Map();
const MERGED_FIGURE_CACHE = new Map();
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });

function std(color, rough = 0.55, metal = 0.3) {
  const key = `${color}:${rough}:${metal}`;
  if (!MATERIAL_CACHE.has(key)) {
    MATERIAL_CACHE.set(key, new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal,
      envMapIntensity: metal > 0.55 ? 1.25 : 0.75,
    }));
  }
  return MATERIAL_CACHE.get(key);
}

function geometry(key, factory) {
  if (!GEOMETRY_CACHE.has(key)) GEOMETRY_CACHE.set(key, factory());
  return GEOMETRY_CACHE.get(key);
}

function mergeGeometryList(source) {
  const geometries = source.map(g => g.index ? g.toNonIndexed() : g.clone());
  const result = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const attributes = geometries.map(g => g.getAttribute(name));
    if (attributes.some(attr => !attr)) continue;
    const first = attributes[0];
    const totalLength = attributes.reduce((sum, attr) => sum + attr.array.length, 0);
    const merged = new first.array.constructor(totalLength);
    let offset = 0;
    for (const attr of attributes) {
      merged.set(attr.array, offset);
      offset += attr.array.length;
    }
    result.setAttribute(name, new THREE.BufferAttribute(merged, first.itemSize, first.normalized));
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  for (const g of geometries) g.dispose();
  return result;
}

// 将不参与攻击动作的零件按材质合并，保留武器层级供 main.js 单独驱动。
function batchStaticFigure(root, type, color, preservedRoots) {
  const cacheKey = `${color}:${type}`;
  const preserved = new Set(preservedRoots.filter(Boolean));
  const isPreserved = obj => {
    for (let node = obj; node && node !== root; node = node.parent) {
      if (preserved.has(node)) return true;
    }
    return false;
  };

  const removable = [];
  root.traverse(obj => {
    if (obj.isMesh && !isPreserved(obj) && !Array.isArray(obj.material)) removable.push(obj);
  });

  if (!MERGED_FIGURE_CACHE.has(cacheKey)) {
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert();
    const buckets = new Map();
    for (const mesh of removable) {
      let bucket = buckets.get(mesh.material);
      if (!bucket) {
        bucket = { material: mesh.material, geometries: [], castShadow: false, receiveShadow: false };
        buckets.set(mesh.material, bucket);
      }
      const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
      const transformed = mesh.geometry.clone();
      transformed.applyMatrix4(relative);
      bucket.geometries.push(transformed);
      bucket.castShadow ||= mesh.castShadow;
      bucket.receiveShadow ||= mesh.receiveShadow;
    }
    const merged = [];
    for (const bucket of buckets.values()) {
      merged.push({
        geometry: mergeGeometryList(bucket.geometries),
        material: bucket.material,
        castShadow: bucket.castShadow,
        receiveShadow: bucket.receiveShadow,
      });
      for (const g of bucket.geometries) g.dispose();
    }
    MERGED_FIGURE_CACHE.set(cacheKey, merged);
  }

  for (const mesh of removable) mesh.removeFromParent();
  for (const entry of MERGED_FIGURE_CACHE.get(cacheKey)) {
    const mesh = new THREE.Mesh(entry.geometry, entry.material);
    mesh.castShadow = entry.castShadow;
    mesh.receiveShadow = entry.receiveShadow;
    root.add(mesh);
  }
}

function part(geo, material, x = 0, y = 0, z = 0, rot = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (rot.x) m.rotation.x = rot.x;
  if (rot.y) m.rotation.y = rot.y;
  if (rot.z) m.rotation.z = rot.z;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const radius = geo.boundingSphere?.radius || 0;
  m.castShadow = radius > 0.11;
  m.receiveShadow = radius > 0.18;
  return m;
}

const box = (w, h, d, mt, x, y, z, rot) => part(geometry(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), mt, x, y, z, rot);
const cyl = (rt, rb, h, mt, x, y, z, rot, seg = 16) => part(geometry(`c:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mt, x, y, z, rot);
const sph = (r, mt, x, y, z, rot, w = 16, h = 12) => part(geometry(`s:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h)), mt, x, y, z, rot);
const cone = (r, h, mt, x, y, z, rot, seg = 16) => part(geometry(`n:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mt, x, y, z, rot);
const torus = (r, t, mt, x, y, z, rot, arc = Math.PI * 2) => part(geometry(`t:${r}:${t}:${arc}`, () => new THREE.TorusGeometry(r, t, 10, 24, arc)), mt, x, y, z, rot);

function glyphTexture(text, bg, ink, ring) {
  const key = `${text}:${bg}:${ink}:${ring}`;
  if (GLYPH_TEXTURE_CACHE.has(key)) return GLYPH_TEXTURE_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const base = ctx.createRadialGradient(105, 85, 8, 128, 128, 180);
  base.addColorStop(0, bg);
  base.addColorStop(0.68, bg);
  base.addColorStop(1, '#080604');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = i % 2 ? '#fff1cf' : '#100906';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 0.7 + Math.random() * 2.2, 0.7 + Math.random() * 2.2);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ring;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.48;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(128, 128, 94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  // 棋子需使用覆盖完整繁简字形的同一字体，避免 Ma Shan Zheng 缺字后局部回退造成混排。
  ctx.font = '900 148px "Noto Serif SC", "Songti SC", "STSong", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  GLYPH_TEXTURE_CACHE.set(key, tex);
  return tex;
}

function glyphMaterial(color, type) {
  const key = `${color}:${type}`;
  if (!GLYPH_MATERIAL_CACHE.has(key)) {
    GLYPH_MATERIAL_CACHE.set(key, new THREE.MeshStandardMaterial({
      map: glyphTexture(
        GLYPH[color][type],
        color === 'red' ? '#3a0f0c' : '#141e2a',
        color === 'red' ? '#ffd9a0' : '#cfe0f5',
        '#e8c070'
      ),
      roughness: 0.55,
      metalness: 0.1,
      // 汉字面贴近底座顶面，需要稳定的深度偏移以免相机移动时闪动。
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }));
  }
  return GLYPH_MATERIAL_CACHE.get(key);
}

// ---- 头顶身份令牌: Sprite 始终正对镜头，混战中也不会被角色遮挡 ----
function identityBadgeTexture(text, color) {
  const key = `${color}:${text}`;
  if (BADGE_TEXTURE_CACHE.has(key)) return BADGE_TEXTURE_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const red = color === 'red';
  const outer = red ? '#ffd16f' : '#c8dcff';
  const inner = red ? '#6f1713' : '#162a45';
  const glow = red ? 'rgba(255, 93, 57, 0.72)' : 'rgba(89, 153, 255, 0.7)';
  const ink = red ? '#fff2bf' : '#f2f7ff';

  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = 'rgba(8, 5, 3, 0.88)';
  ctx.beginPath();
  ctx.arc(128, 126, 96, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 0;
  const rim = ctx.createLinearGradient(52, 44, 204, 214);
  rim.addColorStop(0, '#fff1b0');
  rim.addColorStop(0.38, outer);
  rim.addColorStop(1, red ? '#9a5a24' : '#667f9f');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(128, 126, 91, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  const face = ctx.createRadialGradient(101, 88, 9, 128, 126, 84);
  face.addColorStop(0, red ? '#aa3b27' : '#35567e');
  face.addColorStop(0.58, inner);
  face.addColorStop(1, red ? '#390b0a' : '#091322');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(128, 126, 79, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = red ? 'rgba(255, 222, 142, 0.54)' : 'rgba(219, 235, 255, 0.58)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 126, 69, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowColor = glow;
  ctx.shadowBlur = 8;
  ctx.fillStyle = ink;
  ctx.font = '900 126px "Noto Serif SC", "Songti SC", "STSong", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 132);

  // 令牌下方的小铆钉让标识更像军阵器物，而不是普通 UI 气泡。
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(128, 231, 5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  BADGE_TEXTURE_CACHE.set(key, tex);
  return tex;
}

function identityBadge(color, type) {
  const material = new THREE.SpriteMaterial({
    map: identityBadgeTexture(GLYPH[color][type], color),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    sizeAttenuation: false,
  });
  const badge = new THREE.Sprite(material);
  // 非透视缩放保持约 30–40px 的屏幕尺寸，远端棋子依然可辨识。
  badge.scale.set(0.03, 0.03, 1);
  badge.renderOrder = 1000;
  badge.frustumCulled = false;
  badge.userData.identityBadge = true;
  badge.userData.baseScale = 0.03;
  return badge;
}

// ---- 底座: 阵营色金属盘 + 顶面汉字 + 描金环 ----
function pedestal(color, type) {
  const s = SIDE[color];
  const g = new THREE.Group();
  const sideMt = std(s.base, 0.45, 0.5);
  const body = new THREE.Mesh(
    geometry('pedestal:body', () => new THREE.CylinderGeometry(1.0, 1.12, 0.34, 28)),
    sideMt
  );
  body.position.y = 0.17;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const face = new THREE.Mesh(
    geometry('pedestal:face', () => new THREE.CircleGeometry(0.97, 28)),
    glyphMaterial(color, type)
  );
  face.rotation.x = -Math.PI / 2;
  face.rotation.z = Math.PI;
  face.position.y = 0.35;
  face.receiveShadow = true;
  g.add(face);
  g.add(torus(1.01, 0.035, std(s.baseRing, 0.3, 0.8), 0, 0.34, 0, { x: Math.PI / 2 }));
  g.add(torus(0.86, 0.018, std(s.baseRing, 0.32, 0.75), 0, 0.352, 0, { x: Math.PI / 2 }));
  g.add(torus(1.12, 0.03, std(s.baseRing, 0.3, 0.8), 0, 0.02, 0, { x: Math.PI / 2 }));
  return g;
}

// ---- 通用五官 ----
function addFace(head, skin, s, r = 0.32, opts = {}) {
  const eyeMt = std(0x14100c, 0.3, 0.1);
  const y = opts.eyeY ?? 0.03;
  const z = r * 0.82;
  head.add(sph(0.045, eyeMt, -r * 0.38, y, z));
  head.add(sph(0.045, eyeMt, r * 0.38, y, z));
  const browMt = std(s.beard, 0.7, 0);
  head.add(box(0.11, 0.03, 0.03, browMt, -r * 0.38, y + 0.1, z + 0.01, { z: opts.stern ? -0.35 : 0 }));
  head.add(box(0.11, 0.03, 0.03, browMt, r * 0.38, y + 0.1, z + 0.01, { z: opts.stern ? 0.35 : 0 }));
  return head;
}

// ---- 武器 ----
function longSword(s) {
  const g = new THREE.Group();
  g.add(box(0.05, 0.34, 0.05, std(0x3a2418, 0.6, 0.1), 0, 0.17, 0));           // 柄
  g.add(box(0.22, 0.05, 0.08, std(s.trim, 0.3, 0.85), 0, 0.37, 0));            // 镡
  g.add(box(0.085, 1.5, 0.02, std(s.weapon, 0.15, 0.95), 0, 1.15, 0));         // 身
  g.add(cone(0.06, 0.16, std(s.weapon, 0.15, 0.95), 0, 1.97, 0, {}, 4));       // 锋
  g.add(sph(0.05, std(s.trim, 0.3, 0.85), 0, -0.02, 0));                       // 首
  return g;
}

function spear(s, len = 2.2) {
  const g = new THREE.Group();
  g.add(cyl(0.03, 0.03, len, std(0x4a3020, 0.6, 0.1), 0, len / 2, 0));
  g.add(cyl(0.045, 0.045, 0.08, std(s.trim, 0.3, 0.85), 0, len + 0.02, 0));
  g.add(cone(0.06, 0.3, std(s.weapon, 0.15, 0.95), 0, len + 0.2, 0, {}, 8));
  g.add(cone(0.05, 0.14, std(s.plume, 0.7, 0), 0, len - 0.02, 0, { x: Math.PI }, 8)); // 红缨
  return g;
}

function halberd(s) { // 方天画戟
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.035, 2.5, std(0x3a2a1a, 0.55, 0.15), 0, 1.25, 0));
  g.add(cone(0.07, 0.34, std(s.weapon, 0.15, 0.95), 0, 2.68, 0, {}, 8));
  g.add(box(0.05, 0.3, 0.02, std(s.weapon, 0.15, 0.95), 0.14, 2.42, 0));        // 戟枝
  g.add(torus(0.12, 0.025, std(s.trim, 0.3, 0.85), 0.12, 2.3, 0, { y: Math.PI / 2 }, Math.PI)); // 月牙
  g.add(cyl(0.05, 0.05, 0.1, std(s.trim, 0.3, 0.85), 0, 2.52, 0));
  return g;
}

function staff(s) {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.045, 1.9, std(0x5a3a22, 0.6, 0.1), 0, 0.95, 0));
  g.add(sph(0.1, std(s.accent, 0.25, 0.7), 0, 1.98, 0));
  g.add(torus(0.12, 0.02, std(s.trim, 0.3, 0.85), 0, 1.86, 0));
  return g;
}

function roundShield(s) {
  const g = new THREE.Group();
  g.add(cyl(0.34, 0.34, 0.06, std(s.armor, 0.5, 0.5), 0, 0, 0, { x: Math.PI / 2 }));
  g.add(sph(0.09, std(s.trim, 0.3, 0.85), 0, 0, 0.05));
  g.add(torus(0.3, 0.025, std(s.trim, 0.3, 0.85), 0, 0, 0.04));
  return g;
}

// ---- 帅 / 將: 重甲大帅，凤翅盔、披风、长剑拄地 ----
function buildGeneral(s) {
  const g = new THREE.Group();
  const armor = std(s.armor, 0.4, 0.65), trim = std(s.trim, 0.28, 0.85), cloth = std(s.cloth, 0.75, 0.05);
  // 靴与腿
  g.add(box(0.2, 0.16, 0.34, std(0x241812, 0.7, 0.1), -0.2, 0.08, 0.04));
  g.add(box(0.2, 0.16, 0.34, std(0x241812, 0.7, 0.1), 0.2, 0.08, 0.04));
  g.add(cyl(0.11, 0.13, 0.5, armor, -0.2, 0.42, 0));
  g.add(cyl(0.11, 0.13, 0.5, armor, 0.2, 0.42, 0));
  // 战裙
  g.add(cyl(0.4, 0.58, 0.55, cloth, 0, 0.85, 0));
  g.add(box(0.3, 0.42, 0.06, armor, 0, 0.82, 0.3));
  // 躯干铠甲
  g.add(box(0.82, 0.72, 0.5, armor, 0, 1.5, 0));
  g.add(box(0.5, 0.5, 0.06, trim, 0, 1.52, 0.27));                    // 护心镜框
  g.add(sph(0.14, std(s.accent, 0.2, 0.9), 0, 1.55, 0.3));            // 护心镜
  g.add(torus(0.34, 0.045, trim, 0, 1.14, 0, { x: Math.PI / 2 }));    // 腰带
  // 肩甲
  g.add(sph(0.2, armor, -0.5, 1.86, 0));
  g.add(sph(0.2, armor, 0.5, 1.86, 0));
  g.add(torus(0.2, 0.03, trim, -0.5, 1.8, 0, { x: Math.PI / 2 }));
  g.add(torus(0.2, 0.03, trim, 0.5, 1.8, 0, { x: Math.PI / 2 }));
  // 手臂: 双手拄剑于身前
  g.add(cyl(0.08, 0.09, 0.45, armor, -0.52, 1.5, 0.12, { x: -0.5 }));
  g.add(cyl(0.08, 0.09, 0.45, armor, 0.52, 1.5, 0.12, { x: -0.5 }));
  g.add(cyl(0.07, 0.08, 0.42, trim, -0.34, 1.18, 0.36, { x: -1.2, z: -0.5 }));
  g.add(cyl(0.07, 0.08, 0.42, trim, 0.34, 1.18, 0.36, { x: -1.2, z: 0.5 }));
  g.add(sph(0.1, std(s.skin, 0.6, 0), -0.08, 1.06, 0.5));
  g.add(sph(0.1, std(s.skin, 0.6, 0), 0.08, 1.06, 0.5));
  // 长剑拄地
  const sword = longSword(s);
  sword.name = 'weapon';
  sword.rotation.x = Math.PI;
  sword.position.set(0, 1.02, 0.52);
  g.add(sword);
  // 头
  const head = new THREE.Group();
  head.position.y = 2.14;
  head.add(sph(0.31, std(s.skin, 0.6, 0), 0, 0, 0));
  addFace(head, s.skin, s, 0.31, { stern: true });
  head.add(box(0.1, 0.42, 0.08, std(s.beard, 0.8, 0), 0, -0.32, 0.24));       // 长髯
  head.add(box(0.24, 0.1, 0.06, std(s.beard, 0.8, 0), 0, -0.12, 0.27));       // 髭
  // 凤翅盔
  head.add(cone(0.34, 0.34, trim, 0, 0.32, 0, {}, 12));
  head.add(torus(0.32, 0.04, trim, 0, 0.16, 0, { x: Math.PI / 2 }));
  head.add(box(0.06, 0.3, 0.34, trim, -0.34, 0.28, 0, { z: 0.5 }));           // 凤翅
  head.add(box(0.06, 0.3, 0.34, trim, 0.34, 0.28, 0, { z: -0.5 }));
  head.add(cyl(0.05, 0.09, 0.36, std(s.plume, 0.7, 0), 0, 0.6, 0, { x: 0.25 })); // 盔缨
  g.add(head);
  // 披风
  const cape = box(0.86, 1.5, 0.05, cloth, 0, 1.25, -0.33, { x: 0.12 });
  g.add(cape);
  g.userData.rig = { weapon: sword, head };
  return g;
}

// ---- 仕 / 士: 文士侍卫，长袍幞头，腰悬短剑 ----
function buildAdvisor(s) {
  const g = new THREE.Group();
  const robe = std(s.cloth, 0.75, 0.05), trim = std(s.trim, 0.3, 0.8);
  g.add(cyl(0.32, 0.52, 1.25, robe, 0, 0.63, 0));                       // 长袍
  g.add(torus(0.36, 0.03, trim, 0, 0.98, 0, { x: Math.PI / 2 }));       // 衣缘
  g.add(box(0.62, 0.5, 0.36, robe, 0, 1.42, 0));                        // 上身
  g.add(box(0.2, 0.5, 0.04, trim, 0, 1.42, 0.2));                       // 衣襟
  // 抱拳的双臂
  g.add(cyl(0.08, 0.09, 0.42, robe, -0.3, 1.28, 0.14, { x: -1.1, z: -0.35 }));
  g.add(cyl(0.08, 0.09, 0.42, robe, 0.3, 1.28, 0.14, { x: -1.1, z: 0.35 }));
  g.add(sph(0.09, std(s.skin, 0.6, 0), -0.06, 1.14, 0.32));
  g.add(sph(0.09, std(s.skin, 0.6, 0), 0.06, 1.14, 0.32));
  // 腰悬短剑
  const sw = longSword(s);
  sw.name = 'weapon';
  sw.scale.setScalar(0.55);
  sw.rotation.set(0.4, 0, 2.2);
  sw.position.set(-0.38, 1.05, -0.05);
  g.add(sw);
  // 头 + 幞头帽
  const head = new THREE.Group();
  head.position.y = 1.88;
  head.add(sph(0.28, std(s.skin, 0.6, 0), 0, 0, 0));
  addFace(head, s.skin, s, 0.28);
  head.add(cyl(0.26, 0.29, 0.2, std(s.armor, 0.5, 0.4), 0, 0.22, 0));
  head.add(box(0.05, 0.22, 0.05, std(s.armor, 0.5, 0.4), -0.2, 0.4, -0.08, { z: 0.3 }));
  head.add(box(0.05, 0.22, 0.05, std(s.armor, 0.5, 0.4), 0.2, 0.4, -0.08, { z: -0.3 }));
  g.add(head);
  g.userData.rig = { weapon: sw, head };
  return g;
}

// ---- 相 / 象: 象头文官，大耳长鼻，手持朝杖 ----
function buildElephant(s) {
  const g = new THREE.Group();
  const robe = std(s.armor, 0.55, 0.4), trim = std(s.trim, 0.3, 0.8);
  const hide = std(s.elephant, 0.7, 0.05);
  g.add(cyl(0.38, 0.56, 1.1, robe, 0, 0.55, 0));
  g.add(box(0.72, 0.62, 0.44, robe, 0, 1.35, 0));
  g.add(box(0.24, 0.6, 0.05, trim, 0, 1.35, 0.24));
  g.add(torus(0.4, 0.04, trim, 0, 1.05, 0, { x: Math.PI / 2 }));
  // 手臂: 右手持杖，左手扶腹
  g.add(cyl(0.08, 0.09, 0.5, robe, 0.42, 1.3, 0.12, { x: -0.6 }));
  g.add(sph(0.09, hide, 0.46, 1.05, 0.32));
  g.add(cyl(0.08, 0.09, 0.4, robe, -0.42, 1.32, 0.1, { x: -0.9 }));
  g.add(sph(0.09, hide, -0.36, 1.12, 0.3));
  const st = staff(s);
  st.name = 'weapon';
  st.position.set(0.52, 0, 0.36);
  g.add(st);
  // 象头
  const head = new THREE.Group();
  head.position.y = 2.0;
  head.add(sph(0.34, hide, 0, 0, 0));
  head.add(sph(0.045, std(0x14100c, 0.3, 0.1), -0.14, 0.06, 0.29));
  head.add(sph(0.045, std(0x14100c, 0.3, 0.1), 0.14, 0.06, 0.29));
  // 大耳
  const earL = sph(0.22, hide, -0.36, 0.05, -0.05);
  earL.scale.set(0.35, 1, 0.8); earL.rotation.z = 0.4;
  const earR = sph(0.22, hide, 0.36, 0.05, -0.05);
  earR.scale.set(0.35, 1, 0.8); earR.rotation.z = -0.4;
  head.add(earL, earR);
  // 长鼻(三节下垂前卷)
  head.add(cyl(0.09, 0.11, 0.3, hide, 0, -0.12, 0.3, { x: 0.5 }));
  head.add(cyl(0.07, 0.09, 0.28, hide, 0, -0.32, 0.4, { x: 0.9 }));
  head.add(cyl(0.05, 0.07, 0.24, hide, 0, -0.5, 0.36, { x: 1.5 }));
  // 象牙
  head.add(cone(0.045, 0.22, std(0xf2ead8, 0.4, 0.1), -0.14, -0.2, 0.26, { x: 2.6 }));
  head.add(cone(0.045, 0.22, std(0xf2ead8, 0.4, 0.1), 0.14, -0.2, 0.26, { x: 2.6 }));
  // 官帽
  head.add(cyl(0.2, 0.24, 0.22, trim, 0, 0.36, 0));
  head.add(sph(0.06, std(s.accent, 0.25, 0.8), 0, 0.5, 0));
  g.add(head);
  g.userData.rig = { weapon: st, head };
  return g;
}

// ---- 馬: 马头骑兵，鬃毛飞扬，手持长枪 ----
function buildHorse(s) {
  const g = new THREE.Group();
  const armor = std(s.armor, 0.45, 0.55), trim = std(s.trim, 0.3, 0.8);
  const hide = std(0x7a5236, 0.7, 0.05), mane = std(0x2e1d12, 0.8, 0);
  g.add(box(0.18, 0.14, 0.3, std(0x241812, 0.7, 0.1), -0.17, 0.07, 0.03));
  g.add(box(0.18, 0.14, 0.3, std(0x241812, 0.7, 0.1), 0.17, 0.07, 0.03));
  g.add(cyl(0.09, 0.11, 0.45, armor, -0.17, 0.38, 0));
  g.add(cyl(0.09, 0.11, 0.45, armor, 0.17, 0.38, 0));
  g.add(cyl(0.34, 0.48, 0.45, std(s.cloth, 0.75, 0.05), 0, 0.78, 0));
  g.add(box(0.68, 0.6, 0.42, armor, 0, 1.35, 0));
  g.add(box(0.4, 0.36, 0.05, trim, 0, 1.38, 0.23));
  g.add(sph(0.16, armor, -0.42, 1.66, 0));
  g.add(sph(0.16, armor, 0.42, 1.66, 0));
  // 右臂持枪竖立，左臂叉腰
  g.add(cyl(0.07, 0.08, 0.44, armor, 0.48, 1.32, 0.1, { x: -0.4 }));
  g.add(sph(0.09, std(s.skin, 0.6, 0), 0.52, 1.05, 0.26));
  g.add(cyl(0.07, 0.08, 0.4, armor, -0.44, 1.36, 0.05, { z: 0.9 }));
  g.add(sph(0.09, std(s.skin, 0.6, 0), -0.5, 1.14, 0.12));
  const sp = spear(s);
  sp.name = 'weapon';
  sp.position.set(0.56, 0, 0.28);
  g.add(sp);
  // 马头
  const head = new THREE.Group();
  head.position.y = 1.95;
  head.add(cyl(0.13, 0.17, 0.4, hide, 0, -0.05, 0, { x: 0.3 }));          // 颈
  head.add(box(0.26, 0.28, 0.5, hide, 0, 0.28, 0.14));                    // 颅+吻
  head.add(box(0.2, 0.18, 0.24, hide, 0, 0.2, 0.42));                     // 吻部
  head.add(sph(0.045, std(0x14100c, 0.25, 0.2), -0.14, 0.34, 0.26));
  head.add(sph(0.045, std(0x14100c, 0.25, 0.2), 0.14, 0.34, 0.26));
  head.add(sph(0.025, std(0x0c0a08, 0.4, 0), -0.06, 0.22, 0.55));         // 鼻孔
  head.add(sph(0.025, std(0x0c0a08, 0.4, 0), 0.06, 0.22, 0.55));
  head.add(cone(0.06, 0.18, hide, -0.1, 0.5, 0.02, { z: 0.15 }, 6));      // 耳
  head.add(cone(0.06, 0.18, hide, 0.1, 0.5, 0.02, { z: -0.15 }, 6));
  // 鬃毛
  for (let i = 0; i < 5; i++) {
    head.add(box(0.07, 0.16, 0.1, mane, 0, 0.44 - i * 0.13, -0.1 - i * 0.07, { x: -0.3 }));
  }
  // 马辔金饰
  head.add(box(0.3, 0.05, 0.05, trim, 0, 0.2, 0.4));
  head.add(sph(0.05, std(s.accent, 0.25, 0.8), 0, 0.42, 0.3));
  g.add(head);
  g.userData.rig = { weapon: sp, head };
  return g;
}

// ---- 車: 战车力士，轮甲重铠，双手执戟 ----
function buildChariot(s) {
  const g = new THREE.Group();
  const armor = std(s.armor, 0.4, 0.6), trim = std(s.trim, 0.28, 0.85);
  // 轮式立姿: 双腿如柱，两侧挂车轮
  g.add(cyl(0.16, 0.2, 0.7, armor, -0.24, 0.35, 0));
  g.add(cyl(0.16, 0.2, 0.7, armor, 0.24, 0.35, 0));
  const wheelMt = std(0x3a2a1c, 0.6, 0.2);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Group();
    wheel.position.set(side * 0.52, 0.42, 0);
    wheel.add(torus(0.3, 0.06, wheelMt, 0, 0, 0, { y: Math.PI / 2 }));
    wheel.add(cyl(0.06, 0.06, 0.1, trim, 0, 0, 0, { z: Math.PI / 2 }));
    for (let i = 0; i < 4; i++) {
      wheel.add(box(0.05, 0.52, 0.04, wheelMt, 0, 0, 0, { x: (Math.PI / 4) * i }));
    }
    g.add(wheel);
  }
  g.add(cyl(0.42, 0.5, 0.4, std(s.cloth, 0.7, 0.1), 0, 0.86, 0));
  // 宽厚躯干
  g.add(box(0.95, 0.75, 0.55, armor, 0, 1.45, 0));
  g.add(box(0.6, 0.45, 0.07, trim, 0, 1.48, 0.29));
  g.add(torus(0.4, 0.05, trim, 0, 1.08, 0, { x: Math.PI / 2 }));
  // 巨肩甲
  g.add(sph(0.26, armor, -0.58, 1.86, 0));
  g.add(sph(0.26, armor, 0.58, 1.86, 0));
  g.add(cone(0.08, 0.18, trim, -0.62, 2.08, 0, {}, 6));
  g.add(cone(0.08, 0.18, trim, 0.62, 2.08, 0, {}, 6));
  // 双臂前握长戟
  g.add(cyl(0.1, 0.11, 0.5, armor, -0.56, 1.45, 0.15, { x: -0.7 }));
  g.add(cyl(0.1, 0.11, 0.5, armor, 0.56, 1.45, 0.15, { x: -0.7 }));
  g.add(cyl(0.09, 0.1, 0.45, armor, -0.4, 1.12, 0.42, { x: -1.3, z: -0.4 }));
  g.add(cyl(0.09, 0.1, 0.45, armor, 0.4, 1.12, 0.42, { x: -1.3, z: 0.4 }));
  g.add(sph(0.11, std(s.skin, 0.6, 0), -0.18, 1.02, 0.55));
  g.add(sph(0.11, std(s.skin, 0.6, 0), 0.18, 1.02, 0.55));
  const hb = halberd(s);
  hb.name = 'weapon';
  hb.position.set(0, 0.1, 0.6);
  hb.rotation.x = 0.12;
  g.add(hb);
  // 头: 全覆式铁盔
  const head = new THREE.Group();
  head.position.y = 2.12;
  head.add(sph(0.3, armor, 0, 0.02, 0));
  head.add(box(0.34, 0.06, 0.06, std(0x0c0a08, 0.4, 0.2), 0, 0.05, 0.28)); // 面甲缝
  head.add(torus(0.3, 0.04, trim, 0, -0.05, 0, { x: Math.PI / 2 }));
  head.add(box(0.08, 0.22, 0.3, std(s.plume, 0.7, 0), 0, 0.34, -0.02));    // 盔冠
  g.add(head);
  g.userData.rig = { weapon: hb, head };
  return g;
}

// ---- 炮 / 砲: 火炮手，肩扛重炮，腰挂药葫芦 ----
function buildCannon(s) {
  const g = new THREE.Group();
  const cloth = std(s.cloth, 0.7, 0.1), trim = std(s.trim, 0.3, 0.8);
  const iron = std(0x3c4148, 0.35, 0.85);
  // 矮壮身材
  g.add(box(0.2, 0.15, 0.32, std(0x241812, 0.7, 0.1), -0.2, 0.075, 0.03));
  g.add(box(0.2, 0.15, 0.32, std(0x241812, 0.7, 0.1), 0.2, 0.075, 0.03));
  g.add(cyl(0.11, 0.13, 0.4, cloth, -0.2, 0.35, 0));
  g.add(cyl(0.11, 0.13, 0.4, cloth, 0.2, 0.35, 0));
  const belly = sph(0.42, cloth, 0, 0.95, 0);
  belly.scale.set(1, 1.1, 0.9);
  g.add(belly);
  g.add(torus(0.4, 0.05, trim, 0, 0.85, 0, { x: Math.PI / 2 }));           // 腰带
  g.add(box(0.5, 0.3, 0.4, std(s.armor, 0.5, 0.5), 0, 1.35, 0));           // 胸甲
  // 右肩扛炮管
  const barrel = new THREE.Group();
  barrel.name = 'cannonBarrel';
  barrel.position.set(0.28, 1.54, 0.02);
  barrel.rotation.x = Math.PI / 2 - 0.1;
  barrel.add(cyl(0.14, 0.17, 1.3, iron, 0, 0.3, 0));
  barrel.add(torus(0.17, 0.035, iron, 0, 0.92, 0, { x: Math.PI / 2 }));
  barrel.add(torus(0.19, 0.03, trim, 0, -0.28, 0, { x: Math.PI / 2 }));
  barrel.add(cyl(0.06, 0.06, 0.14, std(0x8a5a2a, 0.7, 0), 0, -0.4, 0));    // 火门木塞
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.y = 1.02;
  barrel.add(muzzle);
  g.add(barrel);
  // 双臂扶炮
  g.add(cyl(0.08, 0.09, 0.4, cloth, 0.42, 1.3, 0.2, { x: -0.9 }));
  g.add(sph(0.09, std(s.skin, 0.6, 0), 0.4, 1.5, 0.42));
  g.add(cyl(0.08, 0.09, 0.4, cloth, -0.4, 1.25, 0.15, { x: -1.0, z: 0.3 }));
  g.add(sph(0.09, std(s.skin, 0.6, 0), -0.2, 1.1, 0.42));
  // 火药葫芦
  g.add(sph(0.13, std(0x7a4a22, 0.6, 0.1), -0.42, 0.8, 0.2));
  g.add(cyl(0.05, 0.07, 0.12, std(0x7a4a22, 0.6, 0.1), -0.42, 0.93, 0.2));
  // 头: 圆盔 + 威严脸
  const head = new THREE.Group();
  head.position.y = 1.78;
  head.add(sph(0.28, std(s.skin, 0.6, 0), 0, 0, 0));
  addFace(head, s.skin, s, 0.28, { stern: true });
  head.add(box(0.2, 0.07, 0.05, std(s.beard, 0.8, 0), 0, -0.1, 0.25));     // 虬髯
  head.add(sph(0.29, std(s.armor, 0.45, 0.6), 0, 0.1, -0.02));             // 盔体
  head.add(sph(0.05, trim, 0, 0.38, 0));
  g.add(head);
  g.userData.rig = { weapon: barrel, barrel, muzzle, head };
  return g;
}

// ---- 兵 / 卒: 步卒，斗笠短打，枪盾在手 ----
function buildSoldier(s) {
  const g = new THREE.Group();
  const cloth = std(s.cloth, 0.75, 0.05), trim = std(s.trim, 0.35, 0.7);
  g.add(box(0.16, 0.12, 0.28, std(0x2a1c12, 0.7, 0.1), -0.14, 0.06, 0.02));
  g.add(box(0.16, 0.12, 0.28, std(0x2a1c12, 0.7, 0.1), 0.14, 0.06, 0.02));
  g.add(cyl(0.08, 0.1, 0.4, std(s.skin, 0.65, 0), -0.14, 0.32, 0));        // 绑腿
  g.add(cyl(0.08, 0.1, 0.4, std(s.skin, 0.65, 0), 0.14, 0.32, 0));
  g.add(box(0.4, 0.24, 0.3, cloth, 0, 0.6, 0));                            // 短打
  g.add(box(0.48, 0.5, 0.34, cloth, 0, 1.0, 0));
  g.add(box(0.5, 0.08, 0.36, trim, 0, 0.78, 0));                           // 腰带
  g.add(box(0.3, 0.3, 0.05, std(s.armor, 0.5, 0.5), 0, 1.05, 0.19));       // 皮甲
  // 右臂持枪，左臂挽盾
  g.add(cyl(0.06, 0.07, 0.36, cloth, 0.3, 1.0, 0.08, { x: -0.5 }));
  g.add(sph(0.07, std(s.skin, 0.6, 0), 0.34, 0.8, 0.2));
  g.add(cyl(0.06, 0.07, 0.34, cloth, -0.3, 1.0, 0.06, { z: 0.5 }));
  const sh = roundShield(s);
  sh.position.set(-0.42, 0.95, 0.16);
  g.add(sh);
  const sp = spear(s, 1.7);
  sp.name = 'weapon';
  sp.position.set(0.38, 0, 0.22);
  g.add(sp);
  // 头 + 斗笠
  const head = new THREE.Group();
  head.position.y = 1.42;
  head.add(sph(0.24, std(s.skin, 0.6, 0), 0, 0, 0));
  addFace(head, s.skin, s, 0.24);
  head.add(cone(0.42, 0.22, std(color2hat(s), 0.7, 0.1), 0, 0.22, 0, {}, 14));
  head.add(sph(0.04, trim, 0, 0.34, 0));
  g.add(head);
  g.userData.rig = { weapon: sp, shield: sh, head };
  return g;
}

function color2hat(s) {
  return s.plume === 0xe23b2e ? 0x8a6a3a : 0x4a4640; // 红方草帽 / 黑方铁笠
}

const BUILDERS = {
  general: buildGeneral,
  advisor: buildAdvisor,
  elephant: buildElephant,
  horse: buildHorse,
  chariot: buildChariot,
  cannon: buildCannon,
  soldier: buildSoldier,
};

export function createPieceMesh(type, color) {
  const s = SIDE[color];
  const root = new THREE.Group();
  const piecePedestal = pedestal(color, type);
  root.add(piecePedestal);
  const generatedFigure = createGeneratedFigure(type, color);
  const figure = generatedFigure || BUILDERS[type](s);
  const rig = figure.userData.rig || {};
  if (!generatedFigure) batchStaticFigure(figure, type, color, [rig.weapon]);
  figure.position.y = 0.34;
  root.add(figure);
  root.updateMatrixWorld(true);
  const figureBox = new THREE.Box3().setFromObject(figure);
  const badge = identityBadge(color, type);
  badge.position.y = THREE.MathUtils.clamp(figureBox.max.y + 0.28, 2.85, 3.25);
  root.add(badge);
  const hitArea = new THREE.Mesh(
    geometry('hit:cylinder', () => new THREE.CylinderGeometry(1.05, 1.05, 3.2, 12)),
    HIT_MATERIAL
  );
  hitArea.position.y = 1.5;
  hitArea.userData.isPieceHitArea = true;
  root.add(hitArea);
  root.userData.figure = figure;
  root.userData.pedestal = piecePedestal;
  root.userData.rig = rig;
  root.userData.hitArea = hitArea;
  root.userData.identityBadge = badge;
  root.userData.ownedMaterials = [badge.material];
  return root;
}
