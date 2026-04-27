# PuzzleWork 開発継続メモ
> 新しいセッションで「続きをやって」と言うだけで再開できます

---

## 起動方法
```bash
# フロントエンド (port 3000)
cd /Users/mouritetsuya/Documents/puzzlework/frontend && npm run dev

# バックエンド（別ターミナル）
cd /Users/mouritetsuya/Documents/puzzlework/backend && npm run dev
```
テストURL: http://localhost:3000/board

## git 確認
```bash
cd /Users/mouritetsuya/Documents/puzzlework && git log --oneline
```

---

## ✅ 実装完了（全フェーズ）

### Phase 1 — Board基盤強化
- **ハンドル Left/Right** (PieceNode.tsx) — ジグソーのタブ形状に合わせた接続
- **localStorage位置保存** — `pz_board_positions_v2` キーで永続化
- **エッジ右クリックメニュー** — sequential/parallel/conditional 切替 + 削除
- **接続タイプ凡例** — 右パネルに表示
- **backend** — `PATCH /pieces/connections/:id` 追加

### Phase 1b — Project Islands + Cascade Glow
- **ProjectIslandNode** — 同プロジェクトのピースを色付き背景で囲む
- **Cascade Glow** — locked上流の下流ピースがオレンジ発光(⛓)
- **🏝ボタン / Iキー** — 島のON/OFF

### Phase 2 — 重力レイアウト + インパクトサイズ
- **Force-Directed Layout** — ⚛重力/⋯DAGトグル、Fruchterman-Reingold 120iter
- **Impact Scale** — business_impact → 0.85〜1.35倍のピースサイズ

### Phase 3 — ガントチャート
- **GanttView.tsx** — プロジェクト/担当者グループ、TODAY線、依存矢印
- ツールバー「ガント」ボタンで切替、バークリックで詳細パネル

### Phase 4 — クリティカルパス + スプリントプランナー
- **computeCriticalPath()** — 最長依存チェーンを黄金色ボーダーで表示（⚡CPボタン）
- **SprintPlannerPanel.tsx** — 依存順・優先度順で候補表示、担当割当、一括スプリント開始
- 「📋 Sprint」ボタン、均等割当ボタン、担当者負荷バー

### Phase 5 — ガントシードデータ投入
- **seed_gantt.sql** — 15製品×5工程=75ピース、担当者5名、接続60件をDBに投入
  - 製品: サンドステッパー/リッチライズプロテイン/ルームランナー/リストラップ/バトルロープEvo/スピンバイクAir/ネックマッサージャー/ST144〜ST120
  - 担当者: 小林・牧（コンテンツ）、黒島・大庭・東條（デザイン）
  - 工程チェーン: 仕様確認→デザイン→LP→プレスリリース→外部SNS
- **POST /pieces/bulk 拡張** — assignee_id / start_date / status / business_impact 対応

### Phase 6 — プロジェクト折りたたみ ★最新
- **▣ 全折ボタン** — 75ピース → 15枚のサマリーカードに一括集約
- **島ラベルクリック** — プロジェクト単位で折りたたみ/展開トグル
- **ProjectSummaryNode** — 進捗バー・ステータスバッジ（完了/進行中/着手可/ロック）・次の締切タスクを表示
- **エッジ自動リマップ** — 折りたたんだピース→サマリーノードに付け替え、重複除去
- **サマリーノード位置保存** — ドラッグした位置をlocalStorageに永続化

---

## 🔲 次にやること（優先順）

### A. ピース階層 (Epic → Task → Sub-task) ★最重要
- **backend**: `pieces` テーブルに `parent_id uuid` カラム追加
  ```sql
  ALTER TABLE pieces ADD COLUMN parent_id uuid REFERENCES pieces(id);
  ```
- **frontend types**: `Piece` に `parent_id: string | null` 追加
- **PuzzleBoard**: 親ピースをダブルクリック → 子ピースが展開（accordion）
- **PieceNode**: 子ピース数バッジ表示、折りたたみ/展開ボタン
- **PieceCreatePanel**: 親ピース選択セレクタ追加

### B. ワークロードリング
- 各メンバーのピース数・進捗をリング表示（ボード左下 or 右パネル下部）
- `viewMode === 'load'` 時に担当者ごとのリング+負荷率を全面表示
- データ: in_progress ピース数 / 全アサイン数 / 平均進捗%

### C. 完成予測ウェーブ
- 現在のペースで全ピース完了する推定日を右パネルに表示
- 計算: `完了数/経過日数 × 残ピース数`
- 直近7日の done 数からベロシティ算出

### D. AI提案強化
- `POST /ai/suggest-sprint` バックエンドエンドポイント追加
- 現在の SprintPlanner はフロントのみでソート
- AI版: skill_tags × worker.skills でマッチング、business_impact 最大化
- OpenAI/Claude API で sprint 推薦文を生成

### E. リアルタイム複数人カーソル
- WebSocketで他ユーザーのカーソル位置を共有
- Figmaスタイルのカラー付きカーソルとアバター

### F. サマリーカードの改善
- 現在: クリックで展開のみ
- 追加: ホバーでポップアップ詳細（担当者アバター・ブロック状況）
- 追加: サマリーカードから直接ステータス一括変更

---

## 重要ファイル一覧

| ファイル | 役割 |
|---|---|
| `frontend/src/components/board/PuzzleBoard.tsx` | メインボード（ReactFlow）— 全機能統合 |
| `frontend/src/components/board/PieceNode.tsx` | ピースSVGノード（ハンドル/グロー/クリティカル） |
| `frontend/src/components/board/GanttView.tsx` | ガントチャートビュー |
| `frontend/src/components/board/SprintPlannerPanel.tsx` | スプリント計画パネル |
| `frontend/src/services/api.ts` | APIクライアント |
| `backend/src/controllers/pieceController.ts` | ピースCRUD |
| `backend/src/routes/pieces.ts` | ルーティング（bulk含む） |
| `backend/scripts/seed_gantt.sql` | ガントデータ投入SQL（再実行可） |
| `backend/src/scripts/seed_gantt.ts` | 同上 TypeScript版 |

## DB確認コマンド
```bash
# ピース・プロジェクト・ユーザー数確認
psql postgresql://mouritetsuya@localhost:5432/puzzlework -c "
SELECT
  (SELECT COUNT(*) FROM pieces) AS pieces,
  (SELECT COUNT(*) FROM projects) AS projects,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM connections) AS connections;
"

# 担当者一覧
psql postgresql://mouritetsuya@localhost:5432/puzzlework -c "SELECT name, email, role FROM users ORDER BY role, name;"
```

## デザイン方針
- **亜鉛合金カラーパレット** — locked:砂色、ready:緑、in_progress:青、done:グレー
- **バルミューダ/I-NE風** — 絵文字最小限、余白重視、金属質感
- **CSS変数**: `--bg`, `--surface`, `--border`, `--accent`, `--accent-sub`, `--text-1/2/3`
- **ピースサイズ**: W=196, H=132, TAB=20, SVG_W=216, SVG_H=152
- **サマリーカード**: W=228, H=122

## キーボードショートカット
| キー | 動作 |
|---|---|
| `Space` | 全体表示にフィット |
| `F` | フィルターパネル開閉 |
| `I` | 島（ProjectIsland）ON/OFF |
| `Esc` | コンテキストメニュー閉じる |
| `Delete` / `Backspace` | 選択中エッジを削除 |
| ダブルクリック | ステータスサイクル（locked→ready→in_progress→done） |
