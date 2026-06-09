# PuzzleWork 開発継続メモ
> 新しいセッションで「続きをやって」と言うだけで再開できます

---

## 起動方法
```bash
# フロントエンド (port 3000)
cd /Users/mouritetsuya/Documents/puzzlework/frontend && npm run dev

# バックエンド（別ターミナル / port 3002）
cd /Users/mouritetsuya/Documents/puzzlework/backend && node dist/server.js
# または: bash start.sh（両方同時起動）
```

テストURL: http://localhost:3000

## 更新手順（データを消さずに）
```bash
cd /Users/mouritetsuya/Documents/puzzlework/backend
npm run build   # TSビルド + SQLファイルをdist/にコピー
npm run migrate # 新しいマイグレーションだけ適用（既適用はスキップ）
node dist/server.js
```

## テストアカウント
- 管理者: admin@puzzlework.com / password
- ワーカー: /register-worker から新規登録

## 現在のフェーズ
**Phase: STEADY導入準備（2026年6月目標）**

### 実装済み（主要機能）
- 管理者ツール（ボード・カンバン・ガント・チーム・プロジェクト等）
- ワーカーツール（ピース一覧・個人タスク・コックピット・スキルツリー）
- ポートフォリオ（プライベート・公開URL /u/:userId）
- 連絡ボタン（公開ポートフォリオから相談送信）
- オンボーディング（ピース完了 → スキル選択 → ポートフォリオ）
- マーケットプレイス
- PWA対応（ホーム画面追加可能）

### 次にやること
1. VPS/Railwayへのデプロイ（DEPLOY_GUIDE.md参照）
2. STEADYの1部署で仮運用開始
3. フィードバックを見て改善

## ファイル構成
```
puzzlework/
├── backend/          Node.js/Express API (port 3002)
│   ├── src/db/migrations/  マイグレーションSQL
│   └── .env         環境変数（要設定）
├── frontend/         React/Vite (port 3000)
├── deploy.sh         本番デプロイ用スクリプト
├── DEPLOY_GUIDE.md   デプロイ手順書
└── CONTINUATION.md   このファイル
```

## 思想メモ
- 「実績は個人に帰属する」 → company_memberships で企業は接続先
- ピースは仕事であって人間ではない
- 「誰が悪いか」ではなく「どこが詰まっているか」
- スコアなし、ランキングなし、完成した事実だけを残す
