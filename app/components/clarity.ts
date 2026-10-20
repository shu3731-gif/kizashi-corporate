export const CLARITY_PROJECT_ID = "yj11jdqsjq"
export const CLARITY_CONSENT_KEY = "kizashi-analytics-consent-v1"

type ClarityValue = string | string[] | Record<string, string>
type ClarityFunction = ((command: string, ...args: ClarityValue[]) => void) & { q?: unknown[][] }
type AnalyticsTags = Record<string, string>

declare global {
  interface Window {
    clarity?: ClarityFunction
  }
}

const pendingEvents: Array<{ name: string; tags: AnalyticsTags }> = []

function sendEvent(name: string, tags: AnalyticsTags) {
  if (!window.clarity) return
  for (const [key, value] of Object.entries(tags)) {
    window.clarity("set", key, value)
  }
  window.clarity("event", name)
}

export function trackClarityEvent(name: string, tags: AnalyticsTags = {}) {
  if (typeof window === "undefined") return
  if (!window.clarity) {
    pendingEvents.push({ name, tags })
    return
  }
  sendEvent(name, tags)
}

export function initializeClarity() {
  if (typeof window === "undefined" || window.clarity) return

  const clarity = ((command: string, ...args: ClarityValue[]) => {
    clarity.q = clarity.q || []
    clarity.q.push([command, ...args])
  }) as ClarityFunction
  window.clarity = clarity

  const script = document.createElement("script")
  script.async = true
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`
  document.head.appendChild(script)

  window.clarity("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "granted",
  })

  for (const event of pendingEvents.splice(0)) {
    sendEvent(event.name, event.tags)
  }
}

export function discardPendingClarityEvents() {
  pendingEvents.length = 0
}

