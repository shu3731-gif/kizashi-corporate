"use client"

import dynamic from "next/dynamic"
import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Volume2, VolumeX } from "lucide-react"
import { sceneStore } from "./components/sceneStore"

const KizashiCanvas = dynamic(() => import("./components/KizashiCanvas"), { ssr: false })

// ─────────────────────────────────────────────────────────────────────────────
// Scene data
// ─────────────────────────────────────────────────────────────────────────────
const SCENES = [
  {
    id: "00",
    code: "INTRO_KZ_00",
    en: "Kizashi Inc.",
    ja: "兆し",
    desc: null,
    stat1: null,
    stat2: null,
  },
  {
    id: "01",
    code: "SERVICE_KZ_01",
    en: "Brand Development",
    ja: "ブランドサイト制作",
    desc: "戦略から実装まで一貫して担当。\n市場での存在感を確立するデジタル体験を構築。",
    stat1: "SCOPE / FULL-STACK BRAND",
    stat2: "01 — FORM: PRISM",
  },
  {
    id: "02",
    code: "SERVICE_KZ_02",
    en: "Commerce",
    ja: "ECサイト制作",
    desc: "コンバージョン最大化を軸に設計した高性能ストア。\n拡張性と速度を両立したアーキテクチャ。",
    stat1: "SCOPE / EC & PLATFORM",
    stat2: "02 — FORM: PLATFORM",
  },
  {
    id: "03",
    code: "SERVICE_KZ_03",
    en: "Workflow Intelligence",
    ja: "業務効率化推進",
    desc: "社内オペレーションを解析し、摩擦を除去。\nアウトプットの質とスピードを根本から変える。",
    stat1: "SCOPE / OPS & SYSTEMS",
    stat2: "03 — FORM: DOUBLE HELIX",
  },
  {
    id: "04",
    code: "SERVICE_KZ_04",
    en: "AI Integration",
    ja: "AI活用推進",
    desc: "次世代AIをプロダクトとプロセスに組み込む。\n競合が気づく前に、先手を打つ。",
    stat1: "SCOPE / AI & AUTOMATION",
    stat2: "04 — FORM: CORTEX",
  },
  {
    id: "05",
    code: "MESSAGE_KZ_05",
    en: "Message",
    ja: "想い",
    desc: null,
    stat1: null,
    stat2: null,
  },
  {
    id: "06",
    code: "CONTACT_KZ_06",
    en: "Contact",
    ja: "次の一手を、一緒に考えよう。",
    desc: null,
    stat1: "hello@kizashi.inc",
    stat2: "© 2026 Kizashi Inc.",
  },
]

// 創業者メッセージ（デモ・後で差し替え）。署名は毛筆体（Yuji Syuku）。
const FOUNDERS = [
  {
    name: "渡辺 洲",
    lines: [
      "私たちは「兆し」という名に、ひとつの信念を込めました。",
      "どんな大きな変化も、はじまりは小さな予兆にすぎない。",
      "その兆しを誰よりも早く捉え、確かな形にする——それが私たちの仕事です。",
    ],
  },
  {
    name: "田中 凌",
    lines: [
      "テクノロジーはあくまで手段。目的は、人の挑戦を一歩前へ進めること。",
      "お客様が見ている景色の、さらに先を一緒に描く。",
      "Kizashi は、そんな伴走者でありたいと願っています。",
    ],
  },
]

const TOTAL = SCENES.length

const BOOT_LINES = [
  "> KIZASHI ENGINE v2.6.0",
  "> ALLOCATING 20,000 PARTICLES ... OK",
  "> COMPILING GLSL SHADERS ... OK",
  "> LINKING SIMPLEX NOISE FIELD ... OK",
  "> CALIBRATING GRAVITY WELL ... OK",
  "> SIGNAL DETECTED —",
]

// Intro timeline: burst 1.0s + vortex 2.0s + 兆 resolve 0.9s + margin
const INTRO_TOTAL_MS = 4300

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  // Deep-link / verification shortcut: ?scene=N jumps straight to a scene with
  // no boot/intro. Parsed once at mount; absent for normal visitors.
  const deepLink = (() => {
    if (typeof window === "undefined") return null
    const p = new URLSearchParams(window.location.search).get("scene")
    if (p === null) return null
    const n = parseInt(p, 10)
    return Number.isFinite(n) && n >= 0 && n < TOTAL ? n : null
  })()
  const skipIntro = deepLink !== null
  if (skipIntro) sceneStore.index = deepLink

  const [scene, setScene] = useState(deepLink ?? 0)
  const [muted, setMuted] = useState(true)
  const [transitioning, setTransitioning] = useState(false)
  const [progress, setProgress] = useState(skipIntro ? 100 : 0)
  const [bootLine, setBootLine] = useState(0)
  const [loaded, setLoaded] = useState(skipIntro)
  const [introDone, setIntroDone] = useState(skipIntro)

  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null)

  // ── Boot sequence ──
  // setInterval (fires reliably even when the heavy canvas is busy) but the
  // progress is derived from elapsed wall-clock, not incremented per tick — so
  // a throttled interval still completes in a steady ~2.4s instead of dragging.
  useEffect(() => {
    if (skipIntro) return
    const DURATION = 2400
    const start = Date.now()
    const iv = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION)
      const eased = 1 - Math.pow(1 - t, 2) // ease-out
      setProgress(Math.floor(eased * 100))
      setBootLine(Math.min(BOOT_LINES.length, Math.floor(t * BOOT_LINES.length) + 1))
      if (t >= 1) {
        clearInterval(iv)
        setTimeout(() => setLoaded(true), 320)
      }
    }, 50)
    return () => clearInterval(iv)
  }, [])

  // ── Intro completion timer ──
  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => setIntroDone(true), INTRO_TOTAL_MS)
    return () => clearTimeout(t)
  }, [loaded])

  // ── Navigation ──
  const goTo = useCallback((next: number) => {
    if (transitioning || !introDone) return
    const clamped = Math.max(0, Math.min(TOTAL - 1, next))
    if (clamped === scene) return
    setTransitioning(true)
    sceneStore.index = clamped
    setScene(clamped)
    setTimeout(() => setTransitioning(false), 700)
  }, [scene, transitioning, introDone])

  const prev = useCallback(() => goTo(scene - 1), [scene, goTo])
  const next = useCallback(() => goTo(scene + 1), [scene, goTo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") next()
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev])

  useEffect(() => {
    let last = 0
    const onWheel = (e: WheelEvent) => {
      const now = Date.now()
      // 1300ms cooldown: trackpad momentum keeps emitting events for over a
      // second after a swipe — without this one swipe advances two scenes
      if (now - last < 1300) return
      if (Math.abs(e.deltaY) < 40) return
      last = now
      if (e.deltaY > 0) next()
      else prev()
    }
    window.addEventListener("wheel", onWheel, { passive: true })
    return () => window.removeEventListener("wheel", onWheel)
  }, [next, prev])

  useEffect(() => {
    let startY = 0
    const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY }
    const onEnd = (e: TouchEvent) => {
      const diff = startY - e.changedTouches[0].clientY
      if (Math.abs(diff) > 50) (diff > 0 ? next() : prev())
    }
    window.addEventListener("touchstart", onStart, { passive: true })
    window.addEventListener("touchend", onEnd, { passive: true })
    return () => {
      window.removeEventListener("touchstart", onStart)
      window.removeEventListener("touchend", onEnd)
    }
  }, [next, prev])

  // ── Ambient sound drone ──
  const toggleSound = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    if (!nextMuted) {
      if (!audio.current) {
        const ctx = new AudioContext()
        const gain = ctx.createGain()
        gain.gain.value = 0
        const filter = ctx.createBiquadFilter()
        filter.type = "lowpass"
        filter.frequency.value = 240
        const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 55
        const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 55.6
        const o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = 110.4
        const g3 = ctx.createGain(); g3.gain.value = 0.22
        o1.connect(filter); o2.connect(filter)
        o3.connect(g3); g3.connect(filter)
        filter.connect(gain); gain.connect(ctx.destination)
        o1.start(); o2.start(); o3.start()
        audio.current = { ctx, gain }
      }
      audio.current.ctx.resume()
      audio.current.gain.gain.setTargetAtTime(0.05, audio.current.ctx.currentTime, 0.8)
    } else if (audio.current) {
      audio.current.gain.gain.setTargetAtTime(0, audio.current.ctx.currentTime, 0.35)
    }
  }

  const s = SCENES[scene]
  const isIntro = scene === 0
  const isContact = scene === TOTAL - 1
  const isMessage = s.code.startsWith("MESSAGE")

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#060606] text-white select-none">

      {/* ── 3D Canvas ── */}
      <div className="absolute inset-0 z-0">
        <KizashiCanvas sceneIndex={scene} started={loaded} skipIntro={skipIntro} />
      </div>

      {/* ── Vignette ── */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.5) 100%)" }}
      />

      {/* ── Film grain ── */}
      <div
        className="absolute inset-0 z-[6] pointer-events-none opacity-[0.045] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Boot / loading overlay ── */}
      <AnimatePresence>
        {!loaded && (
          <motion.div
            key="loader"
            exit={{ opacity: 0 }}
            transition={{ duration: 1.0, ease: "easeInOut" }}
            className="absolute inset-0 z-50 bg-[#060606] flex items-center justify-center"
          >
            <div className="w-[300px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-white/45 mb-7">
                Kizashi Inc.
              </p>
              <div className="h-[110px] mb-6">
                {BOOT_LINES.slice(0, bootLine).map((line, i) => (
                  <p key={i} className="font-mono text-[9px] leading-[1.9] tracking-[0.12em] text-white/30">
                    {line}
                    {i === BOOT_LINES.length - 1 && (
                      <span className="text-[#c8ab82]/70"> 兆</span>
                    )}
                  </p>
                ))}
              </div>
              <div className="h-px bg-white/10 relative overflow-hidden mb-3">
                <div
                  className="absolute inset-y-0 left-0 bg-white/60 transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="font-mono text-[9px] tracking-[0.3em] text-white/25 text-right">
                {String(progress).padStart(3, "0")} %
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── UI Layer ── */}
      {loaded && (
        <div className="absolute inset-0 z-10 pointer-events-none">

          {/* TOP-LEFT: Logo */}
          <div className="absolute top-6 left-5 md:top-12 md:left-14 pointer-events-auto">
            <AnimatePresence mode="wait">
              {isIntro ? (
                <motion.div
                  key="intro-logo"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 3.4 }}
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-white/28 mb-1.5">
                    // Copyright © 2026
                  </p>
                  <h1 className="text-[22px] font-semibold tracking-tight leading-none">
                    Kizashi
                  </h1>
                  <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/22 mt-1.5">
                    Inc. — All Rights Reserved.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="scene-logo"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <p
                    className="font-mono text-[11px] font-semibold tracking-tight text-white/70 cursor-pointer hover:text-white transition-colors"
                    onClick={() => goTo(0)}
                  >
                    Kizashi
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* TOP-RIGHT: Manifesto / scene code */}
          <div className="absolute top-6 right-5 md:top-12 md:right-14 text-right">
            <AnimatePresence mode="wait">
              {isIntro ? (
                <motion.div
                  key="manifesto"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 3.7 }}
                  className="hidden md:block max-w-[240px]"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-white/28 mb-3">
                    ////// Manifesto
                  </p>
                  <p className="font-mono text-[11px] leading-[1.9] text-white/28">
                    We build digital experiences<br />
                    that signal what comes next —<br />
                    branding, commerce,<br />
                    intelligence, and the tools<br />
                    that make it real.
                  </p>
                </motion.div>
              ) : (
                <motion.p
                  key={`code-${scene}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/25"
                >
                  {s.code}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Service scene content */}
          <AnimatePresence mode="wait">
            {!isIntro && !isContact && !isMessage && (
              <motion.div
                key={`content-${scene}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
                className="absolute left-5 right-5 md:right-auto md:left-14 bottom-28 md:bottom-40 w-auto md:w-[360px]"
              >
                <div className="relative px-5 py-5">
                  {/* HUD corner brackets */}
                  <span aria-hidden className="absolute top-0 left-0 h-3 w-3 border-t border-l border-white/35" />
                  <span aria-hidden className="absolute top-0 right-0 h-3 w-3 border-t border-r border-white/35" />
                  <span aria-hidden className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-white/35" />
                  <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-white/35" />

                  <div className="flex items-center justify-between mb-4">
                    <p className="font-mono text-[8px] uppercase tracking-[0.28em] text-[#c8ab82]/70">
                      {s.code}
                    </p>
                    <p className="font-mono text-[8px] uppercase tracking-[0.28em] text-white/25">
                      {s.stat1}
                    </p>
                  </div>

                  <h2 className="text-[26px] md:text-[30px] font-light tracking-tight leading-[1.15] mb-1">
                    {s.en}
                  </h2>
                  <p className="font-mono text-[10px] tracking-[0.3em] text-white/35 mb-4">
                    {s.ja}
                  </p>

                  <div className="h-px w-full bg-gradient-to-r from-white/20 to-transparent mb-4" aria-hidden />

                  <p className="font-mono text-[10.5px] leading-[1.9] text-white/40 whitespace-pre-line mb-5">
                    {s.desc}
                  </p>

                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#c8ab82]/55">
                      {s.stat2}
                    </p>
                    <p className="font-mono text-[9px] tracking-[0.2em] text-white/20">
                      0{scene} ▸
                    </p>
                  </div>
                </div>

                {/* Connector line pointing toward the 3D form */}
                <div aria-hidden className="absolute top-1/2 left-full hidden md:flex items-center">
                  <div className="h-1 w-1 rounded-full bg-white/45" />
                  <div className="h-px w-24 bg-gradient-to-r from-white/30 to-transparent" />
                </div>
              </motion.div>
            )}

            {isMessage && (
              <motion.div
                key="message"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                className="absolute left-5 right-5 md:left-auto md:right-14 bottom-28 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:max-w-[480px] pointer-events-auto"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/30 mb-7 md:mb-9">
                  // Message
                </p>
                <div className="space-y-8 md:space-y-11">
                  {FOUNDERS.map((f, fi) => (
                    <motion.div
                      key={f.name}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.7 + fi * 0.3 }}
                    >
                      {f.lines.map((ln, li) => (
                        <p key={li} className="text-[12px] md:text-[13px] leading-[1.95] text-white/55">
                          {ln}
                        </p>
                      ))}
                      <p
                        className="mt-3 text-[30px] md:text-[36px] text-white/90 leading-none"
                        style={{ fontFamily: "'Yuji Mai', serif" }}
                      >
                        {f.name}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {isContact && (
              <motion.div
                key="contact"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                className="absolute left-5 right-5 md:right-auto md:left-14 top-1/2 -translate-y-1/2 max-w-lg pointer-events-auto"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/28 mb-6">
                  // 005 — Contact
                </p>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.08] mb-3">
                  次の一手を、
                </h2>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.08] text-white/22 mb-12">
                  一緒に考えよう。
                </h2>
                <a
                  href="mailto:hello@kizashi.inc"
                  className="inline-flex items-center gap-3 border border-white/14 px-7 py-3.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45 hover:border-white/35 hover:text-white transition-all duration-500"
                >
                  hello@kizashi.inc →
                </a>
                <div className="mt-8 flex gap-6">
                  {["X", "LinkedIn", "Note"].map(sns => (
                    <a key={sns} href="#" className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/22 hover:text-white/60 transition-colors">
                      {sns}
                    </a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Intro tagline */}
          <AnimatePresence>
            {isIntro && (
              <motion.div
                key="tagline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, delay: 4.0 }}
                className="absolute left-1/2 -translate-x-1/2 bottom-36 md:bottom-44 text-center"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.55em] text-white/20">
                  // The first sign of what's coming
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* BOTTOM-LEFT: Scroll hint + sound */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, delay: 4.2 }}
            className="absolute bottom-6 left-5 md:bottom-12 md:left-14 flex items-end gap-6 pointer-events-auto"
          >
            <AnimatePresence>
              {isIntro && (
                <motion.div
                  key="scroll-hint"
                  exit={{ opacity: 0 }}
                  className="hidden md:flex items-center gap-3"
                >
                  <div className="h-9 w-px bg-white/18" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-white/28">
                    Scroll down to discover.
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={toggleSound}
              className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-white/25 hover:text-white/50 transition-colors"
            >
              {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
              Sound: {muted ? "Off" : "On"}
            </button>
          </motion.div>

          {/* BOTTOM-RIGHT: counter */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.0, delay: 4.2 }}
            className="absolute bottom-6 right-5 md:bottom-12 md:right-14"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={scene}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4 }}
                className="font-mono text-[9px] tracking-[0.2em] text-white/18"
              >
                0{scene + 1} / 0{TOTAL}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          {/* BOTTOM-CENTER: nav */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, delay: 4.4 }}
            className="absolute bottom-16 md:bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto"
          >
            <div className="flex items-center gap-3 md:gap-5">
              {SCENES.map((sc, i) => (
                <button
                  key={sc.id}
                  onClick={() => goTo(i)}
                  className={`font-mono text-[8px] uppercase tracking-[0.25em] transition-all duration-400 ${
                    i === scene
                      ? "text-white/70 border-b border-white/40 pb-0.5"
                      : "text-white/18 hover:text-white/40"
                  }`}
                >
                  {i === 0 ? "Intro" : i === TOTAL - 1 ? "Contact" : sc.code.startsWith("MESSAGE") ? "想い" : `0${i}`}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Arrows */}
          {introDone && scene > 0 && (
            <button
              onClick={prev}
              aria-label="Previous scene"
              className="pointer-events-auto absolute left-6 top-1/2 -translate-y-1/2 font-mono text-base text-white/22 hover:text-white/55 transition-all duration-300 hover:-translate-x-1"
            >
              └─
            </button>
          )}
          {introDone && scene < TOTAL - 1 && (
            <button
              onClick={next}
              aria-label="Next scene"
              className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2 font-mono text-base text-white/22 hover:text-white/55 transition-all duration-300 hover:translate-x-1"
            >
              ─┘
            </button>
          )}

        </div>
      )}
    </div>
  )
}
