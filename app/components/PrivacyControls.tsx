"use client"

import { CLARITY_CONSENT_KEY } from "./clarity"

export default function PrivacyControls() {
  const resetConsent = () => {
    window.localStorage.removeItem(CLARITY_CONSENT_KEY)
    window.location.href = "/"
  }

  return <button className="privacy-reset" type="button" onClick={resetConsent}>アクセス解析の設定を変更</button>
}
