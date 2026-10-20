"use client"

import { useEffect, useSyncExternalStore } from "react"
import Link from "next/link"
import { CLARITY_CONSENT_KEY, discardPendingClarityEvents, initializeClarity } from "./clarity"

type Consent = "pending" | "granted" | "denied"

const CONSENT_EVENT = "kizashi:analytics-consent"

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(CONSENT_EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(CONSENT_EVENT, callback)
  }
}

function getConsent(): Consent {
  const saved = window.localStorage.getItem(CLARITY_CONSENT_KEY)
  return saved === "granted" || saved === "denied" ? saved : "pending"
}

export default function ClarityAnalytics() {
  const consent = useSyncExternalStore(subscribe, getConsent, () => null)

  useEffect(() => {
    if (consent === "granted") {
      initializeClarity()
    } else if (consent === "denied") {
      discardPendingClarityEvents()
    }
  }, [consent])

  if (consent !== "pending") return null

  const grant = () => {
    window.localStorage.setItem(CLARITY_CONSENT_KEY, "granted")
    initializeClarity()
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }

  const deny = () => {
    window.localStorage.setItem(CLARITY_CONSENT_KEY, "denied")
    discardPendingClarityEvents()
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }

  return (
    <aside className="analytics-consent" aria-label="アクセス解析の設定">
      <div>
        <p>サイト改善のため、匿名の利用状況を計測します。</p>
        <span>フォームの入力内容は記録しません。 <Link href="/privacy">詳細</Link></span>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" onClick={deny}>許可しない</button>
        <button className="consent-primary" type="button" onClick={grant}>許可する</button>
      </div>
    </aside>
  )
}
