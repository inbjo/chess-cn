// 战斗特效: 炮弹、爆炸、刀光、尘土、火花。每个特效是带 update 回调的临时对象。
import * as THREE from 'three';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  add(obj, update, onDone) {
    this.items.push({ obj, update, onDone });
    this.scene.add(obj);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.update(dt)) {
        this.scene.remove(it.obj);
        it.onDone && it.onDone();
        this.dispose(it.obj);
        this.items.splice(i, 1);
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
    obj.traverse?.(child => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) material.dispose?.();
    });
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
    const dur = Math.max(0.3, dist * 0.05);
    let t = 0, smokeAcc = 0;
    this.add(g, dt => {
      t += dt;
      const p = Math.min(t / dur, 1);
      g.position.lerpVectors(from, to, p);
      g.position.y += Math.sin(Math.PI * p) * (1 + dist * 0.06);
      smokeAcc += dt;
      if (smokeAcc > 0.03) { smokeAcc = 0; this.smokePuff(g.position, 0.28, 0.5); }
      trail.material.opacity = 0.72 * (0.65 + Math.sin(t * 34) * 0.2);
      if (p >= 1) { this.explode(to); onHit && onHit(); return false; }
      return true;
    });
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
