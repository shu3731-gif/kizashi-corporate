"use client"

import { useEffect, useRef, type FormEvent } from "react"
import { ArrowUpRight, X } from "lucide-react"
import { trackClarityEvent } from "./clarity"

const SERVICES = [
  "ブランドサイト制作",
  "ECサイト制作",
  "業務効率化推進",
  "AI活用推進",
  "まだ決まっていない",
]

type ContactDialogProps = {
  open: boolean
  initialService?: string
  onClose: () => void
}

export default function ContactDialog({ open, initialService, onClose }: ContactDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const firstField = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      form.current?.reset()
      element.showModal()
      requestAnimationFrame(() => firstField.current?.focus())
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const service = String(data.get("service") || "まだ決まっていない")
    const body = [
      "Kizashi Inc.へのお問い合わせ",
      "",
      `ご相談内容: ${service}`,
      `会社名: ${String(data.get("company") || "未記入")}`,
      `お名前: ${String(data.get("name") || "")}`,
      `メールアドレス: ${String(data.get("email") || "")}`,
      "",
      "ご相談の詳細:",
      String(data.get("message") || ""),
    ].join("\n")
    const subject = `[Kizashi Inc.] ${service}のご相談`
    trackClarityEvent("email_compose", { service })
    window.location.href = `mailto:info@kizashiatelier.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <dialog
      ref={dialog}
      className="contact-dialog"
      aria-labelledby="contact-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose() }}
    >
      <div className="contact-dialog-inner">
        <header className="contact-dialog-header">
          <span className="label">KIZASHI / START A PROJECT</span>
          <button className="icon-button" type="button" onClick={onClose} aria-label="問い合わせフォームを閉じる">
            <X size={24} />
          </button>
        </header>

        <div className="contact-layout">
          <div className="contact-intro">
            <p className="scene-eyebrow"><span>06 / LET&apos;S TALK</span><span className="eyebrow-rule" /></p>
            <h2 id="contact-dialog-title">Tell us what<br />comes next.</h2>
            <p>まだ輪郭のない構想でも構いません。<br />現在地と、実現したいことをお聞かせください。</p>
            <a href="mailto:info@kizashiatelier.com">info@kizashiatelier.com <ArrowUpRight size={15} /></a>
          </div>

          <form ref={form} className="contact-form" data-clarity-mask="true" onSubmit={submit}>
            <label className="form-field">
              <span>ご相談内容 <b>必須</b></span>
              <select ref={firstField} key={initialService} name="service" defaultValue={SERVICES.includes(initialService || "") ? initialService : ""} required>
                <option value="" disabled>選択してください</option>
                {SERVICES.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
            </label>

            <div className="form-row">
              <label className="form-field">
                <span>会社名 <small>任意</small></span>
                <input name="company" autoComplete="organization" placeholder="株式会社Kizashi" />
              </label>
              <label className="form-field">
                <span>お名前 <b>必須</b></span>
                <input name="name" autoComplete="name" placeholder="山田 太郎" required />
              </label>
            </div>

            <label className="form-field">
              <span>メールアドレス <b>必須</b></span>
              <input name="email" type="email" inputMode="email" autoComplete="email" placeholder="name@company.jp" required />
            </label>

            <label className="form-field">
              <span>ご相談の詳細 <b>必須</b></span>
              <textarea name="message" rows={5} placeholder="現在の課題、実現したいこと、ご希望の時期など" required />
            </label>

            <div className="form-submit-row">
              <p>入力内容を引き継いで、メールアプリが開きます。</p>
              <button className="contact-submit" type="submit">
                <span>メールを作成</span><ArrowUpRight size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  )
}
