"use client";

/**
 * Hero 3D scene — port of the design bundle's Three.js hero into a React client
 * component. The original uses an importmap CDN; here we use the npm "three"
 * package and a dynamic import (next/dynamic) so the bundle stays out of SSR.
 *
 * Scene can be switched via URL query (?scene=race) or hash (#scene=race).
 * Default: "sync".
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";

type SceneKey = "sync" | "race" | "calendar" | "floorplan" | "merge" | "hourglass";

interface ActiveScene {
  root: THREE.Group;
  anchors: { google: boolean; time: boolean; skedda: boolean };
  tick: (s: { t: number; dt: number; sp: number; scrollVel: number; mouse: { x: number; y: number } }) => void;
}

// Joyful brand colors
const COLOR_BRAND = 0x2b5f3e;
const COLOR_BRAND2 = 0xf4c95d;
const COLOR_GOOGLE = 0x4285f4;
const COLOR_INK = 0x1b1a17;
const COLOR_PAPER = 0xffffff;
const COLOR_DANGER = 0xc44949;

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function makeRoundedBox(w: number, h: number, r: number, depth = 0.16): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 4,
    curveSegments: 12,
  });
  geo.center();
  return geo;
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((o) => {
    const obj = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}

// ===== SCENE 1: sync =====
function buildSync(): ActiveScene {
  const root = new THREE.Group();
  function makeCard(headerColor: number, accentColor: number) {
    const mat = new THREE.MeshStandardMaterial({ color: COLOR_PAPER, roughness: 0.5, metalness: 0.05 });
    const mesh = new THREE.Mesh(makeRoundedBox(2.6, 3.4, 0.18), mat);
    const header = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.34),
      new THREE.MeshStandardMaterial({
        color: headerColor,
        emissive: headerColor,
        emissiveIntensity: 0.3,
        roughness: 0.4,
      }),
    );
    header.position.set(0, 1.18, 0.085);
    mesh.add(header);
    for (let i = 0; i < 3; i++) {
      const row = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.7 }),
      );
      row.position.set(0, 0.55 - i * 0.55, 0.085);
      mesh.add(row);
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.07, 16),
        new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.6 }),
      );
      dot.position.set(-0.85, 0.55 - i * 0.55, 0.087);
      mesh.add(dot);
    }
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.65, 3.45),
      new THREE.MeshBasicMaterial({ color: COLOR_BRAND2, transparent: true, opacity: 0.65 }),
    );
    shadow.position.set(0.12, -0.12, -0.1);
    mesh.add(shadow);
    return mesh;
  }
  const cardL = makeCard(COLOR_GOOGLE, COLOR_GOOGLE);
  cardL.position.set(-2.2, 0.6, -0.4);
  cardL.rotation.set(-0.16, 0.42, 0.05);
  root.add(cardL);
  const cardR = makeCard(COLOR_BRAND, COLOR_BRAND);
  cardR.position.set(2.2, -0.6, -0.4);
  cardR.rotation.set(0.16, -0.42, -0.05);
  root.add(cardR);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.0, 0.6, -0.3),
    new THREE.Vector3(-0.8, 1.2, 0.6),
    new THREE.Vector3(0, 0, 1.1),
    new THREE.Vector3(0.8, -1.2, 0.6),
    new THREE.Vector3(2.0, -0.6, -0.3),
  ]);
  const tubeMat = new THREE.MeshBasicMaterial({ color: COLOR_BRAND, transparent: true, opacity: 0.18 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.014, 8, false), tubeMat);
  root.add(tube);
  const N = 28;
  const particles: THREE.Mesh[] = [];
  const cStart = new THREE.Color(COLOR_GOOGLE),
    cEnd = new THREE.Color(COLOR_BRAND),
    cMid = new THREE.Color(COLOR_BRAND2);
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: COLOR_BRAND, transparent: true }),
    );
    m.userData.t = i / N;
    root.add(m);
    particles.push(m);
  }
  let phase = 0;
  return {
    root,
    anchors: { google: true, time: true, skedda: true },
    tick(s) {
      const breathe = Math.sin(s.t * 0.7) * 0.04;
      const sep = 0.6 + s.sp * 1.6,
        lift = 0.2 + s.sp * 0.7;
      cardL.position.x = -sep;
      cardL.position.y = lift + Math.sin(s.t * 0.8) * 0.06;
      cardL.rotation.y = 0.42 - s.sp * 0.25;
      cardL.rotation.z = 0.05 + breathe + s.sp * 0.08;
      cardR.position.x = sep;
      cardR.position.y = -lift - Math.sin(s.t * 0.8) * 0.06;
      cardR.rotation.y = -0.42 + s.sp * 0.25;
      cardR.rotation.z = -0.05 - breathe - s.sp * 0.08;
      tubeMat.opacity = 0.1 + s.sp * 0.35;
      const speed = 0.05 + s.sp * 0.18 + s.scrollVel * 1.2;
      phase = (phase + speed * s.dt) % 1;
      for (const p of particles) {
        const u = (p.userData.t + phase) % 1;
        p.position.copy(curve.getPointAt(u));
        const fade = Math.min(u, 1 - u, 0.5) * 2;
        p.scale.setScalar(0.3 + s.sp * 0.6 + fade * 0.7);
        if (u < 0.5) tmp.copy(cStart).lerp(cMid, u * 2);
        else tmp.copy(cMid).lerp(cEnd, (u - 0.5) * 2);
        const mat = p.material as THREE.MeshBasicMaterial;
        mat.color.copy(tmp);
        mat.opacity = 0.25 + s.sp * 0.45 + fade * 0.4;
      }
    },
  };
}

// ===== SCENE 2: race =====
function buildRace(): ActiveScene {
  const root = new THREE.Group();
  const ROOMS = [
    { name: "Jupiter", color: 0xc97b5b },
    { name: "Venus", color: 0xe0a848 },
    { name: "Earth", color: 0x2b5f3e },
    { name: "Mars", color: 0xb85450 },
    { name: "Mercury", color: 0x6b7280 },
  ];
  const ROOM_W = 1.2,
    ROOM_H = 1.4,
    GAP = 0.18;
  const totalW = ROOMS.length * ROOM_W + (ROOMS.length - 1) * GAP;
  const x0 = -totalW / 2 + ROOM_W / 2;
  const rooms: THREE.Mesh[] = [];
  ROOMS.forEach((r, i) => {
    const m = new THREE.Mesh(
      makeRoundedBox(ROOM_W, ROOM_H, 0.12, 0.18),
      new THREE.MeshStandardMaterial({ color: COLOR_PAPER, roughness: 0.5, metalness: 0.05 }),
    );
    m.position.set(x0 + i * (ROOM_W + GAP), 0.3, 0);
    const tab = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_W * 0.85, 0.22),
      new THREE.MeshStandardMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.4 }),
    );
    tab.position.set(0, ROOM_H / 2 - 0.18, 0.09);
    m.add(tab);
    const status = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 16),
      new THREE.MeshBasicMaterial({ color: 0xccc8bd }),
    );
    status.position.set(0, -0.1, 0.092);
    m.add(status);
    m.userData = { status, baseY: m.position.y };
    root.add(m);
    rooms.push(m);
  });
  const racers: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const c = [0xe7e2d8, 0xb8b4ab, 0x8a867e, 0xd8d2c5][i];
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }),
    );
    m.userData = {
      startX: -4 + Math.random() * 1.5,
      startY: -2 - Math.random() * 0.3,
      target: i % ROOMS.length,
      t0: Math.random() * 0.3,
    };
    m.position.set(m.userData.startX, m.userData.startY, 0.5);
    (m.material as THREE.MeshStandardMaterial).transparent = true;
    root.add(m);
    racers.push(m);
  }
  const you = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 18, 18),
    new THREE.MeshStandardMaterial({
      color: COLOR_BRAND2,
      emissive: COLOR_BRAND2,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    }),
  );
  you.position.set(0, -2.8, 0.5);
  root.add(you);
  const trailGeo = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(60);
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: COLOR_BRAND2, transparent: true, opacity: 0.6 }),
  );
  root.add(trail);
  return {
    root,
    anchors: { google: false, time: false, skedda: false },
    tick(s) {
      rooms.forEach((m, i) => {
        m.position.y = m.userData.baseY + Math.sin(s.t * 0.7 + i * 0.5) * 0.04;
        const taken = s.sp > 0.1 + i * 0.06;
        const status = m.userData.status as THREE.Mesh;
        const statusMat = status.material as THREE.MeshBasicMaterial;
        if (i === 2 && s.sp > 0.65) {
          statusMat.color.setHex(COLOR_BRAND);
          const pulse = 1 + Math.sin(s.t * 4) * 0.04 * Math.min(1, (s.sp - 0.65) * 4);
          m.scale.setScalar(pulse);
        } else if (taken) {
          statusMat.color.setHex(COLOR_DANGER);
          m.scale.setScalar(1);
        } else {
          statusMat.color.setHex(0xccc8bd);
          m.scale.setScalar(1);
        }
      });
      racers.forEach((r, i) => {
        const target = rooms[r.userData.target];
        const ease = Math.max(0, Math.min(1, (s.sp - r.userData.t0) * 2.2));
        const tx = target.position.x + Math.sin(s.t + i) * 0.08;
        const ty = target.position.y - ROOM_H / 2 - 0.4;
        r.position.x = r.userData.startX + (tx - r.userData.startX) * ease;
        r.position.y = r.userData.startY + (ty - r.userData.startY) * ease;
        (r.material as THREE.MeshStandardMaterial).opacity = 1 - ease * 0.4;
      });
      if (s.sp < 0.55) {
        you.position.x = Math.sin(s.t * 1.2) * 0.05;
        you.position.y = -2.8 + Math.sin(s.t * 0.9) * 0.06;
        you.scale.setScalar(0.85 + Math.sin(s.t * 2) * 0.05);
      } else {
        const e = Math.min(1, (s.sp - 0.55) / 0.15);
        const ee = 1 - Math.pow(1 - e, 3);
        const earth = rooms[2];
        const ty = earth.position.y - ROOM_H / 2 - 0.4;
        you.position.x = earth.position.x * ee;
        you.position.y = -2.8 + (ty - -2.8) * ee;
        you.scale.setScalar(0.85 + ee * 0.3 + Math.sin(s.t * 6) * 0.04);
      }
      for (let i = 19; i > 0; i--) {
        trailPositions[i * 3] = trailPositions[(i - 1) * 3];
        trailPositions[i * 3 + 1] = trailPositions[(i - 1) * 3 + 1];
        trailPositions[i * 3 + 2] = trailPositions[(i - 1) * 3 + 2];
      }
      trailPositions[0] = you.position.x;
      trailPositions[1] = you.position.y;
      trailPositions[2] = you.position.z;
      trailGeo.attributes.position.needsUpdate = true;
      (trail.material as THREE.LineBasicMaterial).opacity = 0.1 + s.sp * 0.6;
    },
  };
}

// ===== SCENE 3: calendar =====
function buildCalendar(): ActiveScene {
  const root = new THREE.Group();
  type GridGroup = THREE.Group & { userData: { cells: THREE.Mesh[] } };
  function makeGrid(color: number): GridGroup {
    const g = new THREE.Group() as GridGroup;
    const bg = new THREE.Mesh(
      makeRoundedBox(2.6, 3.2, 0.16, 0.12),
      new THREE.MeshStandardMaterial({ color: COLOR_PAPER, roughness: 0.55 }),
    );
    g.add(bg);
    const head = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.32),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }),
    );
    head.position.set(0, 1.3, 0.08);
    g.add(head);
    const cells: THREE.Mesh[] = [];
    const cw = 0.42,
      ch = 0.42,
      gap = 0.06,
      cols = 4,
      rows = 5;
    const totalW = cols * cw + (cols - 1) * gap,
      totalH = rows * ch + (rows - 1) * gap;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = new THREE.Mesh(
          new THREE.PlaneGeometry(cw, ch),
          new THREE.MeshStandardMaterial({ color: 0xefebe3, roughness: 0.7 }),
        );
        cell.position.set(
          -totalW / 2 + cw / 2 + c * (cw + gap),
          totalH / 2 - ch / 2 - r * (ch + gap) - 0.15,
          0.085,
        );
        g.add(cell);
        cells.push(cell);
      }
    }
    g.userData = { cells };
    return g;
  }
  const left = makeGrid(COLOR_GOOGLE);
  left.position.set(-1.85, 0, 0);
  left.rotation.y = 0.35;
  root.add(left);
  const right = makeGrid(COLOR_BRAND);
  right.position.set(1.85, 0, 0);
  right.rotation.y = -0.35;
  root.add(right);
  const events: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const e = new THREE.Mesh(
      makeRoundedBox(0.38, 0.34, 0.06, 0.08),
      new THREE.MeshStandardMaterial({
        color: COLOR_BRAND2,
        emissive: COLOR_BRAND2,
        emissiveIntensity: 0.3,
      }),
    );
    e.userData = { cellIdx: Math.floor(Math.random() * 20), delay: i * 0.06 };
    e.visible = false;
    root.add(e);
    events.push(e);
  }
  const cG = new THREE.Color(COLOR_GOOGLE),
    cM = new THREE.Color(COLOR_BRAND2),
    cBr = new THREE.Color(COLOR_BRAND),
    tmp = new THREE.Color();
  return {
    root,
    anchors: { google: false, time: false, skedda: false },
    tick(s) {
      events.forEach((ev) => {
        const local = Math.max(0, Math.min(1, (s.sp - ev.userData.delay) * 2.2));
        if (local <= 0) {
          ev.visible = false;
          return;
        }
        ev.visible = true;
        const tL = left.userData.cells[ev.userData.cellIdx];
        const tR = right.userData.cells[ev.userData.cellIdx];
        const mat = ev.material as THREE.MeshStandardMaterial;
        if (local < 0.5) {
          const e = local / 0.5,
            ee = 1 - Math.pow(1 - e, 3);
          const wp = new THREE.Vector3();
          tL.getWorldPosition(wp);
          ev.position.set(wp.x, 3 + (wp.y - 3) * ee, wp.z + 0.15);
          mat.color.setHex(COLOR_GOOGLE);
          mat.emissive.setHex(COLOR_GOOGLE);
        } else {
          const e = (local - 0.5) / 0.5;
          const ee = 1 - Math.pow(1 - e, 2);
          const wpL = new THREE.Vector3();
          tL.getWorldPosition(wpL);
          const wpR = new THREE.Vector3();
          tR.getWorldPosition(wpR);
          ev.position.set(
            wpL.x + (wpR.x - wpL.x) * ee,
            wpL.y + (wpR.y - wpL.y) * ee + Math.sin(e * Math.PI) * 0.6,
            wpL.z + (wpR.z - wpL.z) * ee + 0.15,
          );
          if (e < 0.5) tmp.copy(cG).lerp(cM, e * 2);
          else tmp.copy(cM).lerp(cBr, (e - 0.5) * 2);
          mat.color.copy(tmp);
          mat.emissive.copy(tmp);
        }
      });
    },
  };
}

// ===== SCENE 4: floorplan =====
function buildFloorplan(): ActiveScene {
  const root = new THREE.Group();
  root.rotation.x = -0.5;
  root.rotation.z = 0.1;
  const ROOMS = [
    { x: -1.8, y: 1.0, w: 1.2, h: 1.0, c: 0xc97b5b, hero: false },
    { x: -0.4, y: 1.0, w: 1.2, h: 1.0, c: 0xe0a848, hero: false },
    { x: 1.2, y: 1.0, w: 1.6, h: 1.0, c: 0x2b5f3e, hero: true },
    { x: -1.3, y: -0.5, w: 2.0, h: 1.2, c: 0xb85450, hero: false },
    { x: 1.4, y: -0.5, w: 1.4, h: 1.2, c: 0x6b7280, hero: false },
  ];
  type RoomTile = THREE.Mesh & { userData: (typeof ROOMS)[number] };
  const tiles: RoomTile[] = [];
  ROOMS.forEach((r) => {
    const tile = new THREE.Mesh(
      makeRoundedBox(r.w, r.h, 0.06, 0.05),
      new THREE.MeshStandardMaterial({ color: COLOR_PAPER, roughness: 0.5 }),
    ) as unknown as RoomTile;
    tile.position.set(r.x, r.y, 0);
    const tab = new THREE.Mesh(
      new THREE.PlaneGeometry(r.w * 0.5, 0.16),
      new THREE.MeshStandardMaterial({ color: r.c, emissive: r.c, emissiveIntensity: 0.3 }),
    );
    tab.position.set(0, r.h / 2 - 0.13, 0.04);
    tile.add(tab);
    tile.userData = r;
    root.add(tile);
    tiles.push(tile);
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.9, 1.6, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: COLOR_BRAND2,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.set(1.2, 1.0, 1.0);
  root.add(beam);
  return {
    root,
    anchors: { google: false, time: false, skedda: false },
    tick(s) {
      tiles.forEach((t) => {
        const r = t.userData;
        const mat = t.material as THREE.MeshStandardMaterial;
        if (r.hero) {
          const e = Math.max(0, Math.min(1, (s.sp - 0.2) * 1.6));
          t.position.z = e * 0.45 + Math.sin(s.t * 1.2) * 0.04 * e;
          if (!mat.emissive) mat.emissive = new THREE.Color();
          mat.emissive.setHex(COLOR_BRAND);
          mat.emissiveIntensity = e * 0.3;
          (beam.material as THREE.MeshBasicMaterial).opacity = e * 0.35;
        } else {
          t.position.z = Math.sin(s.t * 0.7 + r.x) * 0.03;
        }
      });
    },
  };
}

// ===== SCENE 5: merge =====
function buildMerge(): ActiveScene {
  const root = new THREE.Group();
  function makeCard(color: number) {
    const c = new THREE.Mesh(
      makeRoundedBox(2.4, 3.2, 0.18),
      new THREE.MeshStandardMaterial({ color: COLOR_PAPER, roughness: 0.5 }),
    );
    const head = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.3),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }),
    );
    head.position.set(0, 1.2, 0.085);
    c.add(head);
    for (let i = 0; i < 3; i++) {
      const row = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xefebe3, roughness: 0.7 }),
      );
      row.position.set(0, 0.5 - i * 0.5, 0.085);
      c.add(row);
    }
    return c;
  }
  const cardL = makeCard(COLOR_GOOGLE);
  root.add(cardL);
  const cardR = makeCard(COLOR_BRAND);
  root.add(cardR);
  const unified = makeCard(COLOR_BRAND2);
  unified.scale.setScalar(0);
  root.add(unified);
  return {
    root,
    anchors: { google: false, time: false, skedda: false },
    tick(s) {
      if (s.sp < 0.6) {
        const e = s.sp / 0.6;
        cardL.position.set(-2.6 + e * 1.0, 0.3, 0);
        cardL.rotation.set(-0.16, 0.45 - e * 0.3, 0.05);
        cardR.position.set(2.6 - e * 1.0, -0.3, 0);
        cardR.rotation.set(0.16, -0.45 + e * 0.3, -0.05);
        cardL.scale.setScalar(1);
        cardR.scale.setScalar(1);
        unified.visible = false;
      } else {
        const e = (s.sp - 0.6) / 0.4,
          ee = 1 - Math.pow(1 - e, 3);
        cardL.position.x = -1.6 + ee * 1.6;
        cardL.position.y = 0.3 - ee * 0.3;
        cardR.position.x = 1.6 - ee * 1.6;
        cardR.position.y = -0.3 + ee * 0.3;
        cardL.scale.setScalar(1 - ee);
        cardR.scale.setScalar(1 - ee);
        unified.visible = true;
        unified.scale.setScalar(ee * 1.05);
        unified.rotation.y = Math.sin(s.t * 0.6) * 0.1;
      }
    },
  };
}

// ===== SCENE 6: hourglass =====
function buildHourglass(): ActiveScene {
  const root = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.05,
    metalness: 0.6,
  });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 32, 1, true), glassMat);
  top.position.y = 0.7;
  top.rotation.x = Math.PI;
  root.add(top);
  const bot = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 32, 1, true), glassMat);
  bot.position.y = -0.7;
  root.add(bot);
  const capGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.08, 32);
  const capMat = new THREE.MeshStandardMaterial({ color: COLOR_INK, roughness: 0.4 });
  const capTop = new THREE.Mesh(capGeo, capMat);
  capTop.position.y = 1.4;
  root.add(capTop);
  const capBot = new THREE.Mesh(capGeo, capMat);
  capBot.position.y = -1.4;
  root.add(capBot);
  const SAND = 50;
  const sand: THREE.Mesh[] = [];
  for (let i = 0; i < SAND; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: COLOR_BRAND2, transparent: true }),
    );
    m.userData = { t: Math.random(), seedA: Math.random() * Math.PI * 2 };
    root.add(m);
    sand.push(m);
  }
  const cubes: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(
      makeRoundedBox(0.4, 0.4, 0.08, 0.1),
      new THREE.MeshStandardMaterial({
        color: COLOR_BRAND,
        emissive: COLOR_BRAND,
        emissiveIntensity: 0.4,
      }),
    );
    c.userData = { angle: (i / 6) * Math.PI * 2, idx: i };
    c.visible = false;
    root.add(c);
    cubes.push(c);
  }
  return {
    root,
    anchors: { google: false, time: false, skedda: false },
    tick(s) {
      const breakPoint = 0.55;
      sand.forEach((p) => {
        const mat = p.material as THREE.MeshBasicMaterial;
        if (s.sp < breakPoint) {
          const u = (p.userData.t + s.t * 0.3) % 1;
          const yAbs = 1.0 - u * 2.0;
          const r = (1 - Math.abs(yAbs) / 1.4) * 0.7;
          const a = p.userData.seedA + s.t * 0.5;
          p.position.set(Math.cos(a) * r, yAbs, Math.sin(a) * r);
          mat.opacity = 1;
          p.visible = true;
        } else {
          const e = (s.sp - breakPoint) / (1 - breakPoint);
          mat.opacity = 1 - e;
          if (e > 0.95) p.visible = false;
        }
      });
      if (s.sp < breakPoint) {
        glassMat.opacity = 0.18;
        top.visible = bot.visible = capTop.visible = capBot.visible = true;
        root.rotation.z = 0;
      } else {
        const e = Math.min(1, (s.sp - breakPoint) / 0.2);
        glassMat.opacity = 0.18 * (1 - e);
        const v = e <= 0.95;
        top.visible = bot.visible = capTop.visible = capBot.visible = v;
        root.rotation.z = e * 0.05 * Math.sin(s.t * 4) * (1 - e);
      }
      cubes.forEach((c, i) => {
        const localStart = breakPoint + i * 0.04;
        if (s.sp < localStart) {
          c.visible = false;
          return;
        }
        c.visible = true;
        const e = Math.min(1, (s.sp - localStart) * 4),
          ee = 1 - Math.pow(1 - e, 3);
        const a = c.userData.angle + s.t * 0.4,
          radius = 1.6 * ee;
        c.position.set(Math.cos(a) * radius, Math.sin(a * 0.7 + i) * 0.5 * ee, Math.sin(a) * radius * 0.4);
        c.rotation.set(s.t * 0.5 + i, s.t * 0.7 + i, 0);
        c.scale.setScalar(0.6 + ee * 0.5);
      });
    },
  };
}

const SCENES: Record<SceneKey, () => ActiveScene> = {
  sync: buildSync,
  race: buildRace,
  calendar: buildCalendar,
  floorplan: buildFloorplan,
  merge: buildMerge,
  hourglass: buildHourglass,
};

export function HeroScene() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [anchors, setAnchors] = useState<{ google: boolean; time: boolean; skedda: boolean }>({
    google: true,
    time: true,
    skedda: true,
  });
  const searchParams = useSearchParams();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const requested = (searchParams?.get("scene") as SceneKey | null) || "sync";
    const sceneKey: SceneKey = SCENES[requested] ? requested : "sync";

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const sceneObj = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    sceneObj.add(new THREE.AmbientLight(0xffffff, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(3, 6, 5);
    sceneObj.add(keyLight);
    const greenFill = new THREE.PointLight(COLOR_BRAND, 1.6, 14);
    greenFill.position.set(-4, 1, 3);
    sceneObj.add(greenFill);
    const mustardFill = new THREE.PointLight(COLOR_BRAND2, 1.4, 14);
    mustardFill.position.set(4, -1, 3);
    sceneObj.add(mustardFill);

    const sceneRoot = new THREE.Group();
    sceneObj.add(sceneRoot);
    const active = SCENES[sceneKey]();
    sceneRoot.add(active.root);
    setAnchors(active.anchors);

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    const r1 = window.setTimeout(resize, 100);
    const r2 = window.setTimeout(resize, 500);

    let scrollP = 0;
    let scrollPSmoothed = 0;
    let scrollVel = 0;
    let lastScrollY = window.scrollY;
    let lastScrollTime = performance.now();

    const readScroll = () => {
      const heroEl = wrapRef.current?.parentElement;
      const heroH = heroEl ? heroEl.offsetHeight : window.innerHeight;
      scrollP = Math.max(0, Math.min(1, window.scrollY / Math.max(1, heroH * 0.85)));
      const now = performance.now();
      const dt = Math.max(1, now - lastScrollTime);
      const dy = Math.abs(window.scrollY - lastScrollY);
      scrollVel = Math.min(1.5, ((dy / dt) * 1000) / window.innerHeight);
      lastScrollY = window.scrollY;
      lastScrollTime = now;
    };
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const wrap = wrapRef.current;
    const onMove = (e: MouseEvent) => {
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      mouse.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    const onLeave = () => {
      mouse.tx = 0;
      mouse.ty = 0;
    };
    wrap?.addEventListener("mousemove", onMove);
    wrap?.addEventListener("mouseleave", onLeave);

    let running = true;
    const onVisibility = () => {
      running = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clock = new THREE.Clock();
    let lastT = 0;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!running) return;
      const t = clock.getElapsedTime();
      const dt = Math.max(0.001, Math.min(0.05, t - lastT));
      lastT = t;
      scrollVel *= 0.92;
      scrollPSmoothed += (scrollP - scrollPSmoothed) * 0.12;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      camera.position.x = mouse.x * 0.5;
      camera.position.y = -mouse.y * 0.35 - scrollPSmoothed * 0.4;
      camera.position.z = 9 + scrollPSmoothed * 1.6;
      camera.lookAt(0, -scrollPSmoothed * 0.3, 0);
      active.tick({ t, dt, sp: scrollPSmoothed, scrollVel, mouse });
      renderer.render(sceneObj, camera);
    };
    tick();
    if (reduce) {
      running = false;
      renderer.render(sceneObj, camera);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", readScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      wrap?.removeEventListener("mousemove", onMove);
      wrap?.removeEventListener("mouseleave", onLeave);
      window.clearTimeout(r1);
      window.clearTimeout(r2);
      disposeGroup(sceneRoot);
      renderer.dispose();
    };
  }, [searchParams]);

  return (
    <div className="landing-3d-wrap" ref={wrapRef}>
      <canvas id="landing-three-canvas" ref={canvasRef} />
      {anchors.google && (
        <div className="landing-anchor landing-anchor-google">
          <div className="landing-anchor-logo g">
            <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M44 24.5c0-1.5-.1-2.9-.4-4.3H24v8.2h11.3c-.5 2.7-2 4.9-4.3 6.4v5.3h6.9c4.1-3.7 6.1-9.1 6.1-15.6z"
              />
              <path
                fill="#34A853"
                d="M24 45c5.8 0 10.7-1.9 14.3-5.2l-6.9-5.3c-1.9 1.3-4.4 2-7.4 2-5.7 0-10.5-3.8-12.2-9H4.7v5.6C8.3 40.6 15.5 45 24 45z"
              />
              <path
                fill="#FBBC05"
                d="M11.8 27.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5v-5.6H4.7C3.1 16 2.2 19.4 2.2 23s.9 7 2.5 10.1l7.1-5.6z"
              />
              <path
                fill="#EA4335"
                d="M24 11c3.2 0 6 1.1 8.2 3.2l6.1-6.1C34.7 4.6 29.8 2.5 24 2.5 15.5 2.5 8.3 6.9 4.7 13.5l7.1 5.6c1.7-5.2 6.5-8.1 12.2-8.1z"
              />
            </svg>
          </div>
          <span>Demo · Mondial Relay</span>
        </div>
      )}
      {anchors.time && <div className="landing-anchor landing-anchor-time">↓ auto-sync · 4 s ↓</div>}
      {anchors.skedda && (
        <div className="landing-anchor landing-anchor-skedda">
          <div className="landing-anchor-logo s">E</div>
          <span>Earth · réservée</span>
        </div>
      )}
    </div>
  );
}
