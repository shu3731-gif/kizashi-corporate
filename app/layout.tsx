import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import ClarityAnalytics from "./components/ClarityAnalytics"
import "./globals.css"

const SITE_URL = "https://kizashiatelier.com"
const SITE_TITLE = "Kizashi Inc. | Web制作・EC・業務効率化・AI活用"
const SITE_DESCRIPTION = "Kizashi Inc.は、ブランドサイト・ECサイト制作、業務効率化、AI活用を通じて、企業の構想を成果につながるデジタル体験と仕組みにします。"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Kizashi Inc.",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Kizashi Inc.",
  creator: "Kizashi Inc.",
  publisher: "Kizashi Inc.",
  category: "technology",
  keywords: [
    "Kizashi Inc.",
    "ブランドサイト制作",
    "Web制作",
    "ECサイト制作",
    "業務効率化",
    "DX支援",
    "AI活用",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/",
    siteName: "Kizashi Inc.",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Kizashi Inc. - まだない価値に、兆しを。",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        alt: "Kizashi Inc. - まだない価値に、兆しを。",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
  colorScheme: "dark",
}

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Kizashi Inc.",
      url: SITE_URL,
      email: "info@kizashiatelier.com",
      description: SITE_DESCRIPTION,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "business inquiries",
        email: "info@kizashiatelier.com",
        availableLanguage: ["Japanese"],
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "サービス",
        itemListElement: [
          "ブランドサイト制作",
          "ECサイト制作",
          "業務効率化推進",
          "AI活用推進",
        ].map((name) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name },
        })),
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Kizashi Inc.",
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "ja-JP",
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/* Brush calligraphy face for the Intro 兆 (sampled into particles). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Yuji+Mai&family=Yuji+Syuku&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
        <ClarityAnalytics />
      </body>
    </html>
  )
}
