import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import PrivacyControls from "../components/PrivacyControls"

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "Kizashi Inc.のプライバシーポリシーとアクセス解析についてご案内します。",
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-header">
        <Link href="/" className="privacy-back"><ArrowLeft size={17} /> Kizashi Inc.</Link>
        <span className="label">PRIVACY / 2026</span>
      </header>

      <article className="privacy-content">
        <p className="scene-eyebrow"><span>PRIVACY POLICY</span><span className="eyebrow-rule" /></p>
        <h1>プライバシー<br />ポリシー</h1>
        <p className="privacy-lead">Kizashi Inc.は、お問い合わせ情報とアクセスデータを、必要な範囲に限定して取り扱います。</p>

        <section>
          <h2>お問い合わせ情報</h2>
          <p>氏名、会社名、メールアドレス、ご相談内容は、お問い合わせへの回答とご提案のために使用します。当サイトのフォームは入力内容をメールアプリへ引き継ぎ、サイト内には保存しません。</p>
        </section>

        <section>
          <h2>アクセス解析</h2>
          <p>利用に同意いただいた場合に限り、Microsoft Clarityを使用して、閲覧シーン、ボタン操作、端末種別などの匿名の利用状況を計測します。フォーム全体はマスク対象とし、入力内容をClarityへ送信しません。</p>
        </section>

        <section>
          <h2>利用目的</h2>
          <p>取得した情報は、当サイトの操作性、表示品質、サービス案内、問い合わせ導線の改善に使用します。個人を特定する目的では使用しません。</p>
        </section>

        <section>
          <h2>外部サービス</h2>
          <p>Microsoft Clarityにおけるデータの取り扱いは、MicrosoftのプライバシーポリシーおよびClarityの規約に基づきます。</p>
          <a href="https://privacy.microsoft.com/ja-jp/privacystatement" target="_blank" rel="noreferrer">Microsoft プライバシーステートメント</a>
        </section>

        <section>
          <h2>お問い合わせ</h2>
          <a href="mailto:info@kizashiatelier.com">info@kizashiatelier.com</a>
        </section>

        <PrivacyControls />
      </article>
    </main>
  )
}

