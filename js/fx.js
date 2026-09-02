// 战斗特效: 炮弹、爆炸、刀光、尘土、火花。每个特效是带 update 回调的临时对象。
import * as THREE from 'three';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  warmup(renderer, camera, pieces) {
    const group = new THREE.Group();
    const meshes = [
      new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.05, 10), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
      new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
      new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 0.9, 8), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
      new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 32), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })),
      new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ transparent: true, roughness: 1 })),
    ];
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    meshes.push(new THREE.Points(pointsGeometry, new THREE.PointsMaterial({ transparent: true, depthWrite: false })));
    const captureMaterials = new Set();
    pieces?.traverse(child => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || material.colorWrite === false || captureMaterials.has(material)) continue;
        captureMaterials.add(material);
        const transparentMaterial = material.clone();
        transparentMaterial.transparent = true;
        meshes.push(new THREE.Mesh(child.geometry, transparentMaterial));
      }
    });
    for (const mesh of meshes) {
      mesh.scale.setScalar(0.001);
      group.add(mesh);
    }
    const lights = [new THREE.PointLight(0xff8a3c, 0), new THREE.PointLight(0xff7a30, 0)];
    group.add(...lights);
    group.position.y = 1;
    this.scene.add(group);
    renderer.compile(this.scene, camera);
    group.remove(lights[1]);
    renderer.compile(this.scene, camera);
    group.remove(lights[0]);
    renderer.compile(this.scene, camera);
    this.scene.remove(group);
    this.warmupGroup = group;
  }

  add(obj, update, onDone) {
    this.items.push({ obj, update, onDone });
    this.scene.add(obj);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      let alive = true;
      try { alive = it.update(dt); } catch (error) {
        console.error('FX update failed', error);
        alive = false;
      }
      if (!alive) {
        this.items.splice(i, 1);
        this.scene.remove(it.obj);
        this.dispose(it.obj);
        try { it.onDone && it.onDone(); } catch (error) { console.error('FX completion failed', error); }
      }
    }
  }

  get busy() { return this.items.length > 0; }

  clear() {
    for (const item of this.items) {
      this.scene.remove(item.obj);
      this.dispose(item.obj);
    }
    this.items.length = 0;
  }

  dispose(obj) {
    const geometries = new Set();
    const materials = new Set();
    obj.traverse?.(child => {
      if (child.geometry) geometries.add(child.geometry);
      const childMaterials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of childMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose?.();
    for (const material of materials) material.dispose?.();
  }

  groundRing(pos, color, endScale = 3.2, dur = 0.46, opacity = 0.82, segments = 36) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.63, segments),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.035, pos.z);
    let t = 0;
    this.add(ring, dt => {
      t += dt;
      const p = Math.min(t / dur, 1);
      ring.scale.setScalar(0.55 + p * endScale);
      ring.material.opacity = opacity * Math.pow(1 - p, 1.35);
      return p < 1;
    });
  }

  directedArc(pos, direction, color, { radius = 1, tube = 0.09, dur = 0.34, roll = 0, scale = 1.5 } = {}) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 8, 30, Math.PI * 0.92),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    arc.position.set(pos.x, pos.y + 1.15, pos.z);
    const dir = direction.clone().setY(0).normalize();
    const normal = new THREE.Vector3(-dir.z, 0, dir.x);
    arc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    arc.rotateZ(roll);
    let t = 0;
    this.add(arc, dt => {
      t += dt;
      const p = Math.min(t / dur, 1);
      arc.scale.setScalar(0.45 + p * scale);
      arc.material.opacity = 0.98 * Math.pow(1 - p, 1.6);
      return p < 1;
    });
  }

  // ---- 帅/将：金色重剑纵斩 + 将令震环 ----
  generalCleave(pos, direction, color) {
    this.directedArc(pos, direction, color, { radius: 1.18, tube: 0.14, dur: 0.42, scale: 1.75 });
    this.groundRing(pos, color, 3.4, 0.5, 0.86, 12);
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 3.1, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffffdc, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    blade.position.set(pos.x, pos.y + 1.5, pos.z);
    blade.rotation.z = -0.18;
    let t = 0;
    this.add(blade, dt => {
      t += dt;
      const p = Math.min(t / 0.3, 1);
      blade.scale.set(1 + p * 1.4, 0.7 + p * 0.5, 1);
      blade.material.opacity = 0.9 * (1 - p);
      return p < 1;
    });
    this.sparks(new THREE.Vector3(pos.x, pos.y + 1.0, pos.z), color, 8, 3.8);
  }

  // ---- 仕/士：八角护印 + 交叉双燕斩 ----
  advisorCrossCut(pos, direction, color) {
    this.directedArc(pos, direction, color, { radius: 0.82, tube: 0.055, dur: 0.32, roll: -0.66, scale: 1.35 });
    this.directedArc(pos, direction, 0xf4fbff, { radius: 0.82, tube: 0.05, dur: 0.36, roll: 0.66, scale: 1.35 });
    const seal = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.64, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(pos.x, pos.y + 0.045, pos.z);
    let t = 0;
    this.add(seal, dt => {
      t += dt;
      const p = Math.min(t / 0.58, 1);
      seal.rotation.z += dt * 4.2;
      seal.scale.setScalar(0.65 + p * 2.35);
      seal.material.opacity = 0.78 * (1 - p);
      return p < 1;
    });
    const cross = new THREE.Group();
    cross.position.set(pos.x, pos.y + 2.05, pos.z);
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
      const cut = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.075, 0.11),
        new THREE.MeshBasicMaterial({ color: angle < 0 ? color : 0xf4fbff, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
      );
      cut.rotation.y = angle;
      cross.add(cut);
    }
    let xt = 0;
    this.add(cross, dt => {
      xt += dt;
      const p = Math.min(xt / 0.36, 1);
      cross.scale.setScalar(0.55 + p * 1.25);
      for (const cut of cross.children) cut.material.opacity = 0.9 * (1 - p);
      return p < 1;
    });
    this.sparks(new THREE.Vector3(pos.x, pos.y + 1.0, pos.z), color, 5, 2.8);
  }

  // ---- 相/象：杖击地裂 + 土石震波 ----
  elephantQuake(pos, color) {
    this.groundRing(pos, color, 4.4, 0.58, 0.96, 28);
    this.groundRing(pos, 0xd2a262, 5.6, 0.72, 0.78, 20);
    const points = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.12;
      const inner = 0.28 + (i % 3) * 0.06;
      const outer = 1.2 + (i % 4) * 0.18;
      points.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a + 0.08) * outer, 0, Math.sin(a + 0.08) * outer);
    }
    const cracksGeo = new THREE.BufferGeometry();
    cracksGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const cracks = new THREE.LineSegments(cracksGeo, new THREE.LineBasicMaterial({ color: 0xe0b16e, transparent: true, opacity: 0.9, depthTest: false, blending: THREE.AdditiveBlending }));
    cracks.position.set(pos.x, pos.y + 0.05, pos.z);
    let ct = 0;
    this.add(cracks, dt => {
      ct += dt;
      const p = Math.min(ct / 0.7, 1);
      cracks.scale.setScalar(0.7 + p * 1.2);
      cracks.material.opacity = 0.9 * (1 - p);
      return p < 1;
    });
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    pulse.position.set(pos.x, pos.y + 0.48, pos.z);
    pulse.scale.set(1, 0.35, 1);
    let pt = 0;
    this.add(pulse, dt => {
      pt += dt;
      const p = Math.min(pt / 0.42, 1);
      pulse.scale.set(0.7 + p * 4.2, 0.35 + p * 0.5, 0.7 + p * 4.2);
      pulse.material.opacity = 0.68 * (1 - p);
      return p < 1;
    });

    const debris = new THREE.Group();
    debris.position.copy(pos);
    const velocities = [];
    for (let i = 0; i < 7; i++) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.1 + (i % 3) * 0.035, 0),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8c6a44 : 0x5f422a })
      );
      const a = (i / 7) * Math.PI * 2;
      rock.position.set(Math.cos(a) * 0.32, 0.08, Math.sin(a) * 0.32);
      velocities.push(new THREE.Vector3(Math.cos(a) * (1.4 + i * 0.08), 2.2 + (i % 2) * 0.5, Math.sin(a) * (1.4 + i * 0.08)));
      debris.add(rock);
    }
    let dtTotal = 0;
    this.add(debris, dt => {
      dtTotal += dt;
      for (let i = 0; i < debris.children.length; i++) {
        const rock = debris.children[i], velocity = velocities[i];
        velocity.y -= dt * 7.5;
        rock.position.addScaledVector(velocity, dt);
        rock.rotation.x += dt * 6;
        rock.rotation.z += dt * 4;
        rock.position.y = Math.max(0.04, rock.position.y);
        rock.material.opacity = Math.max(0, 1 - dtTotal / 0.75);
        rock.material.transparent = true;
      }
      return dtTotal < 0.75;
    });
  }

  // ---- 马：定向跃槊枪芒 + 双蹄尘 ----
  horseLance(pos, direction, color) {
    const dir = direction.clone().setY(0).normalize();
    const g = new THREE.Group();
    // 枪芒前移到目标之外，避免默认俯视镜头下被双方模型夹住。
    g.position.copy(pos).addScaledVector(dir, -0.75);
    g.position.y += 1.9;
    g.rotation.y = Math.atan2(dir.x, dir.z);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.16, 3.75),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    glow.position.z = 1.55;
    const streak = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.085, 3.65),
      new THREE.MeshBasicMaterial({ color: 0xffffe0, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    streak.position.z = 1.52;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.82, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 3.82;
    const sideGlowL = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.04, 2.75),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    sideGlowL.position.set(-0.29, -0.02, 1.15);
    const sideGlowR = sideGlowL.clone();
    sideGlowR.material = sideGlowL.material.clone();
    sideGlowR.position.x = 0.29;
    g.add(glow, streak, tip, sideGlowL, sideGlowR);
    let t = 0;
    this.add(g, dt => {
      t += dt;
      const p = Math.min(t / 0.42, 1);
      const fade = p < 0.52 ? 1 : 1 - (p - 0.52) / 0.48;
      g.scale.set(0.82 + p * 0.3, 0.82 + p * 0.3, 0.72 + p * 0.48);
      glow.material.opacity = 0.5 * fade;
      streak.material.opacity = fade;
      tip.material.opacity = fade;
      sideGlowL.material.opacity = 0.78 * fade;
      sideGlowR.material.opacity = 0.78 * fade;
      return p < 1;
    });
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    star.position.copy(pos).addScaledVector(dir, 0.95);
    star.position.y += 1.95;
    let starTime = 0;
    this.add(star, dt => {
      starTime += dt;
      const p = Math.min(starTime / 0.42, 1);
      const fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
      star.rotation.y += dt * 10;
      star.scale.set(0.55 + p * 2.5, 0.38 + p * 1.4, 0.55 + p * 2.5);
      star.material.opacity = fade;
      return p < 1;
    });
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.34);
    this.smokePuff(pos.clone().add(side), 0.42, 0.46);
    this.smokePuff(pos.clone().sub(side), 0.42, 0.46);
    this.sparks(new THREE.Vector3(pos.x, pos.y + 1.0, pos.z), color, 7, 4.4);
  }

  // ---- 车：随车轮辙与速度线 ----
  chariotTrail(mesh, direction, color, dur = 0.38) {
    const trails = new THREE.Group();
    const trackMat = new THREE.MeshBasicMaterial({ color: 0xc58b50, transparent: true, opacity: 0.62, depthWrite: false, depthTest: false });
    const speedMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    for (const x of [-0.43, 0.43]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 3.2), trackMat);
      track.position.set(x, 0.08, -1.7);
      trails.add(track);
    }
    for (const [x, y, len] of [[-0.76, 0.65, 2.3], [0.78, 0.95, 2.7], [0, 1.28, 1.8]]) {
      const speed = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, len), speedMat);
      speed.position.set(x, y, -len * 0.62);
      trails.add(speed);
    }
    trails.rotation.y = Math.atan2(direction.x, direction.z);
    let t = 0, dustAcc = 0;
    this.add(trails, dt => {
      t += dt;
      dustAcc += dt;
      trails.position.copy(mesh.position);
      trails.position.y += 0.05;
      const fade = Math.max(0, 1 - t / dur);
      trackMat.opacity = 0.62 * fade;
      speedMat.opacity = 0.82 * fade;
      if (dustAcc > 0.11) {
        dustAcc = 0;
        const back = mesh.position.clone().addScaledVector(direction, -0.75);
        this.smokePuff(back, 0.48, 0.5);
      }
      return t < dur;
    });
  }

  chariotRam(pos, direction, color) {
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.78, 30, 1, -Math.PI * 0.56, Math.PI * 1.12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    wave.position.copy(pos).addScaledVector(direction, 0.58);
    wave.position.y += 1.82;
    wave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
    let t = 0;
    this.add(wave, dt => {
      t += dt;
      const p = Math.min(t / 0.42, 1);
      wave.scale.setScalar(0.6 + p * 3.1);
      wave.material.opacity = 0.92 * (1 - p);
      return p < 1;
    });
    this.groundRing(pos, 0xb88652, 3.8, 0.5, 0.7, 24);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    pulse.position.set(pos.x, pos.y + 0.9, pos.z);
    let pt = 0;
    this.add(pulse, dt => {
      pt += dt;
      const p = Math.min(pt / 0.36, 1);
      pulse.scale.set(0.8 + p * 3.4, 0.7 + p * 1.2, 0.8 + p * 3.4);
      pulse.material.opacity = 0.62 * (1 - p);
      return p < 1;
    });
    this.sparks(new THREE.Vector3(pos.x, pos.y + 0.9, pos.z), color, 12, 5.8);
  }

  // ---- 兵/卒：盾进后的短促直刺 ----
  soldierThrust(from, to, direction, color) {
    const dir = direction.clone().setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const g = new THREE.Group();
    g.position.copy(from).addScaledVector(dir, 0.18);
    g.position.addScaledVector(side, 1.25);
    g.position.y += 1.55;
    g.rotation.y = Math.atan2(dir.x, dir.z);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 2.85),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    glow.position.z = 1.18;
    const ray = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.065, 2.65),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    ray.position.z = 1.1;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.23, 0.62, 7),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 2.82;
    const flankL = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.05, 1.8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    flankL.position.set(-0.3, -0.04, 0.75);
    flankL.rotation.y = -0.14;
    const flankR = flankL.clone();
    flankR.material = flankL.material.clone();
    flankR.position.x = 0.3;
    flankR.rotation.y = 0.14;
    g.add(glow, ray, tip, flankL, flankR);
    let t = 0;
    this.add(g, dt => {
      t += dt;
      const p = Math.min(t / 0.32, 1);
      const fade = p < 0.48 ? 1 : 1 - (p - 0.48) / 0.52;
      g.scale.set(0.82 + p * 0.24, 0.82 + p * 0.24, 0.62 + p * 0.52);
      glow.material.opacity = 0.68 * fade;
      ray.material.opacity = 0.82 * fade;
      tip.material.opacity = 0.9 * fade;
      flankL.material.opacity = 0.86 * fade;
      flankR.material.opacity = 0.86 * fade;
      return p < 1;
    });

    const shield = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    shield.position.copy(from).addScaledVector(dir, 0.48);
    shield.position.y += 0.95;
    shield.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    let st = 0;
    this.add(shield, dt => {
      st += dt;
      const p = Math.min(st / 0.3, 1);
      shield.scale.setScalar(0.7 + p * 1.8);
      shield.material.opacity = 0.72 * (1 - p);
      return p < 1;
    });
    const shieldWave = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.6, 24, 1, -Math.PI / 2, Math.PI),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    shieldWave.rotation.x = -Math.PI / 2;
    shieldWave.rotation.z = -Math.atan2(dir.x, dir.z);
    shieldWave.position.copy(from).addScaledVector(dir, 0.46);
    shieldWave.position.y += 0.07;
    let waveTime = 0;
    this.add(shieldWave, dt => {
      waveTime += dt;
      const p = Math.min(waveTime / 0.36, 1);
      shieldWave.scale.setScalar(0.8 + p * 2.4);
      shieldWave.material.opacity = 0.86 * (1 - p);
      return p < 1;
    });
    const impact = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.46, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    );
    impact.position.set(to.x, to.y + 1.45, to.z);
    let it = 0;
    this.add(impact, dt => {
      it += dt;
      const p = Math.min(it / 0.34, 1);
      impact.rotation.y += dt * 8;
      impact.scale.setScalar(0.6 + p * 2.6);
      impact.material.opacity = 0.92 * (1 - p);
      return p < 1;
    });
    this.sparks(new THREE.Vector3(to.x, to.y + 0.9, to.z), color, 4, 2.5);
  }

  // ---- 炮口焰: 瞬时暖光 + 火舌 + 火星 ----
  muzzleFlash(pos, direction) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 1.05, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc267, transparent: true, opacity: 0.95, depthWrite: false })
    );
    flame.position.y = 0.45;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 1, depthWrite: false })
    );
    const light = new THREE.PointLight(0xff8a3c, 52, 16, 2);
    g.add(flame, core, light);
    const dir = direction.clone().normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    let t = 0;
    this.add(g, dt => {
      t += dt;
      const p = Math.min(t / 0.18, 1);
      g.scale.setScalar(0.75 + p * 1.2);
      flame.material.opacity = 0.95 * (1 - p);
      core.material.opacity = 1 - p;
      light.intensity = 52 * (1 - p);
      return p < 1;
    });
    this.sparks(pos, 0xffc060, 12, 4.8);
    this.smokePuff(pos, 0.48, 0.65);
  }

  // ---- 炮击: 火球划抛物线，沿途吐烟，命中后爆炸 ----
  cannonShot(from, to, onHit) {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc060 })
    );
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8 })
    );
    const glow = new THREE.PointLight(0xff7a30, 24, 14, 2);
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.15, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.72, depthWrite: false })
    );
    trail.position.y = -0.48;
    g.add(ball, core, glow, trail);
    g.position.copy(from);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    const dist = from.distanceTo(to);
    const dur = THREE.MathUtils.clamp(dist * 0.045, 0.34, 0.82);
    let t = 0, smokeAcc = 0, completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      try { this.explode(to); } finally { onHit?.(); }
    };
    this.add(g, dt => {
      t += dt;
      const p = Math.min(t / dur, 1);
      const previous = g.position.clone();
      g.position.lerpVectors(from, to, p);
      g.position.y += Math.sin(Math.PI * p) * (1 + dist * 0.06);
      const tangent = g.position.clone().sub(previous);
      if (tangent.lengthSq() > 0.000001) {
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
      }
      smokeAcc += dt;
      if (smokeAcc > 0.05) { smokeAcc = 0; this.smokePuff(g.position, 0.28, 0.5); }
      trail.material.opacity = 0.72 * (0.65 + Math.sin(t * 34) * 0.2);
      if (p >= 1) return false;
      return true;
    }, complete);
  }

  // ---- 爆炸: 闪光球 + 冲击环 + 火花 + 光源 ----
  explode(pos) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95 })
    );
    flash.position.copy(pos);
    const light = new THREE.PointLight(0xff8040, 60, 22, 2);
    flash.add(light);
    let t = 0;
    this.add(flash, dt => {
      t += dt;
      const p = Math.min(t / 0.45, 1);
      flash.scale.setScalar(0.4 + p * 3.2);
      flash.material.opacity = 0.95 * (1 - p);
      light.intensity = 60 * (1 - p);
      return p < 1;
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 32),
      new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.68, pos.z);
    let rt = 0;
    this.add(ring, dt => {
      rt += dt;
      const p = Math.min(rt / 0.5, 1);
      ring.scale.setScalar(1 + p * 5);
      ring.material.opacity = 0.9 * (1 - p);
      return p < 1;
    });
    this.sparks(pos, 0xffa040, 16, 5.5);
    this.smokePuff(pos, 1.4, 1.4);
  }

  // ---- 刀光 / 枪芒: 月牙弧光闪现 ----
  slash(pos, color = 0xfff0c0) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.09, 8, 24, Math.PI * 0.85),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })
    );
    arc.position.set(pos.x, pos.y + 1.1, pos.z);
    arc.rotation.set(Math.random() * 0.8 - 0.4, Math.random() * Math.PI, Math.random() * 1.2 - 0.6);
    let t = 0;
    this.add(arc, dt => {
      t += dt;
      const p = Math.min(t / 0.28, 1);
      arc.scale.setScalar(0.6 + p * 1.1);
      arc.material.opacity = 0.95 * (1 - p);
      return p < 1;
    });
    this.sparks(new THREE.Vector3(pos.x, pos.y + 1.0, pos.z), color, 8, 3);
  }

  // ---- 撞击尘环（战车冲锋/战马践踏）----
  impactDust(pos) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.9, 28),
      new THREE.MeshBasicMaterial({ color: 0xb09a70, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.68, pos.z);
    let t = 0;
    this.add(ring, dt => {
      t += dt;
      const p = Math.min(t / 0.45, 1);
      ring.scale.setScalar(1 + p * 3.5);
      ring.material.opacity = 0.7 * (1 - p);
      return p < 1;
    });
    this.smokePuff(pos, 1.0, 0.9);
  }

  // ---- 火花迸溅 ----
  sparks(pos, color, n = 12, speed = 4) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, up = Math.random() * 0.9 + 0.2;
      vel.push(new THREE.Vector3(Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up)).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 0.16, transparent: true, opacity: 1, depthWrite: false,
    }));
    let t = 0;
    this.add(pts, dt => {
      t += dt;
      const p = Math.min(t / 0.6, 1);
      const attr = pts.geometry.attributes.position;
      for (let i = 0; i < n; i++) {
        vel[i].y -= dt * 9;
        attr.setXYZ(i, attr.getX(i) + vel[i].x * dt, Math.max(0.66, attr.getY(i) + vel[i].y * dt), attr.getZ(i) + vel[i].z * dt);
      }
      attr.needsUpdate = true;
      pts.material.opacity = 1 - p;
      return p < 1;
    });
  }

  // ---- 烟团 ----
  smokePuff(pos, scale = 0.5, dur = 0.8) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x555049, transparent: true, opacity: 0.45, roughness: 1, metalness: 0 })
    );
    m.position.copy(pos);
    let t = 0;
    this.add(m, dt => {
      t += dt;
      const p = Math.min(t / dur, 1);
      m.scale.setScalar(scale * (0.5 + p * 1.6));
      m.position.y += dt * 0.8;
      m.material.opacity = 0.45 * (1 - p);
      return p < 1;
    });
  }
}
