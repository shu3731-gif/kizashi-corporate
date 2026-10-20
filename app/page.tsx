"use client"

import dynamic from "next/dynamic"
import { Component, useState, useEffect, useRef, useCallback, type ReactNode } from "react"
import { motion, AnimatePresence, MotionConfig } from "framer-motion"
import { ArrowUpRight, ArrowRight, ArrowLeft, ArrowDown, Volume2, VolumeX, Pause, Play, SkipForward, X, Plus, Gauge } from "lucide-react"
import { sceneStore } from "./components/sceneStore"
import ContactDialog from "./components/ContactDialog"
import { trackClarityEvent } from "./components/clarity"

const KizashiCanvas = dynamic(() => import("./components/KizashiCanvas"), { ssr: false })

const SCENES = [
  { id: "00", en: "Kizashi Inc.", nav: "Introduction", ja: "はじまり", headline: ["Kizashi", "Inc."], lead: "まだない価値に、兆しを。", desc: "ブランド、コマース、業務、AI。\n構想を描くところから、動く仕組みになるまで。", details: ["Digital craft", "Business intelligence"] },
  { id: "01", en: "Brand Development", nav: "Brand", ja: "ブランドサイト制作", headline: ["Brand", "Development."], lead: "らしさを、体験に。", desc: "企業の意志と価値を捉え、訪れる人の記憶に残るデジタル体験へ。戦略、デザイン、実装まで一貫してつくります。", details: ["ブランド戦略", "UI / UXデザイン", "Web開発"] },
  { id: "02", en: "Commerce", nav: "Commerce", ja: "ECサイト制作", headline: ["Beyond", "Commerce."], lead: "買う理由まで、デザインする。", desc: "商品との出会いから購入、その先の関係まで。使いやすさとブランドの世界観を両立し、事業とともに育つストアを構築します。", details: ["ECサイト設計", "ストア構築", "購入体験の改善"] },
  { id: "03", en: "Workflow Intelligence", nav: "Workflow", ja: "業務効率化推進", headline: ["Work,", "Reimagined."], lead: "人が、本来の仕事に向き合えるように。", desc: "繰り返しの作業や情報の分断を見つめ直す。現場に合う仕組みと自動化で、チームの時間と可能性をひらきます。", details: ["業務分析", "システム連携", "自動化"] },
  { id: "04", en: "AI Integration", nav: "AI", ja: "AI活用推進", headline: ["Intelligence,", "Applied."], lead: "AIを、現場の力に。", desc: "新しい技術を、使い続けられる価値へ。活用領域の整理からプロトタイプ、導入・運用まで、事業に合うAI活用を支援します。", details: ["活用方針の策定", "プロトタイプ開発", "導入・運用支援"] },
  { id: "05", en: "Our Perspective", nav: "Perspective", ja: "私たちの想い", headline: ["Small signs.", "Real change."], lead: "", desc: "", details: [] },
  { id: "06", en: "Contact", nav: "Contact", ja: "お問い合わせ", headline: ["What comes", "next?"], lead: "次の一手を、一緒に考えよう。", desc: "まだ言葉になっていない構想も、\n解決したい目の前の課題も。", details: [] },
]

const FOUNDERS = [
  { name: "渡辺 洲", lines: ["私たちは「兆し」という名に、ひとつの信念を込めました。", "どんな大きな変化も、はじまりは小さな予兆にすぎない。", "その兆しを誰よりも早く捉え、確かな形にする。それが私たちの仕事です。"] },
  { name: "田中 凌", lines: ["テクノロジーはあくまで手段。目的は、人の挑戦を一歩前へ進めること。", "お客様が見ている景色の、さらに先を一緒に描く。", "Kizashi は、そんな伴走者でありたいと願っています。"] },
]

class CanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function Home() {
  const [initialized, setInitialized] = useState(false)
  const [ready, setReady] = useState(false)
  const [scene, setScene] = useState(0)
  const [introDone, setIntroDone] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactService, setContactService] = useState("")
  const [lite, setLite] = useState(false)
  const [pageActive, setPageActive] = useState(true)
  const [fallback, setFallback] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null)

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const url = new URL(window.location.href)
    const param = url.searchParams.get("scene")
    const initial = param !== null && /^\d+$/.test(param) ? Number(param) : 0
    const valid = initial >= 0 && initial < SCENES.length ? initial : 0
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
    const savedQuality = window.localStorage.getItem("kizashi-quality")
    const useLiteMode = savedQuality
      ? savedQuality === "lite"
      : Boolean(device.connection?.saveData || (device.deviceMemory && device.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4)

    for (const key of Array.from(url.searchParams.keys())) {
      if (key === "scene" || key === "fbclid" || key === "gclid" || key === "dclid" || key === "msclkid" || key.startsWith("utm_")) {
        url.searchParams.delete(key)
      }
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)

    Object.assign(sceneStore, {
      index: valid, skipIntro: param !== null || motionPreference.matches,
      introComplete: false, paused: motionPreference.matches, reducedMotion: motionPreference.matches,
    })
    // Resolve browser-only preferences after hydration so exported HTML stays stable.
    queueMicrotask(() => {
      setScene(valid)
      setReduced(motionPreference.matches)
      setPaused(motionPreference.matches)
      setLite(useLiteMode)
      setIntroDone(sceneStore.skipIntro)
      setInitialized(true)
      trackClarityEvent("scene_view", {
        scene: SCENES[valid].id,
        navigation: "initial",
        device: window.innerWidth < 768 ? "mobile" : "desktop",
        quality: useLiteMode ? "lite" : "high",
      })
    })
    const change = () => {
      sceneStore.reducedMotion = motionPreference.matches
      sceneStore.paused = motionPreference.matches
      if (motionPreference.matches) sceneStore.skipIntro = true
      setReduced(motionPreference.matches)
      setPaused(motionPreference.matches)
    }
    const visibilityChange = () => setPageActive(!document.hidden)
    motionPreference.addEventListener("change", change)
    document.addEventListener("visibilitychange", visibilityChange)
    return () => {
      motionPreference.removeEventListener("change", change)
      document.removeEventListener("visibilitychange", visibilityChange)
      void audio.current?.ctx.close()
    }
  }, [])

  const onReady = useCallback(() => setReady(true), [])
  const onIntroComplete = useCallback(() => setIntroDone(true), [])
  const onCanvasError = useCallback(() => {
    setFallback(true)
    setReady(true)
    setIntroDone(true)
    sceneStore.skipIntro = true
  }, [])

  const skip = useCallback(() => {
    sceneStore.skipIntro = true
    setIntroDone(true)
  }, [])

  const goTo = useCallback((index: number, navigation = "direct") => {
    const next = Math.max(0, Math.min(SCENES.length - 1, index))
    sceneStore.index = next
    sceneStore.skipIntro = true
    setScene(next)
    setIntroDone(true)
    trackClarityEvent("scene_view", { scene: SCENES[next].id, navigation })
    if (dialog.current?.open) dialog.current.close()
  }, [])

  useEffect(() => {
    let lastEvent = 0, distance = 0, consumed = false
    let touch: { x: number; y: number } | null = null
    const isControl = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("button, a, input, textarea, select, dialog, [contenteditable], [data-scrollable]")
    const onWheel = (event: WheelEvent) => {
      if (dialog.current?.open || isControl(event.target) || event.ctrlKey || !sceneStore.introComplete) return
      const now = performance.now()
      if (now - lastEvent > 200) { distance = 0; consumed = false }
      lastEvent = now
      if (consumed || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      distance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1)
      if (Math.abs(distance) > 65) {
        consumed = true
        goTo(sceneStore.index + (distance > 0 ? 1 : -1), "wheel")
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (dialog.current?.open || isControl(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const direction = ["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key) ? 1 :
        ["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key) ? -1 : 0
      if (direction) { event.preventDefault(); goTo(sceneStore.index + direction, "keyboard") }
      if (event.key === "Home") { event.preventDefault(); goTo(0, "keyboard") }
      if (event.key === "End") { event.preventDefault(); goTo(SCENES.length - 1, "keyboard") }
    }
    const onStart = (event: TouchEvent) => {
      touch = isControl(event.target) || dialog.current?.open ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
    const onEnd = (event: TouchEvent) => {
      if (!touch) return
      const dx = touch.x - event.changedTouches[0].clientX
      const dy = touch.y - event.changedTouches[0].clientY
      if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx)) goTo(sceneStore.index + (dy > 0 ? 1 : -1), "swipe")
      touch = null
    }
    window.addEventListener("wheel", onWheel, { passive: true })
    window.addEventListener("keydown", onKey)
    window.addEventListener("touchstart", onStart, { passive: true })
    window.addEventListener("touchend", onEnd, { passive: true })
    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("touchstart", onStart)
      window.removeEventListener("touchend", onEnd)
    }
  }, [goTo])

  const toggleSound = async () => {
    try {
      if (!audio.current) {
        const ctx = new AudioContext()
        const gain = ctx.createGain()
        gain.gain.value = 0
        const filter = ctx.createBiquadFilter()
        filter.type = "lowpass"
        filter.frequency.value = 240
        for (const frequency of [55, 55.6, 110.4]) {
          const oscillator = ctx.createOscillator()
          oscillator.type = "sine"
          oscillator.frequency.value = frequency
          oscillator.connect(filter)
          oscillator.start()
        }
        filter.connect(gain)
        gain.connect(ctx.destination)
        audio.current = { ctx, gain }
      }
      await audio.current.ctx.resume()
      audio.current.gain.gain.setTargetAtTime(muted ? 0.025 : 0, audio.current.ctx.currentTime, 0.4)
      setMuted(!muted)
    } catch { setMuted(true) }
  }

  const toggleMotion = () => {
    sceneStore.paused = !paused
    if (!introDone) skip()
    setPaused(!paused)
  }
  const toggleQuality = () => {
    setLite((current) => {
      const next = !current
      window.localStorage.setItem("kizashi-quality", next ? "lite" : "high")
      trackClarityEvent("quality_mode", { quality: next ? "lite" : "high" })
      return next
    })
  }
  const openContact = (service = "") => {
    if (dialog.current?.open) dialog.current.close()
    setContactService(service)
    setContactOpen(true)
    trackClarityEvent("contact_open", { service: service || "general", scene: SCENES[scene].id })
  }
  const openMenu = () => { dialog.current?.showModal(); setMenuOpen(true) }
  const s = SCENES[scene]
  const isMessage = scene === 5
  const showCopy = introDone || fallback
  const reveal = { duration: reduced ? 0.12 : 0.65, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <main className="experience" data-scene={scene} data-ready={ready} data-intro-done={introDone} data-paused={paused} data-quality={lite ? "lite" : "high"}>
        <div className="world" aria-hidden="true">
          {initialized && (
            <CanvasBoundary onError={onCanvasError}>
              <KizashiCanvas started sceneIndex={scene} paused={paused} active={pageActive} quality={lite ? "lite" : "high"} onReady={onReady} onIntroComplete={onIntroComplete} onError={onCanvasError} />
            </CanvasBoundary>
          )}
          {fallback && <div className="world-fallback">兆</div>}
        </div>

        <header className="site-header">
          <button className="wordmark" onClick={() => goTo(0, "wordmark")} aria-label="Kizashi Inc. ホーム">Kizashi<span>Inc.</span></button>
          <p className="header-note">Independent thinking.<br />Extraordinary possibilities.</p>
          <div className="header-actions">
            <button className="text-action contact-shortcut" onClick={() => goTo(6, "header")}>Contact <ArrowUpRight size={16} /></button>
            <button ref={menuButton} className="menu-button" onClick={openMenu} aria-label="サービス一覧を開く" aria-haspopup="dialog" aria-expanded={menuOpen}>
              <span>Explore</span><Plus size={20} />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {!ready && (
            <motion.div className="loading" exit={{ opacity: 0 }} transition={{ duration: 0.45 }} role="status">
              <span className="loading-name">Kizashi Inc.</span>
              <span className="loading-line" />
              <span className="label">まもなく、はじまる。</span>
            </motion.div>
          )}
        </AnimatePresence>

        {!introDone && ready && (
          <button className="skip-intro text-action" onClick={skip}>Skip intro <SkipForward size={15} /></button>
        )}

        <AnimatePresence mode="wait">
          {showCopy && (
            <motion.section
              key={scene}
              className={`scene-copy ${scene === 0 ? "intro-copy" : ""} ${isMessage ? "message-copy" : ""}`}
              aria-labelledby="scene-heading"
              initial={{ opacity: 0, y: reduced ? 0 : 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -10 }}
              transition={reveal}
            >
              <p className="scene-eyebrow"><span>{s.id} / {scene === 0 ? "THE FIRST SIGN" : scene === 5 ? "OUR PERSPECTIVE" : scene === 6 ? "LET'S TALK" : "OUR EXPERTISE"}</span><span className="eyebrow-rule" /></p>
              <h1 id="scene-heading" className="scene-heading">{s.headline.map((line, i) => <span key={line} className={i === 1 ? "heading-secondary" : ""}>{line}</span>)}</h1>
              {!isMessage ? (
                <>
                  <h2 className="scene-lead">{s.lead}</h2>
                  <p className="scene-description">{s.desc}</p>
                  {scene === 0 ? (
                    <button className="primary-link" onClick={() => goTo(1, "primary_cta")}><span>私たちにできること</span><span className="link-circle"><ArrowDown size={19} /></span></button>
                  ) : scene === 6 ? (
                    <div className="contact-actions">
                      <button className="primary-link" onClick={() => openContact()}><span>プロジェクトについて相談する</span><span className="link-circle"><ArrowUpRight size={20} /></span></button>
                      <a className="contact-direct" href="mailto:info@kizashiatelier.com">info@kizashiatelier.com</a>
                    </div>
                  ) : (
                    <>
                      <ul className="expertise-list">{s.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
                      <button className="service-inquiry text-action" onClick={() => openContact(s.ja)}>この領域について相談する <ArrowUpRight size={16} /></button>
                    </>
                  )}
                </>
              ) : (
                <div className="founder-messages" data-scrollable>
                  {FOUNDERS.map(founder => <div className="founder" key={founder.name}>
                    <p>{founder.lines.join("")}</p>
                    <p className="signature">{founder.name}</p>
                  </div>)}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {showCopy && <div className="scene-caption" aria-hidden="true"><span className="caption-tick" /><span>{s.ja}</span><span className="label">{s.id} / KIZASHI</span></div>}

        <footer className="site-footer">
          <div className="footer-top">
            <div className="scene-position"><span className="label">{s.id}</span><span className="position-divider" /><span className="position-name">{s.ja}</span></div>
            <div className="scene-arrows">
              <button className="icon-button" onClick={() => goTo(scene - 1, "arrow")} disabled={scene === 0} title="前のシーン" aria-label="前のシーン"><ArrowLeft size={20} /></button>
              <button className="icon-button" onClick={() => goTo(scene + 1, "arrow")} disabled={scene === SCENES.length - 1} title="次のシーン" aria-label="次のシーン"><ArrowRight size={20} /></button>
            </div>
          </div>
          <nav className="chapter-nav" aria-label="シーン">
            {SCENES.map((chapter, i) => (
              <button key={chapter.id} onClick={() => goTo(i, "chapter_nav")} aria-label={chapter.ja} aria-current={scene === i ? "step" : undefined} className={scene === i ? "chapter active" : "chapter"} title={chapter.ja}>
                <span className="chapter-rule">{scene === i && <motion.span layoutId="chapter-indicator" transition={reveal} />}</span>
                <span className="chapter-number">{chapter.id}</span><span className="chapter-name">{chapter.nav}</span>
              </button>
            ))}
          </nav>
          <div className="footer-bottom">
            <p className="copyright">© 2026 Kizashi Inc. <a href="/privacy">Privacy</a></p>
            <span className="footer-sign">The first sign of what&apos;s coming.</span>
            <div className="experience-controls">
              <button className="icon-button" onClick={toggleMotion} aria-label={paused ? "アニメーションを再生" : "アニメーションを一時停止"} aria-pressed={paused} title={paused ? "アニメーションを再生" : "アニメーションを一時停止"}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
              <button className="quality-button" onClick={toggleQuality} aria-label={lite ? "高品質モードに切り替え" : "軽量モードに切り替え"} aria-pressed={lite} title={lite ? "高品質モードに切り替え" : "軽量モードに切り替え"}><Gauge size={15} /><span>{lite ? "Lite" : "High"}</span></button>
              <button className="sound-button" onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? "サウンドをオン" : "サウンドをオフ"} title={muted ? "サウンドをオン" : "サウンドをオフ"}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}<span>Sound {muted ? "off" : "on"}</span></button>
            </div>
          </div>
        </footer>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{s.ja}</p>

        <dialog ref={dialog} className="explore-dialog" onClose={() => { setMenuOpen(false); menuButton.current?.focus() }} onClick={event => { if (event.target === dialog.current) dialog.current.close() }}>
          <div className="explore-inner">
            <div className="explore-header"><span className="label">KIZASHI / EXPLORE</span><button className="icon-button" onClick={() => dialog.current?.close()} aria-label="サービス一覧を閉じる"><X size={24} /></button></div>
            <h2>可能性の、その先へ。</h2>
            <nav aria-label="サービス一覧">{SCENES.map((chapter, i) => <button key={chapter.id} className="explore-row" aria-current={scene === i ? "page" : undefined} onClick={() => goTo(i, "explore_menu")}>
              <span className="label">{chapter.id}</span><span className="explore-title">{chapter.nav}</span><span className="explore-ja">{chapter.ja}</span><ArrowUpRight size={20} />
            </button>)}</nav>
            <button className="text-action explore-contact" onClick={() => openContact()}>プロジェクトについて相談する <ArrowUpRight size={16} /></button>
          </div>
        </dialog>

        <ContactDialog open={contactOpen} initialService={contactService} onClose={() => setContactOpen(false)} />
      </main>
    </MotionConfig>
  )
}
