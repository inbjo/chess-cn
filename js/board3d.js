// 3D 棋盘: 风化夯土沙盘 + 錾刻棋路（九宫、河谷、炮位兵位标记）
import * as THREE from 'three';

export const CELL = 2.6;
export const MARGIN = 1.8;
export const BOARD_W = 8 * CELL + MARGIN * 2;  // 24.4
export const BOARD_H = 9 * CELL + MARGIN * 2;  // 27.0
const TOP_Y = 0.62;

// row 0(黑方) 在 -z，row 9(红方) 在 +z；col 0 在 -x
export function squareToWorld(row, col) {
  return { x: (col - 4) * CELL, y: TOP_Y, z: (row - 4.5) * CELL };
}

function boardTexture() {
  const PX = 64; // 每世界单位像素
  const W = Math.round(BOARD_W * PX), H = Math.round(BOARD_H * PX);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const M = MARGIN * PX, S = CELL * PX;

  // 风化夯土 / 青石混合底色
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#765536');
  grad.addColorStop(0.48, '#5e4027');
  grad.addColorStop(1, '#412a1c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 180; i++) {
    ctx.strokeStyle = i % 2 ? '#21150d' : '#c09a64';
    ctx.lineWidth = 0.8 + Math.random() * 2.4;
    ctx.beginPath();
    const y = Math.random() * H;
    const x = Math.random() * W;
    ctx.moveTo(x - 50, y);
    ctx.bezierCurveTo(x - 10, y + (Math.random() - 0.5) * 30, x + 30, y + (Math.random() - 0.5) * 30, x + 80, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const gold = '#d7b36b';
  const gx = col => M + col * S;
  const gy = row => M + row * S;

  // 楚河：下凹干涸河谷，以暗青泥水和裸露河床表现战场分界
  const riverTop = gy(4) + S * 0.08;
  const riverH = S * 0.84;
  const river = ctx.createLinearGradient(0, riverTop, 0, riverTop + riverH);
  river.addColorStop(0, 'rgba(27,28,24,0.55)');
  river.addColorStop(0.5, 'rgba(42,56,52,0.76)');
  river.addColorStop(1, 'rgba(31,24,17,0.62)');
  ctx.fillStyle = river;
  ctx.fillRect(gx(0), riverTop, gx(8) - gx(0), riverH);
  ctx.strokeStyle = 'rgba(225,188,112,0.32)';
  ctx.lineWidth = 3;
  for (const y of [riverTop + 4, riverTop + riverH - 4]) {
    ctx.beginPath();
    for (let x = gx(0); x <= gx(8); x += 22) {
      const yy = y + Math.sin(x * 0.035) * 5 + Math.sin(x * 0.11) * 2;
      if (x === gx(0)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = gold;
  ctx.shadowColor = 'rgba(220,170,80,0.55)';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  // 横线（贯通）
  for (let r = 0; r < 10; r++) {
    ctx.beginPath(); ctx.moveTo(gx(0), gy(r)); ctx.lineTo(gx(8), gy(r)); ctx.stroke();
  }
  // 竖线（河界断开）
  for (let col = 0; col < 9; col++) {
    if (col === 0 || col === 8) {
      ctx.beginPath(); ctx.moveTo(gx(col), gy(0)); ctx.lineTo(gx(col), gy(9)); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(gx(col), gy(0)); ctx.lineTo(gx(col), gy(4)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx(col), gy(5)); ctx.lineTo(gx(col), gy(9)); ctx.stroke();
    }
  }
  // 外框加粗
  ctx.lineWidth = 7;
  ctx.strokeRect(gx(0) - 10, gy(0) - 10, 8 * S + 20, 9 * S + 20);
  // 九宫斜线
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(gx(3), gy(0)); ctx.lineTo(gx(5), gy(2)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gx(5), gy(0)); ctx.lineTo(gx(3), gy(2)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gx(3), gy(7)); ctx.lineTo(gx(5), gy(9)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gx(5), gy(7)); ctx.lineTo(gx(3), gy(9)); ctx.stroke();

  // 炮位 / 兵位 角标
  const mark = (row, col) => {
    const x = gx(col), y = gy(row), L = S * 0.16, o = S * 0.07;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 4;
    const corner = (dx, dy) => {
      if (col + dx < 0 || col + dx > 8) return;
      ctx.beginPath();
      ctx.moveTo(x + dx * o, y + dy * (o + L));
      ctx.lineTo(x + dx * o, y + dy * o);
      ctx.lineTo(x + dx * (o + L), y + dy * o);
      ctx.stroke();
    };
    corner(-1, -1); corner(1, -1); corner(-1, 1); corner(1, 1);
  };
  [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]]
    .forEach(([r, c2]) => mark(r, c2));

  // 楚河漢界
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#d8b878';
  ctx.font = `900 ${Math.round(S * 0.62)}px "Ma Shan Zheng", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ry = (gy(4) + gy(5)) / 2;
  ctx.fillText('楚 河', gx(2), ry);
  ctx.fillText('漢 界', gx(6), ry);
  ctx.shadowBlur = 0;

  // 战火磨损: 灼痕、马蹄印与刀划痕
  for (let i = 0; i < 10; i++) {
    const sx = M + Math.random() * 8 * S, sy = M + Math.random() * 9 * S, r = 30 + Math.random() * 90;
    const scorch = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    scorch.addColorStop(0, 'rgba(8,5,3,0.5)');
    scorch.addColorStop(1, 'rgba(8,5,3,0)');
    ctx.fillStyle = scorch;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(10,6,4,0.4)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const sx = M + Math.random() * 8 * S, sy = M + Math.random() * 9 * S;
    const a = Math.random() * Math.PI, l = 20 + Math.random() * 60;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBoard() {
  const group = new THREE.Group();

  // 盘体
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x4f3320, roughness: 0.92, metalness: 0.04 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, TOP_Y, BOARD_H), lacquer);
  body.position.y = TOP_Y / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // 顶面棋路
  const topMaterial = new THREE.MeshStandardMaterial({
    map: boardTexture(),
    roughness: 0.88,
    metalness: 0.04,
    // 顶面与盘体几乎共面；向镜头侧偏移深度，防止缩放/旋转时 z-fighting。
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), topMaterial);
  top.rotation.x = -Math.PI / 2;
  top.position.y = TOP_Y + 0.006;
  top.receiveShadow = true;
  group.add(top);

  // 描金口沿
  const rimMt = new THREE.MeshStandardMaterial({ color: 0xa9854c, roughness: 0.48, metalness: 0.72 });
  const rw = BOARD_W + 0.5, rh = BOARD_H + 0.5;
  group.add(box(rw, 0.1, 0.16, rimMt, 0, TOP_Y - 0.02, -rh / 2 + 0.08));
  group.add(box(rw, 0.1, 0.16, rimMt, 0, TOP_Y - 0.02, rh / 2 - 0.08));
  group.add(box(0.16, 0.1, rh, rimMt, -rw / 2 + 0.08, TOP_Y - 0.02, 0));
  group.add(box(0.16, 0.1, rh, rimMt, rw / 2 - 0.08, TOP_Y - 0.02, 0));

  // 底座托 + 四足
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 1.6, 0.34, BOARD_H + 1.6),
    new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.9, metalness: 0.08 }));
  slab.position.y = -0.17;
  slab.castShadow = slab.receiveShadow = true;
  group.add(slab);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.66, 0.8, 10), lacquer);
    foot.position.set(sx * (BOARD_W / 2 - 1), -0.72, sz * (BOARD_H / 2 - 1));
    foot.castShadow = true;
    group.add(foot);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), rimMt);
    bolt.position.set(sx * (BOARD_W / 2 - 0.45), TOP_Y + 0.035, sz * (BOARD_H / 2 - 0.45));
    bolt.castShadow = true;
    group.add(bolt);
  }
  return group;

  function box(w, h, d, mt, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

// ---- 走法标记 ----
export function createMarkers() {
  const group = new THREE.Group();
  const moveMt = new THREE.MeshBasicMaterial({ color: 0x7fd4a8, transparent: true, opacity: 0.85, depthWrite: false });
  const capMt = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const selMt = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const responseMt = new THREE.MeshBasicMaterial({ color: 0x79e6bd, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
  const lastMt = new THREE.MeshBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const moveGeo = new THREE.CircleGeometry(0.3, 24);
  const capGeo = new THREE.RingGeometry(1.2, 1.38, 36);
  const selectGeo = new THREE.RingGeometry(1.24, 1.38, 36);
  const responseGeo = new THREE.RingGeometry(1.42, 1.57, 36);
  const lastGeo = new THREE.RingGeometry(1.18, 1.3, 36);
  return {
    group,
    clear() { while (group.children.length) group.remove(group.children[0]); },
    showMoves(moves, pieces, pieceAtFn) {
      for (const m of moves) {
        const { x, z } = squareToWorld(m.row, m.col);
        const isCap = !!pieceAtFn(pieces, m.row, m.col);
        let mesh;
        if (isCap) {
          mesh = new THREE.Mesh(capGeo, capMt);
        } else {
          mesh = new THREE.Mesh(moveGeo, moveMt);
        }
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, TOP_Y + 0.02, z);
        mesh.userData.moveTo = m;
        group.add(mesh);
      }
    },
    selectRing(row, col) {
      const { x, z } = squareToWorld(row, col);
      const ring = new THREE.Mesh(selectGeo, selMt);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, TOP_Y + 0.02, z);
      ring.userData.isSelectRing = true;
      group.add(ring);
    },
    responsePieces(pieces) {
      for (const piece of pieces) {
        const { x, z } = squareToWorld(piece.row, piece.col);
        const ring = new THREE.Mesh(responseGeo, responseMt);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, TOP_Y + 0.025, z);
        ring.userData.isResponseHint = true;
        group.add(ring);
      }
    },
    lastMoveMarks(from, to) {
      for (const sq of [from, to]) {
        const { x, z } = squareToWorld(sq.row, sq.col);
        const ring = new THREE.Mesh(lastGeo, lastMt);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, TOP_Y + 0.015, z);
        ring.userData.isLastMark = true;
        group.add(ring);
      }
    },
  };
}

// ---- 古战场环境 ----
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b1d12';
  ctx.fillRect(0, 0, 1024, 1024);
  // 泥土斑块
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 8 + Math.random() * 46;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(105,73,39,0.2)' : 'rgba(12,8,5,0.28)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 焦土
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(5,3,2,0.7)');
    g.addColorStop(1, 'rgba(5,3,2,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 暗红血渍
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 10 + Math.random() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(60,12,8,0.5)');
    g.addColorStop(1, 'rgba(60,12,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 龟裂
  ctx.strokeStyle = 'rgba(6,4,2,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    let x = Math.random() * 1024, y = Math.random() * 1024;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bannerTexture(char, field, ink) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 168;
  const ctx = c.getContext('2d');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, 256, 168);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 152);
  // 锯齿旗尾
  ctx.fillStyle = field;
  ctx.fillRect(240, 8, 16, 152);
  ctx.fillStyle = ink;
  ctx.font = '900 104px "Ma Shan Zheng", "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 128, 92);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBanner(char, field, ink, x, z, faceAngle) {
  const g = new THREE.Group();
  const poleMt = new THREE.MeshStandardMaterial({ color: 0x2e2014, roughness: 0.7 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 8.4, 8), poleMt);
  pole.position.y = 4.2;
  pole.castShadow = true;
  g.add(pole);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.3, metalness: 0.8 })));
  g.children[1].position.y = 8.5;
  const W = 3.0, H = 1.9;
  const geo = new THREE.PlaneGeometry(W, H, 14, 6);
  geo.translate(W / 2 + 0.1, 0, 0); // 左缘固定在旗杆
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: bannerTexture(char, field, ink), side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
  }));
  cloth.position.y = 7.2;
  cloth.castShadow = true;
  g.add(cloth);
  g.position.set(x, -1.14, z);
  g.rotation.y = faceAngle;
  return { group: g, cloth, width: W, phase: Math.random() * Math.PI * 2, base: geo.attributes.position.array.slice() };
}

export function createEnvironment() {
  const g = new THREE.Group();

  // 龟裂焦土
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(85, 48),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.14;
  ground.receiveShadow = true;
  g.add(ground);

  const rand = (a, b) => a + Math.random() * (b - a);
  // 四周散布: 岩石
  const rockMt = new THREE.MeshStandardMaterial({ color: 0x3a352c, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(19, 46);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.4, 1.5), 0), rockMt);
    rock.position.set(Math.cos(a) * r, -1.14 + rand(0, 0.25), Math.sin(a) * r);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }
  // 断矛插地
  const shaftMt = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.75 });
  const tipMt = new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.35, metalness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(17, 42);
    const sp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, rand(1.4, 2.6), 6), shaftMt);
    shaft.position.y = 0.8;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), tipMt);
    tip.position.y = shaft.geometry.parameters.height + 0.1;
    sp.add(shaft, tip);
    sp.position.set(Math.cos(a) * r, -1.14, Math.sin(a) * r);
    sp.rotation.set(rand(-0.45, 0.45), 0, rand(-0.45, 0.45));
    sp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(sp);
  }
  // 破损盾牌半埋
  const shieldMts = [
    new THREE.MeshStandardMaterial({ color: 0x5c2018, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x27374c, roughness: 0.7 }),
  ];
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(18, 40);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(rand(0.4, 0.62), rand(0.4, 0.62), 0.09, 14),
      shieldMts[i % 2]);
    sh.position.set(Math.cos(a) * r, -1.1, Math.sin(a) * r);
    sh.rotation.set(rand(-0.7, 0.7), Math.random() * 3, rand(-0.7, 0.7));
    sh.castShadow = sh.receiveShadow = true;
    g.add(sh);
  }

  // 营前战鼓：红黑两军各一面，强化古代军阵轮廓
  for (const [dx, dz, color, face] of [[-14.5, 12.5, 0x7d2119, 0.18], [14.5, -12.5, 0x243b55, Math.PI + 0.18]]) {
    const drum = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd1aa70, roughness: 0.86 });
    const bodyMt = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0xb38b4e, roughness: 0.42, metalness: 0.75 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.2, 18), [skin, bodyMt, skin]);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.05;
    body.castShadow = true;
    drum.add(body);
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.045, 8, 24), bronze);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(side * 0.61, 1.05, 0);
      ring.castShadow = true;
      drum.add(ring);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 8), shaftMt);
      leg.position.set(side * 0.72, 0.45, 0);
      leg.rotation.z = side * 0.25;
      leg.castShadow = true;
      drum.add(leg);
    }
    drum.position.set(dx, -1.14, dz);
    drum.rotation.y = face;
    g.add(drum);
  }

  // 战旗: 红方楚旗 x2(近侧) / 黑方汉旗 x2(远侧)
  const banners = [
    makeBanner('楚', '#7a1a16', '#e8c070', -17, 16, Math.PI * 0.15),
    makeBanner('楚', '#7a1a16', '#e8c070', 17, 16, -Math.PI * 0.15),
    makeBanner('漢', '#1c2736', '#9fb2c8', -17, -16, Math.PI - Math.PI * 0.15),
    makeBanner('漢', '#1c2736', '#9fb2c8', 17, -16, Math.PI + Math.PI * 0.15),
  ];
  for (const b of banners) g.add(b.group);

  // 火盆(对角两座)
  const fires = [];
  for (const [fx, fz] of [[15, 9], [-15, -9]]) {
    const brazier = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 0.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5, metalness: 0.6 }));
    bowl.position.y = 0.55;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e1710, roughness: 0.6, metalness: 0.5 }));
    legs.position.y = 0.1;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 8),
      new THREE.MeshBasicMaterial({ color: 0xff9540, transparent: true, opacity: 0.9 }));
    flame.position.y = 1.35;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0 }));
    core.position.y = 1.2;
    const light = new THREE.PointLight(0xff7a30, 10, 20, 2);
    light.position.y = 1.8;
    brazier.add(bowl, legs, flame, core, light);
    brazier.position.set(fx, -1.14, fz);
    brazier.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(brazier);
    fires.push({ light, flame, phase: Math.random() * Math.PI * 2 });
  }

  // 余烬漂浮
  const N = 320;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 16 - 1;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xff8a3c, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  g.add(embers);

  return { group: g, embers, banners, fires };
}
