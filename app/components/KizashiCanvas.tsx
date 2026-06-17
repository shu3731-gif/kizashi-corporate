"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js"
import { sceneStore } from "./sceneStore"

// Device tier — evaluated once at module load (client-only; this module is
// dynamically imported with ssr:false). Mobile gets a lighter particle budget,
// fewer shooting stars and a lower DPR ceiling so the scene stays smooth.
const IS_MOBILE = typeof window !== "undefined" && window.innerWidth < 768
const PARTICLE_COUNT = IS_MOBILE ? 12000 : 24000
const AMBIENT_RATIO = 0.08
const FLOOR_Y = -2.5

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────
function scatter(): [number, number, number] {
  return [(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12 - 2]
}

function onSphere(r: number, noise = 0): [number, number, number] {
  const phi = Math.acos(2 * Math.random() - 1)
  const theta = 2 * Math.PI * Math.random()
  const rad = r + (Math.random() - 0.5) * noise
  return [rad * Math.sin(phi) * Math.cos(theta), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(theta)]
}

function onLine(a: number[], b: number[], noise = 0.02): [number, number, number] {
  const t = Math.random()
  return [
    a[0] * (1 - t) + b[0] * t + (Math.random() - 0.5) * noise,
    a[1] * (1 - t) + b[1] * t + (Math.random() - 0.5) * noise,
    a[2] * (1 - t) + b[2] * t + (Math.random() - 0.5) * noise,
  ]
}

function onTriangle(a: number[], b: number[], c: number[], noise = 0.03): [number, number, number] {
  let u = Math.random(), v = Math.random()
  if (u + v > 1) { u = 1 - u; v = 1 - v }
  const w = 1 - u - v
  return [
    a[0] * u + b[0] * v + c[0] * w + (Math.random() - 0.5) * noise,
    a[1] * u + b[1] * v + c[1] * w + (Math.random() - 0.5) * noise,
    a[2] * u + b[2] * v + c[2] * w + (Math.random() - 0.5) * noise,
  ]
}

function fillAmbient(pos: Float32Array, fromIdx: number) {
  for (let i = fromIdx; i < PARTICLE_COUNT; i++) {
    const p = scatter()
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTRO shapes
// ─────────────────────────────────────────────────────────────────────────────
function genCore(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = onSphere(0.06 * Math.cbrt(Math.random()), 0)
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]
  }
  return pos
}

function genBurst(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = 4.2 + Math.pow(Math.random(), 2) * 4.5
    const p = onSphere(r, 1.2)
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]
  }
  return pos
}

function genVortex(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const ARMS = 3
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const t = Math.random()
    const z = -19 + t * 24
    const taper = Math.pow((z + 19) / 24, 1.4)
    const radius = 0.7 + taper * 4.8 + (Math.random() - 0.5) * 0.5
    const arm = i % ARMS
    const angle = (arm / ARMS) * Math.PI * 2 + z * 0.55 + (Math.random() - 0.5) * 0.5
    pos[i * 3] = Math.cos(angle) * radius
    pos[i * 3 + 1] = Math.sin(angle) * radius
    pos[i * 3 + 2] = z
  }
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 0: 兆 kanji
// ─────────────────────────────────────────────────────────────────────────────
// Brush-calligraphy face the Intro 兆 is sampled into. Loaded via a Google
// Fonts <link> in layout.tsx; falls back to a system serif until it arrives,
// then re-sampled (see the font-load effect). Swap the family here to restyle:
//   'Yuji Syuku' — clean formal brush (default)
//   'Yuji Boku'  — bold, dry/rough brush
//   'Yuji Mai'   — flowing cursive (草書)
const BRUSH_FAMILY = "Yuji Syuku"
const BRUSH_FONT = `'${BRUSH_FAMILY}', 'Hiragino Mincho ProN', serif`
function genKanji(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)

  const candidates: [number, number][] = []
  if (typeof document !== "undefined") {
    const size = 320
    const cv = document.createElement("canvas")
    cv.width = size; cv.height = size
    const ctx = cv.getContext("2d")
    if (ctx) {
      ctx.fillStyle = "#fff"
      ctx.font = `260px ${BRUSH_FONT}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("兆", size / 2, size / 2 + 10)
      const data = ctx.getImageData(0, 0, size, size).data
      for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x += 2) {
          if (data[(y * size + x) * 4 + 3] > 100) candidates.push([x, y])
        }
      }
    }
  }

  if (candidates.length < 100) {
    for (let i = 0; i < surface; i++) {
      const p = onSphere(2.2, 0.5)
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]
    }
  } else {
    // Near-flat sheet: a deep/double-layer slab made the strokes double up under
    // parallax and read as fuzzy. A thin sheet keeps the glyph crisp and clean.
    const span = 5.0
    for (let i = 0; i < surface; i++) {
      const [cx, cy] = candidates[Math.floor(Math.random() * candidates.length)]
      pos[i * 3] = (cx / 320 - 0.5) * span + (Math.random() - 0.5) * 0.015
      pos[i * 3 + 1] = -(cy / 320 - 0.5) * span + (Math.random() - 0.5) * 0.015
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.1
    }
  }
  fillAmbient(pos, surface)
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 1: Parametric brilliant-cut diamond
// Proportions follow the round brilliant: table ~53%, crown ~16%, pavilion ~43%
// ─────────────────────────────────────────────────────────────────────────────
function genDiamond(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)

  const R = 1.7                 // girdle radius
  const tableR = R * 0.55
  const tableY = R * 0.36
  const girdleY = 0
  const culetY = -R * 0.9
  const LIFT = 0.2              // float height above the pedestal

  const table: number[][] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16
    table.push([Math.cos(a) * tableR, tableY + LIFT, Math.sin(a) * tableR])
  }
  const girdle: number[][] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    girdle.push([Math.cos(a) * R, girdleY + LIFT, Math.sin(a) * R])
  }
  const culet = [0, culetY + LIFT, 0]
  const tableCenter = [0, tableY + LIFT, 0]

  const edges: number[][][] = []
  // table octagon
  for (let i = 0; i < 8; i++) edges.push([table[i], table[(i + 1) % 8]])
  // girdle 16-gon
  for (let i = 0; i < 16; i++) edges.push([girdle[i], girdle[(i + 1) % 16]])
  // crown: each table vertex → two nearest girdle vertices
  for (let i = 0; i < 8; i++) {
    edges.push([table[i], girdle[(i * 2) % 16]])
    edges.push([table[i], girdle[(i * 2 + 1) % 16]])
  }
  // pavilion: girdle → culet
  for (let i = 0; i < 16; i++) edges.push([girdle[i], culet])

  const faces: number[][][] = []
  // table fan
  for (let i = 0; i < 8; i++) faces.push([tableCenter, table[i], table[(i + 1) % 8]])
  // crown kites + stars
  for (let i = 0; i < 8; i++) {
    const g0 = girdle[(i * 2) % 16]
    const g1 = girdle[(i * 2 + 1) % 16]
    const g2 = girdle[(i * 2 + 2) % 16]
    faces.push([table[i], g0, g1])
    faces.push([table[i], g1, g2])
    faces.push([table[i], table[(i + 1) % 8], g2])
  }
  // pavilion
  for (let i = 0; i < 16; i++) faces.push([girdle[i], girdle[(i + 1) % 16], culet])

  const edgeShare = Math.floor(surface * 0.6)
  const ptsPerEdge = Math.floor(edgeShare / edges.length)
  let idx = 0
  for (const [a, b] of edges) {
    for (let j = 0; j < ptsPerEdge && idx < surface; j++) {
      const p = onLine(a, b, 0.015)
      pos[idx * 3] = p[0]; pos[idx * 3 + 1] = p[1]; pos[idx * 3 + 2] = p[2]
      idx++
    }
  }
  while (idx < surface) {
    const f = faces[Math.floor(Math.random() * faces.length)]
    const p = onTriangle(f[0], f[1], f[2], 0.02)
    pos[idx * 3] = p[0]; pos[idx * 3 + 1] = p[1]; pos[idx * 3 + 2] = p[2]
    idx++
  }
  fillAmbient(pos, surface)
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 2: Nested cubes
// ─────────────────────────────────────────────────────────────────────────────
function genCube(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const mk = (s: number): number[][][] => [
    [[-s,-s,-s],[s,-s,-s]], [[s,-s,-s],[s,-s,s]], [[s,-s,s],[-s,-s,s]], [[-s,-s,s],[-s,-s,-s]],
    [[-s,s,-s],[s,s,-s]],   [[s,s,-s],[s,s,s]],   [[s,s,s],[-s,s,s]],   [[-s,s,s],[-s,s,-s]],
    [[-s,-s,-s],[-s,s,-s]], [[s,-s,-s],[s,s,-s]],  [[s,-s,s],[s,s,s]],   [[-s,-s,s],[-s,s,s]],
  ]
  const s = 1.8, s2 = 0.85
  const diag: number[][][] = [
    [[-s,-s,-s],[-s2,-s2,-s2]], [[s,-s,-s],[s2,-s2,-s2]],
    [[s,s,s],[s2,s2,s2]], [[-s,s,s],[-s2,s2,s2]],
  ]
  const allLines = [...mk(s), ...mk(s2), ...diag]

  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
  const ptsPerLine = Math.floor(surface / allLines.length)

  let idx = 0
  for (const [a, b] of allLines) {
    for (let j = 0; j < ptsPerLine && idx < surface; j++) {
      const p = onLine(a, b, 0.025)
      pos[idx * 3] = p[0]; pos[idx * 3 + 1] = p[1]; pos[idx * 3 + 2] = p[2]
      idx++
    }
  }
  while (idx < surface) {
    const line = allLines[Math.floor(Math.random() * allLines.length)]
    const p = onLine(line[0], line[1], 0.025)
    pos[idx * 3] = p[0]; pos[idx * 3 + 1] = p[1]; pos[idx * 3 + 2] = p[2]
    idx++
  }
  fillAmbient(pos, surface)
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 2: City of light — a metropolis of particle towers on a street grid,
// with a glowing ground plane. Animated traffic + rising data streams live in
// the env layer. "取引が行き交う都市"
// ─────────────────────────────────────────────────────────────────────────────
const CITY_N = 9              // grid is CITY_N × CITY_N blocks
const CITY_SP = 0.62         // block spacing
const CITY_HALF = ((CITY_N - 1) * CITY_SP) / 2

type CityBlock = { gx: number; gz: number; w: number; d: number; h: number }
function buildCityBlocks(): CityBlock[] {
  const blocks: CityBlock[] = []
  for (let ix = 0; ix < CITY_N; ix++) {
    for (let iz = 0; iz < CITY_N; iz++) {
      const cx = ix * CITY_SP - CITY_HALF
      const cz = iz * CITY_SP - CITY_HALF
      // taller toward the centre (a skyline), with variation
      const distC = Math.hypot(cx, cz) / CITY_HALF
      const base = (1 - distC) * 2.4 + 0.25
      const h = Math.max(0.2, base * (0.55 + Math.random() * 0.9))
      const w = CITY_SP * (0.34 + Math.random() * 0.12)
      const d = CITY_SP * (0.34 + Math.random() * 0.12)
      blocks.push({ gx: cx, gz: cz, w, d, h })
    }
  }
  return blocks
}

function genMetropolis(blocks: CityBlock[]): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
  const GROUND = -1.9

  // weight particle budget by building height (taller = more particles)
  const totalH = blocks.reduce((s, b) => s + b.h, 0)
  const buildingShare = Math.floor(surface * 0.82)
  const groundShare = surface - buildingShare

  let idx = 0
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi]
    const n = bi === blocks.length - 1
      ? buildingShare - idx
      : Math.max(8, Math.floor((buildingShare * b.h) / totalH))
    const x0 = b.gx - b.w / 2, x1 = b.gx + b.w / 2
    const z0 = b.gz - b.d / 2, z1 = b.gz + b.d / 2
    const yTop = GROUND + b.h
    for (let j = 0; j < n && idx < surface; j++) {
      const r = Math.random()
      let x: number, y: number, z: number
      if (r < 0.6) {
        // vertical edges (4 corners) — the building's glowing frame
        const corner = Math.floor(Math.random() * 4)
        x = corner === 0 || corner === 3 ? x0 : x1
        z = corner < 2 ? z0 : z1
        y = GROUND + Math.random() * b.h
        x += (Math.random() - 0.5) * 0.012
        z += (Math.random() - 0.5) * 0.012
      } else if (r < 0.8) {
        // top rectangle (roof outline)
        if (Math.random() < 0.5) { x = x0 + Math.random() * b.w; z = Math.random() < 0.5 ? z0 : z1 }
        else { z = z0 + Math.random() * b.d; x = Math.random() < 0.5 ? x0 : x1 }
        y = yTop + (Math.random() - 0.5) * 0.02
      } else {
        // sparse facade fill (windows)
        const face = Math.floor(Math.random() * 4)
        if (face === 0) { x = x0; z = z0 + Math.random() * b.d }
        else if (face === 1) { x = x1; z = z0 + Math.random() * b.d }
        else if (face === 2) { z = z0; x = x0 + Math.random() * b.w }
        else { z = z1; x = x0 + Math.random() * b.w }
        y = GROUND + Math.random() * b.h
      }
      pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z
      idx++
    }
  }
  // ground street grid
  while (idx < surface) {
    const onX = Math.random() < 0.5
    const line = Math.floor(Math.random() * CITY_N) * CITY_SP - CITY_HALF - CITY_SP / 2
    const along = (Math.random() - 0.5) * (CITY_N * CITY_SP)
    pos[idx * 3] = onX ? line : along
    pos[idx * 3 + 1] = GROUND + (Math.random() - 0.5) * 0.02
    pos[idx * 3 + 2] = onX ? along : line
    idx++
  }
  void groundShare
  fillAmbient(pos, surface)
  return pos
}

// The scene-3 Earth is built from glowing particles (like the rest of the site).
// Particles within EARTH_R_MAX of the origin are the planet; the texture-load
// effect importance-samples the world map to cluster them onto land/cloud and
// colours them, so a luminous, recognisable Earth emerges out of light.
const EARTH_R = 1.95
const EARTH_R_MAX = 2.6

// ─────────────────────────────────────────────────────────────────────────────
// Scene 3: Saturn motif — a particle Earth (coloured from a real equirectangular
// texture: blue oceans, green/brown land, white cloud & ice) at the centre,
// encircled by a thin horizontal DNA double-helix ring in place of Saturn's
// rings. A pulse of light travels round the ring. centers.x = ring flow position
// (0..1); centers.y = 1 for ring particles (so the pulse lights only the ring,
// not the planet). speeds all 0 → gear-spin path is inert. Particle colours are
// applied asynchronously once the texture loads (see the texture-load effect).
// ─────────────────────────────────────────────────────────────────────────────
type Saturn = { pos: Float32Array; centers: Float32Array; speeds: Float32Array }

function genSaturn(): Saturn {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const centers = new Float32Array(PARTICLE_COUNT * 3)
  const speeds = new Float32Array(PARTICLE_COUNT)
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)

  const TWO_PI = Math.PI * 2
  let idx = 0
  let curFlow = 0
  let curRing = 0
  const put = (x: number, y: number, z: number, j: number) => {
    pos[idx * 3] = x + (Math.random() - 0.5) * j
    pos[idx * 3 + 1] = y + (Math.random() - 0.5) * j
    pos[idx * 3 + 2] = z + (Math.random() - 0.5) * j
    centers[idx * 3] = curFlow
    centers[idx * 3 + 1] = curRing
    idx++
  }

  // ── Earth at the centre: even particle sphere (fallback). The texture-load
  // effect re-places these onto land/cloud and colours them. ──
  const RP = EARTH_R
  const planetN = Math.floor(surface * 0.58)
  curRing = 0; curFlow = 0
  for (let i = 0; i < planetN && idx < surface; i++) {
    const theta = Math.random() * TWO_PI
    const phi = Math.acos(2 * Math.random() - 1)
    const r = RP + (Math.random() - 0.5) * 0.02
    put(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta), 0)
  }

  // ── Horizontal DNA ring (Saturn's rings) — two slender strands of light that
  // twist around each other, joined by sparse crisp base-pair rungs so it reads
  // as a twisted DNA ladder (gene structure) without ever filling into a tube. ──
  const RING = 3.45       // major radius — clears the larger planet
  const TUBE_R = 0.2      // twist amplitude — enough to read the helix & rungs
  const COILS = 18        // integer → strands close seamlessly round the loop
  const ROPE = 0.028      // crisp thread
  curRing = 1
  const putStrand = (f: number, phase: number) => {
    const cphi = Math.cos(f), sphi = Math.sin(f)
    const th = f * COILS + phase
    const dr = Math.cos(th), dv = Math.sin(th)
    const rad = RING + TUBE_R * dr
    const a = Math.random() * TWO_PI, rr = Math.sqrt(Math.random()) * ROPE
    put(cphi * rad + Math.cos(a) * rr, TUBE_R * dv + (Math.random() - 0.5) * ROPE, sphi * rad + Math.sin(a) * rr, 0)
  }
  const strandN = Math.floor(surface * 0.15)
  for (let strand = 0; strand < 2; strand++) {
    const phase = strand * Math.PI
    for (let i = 0; i < strandN && idx < surface; i++) {
      const f = (i / strandN) * TWO_PI
      curFlow = i / strandN
      putStrand(f, phase)
    }
  }
  // Sparse, crisp base-pair rungs — a short step links the two strands at the
  // same point on the loop, so the helix reads as a twisted DNA ladder.
  const RUNGS = 48
  const rungPer = Math.max(2, Math.floor((surface * 0.08) / RUNGS))
  for (let k = 0; k < RUNGS && idx < surface; k++) {
    const f = (k / RUNGS) * TWO_PI
    curFlow = k / RUNGS
    const cphi = Math.cos(f), sphi = Math.sin(f)
    const th = f * COILS
    const da = Math.cos(th), dva = Math.sin(th)
    const ax = cphi * (RING + TUBE_R * da), ay = TUBE_R * dva, az = sphi * (RING + TUBE_R * da)
    const bx = cphi * (RING - TUBE_R * da), by = -TUBE_R * dva, bz = sphi * (RING - TUBE_R * da)
    for (let j = 0; j < rungPer && idx < surface; j++) {
      const u = j / (rungPer - 1 || 1)
      put(ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u, 0.01)
    }
  }
  // top up leftover onto the ring strands
  while (idx < surface) {
    const f = Math.random() * TWO_PI
    curFlow = f / TWO_PI
    putStrand(f, Math.random() < 0.5 ? 0 : Math.PI)
  }

  fillAmbient(pos, surface)
  return { pos, centers, speeds }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 4: Brain — procedural fallback, replaced by the real GLB sample
// Model: "Brain" by Poly by Google (CC BY 3.0) — /public/models/brain.glb
// ─────────────────────────────────────────────────────────────────────────────
type Sampled = { pos: Float32Array; nrm: Float32Array }

function genBrainFallback(): Sampled {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const nrm = new Float32Array(PARTICLE_COUNT * 3)
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
  for (let i = 0; i < surface; i++) {
    const d = onSphere(1, 0)
    const wr = 1 + 0.1 * Math.sin(d[1] * 9 + d[2] * 7) * Math.sin(d[0] * 8 - d[2] * 5)
    const x = d[0] * 1.25 * wr * 1.85
    const y = d[1] * 0.95 * wr * 1.85
    const z = d[2] * 1.5 * wr * 1.85
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
    const l = Math.hypot(x, y, z) || 1
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l
  }
  fillAmbient(pos, surface)
  return { pos, nrm }
}

// Sample a GLB's mesh surfaces into particle positions + normals.
// `yaw` pre-rotates the model so a chosen profile faces the camera at rest.
function sampleGLB(scene: THREE.Group, targetHeight: number, yaw = 0): Sampled {
  const meshes: THREE.Mesh[] = []
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const nrm = new Float32Array(PARTICLE_COUNT * 3)
  if (meshes.length === 0) return genBrainFallback()

  const counts = meshes.map(m => {
    const g = m.geometry as THREE.BufferGeometry
    return g.index ? g.index.count / 3 : g.getAttribute("position").count / 3
  })
  const totalTris = counts.reduce((a, b) => a + b, 0)

  const tmp = new THREE.Vector3()
  const tmpN = new THREE.Vector3()
  const positions: THREE.Vector3[] = []
  const normals: THREE.Vector3[] = []
  const yawM = new THREE.Matrix4().makeRotationY(yaw)
  // Oversample, then bias toward the outer hull so deep interior folds thin out
  // and the silhouette stays crisp.
  const OVER = 2
  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi]
    const want = Math.floor(surface * counts[mi] / totalTris) * OVER + OVER
    const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    const sampler = new MeshSurfaceSampler(mesh).build()
    for (let j = 0; j < want; j++) {
      sampler.sample(tmp, tmpN)
      positions.push(tmp.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(yawM))
      normals.push(tmpN.clone().applyMatrix3(normalMat).applyMatrix4(yawM).normalize())
    }
  }

  const box = new THREE.Box3()
  for (const v of positions) box.expandByPoint(v)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const scale = targetHeight / Math.max(size.x, size.y, size.z)
  const maxR = Math.max(size.x, size.y, size.z) * 0.5

  // Rejection-sample the oversampled set, weighted by outward distance
  const order = Array.from({ length: positions.length }, (_, i) => i)
  const kept: number[] = []
  for (const i of order) {
    if (kept.length >= surface) break
    const v = positions[i]
    const r = v.distanceTo(center) / maxR
    if (Math.random() < 0.88 + 0.12 * r) kept.push(i)
  }
  // top up if rejection left us short
  let oi = 0
  while (kept.length < surface) { kept.push(order[oi % order.length]); oi++ }

  for (let k = 0; k < surface; k++) {
    const i = kept[k]
    const v = positions[i]
    const nv = normals[i]
    pos[k * 3] = (v.x - center.x) * scale + (Math.random() - 0.5) * 0.025
    pos[k * 3 + 1] = (v.y - center.y) * scale + (Math.random() - 0.5) * 0.025
    pos[k * 3 + 2] = (v.z - center.z) * scale + (Math.random() - 0.5) * 0.025
    nrm[k * 3] = nv.x; nrm[k * 3 + 1] = nv.y; nrm[k * 3 + 2] = nv.z
  }
  fillAmbient(pos, surface)
  return { pos, nrm }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 5: Blood moon (founders' message). A warm particle moon at upper-left,
// mid lunar-eclipse: a terminator (uShadowX) sweeps off and the red-orange moon
// emerges from darkness. Centred at MOON_C; shading lives in the shader.
// ─────────────────────────────────────────────────────────────────────────────
const MOON_C: [number, number] = [-2.3, 1.2]
const MOON_R = 1.5

function genMoon(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
  const TWO_PI = Math.PI * 2
  for (let i = 0; i < surface; i++) {
    const theta = Math.random() * TWO_PI
    const phi = Math.acos(2 * Math.random() - 1)
    const r = MOON_R + (Math.random() - 0.5) * 0.045
    pos[i * 3]     = MOON_C[0] + r * Math.sin(phi) * Math.cos(theta)
    pos[i * 3 + 1] = MOON_C[1] + r * Math.cos(phi)
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  fillAmbient(pos, surface)
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene 6: Globe
// ─────────────────────────────────────────────────────────────────────────────
function genGlobe(): Float32Array {
  const pos = new Float32Array(PARTICLE_COUNT * 3)
  const R = 2.3
  const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
  const latLines = 11
  const lonLines = 20
  const ptsLat = Math.floor(surface * 0.46 / latLines)
  const ptsLon = Math.floor(surface * 0.46 / lonLines)

  let idx = 0
  for (let li = 0; li < latLines; li++) {
    const lat = -80 + (li / (latLines - 1)) * 160
    const y = Math.sin(lat * Math.PI / 180) * R
    const r = Math.cos(lat * Math.PI / 180) * R
    for (let j = 0; j < ptsLat && idx < surface; j++) {
      const theta = Math.random() * Math.PI * 2
      pos[idx * 3] = r * Math.cos(theta) + (Math.random() - 0.5) * 0.04
      pos[idx * 3 + 1] = y + (Math.random() - 0.5) * 0.04
      pos[idx * 3 + 2] = r * Math.sin(theta) + (Math.random() - 0.5) * 0.04
      idx++
    }
  }
  for (let lo = 0; lo < lonLines; lo++) {
    const lon = (lo / lonLines) * Math.PI * 2
    for (let j = 0; j < ptsLon && idx < surface; j++) {
      const lat = (Math.random() * 2 - 1) * 85 * Math.PI / 180
      pos[idx * 3] = Math.cos(lon) * Math.cos(lat) * R + (Math.random() - 0.5) * 0.04
      pos[idx * 3 + 1] = Math.sin(lat) * R + (Math.random() - 0.5) * 0.04
      pos[idx * 3 + 2] = Math.sin(lon) * Math.cos(lat) * R + (Math.random() - 0.5) * 0.04
      idx++
    }
  }
  while (idx < surface) {
    const p = onSphere(R, 0.06)
    pos[idx * 3] = p[0]; pos[idx * 3 + 1] = p[1]; pos[idx * 3 + 2] = p[2]
    idx++
  }
  fillAmbient(pos, surface)
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Shaders
// ─────────────────────────────────────────────────────────────────────────────
const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uStagger;
uniform float uEaseMode;
uniform float uNoiseAmp;
uniform float uSize;
uniform float uSweepAmp;
uniform float uSweepPos;
uniform float uWaveAmp;
uniform float uScanZ;
uniform float uFireAmp;
uniform float uRimAmp;
uniform float uSizeBoost;
uniform vec3 uMouse;       // cursor position projected onto the z=0 world plane
uniform float uRippleAmp;
uniform float uMouseAmp;    // cursor swirl/aura strength
uniform float uKanjiGlow;   // scene-0 dreamy shimmer gate
uniform float uHelixGlow;   // scene-3 traveling light pulse gate
uniform float uClockTime;  // accumulates only on the clockwork scene

attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec3 aRandom;
attribute vec3 aNrm;
attribute vec3 aGearCenter; // clockwork: this particle's gear centre
attribute float aGearSpeed; // clockwork: signed angular speed (0 = not a gear)
attribute vec3 aColor;      // scene-3 Earth colour (white elsewhere)
varying vec3 vColor;
uniform float uMoon;        // scene-5 blood-moon gate
uniform float uShadowX;     // scene-5 eclipse terminator (local x)
varying float vMoonMask;    // 1 on the moon's disc, 0 elsewhere
varying float vMoonLit;     // 0 in eclipse shadow, 1 in warm light
varying float vMoonRim;     // bright band at the terminator

varying vec3 vRand;
varying float vFade;
varying float vSweep;
varying float vFire;
varying float vScan;
varying float vRim;
varying float vRipple;
varying float vAura;
varying float vGlow;

vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float cubicInOut(float t) {
  return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0;
}
float outQuart(float t) {
  return 1.0 - pow(1.0 - t, 4.0);
}

void main() {
  vRand = aRandom;
  vColor = aColor;

  float raw = clamp(uProgress * (1.0 + uStagger) - aRandom.x * uStagger, 0.0, 1.0);
  float t = uEaseMode < 0.5 ? cubicInOut(raw) : outQuart(raw);
  vec3 p = mix(aFrom, aTo, t);

  // Clockwork: spin each particle around its own gear centre. uClockTime only
  // advances on the clockwork scene (0 elsewhere → identity), and aGearSpeed is
  // 0 for non-gear particles, so this is a no-op everywhere else.
  if (aGearSpeed != 0.0 && uClockTime > 0.0) {
    float ang = aGearSpeed * uClockTime;
    float cs = cos(ang), sn = sin(ang);
    vec2 gd = p.xy - aGearCenter.xy;
    p.xy = aGearCenter.xy + vec2(gd.x * cs - gd.y * sn, gd.x * sn + gd.y * cs);
  }

  vec3 np = p * 0.55 + uTime * 0.07;
  p += vec3(
    snoise(np),
    snoise(np + vec3(31.7, 11.3, 71.9)),
    snoise(np + vec3(73.1, 53.7, 19.3))
  ) * uNoiseAmp * (0.4 + aRandom.z * 0.9);

  // Scene 3: traveling wave + scan line
  p.y += uWaveAmp * sin(p.x * 1.15 - uTime * 1.6) * 0.4;
  vScan = uWaveAmp * exp(-pow((p.z - uScanZ) * 2.2, 2.0));

  // Scene 4: neural firing (skip the noise entirely when the scene is inactive)
  vFire = 0.0;
  if (uFireAmp > 0.001) {
    vFire = uFireAmp * pow(max(snoise(p * 0.7 + vec3(0.0, 0.0, uTime * 0.33)), 0.0), 3.0);
  }

  // Scene 1: light sweep
  float sw = dot(p, normalize(vec3(0.65, 1.0, 0.35)));
  vSweep = uSweepAmp * exp(-pow((sw - uSweepPos) * 2.0, 2.0));

  // Cursor ripple — concentric brightness waves radiating from the cursor,
  // measured in world space so it tracks the on-screen cursor even while a
  // scene spins.
  vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
  vec2 toM = wp.xy - uMouse.xy;
  float dM = length(toM);
  float ripFall = exp(-dM * 0.5);
  float ripWave = 0.5 + 0.5 * sin(dM * 5.0 - uTime * 3.5);
  vRipple = uRippleAmp * ripFall * ripWave;

  // Magical cursor aura — stardust stirred by a fingertip. Particles near the
  // pointer swirl tangentially, breathe outward and lift toward the viewer.
  // Computed in world space and reset every frame (no persistent deformation),
  // so the glyph snaps cleanly back as the cursor moves away.
  float aura = 0.0;
  if (uMouseAmp > 0.001) {
    aura = exp(-dM * 1.7) * uMouseAmp;
    vec2 tang = vec2(-toM.y, toM.x) / max(dM, 0.05);   // swirl direction
    vec2 rad  = toM / max(dM, 0.05);                    // outward direction
    float shim = snoise(vec3(wp.xy * 1.1, uTime * 0.5));
    wp.xy += tang * aura * 0.38 * (0.7 + 0.3 * sin(uTime * 1.7));
    wp.xy += rad  * aura * 0.14 * shim;
    wp.z  += aura * (0.45 + 0.3 * shim);
  }
  vAura = aura;

  // Scene 0: dreamy kanji shimmer. Scene 3: a bright pulse of light travelling
  // round the Saturn ring — gated by aGearCenter.y so only the ring lights up,
  // never the central planet.
  vGlow = uKanjiGlow * (0.5 + 0.5 * sin(wp.y * 1.3 - uTime * 1.1 + wp.x * 0.6))
        + uHelixGlow * aGearCenter.y * pow(0.5 + 0.5 * sin(aGearCenter.x * 6.28318 - uTime * 1.4), 3.0) * 1.45;

  // Scene 5: blood-moon eclipse (moonC matches MOON_C in genMoon)
  vec2 moonC = vec2(-2.3, 1.2);
  vMoonMask = uMoon * (1.0 - smoothstep(1.5, 2.1, length(p.xy - moonC)));
  vMoonLit = smoothstep(uShadowX - 0.35, uShadowX + 0.35, p.x);
  vMoonRim = exp(-pow((p.x - uShadowX) * 2.2, 2.0));

  vec4 mv = viewMatrix * vec4(wp, 1.0);

  // Scene 4: fresnel rim — particles on the silhouette edge glow, so the
  // brain reads as a solid 3D form instead of an even cloud.
  // Derive the view-space normal from modelViewMatrix directly; normalMatrix
  // is not reliably supplied to a Points ShaderMaterial (→ NaN → black).
  float rim = 0.0;
  if (uRimAmp > 0.001 && dot(aNrm, aNrm) > 0.25) {
    vec3 vn = normalize(mat3(modelViewMatrix) * aNrm);
    vec3 vdir = normalize(-mv.xyz);
    rim = pow(1.0 - abs(dot(vn, vdir)), 2.2);
  }
  vRim = uRimAmp * rim;

  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uSizeBoost * (0.5 + aRandom.y * 0.9) * (300.0 / -mv.z) * (1.0 + vRim * 1.4 + vAura * 2.0 + vGlow * 0.5);
  vFade = smoothstep(17.0, 5.0, -mv.z);
}
`

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uWaveAmp;
uniform float uRimGate;
uniform float uEarthCol;
varying vec3 vRand;
varying vec3 vColor;
varying float vFade;
varying float vSweep;
varying float vFire;
varying float vScan;
varying float vRim;
varying float vRipple;
varying float vAura;
varying float vGlow;
varying float vMoonMask;
varying float vMoonLit;
varying float vMoonRim;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float alpha = smoothstep(0.5, 0.06, d);
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + vRand.z * 2.2) + vRand.x * 6.2831);
  vec3 base = vec3(0.85, 0.85, 0.87);
  vec3 gold = vec3(0.784, 0.671, 0.510);
  vec3 col = mix(base, gold, step(0.9, vRand.y));
  // Scene 3: paint the Earth with its real texture colour.
  col = mix(col, vColor, uEarthCol);
  col += vec3(1.0, 0.95, 0.82) * vSweep;
  col += vec3(0.75, 0.85, 1.0) * vFire;
  col += vec3(0.95, 0.85, 0.65) * vScan;
  // Silhouette particles glow cyan-white on top of the full-brightness body
  col += vec3(0.82, 0.90, 1.0) * vRim * 2.6;
  // Cursor ripple — cool light pulse radiating from the pointer
  col += vec3(0.70, 0.84, 1.0) * vRipple * 1.5;
  // Magical cursor aura — warm gold bloom + fast twinkle on nearby particles
  float auraTw = 0.5 + 0.5 * sin(uTime * 7.0 + vRand.x * 6.2831);
  col += vec3(1.0, 0.84, 0.50) * vAura * (1.4 + auraTw);
  // Scene 0 dreamy shimmer — soft gold light breathing across the 兆
  col += vec3(0.96, 0.82, 0.52) * vGlow * 0.55;
  // Scene 5 blood moon — deep red in eclipse shadow → warm orange in light,
  // with a bright copper terminator. vMoonMask isolates the moon's disc.
  vec3 moonCol = mix(vec3(0.34, 0.02, 0.02), vec3(1.0, 0.16, 0.09), vMoonLit)
               + vec3(1.0, 0.42, 0.20) * vMoonRim * 0.7;
  col = mix(col, moonCol, vMoonMask);
  // The waveform scene spreads deep into z — lift its depth fade and brightness
  float fade = max(vFade, uWaveAmp * 0.45);
  float boost = uWaveAmp * 0.5;
  // Atmospheric perspective: distant particles go cooler and dimmer
  col *= mix(vec3(0.62, 0.70, 0.95), vec3(1.0), fade);
  // Scene 4 (uRimGate→1) lifts overall brightness: surface particles are
  // sparser than the wireframe scenes, so they need more luminance to read
  float sceneBright = 1.0 + uRimGate * 0.55;
  float a = alpha * uOpacity * sceneBright * (tw + vSweep + vFire + vScan + boost + vRim * 3.2 + vRipple * 1.6 + vAura * 2.2 + vGlow * 0.7 + vMoonMask * (0.35 + vMoonLit * 0.9 + vMoonRim * 0.9)) * fade;
  gl_FragColor = vec4(col, min(1.0, a));
}
`

// ─────────────────────────────────────────────────────────────────────────────
// Easing (JS mirror)
// ─────────────────────────────────────────────────────────────────────────────
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

const CAMERA = [
  { z: 6.2, y: 0 },     // 0 kanji
  { z: 6.6, y: 0.1 },   // 1 diamond on pedestal
  { z: 8.6, y: 0.4 },   // 2 city of light — pulled back for the aerial skyline
  { z: 9.0, y: 0 },     // 3 Saturn — framed for the planet + encircling ring
  { z: 6.3, y: 0 },     // 4 brain
  { z: 7.4, y: 0 },     // 5 blood moon (offset upper-left via MOON_C)
  { z: 8.4, y: 0.3 },   // 6 globe (no more dawn plane)
]

const MODULE_UNIFORMS = {
  uTime: { value: 0 },
  uProgress: { value: 0 },
  uStagger: { value: 0.6 },
  uEaseMode: { value: 0 },
  uNoiseAmp: { value: 0.05 },
  uSize: { value: 0.030 * (typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1) },
  uOpacity: { value: 0.9 },
  uSweepAmp: { value: 0 },
  uSweepPos: { value: -4 },
  uWaveAmp: { value: 0 },
  uScanZ: { value: 2 },
  uFireAmp: { value: 0 },
  uRimAmp: { value: 0 },
  uRimGate: { value: 0 },
  uSizeBoost: { value: 1 },
  uMouse: { value: new THREE.Vector3(999, 999, 999) },
  uRippleAmp: { value: 0 },
  uMouseAmp: { value: 0 },   // cursor swirl/aura strength (ramps in on first move)
  uKanjiGlow: { value: 0 },  // scene-0 dreamy shimmer gate
  uHelixGlow: { value: 0 },  // scene-3 traveling light pulse gate
  uEarthCol: { value: 0 },   // scene-3 Earth colouring gate
  uMoon: { value: 0 },       // scene-5 blood-moon gate
  uShadowX: { value: 0 },    // scene-5 eclipse terminator (local x)
  uClockTime: { value: 0 },
}

const INTRO_CAM_Z = [11.5, 9.0, 6.2]

type EaseMode = "cubic" | "outQuart"

// ─────────────────────────────────────────────────────────────────────────────
// Shooting stars
// ─────────────────────────────────────────────────────────────────────────────
const STAR_COUNT = IS_MOBILE ? 3 : 6
const TRAIL = 26

function ShootingStars() {
  const stars = useMemo(() =>
    Array.from({ length: STAR_COUNT }, () => ({
      active: false,
      nextSpawn: 1 + Math.random() * 5,
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      speed: 0,
      life: 0,
      age: 0,
      gold: false,
    })), [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STAR_COUNT * TRAIL * 3), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(STAR_COUNT * TRAIL * 3), 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60)
    return geo
  }, [])

  useFrame((_, delta) => {
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute
    const colAttr = geometry.getAttribute("color") as THREE.BufferAttribute
    const pos = posAttr.array as Float32Array
    const col = colAttr.array as Float32Array

    for (let si = 0; si < STAR_COUNT; si++) {
      const star = stars[si]

      if (!star.active) {
        star.nextSpawn -= delta
        if (star.nextSpawn <= 0) {
          star.active = true
          star.age = 0
          star.life = 1.1 + Math.random() * 1.1
          star.speed = 7 + Math.random() * 6
          const fromLeft = Math.random() < 0.5
          star.pos.set(
            fromLeft ? -11 - Math.random() * 4 : 11 + Math.random() * 4,
            3.5 + Math.random() * 5,
            -4.5 - Math.random() * 5,
          )
          star.dir.set(
            fromLeft ? 1 : -1,
            -(0.35 + Math.random() * 0.3),
            (Math.random() - 0.5) * 0.2,
          ).normalize()
          star.gold = Math.random() < 0.25
        }
      } else {
        star.age += delta
        if (star.age >= star.life) {
          star.active = false
          star.nextSpawn = 1.5 + Math.random() * 6
        } else {
          star.pos.addScaledVector(star.dir, star.speed * delta)
        }
      }

      const lifeT = star.active ? star.age / star.life : 1
      const envelope = star.active
        ? Math.min(lifeT / 0.12, 1) * Math.min((1 - lifeT) / 0.25, 1)
        : 0

      for (let j = 0; j < TRAIL; j++) {
        const k = (si * TRAIL + j) * 3
        const back = j * 0.14
        pos[k] = star.pos.x - star.dir.x * back
        pos[k + 1] = star.pos.y - star.dir.y * back
        pos[k + 2] = star.pos.z - star.dir.z * back

        const headBoost = j === 0 ? 1.4 : 1
        const b = Math.pow(1 - j / TRAIL, 2.2) * envelope * headBoost
        if (star.gold) {
          col[k] = b * 0.95; col[k + 1] = b * 0.8; col[k + 2] = b * 0.58
        } else {
          col[k] = b; col[k + 1] = b; col[k + 2] = Math.min(1, b * 1.05)
        }
      }
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.055}
        vertexColors
        transparent
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Particle-only environment data
// ─────────────────────────────────────────────────────────────────────────────

// Scene 1: pedestal — static rings + animated ripple rings + light column dust
const PED_STATIC = 700
const RIPPLE_RINGS = 2
const RIPPLE_PTS = 360
const COLUMN_DUST = 320

function genPedestal(): Float32Array {
  const pos = new Float32Array(PED_STATIC * 3)
  for (let i = 0; i < PED_STATIC; i++) {
    const ring = i % 2 === 0 ? 1.5 : 2.2
    const a = Math.random() * Math.PI * 2
    pos[i * 3] = Math.cos(a) * ring + (Math.random() - 0.5) * 0.02
    pos[i * 3 + 1] = FLOOR_Y + (Math.random() - 0.5) * 0.01
    pos[i * 3 + 2] = Math.sin(a) * ring + (Math.random() - 0.5) * 0.02
  }
  return pos
}

function genColumnDust(): Float32Array {
  const pos = new Float32Array(COLUMN_DUST * 3)
  for (let i = 0; i < COLUMN_DUST; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.pow(Math.random(), 0.5) * 1.3
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = FLOOR_Y + 0.1 + Math.random() * 5.6
    pos[i * 3 + 2] = Math.sin(a) * r
  }
  return pos
}

// Scene 2: particle block swarm
const BLOCK_COUNT = 30
const BLOCK_PTS = 110
type Block = {
  start: THREE.Vector3
  end: THREE.Vector3
  phase: number
  cycle: number
}
function makeBlocks(): { blocks: Block[]; local: Float32Array } {
  const blocks: Block[] = []
  const local = new Float32Array(BLOCK_COUNT * BLOCK_PTS * 3)
  const bs = 0.13
  const cubeEdges: number[][][] = [
    [[-bs,-bs,-bs],[bs,-bs,-bs]], [[bs,-bs,-bs],[bs,-bs,bs]], [[bs,-bs,bs],[-bs,-bs,bs]], [[-bs,-bs,bs],[-bs,-bs,-bs]],
    [[-bs,bs,-bs],[bs,bs,-bs]],   [[bs,bs,-bs],[bs,bs,bs]],   [[bs,bs,bs],[-bs,bs,bs]],   [[-bs,bs,bs],[-bs,bs,-bs]],
    [[-bs,-bs,-bs],[-bs,bs,-bs]], [[bs,-bs,-bs],[bs,bs,-bs]],  [[bs,-bs,bs],[bs,bs,bs]],   [[-bs,-bs,bs],[-bs,bs,bs]],
  ]
  for (let b = 0; b < BLOCK_COUNT; b++) {
    const sp = onSphere(6.5 + Math.random() * 2, 0)
    const face = Math.floor(Math.random() * 6)
    const u = (Math.random() * 2 - 1) * 1.8
    const v = (Math.random() * 2 - 1) * 1.8
    const s = 1.8
    let end: [number, number, number]
    if (face === 0) end = [s, u, v]
    else if (face === 1) end = [-s, u, v]
    else if (face === 2) end = [u, s, v]
    else if (face === 3) end = [u, -s, v]
    else if (face === 4) end = [u, v, s]
    else end = [u, v, -s]
    blocks.push({
      start: new THREE.Vector3(...sp),
      end: new THREE.Vector3(...end),
      phase: Math.random(),
      cycle: 3.5 + Math.random() * 2,
    })
    for (let j = 0; j < BLOCK_PTS; j++) {
      const e = cubeEdges[j % cubeEdges.length]
      const p = onLine(e[0], e[1], 0.008)
      const k = (b * BLOCK_PTS + j) * 3
      local[k] = p[0]; local[k + 1] = p[1]; local[k + 2] = p[2]
    }
  }
  return { blocks, local }
}

// Scene 5: sea + city lights + particle orbits
const SEA_COLS = 64
const SEA_ROWS = 36
function genSea(): Float32Array {
  const pos = new Float32Array(SEA_COLS * SEA_ROWS * 3)
  let i = 0
  for (let r = 0; r < SEA_ROWS; r++) {
    for (let c = 0; c < SEA_COLS; c++) {
      pos[i * 3] = (c / (SEA_COLS - 1) - 0.5) * 28
      pos[i * 3 + 1] = -2.9
      pos[i * 3 + 2] = -2 - (r / (SEA_ROWS - 1)) * 14
      i++
    }
  }
  return pos
}

function genCityLights(count: number): Float32Array {
  const pos = new Float32Array(count * 3)
  const centers: [number, number, number][] = []
  for (let c = 0; c < 14; c++) centers.push(onSphere(1, 0))
  const R = 2.34
  for (let i = 0; i < count; i++) {
    const c = centers[Math.floor(Math.random() * centers.length)]
    const v = new THREE.Vector3(
      c[0] + (Math.random() - 0.5) * 0.35,
      c[1] + (Math.random() - 0.5) * 0.35,
      c[2] + (Math.random() - 0.5) * 0.35,
    ).normalize().multiplyScalar(R)
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z
  }
  return pos
}

const ORBIT_PTS = 500
function genOrbit(radius: number): Float32Array {
  const pos = new Float32Array(ORBIT_PTS * 3)
  for (let i = 0; i < ORBIT_PTS; i++) {
    const a = (i / ORBIT_PTS) * Math.PI * 2
    pos[i * 3] = Math.cos(a) * radius
    pos[i * 3 + 1] = Math.sin(a) * radius
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.01
  }
  return pos
}

// ─────────────────────────────────────────────────────────────────────────────
// Particles + particle environments
// ─────────────────────────────────────────────────────────────────────────────
function Particles({ started, skipIntro }: { started: boolean; skipIntro?: boolean }) {
  const { camera } = useThree()
  const pointsRef = useRef<THREE.Points>(null!)
  const ring1Ref = useRef<THREE.Mesh>(null!)
  const ring2Ref = useRef<THREE.Mesh>(null!)

  const env1Ref = useRef<THREE.Group>(null!)
  const env2Ref = useRef<THREE.Group>(null!)
  const env5Ref = useRef<THREE.Group>(null!)
  const rippleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RIPPLE_RINGS * RIPPLE_PTS * 3), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(RIPPLE_RINGS * RIPPLE_PTS * 3), 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, FLOOR_Y, 0), 10)
    return geo
  }, [])
  const pedestalGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(genPedestal(), 3))
    return geo
  }, [])
  const dustGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(genColumnDust(), 3))
    return geo
  }, [])
  const blockData = useMemo(() => makeBlocks(), [])
  const blockGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BLOCK_COUNT * BLOCK_PTS * 3), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(BLOCK_COUNT * BLOCK_PTS * 3), 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 15)
    return geo
  }, [])
  const seaGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(genSea(), 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -3, -9), 30)
    return geo
  }, [])
  const cityGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(genCityLights(240), 3))
    return geo
  }, [])
  const orbit1Geo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(genOrbit(3.05), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ORBIT_PTS * 3), 3))
    return geo
  }, [])
  const orbit2Geo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(genOrbit(3.65), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ORBIT_PTS * 3), 3))
    return geo
  }, [])
  const cityRef = useRef<THREE.Points>(null!)

  // Morph targets — brain slot replaced asynchronously by the GLB sample
  const brainFallback = useMemo(() => genBrainFallback(), [])
  const brainNrmRef = useRef<Float32Array>(brainFallback.nrm)
  const cityBlocks = useMemo(() => buildCityBlocks(), [])
  const saturn = useMemo(() => genSaturn(), [])
  const targetsRef = useRef<Float32Array[]>([])
  if (targetsRef.current.length === 0) {
    targetsRef.current = [
      genKanji(), genDiamond(), genMetropolis(cityBlocks),
      saturn.pos, brainFallback.pos, genMoon(), genGlobe(),
    ]
  }
  const introShapes = useMemo(() => ({
    core: genCore(), burst: genBurst(), vortex: genVortex(),
  }), [])

  // Load + sample the real brain model
  useEffect(() => {
    let cancelled = false
    const loader = new GLTFLoader()
    loader.load(
      "/models/brain.glb",
      (gltf) => {
        if (cancelled) return
        // yaw 0 keeps the model's default lateral profile facing the camera
        const sampled = sampleGLB(gltf.scene, 3.7, 0)
        targetsRef.current[4] = sampled.pos
        brainNrmRef.current = sampled.nrm
        const aNrm = geometry.getAttribute("aNrm") as THREE.BufferAttribute
        ;(aNrm.array as Float32Array).set(sampled.nrm)
        aNrm.needsUpdate = true
        const m = morph.current
        if (m.introPhase === 3 && m.scene === 4) {
          geometry.userData.appliedScene = -1 // force re-apply on next frame
        }
      },
      undefined,
      () => { /* keep procedural fallback on failure */ },
    )
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the Earth out of light: once the texture loads, re-place each planet
  // particle onto the bright parts of the world map (land, cloud, ice) so the
  // continents emerge as dense glowing constellations, and colour each particle
  // by the pixel under it. Mirrors the async brain-GLB swap.
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const W = img.naturalWidth, H = img.naturalHeight
      const cv = document.createElement("canvas")
      cv.width = W; cv.height = H
      const ctx = cv.getContext("2d")
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      let data: Uint8ClampedArray
      try { data = ctx.getImageData(0, 0, W, H).data } catch { return }
      const earthPos = targetsRef.current[3]
      if (!earthPos) return
      const TWO_PI = Math.PI * 2
      const surface = PARTICLE_COUNT - Math.floor(PARTICLE_COUNT * AMBIENT_RATIO)
      const at = (theta: number, phi: number) => {
        const px = Math.min(W - 1, Math.max(0, Math.floor((theta / TWO_PI) * W)))
        const py = Math.min(H - 1, Math.max(0, Math.floor((phi / Math.PI) * H)))
        return (py * W + px) * 4
      }
      const lumAt = (theta: number, phi: number) => {
        const di = at(theta, phi)
        return (0.299 * data[di] + 0.587 * data[di + 1] + 0.114 * data[di + 2]) / 255
      }
      for (let i = 0; i < surface; i++) {
        const x0 = earthPos[i * 3], y0 = earthPos[i * 3 + 1], z0 = earthPos[i * 3 + 2]
        if (Math.hypot(x0, y0, z0) > EARTH_R_MAX) continue // ring / ambient — leave it
        // importance-sample a direction: mostly weighted toward bright land &
        // cloud; some uniform so the ocean sphere still faintly reads.
        let theta = Math.random() * TWO_PI
        let phi = Math.acos(2 * Math.random() - 1)
        // strongly cluster onto bright land / cloud / ice; only a few land on
        // the dark ocean, so continents read as dense glowing constellations
        if (Math.random() < 0.88) {
          let tries = 0
          while (Math.random() > lumAt(theta, phi) && tries < 24) {
            theta = Math.random() * TWO_PI
            phi = Math.acos(2 * Math.random() - 1)
            tries++
          }
        }
        const r = EARTH_R + (Math.random() - 0.5) * 0.05
        earthPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
        earthPos[i * 3 + 1] = r * Math.cos(phi)
        earthPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
        const di = at(theta, phi)
        let R = data[di] / 255, G = data[di + 1] / 255, B = data[di + 2] / 255
        const l = 0.3 * R + 0.59 * G + 0.11 * B
        const S = 1.7 // saturate so oceans read blue and land green under bloom
        R = l + (R - l) * S; G = l + (G - l) * S; B = l + (B - l) * S
        earthColors[i * 3]     = Math.max(0, Math.min(1, R * 2.1 + 0.12))
        earthColors[i * 3 + 1] = Math.max(0, Math.min(1, G * 2.3 + 0.18))
        earthColors[i * 3 + 2] = Math.max(0, Math.min(1, B * 2.6 + 0.30))
      }
      const aColor = geometry.getAttribute("aColor") as THREE.BufferAttribute
      aColor.needsUpdate = true
      const m = morph.current
      if (m.introPhase === 3 && m.scene === 3) geometry.userData.appliedScene = -1
    }
    img.src = "/textures/earth.jpg"
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-sample the 兆 once the brush webfont's glyph is ready. The first
  // genKanji() runs before the font loads (serif fallback); this swaps the
  // brush-shaped target in. If the 兆 is already on screen it re-morphs into it.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return
    let cancelled = false
    document.fonts.load(`260px '${BRUSH_FAMILY}'`, "兆").then(() => {
      if (cancelled) return
      const brush = genKanji()
      targetsRef.current[0] = brush
      const m = morph.current
      if (m.introPhase === 3 && m.scene === 0) {
        // Resting on the 兆 — force the scene-sync to re-morph into the brush form.
        geometry.userData.appliedScene = -1
      } else if (m.snapped && geometry.userData.appliedScene === 0) {
        // Intro already snapped the fallback 兆 in while faded — swap arrays in place.
        const aFrom = geometry.getAttribute("aFrom") as THREE.BufferAttribute
        const aTo = geometry.getAttribute("aTo") as THREE.BufferAttribute
        ;(aFrom.array as Float32Array).set(brush)
        ;(aTo.array as Float32Array).set(brush)
        aFrom.needsUpdate = true
        aTo.needsUpdate = true
      }
    }).catch(() => { /* keep serif fallback */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const randoms = useMemo(() => {
    const r = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < r.length; i++) r[i] = Math.random()
    return r
  }, [])

  // Per-particle colour, used only on scene 3 (the Earth). Starts white; the
  // Earth particles are painted from the texture once it loads.
  const earthColors = useMemo(() => {
    const c = new Float32Array(PARTICLE_COUNT * 3)
    c.fill(1)
    return c
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const core = introShapes.core
    geo.setAttribute("position", new THREE.BufferAttribute(core.slice(), 3))
    geo.setAttribute("aFrom", new THREE.BufferAttribute(core.slice(), 3))
    geo.setAttribute("aTo", new THREE.BufferAttribute(core.slice(), 3))
    geo.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 3))
    geo.setAttribute("aNrm", new THREE.BufferAttribute(brainFallback.nrm.slice(), 3))
    geo.setAttribute("aGearCenter", new THREE.BufferAttribute(saturn.centers, 3))
    geo.setAttribute("aGearSpeed", new THREE.BufferAttribute(saturn.speeds, 1))
    geo.setAttribute("aColor", new THREE.BufferAttribute(earthColors, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 30)
    return geo
  }, [introShapes, randoms, brainFallback, saturn, earthColors])

  // Module-stable uniforms + imperative material: R3F clones uniforms passed
  // through JSX props, so the GPU would otherwise animate a stale copy while
  // we update ours. Constructing the material ourselves guarantees identity.
  const uniforms = MODULE_UNIFORMS
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: MODULE_UNIFORMS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const morph = useRef({
    progress: 1,
    dur: 2.2,
    ease: "cubic" as EaseMode,
    stagger: 0.6,
    scene: 0,
    introPhase: -1,
    burstStartTime: -1,
    rotY: 0,
    rotX: 0,
    rotZ: 0,
    dissolve: 0,      // phase-2 cross-dissolve progress (vortex → 兆)
    snapped: false,   // whether 兆 positions have been swapped in (while faded)
  })

  const envLevels = useRef([0, 0, 0, 0, 0, 0])
  const eclipseT = useRef(0) // scene-5 eclipse progress (0 = shadowed, 1 = emerged)

  const tmpVec = useMemo(() => new THREE.Vector3(), [])

  // Cursor ripple tracking (brightness only — never moves particles)
  const mousePlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), [])
  const mouseWorld = useMemo(() => new THREE.Vector3(999, 999, 999), [])
  const pointerMoved = useRef(false)
  // Timestamp of the last real pointer move. The cursor swirl only acts while
  // the pointer is actively moving and relaxes when it rests — otherwise a
  // cursor parked over the 兆 would hold those particles permanently deformed.
  const lastMoveTime = useRef(-1)
  useEffect(() => {
    const onMove = () => {
      pointerMoved.current = true
      lastMoveTime.current = performance.now()
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [])

  // NOTE: writes through `geometry` directly (never via pointsRef) so a
  // not-yet-attached ref can never silently turn this into a no-op
  const retarget = (target: Float32Array, dur: number, ease: EaseMode, stagger: number) => {
    const m = morph.current
    const geo = geometry
    const aFrom = geo.getAttribute("aFrom") as THREE.BufferAttribute
    const aTo = geo.getAttribute("aTo") as THREE.BufferAttribute
    const fromArr = aFrom.array as Float32Array
    const toArr = aTo.array as Float32Array

    const easeFn = m.ease === "outQuart" ? easeOutQuart : easeInOutCubic
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const raw = Math.min(1, Math.max(0, m.progress * (1 + m.stagger) - randoms[i * 3] * m.stagger))
      const t = easeFn(raw)
      for (let c = 0; c < 3; c++) {
        const k = i * 3 + c
        fromArr[k] = fromArr[k] + (toArr[k] - fromArr[k]) * t
      }
    }
    toArr.set(target)
    aFrom.needsUpdate = true
    aTo.needsUpdate = true
    m.progress = 0
    m.dur = dur
    m.ease = ease
    m.stagger = stagger
    uniforms.uStagger.value = stagger
    uniforms.uEaseMode.value = ease === "outQuart" ? 1 : 0
  }
  const retargetRef = useRef<typeof retarget | null>(null)
  retargetRef.current = retarget

  // Intro kick-off. Always plays on a fresh mount; the introPhase guard keeps
  // it from restarting on re-renders. (Earlier this skipped the intro when a
  // module flag was set, but StrictMode's dev double-mount tripped that flag
  // and snapped straight to the formed kanji — the "messy on reload" bug.)
  useEffect(() => {
    const m = morph.current
    if (!started || m.introPhase !== -1) return
    // Deep-link / verification shortcut: snap straight to the target scene with
    // no intro animation. Normal visitors (no ?scene= param) never hit this.
    if (skipIntro) {
      const s = sceneStore.index
      m.introPhase = 3
      m.progress = 1
      m.dissolve = 1
      m.snapped = true
      m.scene = s
      const aFrom = geometry.getAttribute("aFrom") as THREE.BufferAttribute
      const aTo = geometry.getAttribute("aTo") as THREE.BufferAttribute
      ;(aFrom.array as Float32Array).set(targetsRef.current[s])
      ;(aTo.array as Float32Array).set(targetsRef.current[s])
      aFrom.needsUpdate = true
      aTo.needsUpdate = true
      uniforms.uProgress.value = 1
      geometry.userData.appliedScene = s
      camera.position.z = CAMERA[s].z
      return
    }
    m.introPhase = 0
    camera.position.z = INTRO_CAM_Z[0]
    retarget(introShapes.burst, 1.0, "outQuart", 0.12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  useFrame((state, delta) => {
    const m = morph.current
    const time = state.clock.elapsedTime
    uniforms.uTime.value = time

    if (m.introPhase !== -1 && m.progress < 1) {
      m.progress = Math.min(1, m.progress + delta / m.dur)
    }
    uniforms.uProgress.value = m.progress

    // Intro chain
    if (m.introPhase === 0 && m.progress >= 1) {
      m.introPhase = 1
      retarget(introShapes.vortex, 2.0, "cubic", 0.5)
    } else if (m.introPhase === 1 && m.progress >= 1) {
      // Enter the cross-dissolve: DON'T morph vortex→兆 (that "forming" is the
      // unwanted flash). Instead fade the vortex out, swap 兆 in while invisible,
      // fade it back in. Handled below via m.dissolve.
      m.introPhase = 2
      m.dissolve = 0
      m.snapped = false
    }

    // Phase 2: cross-dissolve (no visible morph). ~1.0s total.
    if (m.introPhase === 2) {
      m.dissolve = Math.min(1, m.dissolve + delta / 1.0)
      if (!m.snapped && m.dissolve >= 0.5) {
        // Swap to the 兆 while the cloud is faded to black — never seen forming
        const aFrom = geometry.getAttribute("aFrom") as THREE.BufferAttribute
        const aTo = geometry.getAttribute("aTo") as THREE.BufferAttribute
        ;(aFrom.array as Float32Array).set(targetsRef.current[0])
        ;(aTo.array as Float32Array).set(targetsRef.current[0])
        aFrom.needsUpdate = true
        aTo.needsUpdate = true
        uniforms.uProgress.value = 1
        m.progress = 1
        geometry.userData.appliedScene = 0
        m.rotZ = 0; m.rotY = 0; m.rotX = 0   // 兆 appears face-on
        m.snapped = true
      }
      if (m.dissolve >= 1) m.introPhase = 3
    }

    // Scene sync — keyed on the geometry itself so a freshly recreated
    // geometry (Fast Refresh) re-applies the current scene automatically
    if (m.introPhase === 3 && geometry.userData.appliedScene !== sceneStore.index) {
      m.scene = sceneStore.index
      geometry.userData.appliedScene = sceneStore.index
      retarget(targetsRef.current[m.scene], 1.1, "cubic", 0.3)
    }

    // Intro shockwaves
    if (m.introPhase >= 0 && m.burstStartTime < 0) m.burstStartTime = time
    if (ring1Ref.current && ring2Ref.current && m.burstStartTime >= 0) {
      const e1 = (time - m.burstStartTime) / 1.5
      const e2 = (time - m.burstStartTime - 0.18) / 1.7
      const r1 = ring1Ref.current, r2 = ring2Ref.current
      if (e1 < 1) {
        r1.visible = true
        const s = easeOutQuart(Math.max(0, e1)) * 10
        r1.scale.setScalar(Math.max(s, 0.001));
        (r1.material as THREE.MeshBasicMaterial).opacity = (1 - e1) * 0.5
      } else r1.visible = false
      if (e2 > 0 && e2 < 1) {
        r2.visible = true
        const s = easeOutQuart(e2) * 12
        r2.scale.setScalar(Math.max(s, 0.001));
        (r2.material as THREE.MeshBasicMaterial).opacity = (1 - e2) * 0.3
      } else r2.visible = false
    }

    // Turbulence + opacity
    let noiseTarget = 0.022
    if (m.introPhase === 0) noiseTarget = 0.5
    // Lively surge only while a scene is morphing; calm/crisp at rest
    else if (m.progress < 1) {
      noiseTarget = 0.022 + Math.sin(Math.PI * m.progress) * 0.3
    }
    uniforms.uNoiseAmp.value = THREE.MathUtils.lerp(uniforms.uNoiseAmp.value, noiseTarget, 0.08)

    if (m.introPhase === 0) {
      uniforms.uOpacity.value = 1.0
    } else if (m.introPhase === 2) {
      // V-shaped fade: 0.9 → 0 (vortex out) → 0.9 (兆 in)
      const d = m.dissolve
      uniforms.uOpacity.value = 0.9 * (d < 0.5 ? 1 - d / 0.5 : (d - 0.5) / 0.5)
    } else {
      uniforms.uOpacity.value = m.progress < 1
        ? 0.9 - Math.sin(Math.PI * m.progress) * 0.25
        : 0.9
    }

    // Scene-gated shader effects
    const ready = m.introPhase === 3 && m.progress > 0.6
    uniforms.uSweepAmp.value = THREE.MathUtils.lerp(uniforms.uSweepAmp.value, ready && m.scene === 1 ? 1 : 0, 0.04)
    uniforms.uSweepPos.value = -4 + ((time * 0.28) % 1) * 8
    // Waveform displacement retired (scene 3 is now gears) — keep uniform at 0
    uniforms.uWaveAmp.value = THREE.MathUtils.lerp(uniforms.uWaveAmp.value, 0, 0.04)
    uniforms.uFireAmp.value = THREE.MathUtils.lerp(uniforms.uFireAmp.value, ready && m.scene === 4 ? 0.4 : 0, 0.04)
    const rimOn = ready && m.scene === 4 ? 1 : 0
    uniforms.uRimAmp.value = THREE.MathUtils.lerp(uniforms.uRimAmp.value, rimOn, 0.05)
    uniforms.uRimGate.value = uniforms.uRimAmp.value
    // Brain spreads particles over a surface (not dense edges) → bump point
    // size on scene 4 so density lifts it above the bloom threshold
    uniforms.uSizeBoost.value = THREE.MathUtils.lerp(uniforms.uSizeBoost.value, m.scene === 4 ? 1.3 : m.scene === 3 ? 1.32 : 1, 0.05)
    // Scene 0: dreamy golden shimmer drifting across the 兆
    uniforms.uKanjiGlow.value = THREE.MathUtils.lerp(uniforms.uKanjiGlow.value, ready && m.scene === 0 ? 1 : 0, 0.04)
    uniforms.uHelixGlow.value = THREE.MathUtils.lerp(uniforms.uHelixGlow.value, ready && m.scene === 3 ? 1 : 0, 0.04)
    uniforms.uEarthCol.value = THREE.MathUtils.lerp(uniforms.uEarthCol.value, ready && m.scene === 3 ? 1 : 0, 0.06)
    // Scene 5: blood moon — fade in, and sweep the eclipse terminator across so
    // the moon emerges from shadow over ~7s.
    eclipseT.current = ready && m.scene === 5 ? Math.min(1, eclipseT.current + delta / 7) : 0
    uniforms.uMoon.value = THREE.MathUtils.lerp(uniforms.uMoon.value, ready && m.scene === 5 ? 1 : 0, 0.05)
    uniforms.uShadowX.value = THREE.MathUtils.lerp(MOON_C[0] + MOON_R + 0.6, MOON_C[0] - MOON_R - 0.6, eclipseT.current)

    // Clockwork time advances only on the gear scene (once settled), so the
    // gears spin up from rest and the morph in/out is never distorted
    if (ready && m.scene === 3) uniforms.uClockTime.value += delta
    else uniforms.uClockTime.value = 0

    // Cursor ripple: project the pointer onto the z=0 world plane and feed it
    // to the shader as a brightness source. Ramps in only after a real move
    // (so the phantom (0,0) cursor doesn't pulse the glyph centre on load).
    if (pointerMoved.current) {
      state.raycaster.setFromCamera(state.pointer, camera)
      if (state.raycaster.ray.intersectPlane(mousePlane, mouseWorld)) {
        uniforms.uMouse.value.copy(mouseWorld)
      }
      uniforms.uRippleAmp.value = THREE.MathUtils.lerp(uniforms.uRippleAmp.value, 0.65, 0.04)
      // Swirl displacement only while the pointer is actively moving; relax back
      // when it rests so a parked cursor never holds the 兆 deformed. The glyph
      // settles within ~0.4s of the cursor going still.
      const idle = performance.now() - lastMoveTime.current > 120
      uniforms.uMouseAmp.value = THREE.MathUtils.lerp(uniforms.uMouseAmp.value, idle ? 0 : 1, idle ? 0.1 : 0.18)
    }

    // Rotation
    const g = pointsRef.current
    if (m.introPhase === 1) {
      m.rotZ += delta * 1.15
      m.rotY = THREE.MathUtils.damp(m.rotY, 0, 2.5, delta)
      m.rotX = THREE.MathUtils.damp(m.rotX, -0.12, 2.5, delta)
    } else if (m.introPhase === 2 || (m.introPhase === 3 && m.scene === 0)) {
      // Keep 兆 essentially face-on — only a whisper of sway so it never skews
      // or looks broken. Depth is read via mouse parallax instead.
      m.rotZ = THREE.MathUtils.damp(m.rotZ, 0, 2.2, delta)
      m.rotY = THREE.MathUtils.damp(m.rotY, Math.sin(time * 0.14) * 0.05, 1.8, delta)
      m.rotX = THREE.MathUtils.damp(m.rotX, Math.sin(time * 0.1) * 0.025, 1.8, delta)
    } else if (m.introPhase === 3) {
      m.rotZ = THREE.MathUtils.damp(m.rotZ, 0, 2.2, delta)
      switch (m.scene) {
        case 1:
          m.rotY += delta * 0.12
          m.rotX = THREE.MathUtils.damp(m.rotX, Math.sin(time * 0.05) * 0.08, 2, delta)
          break
        case 2:
          // City of light: slow aerial orbit, fixed downward tilt to read depth
          m.rotY += delta * 0.05
          m.rotX = THREE.MathUtils.damp(m.rotX, 0.62, 2, delta)
          break
        case 3:
          // Saturn: planet + horizontal DNA ring, viewed from slightly above so
          // the ring reads as a shallow ellipse; the whole system turns slowly.
          m.rotY += delta * 0.12
          m.rotX = THREE.MathUtils.damp(m.rotX, 0.36, 2, delta)
          break
        case 4:
          // Sway around the lateral profile so the brain stays recognizable
          m.rotY = THREE.MathUtils.damp(m.rotY, Math.sin(time * 0.16) * 0.45, 1.6, delta)
          m.rotX = THREE.MathUtils.damp(m.rotX, Math.sin(time * 0.11) * 0.06, 2, delta)
          break
        case 5:
          // Blood moon: static and calm — barely a breath of drift.
          m.rotY = THREE.MathUtils.damp(m.rotY, 0, 2.5, delta)
          m.rotX = THREE.MathUtils.damp(m.rotX, 0, 2.5, delta)
          break
        case 6:
          m.rotY += delta * 0.3
          m.rotX = THREE.MathUtils.damp(m.rotX, 0.1, 2, delta)
          break
      }
    }
    g.rotation.y = m.rotY
    g.rotation.x = m.rotX
    g.rotation.z = m.rotZ

    // ── Environment crossfades. env2 (block swarm) retired with the cube;
    // scene 2 is now a self-contained stacked platform. ──
    const envRefs = [env1Ref, null, null, null, null, env5Ref]
    for (let e = 0; e < 6; e++) {
      const lv = envLevels.current
      const active = m.introPhase === 3 && m.scene === e + 1
      lv[e] = THREE.MathUtils.lerp(lv[e], active ? 1 : 0, 0.055)
      const group = envRefs[e]?.current
      if (!group) continue
      group.visible = lv[e] > 0.015
      if (group.visible) {
        group.traverse((o) => {
          const obj = o as THREE.Points
          if (obj.userData?.baseOpacity !== undefined && obj.material) {
            (obj.material as THREE.PointsMaterial).opacity = obj.userData.baseOpacity * lv[e]
          }
        })
      }
    }
    const lv = envLevels.current

    // Env 1: ripples expand along the floor; dust rises in the light column
    if (env1Ref.current?.visible) {
      const posAttr = rippleGeo.getAttribute("position") as THREE.BufferAttribute
      const colAttr = rippleGeo.getAttribute("color") as THREE.BufferAttribute
      const pa = posAttr.array as Float32Array
      const ca = colAttr.array as Float32Array
      for (let ring = 0; ring < RIPPLE_RINGS; ring++) {
        const prog = (time * 0.2 + ring / RIPPLE_RINGS) % 1
        const radius = 0.6 + prog * 4.2
        const bright = (1 - prog) * 0.55 * lv[0]
        for (let j = 0; j < RIPPLE_PTS; j++) {
          const k = (ring * RIPPLE_PTS + j) * 3
          const a = (j / RIPPLE_PTS) * Math.PI * 2
          pa[k] = Math.cos(a) * radius
          pa[k + 1] = FLOOR_Y
          pa[k + 2] = Math.sin(a) * radius
          ca[k] = bright; ca[k + 1] = bright; ca[k + 2] = bright
        }
      }
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true

      const dustAttr = dustGeo.getAttribute("position") as THREE.BufferAttribute
      const da = dustAttr.array as Float32Array
      for (let i = 0; i < COLUMN_DUST; i++) {
        da[i * 3 + 1] += delta * (0.1 + (i % 7) * 0.02)
        if (da[i * 3 + 1] > FLOOR_Y + 6) da[i * 3 + 1] = FLOOR_Y + 0.1
      }
      dustAttr.needsUpdate = true
    }

    // Env 2: particle blocks fly in and dissolve into the cube
    if (env2Ref.current?.visible) {
      const posAttr = blockGeo.getAttribute("position") as THREE.BufferAttribute
      const colAttr = blockGeo.getAttribute("color") as THREE.BufferAttribute
      const pa = posAttr.array as Float32Array
      const ca = colAttr.array as Float32Array
      const local = blockData.local
      for (let b = 0; b < BLOCK_COUNT; b++) {
        const blk = blockData.blocks[b]
        const t = ((time / blk.cycle) + blk.phase) % 1
        const ease = easeInOutCubic(t)
        tmpVec.lerpVectors(blk.start, blk.end, ease)
        const bright = Math.pow(Math.sin(Math.PI * Math.min(t * 1.15, 1)), 0.8) * 0.7 * lv[1]
        for (let j = 0; j < BLOCK_PTS; j++) {
          const k = (b * BLOCK_PTS + j) * 3
          pa[k] = tmpVec.x + local[k]
          pa[k + 1] = tmpVec.y + local[k + 1]
          pa[k + 2] = tmpVec.z + local[k + 2]
          ca[k] = bright; ca[k + 1] = bright; ca[k + 2] = bright
        }
      }
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    }

    // Env 5: sea waves, orbit satellites (brightness pulse), city follows globe
    if (env5Ref.current?.visible) {
      const seaAttr = seaGeo.getAttribute("position") as THREE.BufferAttribute
      const sa = seaAttr.array as Float32Array
      for (let i = 0; i < SEA_COLS * SEA_ROWS; i++) {
        const x = sa[i * 3]
        const z = sa[i * 3 + 2]
        sa[i * 3 + 1] = -2.9 + Math.sin(x * 0.55 + time * 0.9) * 0.12 + Math.sin(z * 0.7 - time * 0.6) * 0.1
      }
      seaAttr.needsUpdate = true

      // Orbit rings: a bright "satellite" pulse travels along each ring
      const updateOrbit = (geo: THREE.BufferGeometry, satAngle: number, baseB: number, goldRing: boolean) => {
        const colAttr = geo.getAttribute("color") as THREE.BufferAttribute
        const ca = colAttr.array as Float32Array
        for (let j = 0; j < ORBIT_PTS; j++) {
          const a = (j / ORBIT_PTS) * Math.PI * 2
          let dAng = Math.abs(a - (satAngle % (Math.PI * 2)))
          if (dAng > Math.PI) dAng = Math.PI * 2 - dAng
          const sat = Math.exp(-dAng * dAng * 60) * 1.2
          const b = (baseB + sat) * lv[4]
          if (goldRing) { ca[j * 3] = b * 0.95; ca[j * 3 + 1] = b * 0.8; ca[j * 3 + 2] = b * 0.58 }
          else { ca[j * 3] = b; ca[j * 3 + 1] = b; ca[j * 3 + 2] = b * 1.02 }
        }
        colAttr.needsUpdate = true
      }
      updateOrbit(orbit1Geo, time * 0.5, 0.12, false)
      updateOrbit(orbit2Geo, -time * 0.38 + 2, 0.09, true)

      if (cityRef.current) {
        cityRef.current.rotation.y = m.rotY
        cityRef.current.rotation.x = m.rotX
      }
    }

    // Camera
    let camZ: number, camY: number
    if (m.introPhase >= 0 && m.introPhase < 3) {
      camZ = INTRO_CAM_Z[m.introPhase]
      camY = 0
    } else {
      const cfg = CAMERA[m.scene]
      camZ = cfg.z
      camY = cfg.y
    }
    // Fit narrow/portrait viewports: fov is vertical, so a tall screen sees less
    // width and the form would crop on the sides. Pull back proportionally to
    // frame the same horizontal extent. Wide screens (aspect ≥ 1.15) unchanged.
    const aspect = state.size.width / Math.max(1, state.size.height)
    camZ *= Math.min(2.4, Math.max(1, 1.15 / aspect))
    const px = state.pointer.x * 0.45
    const py = camY + state.pointer.y * 0.3
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, px, 0.03)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, py, 0.03)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, camZ, 0.022)
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <primitive object={material} attach="material" />
      </points>

      {/* Intro shockwave rings (light, not solid geometry) */}
      <mesh ref={ring1Ref} visible={false}>
        <ringGeometry args={[0.97, 1.0, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ring2Ref} visible={false} rotation={[0.3, 0, 0]}>
        <ringGeometry args={[0.98, 1.0, 128]} />
        <meshBasicMaterial color="#c8ab82" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Env 1: pedestal (all particles) */}
      <group ref={env1Ref} visible={false}>
        <points geometry={pedestalGeo} userData={{ baseOpacity: 0.5 }}>
          <pointsMaterial color="#ffffff" size={0.016} transparent opacity={0} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
        <points geometry={rippleGeo}>
          <pointsMaterial vertexColors size={0.018} transparent opacity={1} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
        <points geometry={dustGeo} userData={{ baseOpacity: 0.5 }}>
          <pointsMaterial color="#fff4e0" size={0.014} transparent opacity={0} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>

      {/* Env 2: block swarm (all particles) */}
      <group ref={env2Ref} visible={false}>
        <points geometry={blockGeo}>
          <pointsMaterial vertexColors size={0.02} transparent opacity={1} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>

      {/* Env 5: sea, particle orbits, city lights (dawn-glow plane removed) */}
      <group ref={env5Ref} visible={false}>
        <points geometry={seaGeo} userData={{ baseOpacity: 0.35 }}>
          <pointsMaterial color="#7f8fa3" size={0.022} transparent opacity={0} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
        <points geometry={orbit1Geo} rotation={[1.25, 0, 0]}>
          <pointsMaterial vertexColors size={0.02} transparent opacity={1} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
        <points geometry={orbit2Geo} rotation={[1.9, 0.3, 0]}>
          <pointsMaterial vertexColors size={0.018} transparent opacity={1} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
        <points ref={cityRef} geometry={cityGeo} userData={{ baseOpacity: 0.85 }}>
          <pointsMaterial color="#c8ab82" size={0.03} transparent opacity={0} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────
export default function KizashiCanvas({ started, skipIntro }: { sceneIndex?: number; started: boolean; skipIntro?: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 11.5], fov: 55 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      dpr={IS_MOBILE ? [1, 1.4] : [1, 1.75]}
      style={{ background: "#060606" }}
    >
      <Particles started={started} skipIntro={skipIntro} />
      <ShootingStars />
      <EffectComposer>
        <Bloom
          intensity={0.55}
          luminanceThreshold={0.28}
          luminanceSmoothing={0.5}
          mipmapBlur
          radius={0.65}
        />
      </EffectComposer>
    </Canvas>
  )
}
