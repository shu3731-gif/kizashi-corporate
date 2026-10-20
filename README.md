# Kizashi Inc.

Next.js App Router / React Three Fiber / Framer Motion による7シーンのコーポレートサイト。

## ローカル確認

```bash
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/corporate-site
KIZASHI_BUILD_DIR=.next-astra npm run dev -- --webpack --port 3010
```

[http://localhost:3010](http://localhost:3010) を開きます。検証用キャッシュは `.next-astra/` に分離しています。

- 通常URLではオープニングを再生。
- `?scene=0` から `?scene=6` で指定シーンを直接表示。
- スクロール、スワイプ、矢印キー、画面下部のシーン選択で移動。
- Explore はサービス一覧。Escape で閉じる。
- 画面右下で動きを一時停止・再生でき、サウンドは初期状態でオフ。
- OSの「視差効果を減らす」設定ではイントロをスキップし、静止したCGを表示。

## ビルド

```bash
npm run build -- --webpack
```

生成物は `out/`。静的ホスティングに配置できます。この仕上げ作業では公開先へのデプロイは行っていません。

## 編集箇所

- `app/page.tsx`: 各シーンの文章、ナビゲーション、イントロ制御。
- `app/components/KizashiCanvas.tsx`: 粒子の造形、シェーダー、カメラ、流れ星。
- `app/components/sceneStore.ts`: UIと3Dの共有状態。
- `tokens.css` / `app/globals.css`: 配色、書体、レスポンシブレイアウト。
- `DESIGN.md`: デザイン方針。

問い合わせ先メールアドレスと創業者メッセージは既存コンテンツを使用しています。公開前に実際の窓口・原稿を確認してください。
