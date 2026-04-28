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
- **ハンドル Left/Right** — ジグソーのタブ形状に合わせた接続
- **localStorage位置保存** — `pz_board_positions_v2` キーで永続化
- **エッジ右クリックメニュー** — sequential/parallel/conditional 切替 + 削除

### Phase 1b — Project Islands + Cascade Glow
- **ProjectIslandNode** — 同プロジェクトのピースを色付き背景で囲む
- **Cascade Glow** — locked上流の下流ピースがオレンジ発光

### Phase 2 — 重力レイアウト + インパクトサイズ
- **Force-Directed Layout** — ⚛重力/⋯DAGトグル
- **Impact Scale** — business_impact → ピースサイズ変動

### Phase 3 — ガントチャート
- **GanttView.tsx** — プロジェクト/担当者グループ、TODAY線

### Phase 4 — クリティカルパス + スプリントプランナー
- **computeCriticalPath()** — 最長依存チェーン可視化
- **SprintPlannerPanel.tsx** — 依存順・優先度順候補、担当割当

### Phase 5 — ガントシードデータ投入
- 15製品×5工程=75ピース、担当者5名をDB投入

### Phase 6 — プロジェクト折りたたみ
- **▣ 全折ボタン** — 75ピース → 15枚サマリーカード
- **ProjectSummaryNode** — 進捗バー・ステータスバッジ
- **エッジ自動リマップ** — 折りたたんだピース→サマリーノード

### Phase 7A — ピース階層（Epic→Task→Sub-task）✅ 完了
- **DB**: `pieces.parent_id uuid REFERENCES pieces(id)` カラム追加済み
- **backend**: `createPiece` で `parent_id` 受け取り・保存
- **types**: `Piece.parent_id: string | null` 追加
- **PieceNode**: 子インジケーターバー（左端の縦線）+ 展開/折りたたみピルボタン
- **PuzzleBoard**: `childMap`・`expandedPieces`・`visiblePieces`フィルタ・子自動配置・点線親子エッジ
- **PieceCreatePanel**: 親ピース選択セレクタ（ルートピースのみ、孫は作れない）
- コミット: `7947094`

### Phase 7B — ワークロードリング ✅ 完了
- **WorkloadRingPanel.tsx**: `viewMode === 'load'` でSVGドーナツリング
- ワーカー別ステータス内訳（in_progress/ready/locked/done）、負荷レベルバッジ
- コミット: `bed5ea6`

### Phase 7C — 完了予測（velocity ETA）✅ 完了
- 右パネルに「完了予測」セクション追加
- `velocityBySkill × skill_tags` でETA残日数計算
- `started_at`からの経過日数を考慮した残日数表示
- コミット: `bed5ea6`（7Bと同一コミット）

### Phase 7D — AI Sprint Enhancement ✅ 完了
- **backend**: `POST /ai/suggest-sprint` エンドポイント追加
  - Anthropic API でスキルマッチング×負荷分散の最適割り当て提案
  - APIキー未設定時はルールベースフォールバック
- **frontend**: SprintPlannerPanel に「✦ AI」ボタン追加
  - 選択ピースに対してAI割り当て提案を取得→`assignMap`に反映
- **api.ts**: `ai.suggestSprint()` 追加

---

## 🔲 次にやること（優先順）

### E. リアルタイム複数人カーソル
- WebSocketで他ユーザーのカーソル位置を共有
- Figmaスタイルのカラー付きカーソルとアバター

### F. サマリーカードの改善
- ホバーでポップアップ詳細（担当者アバター・ブロック状況）
- サマリーカードから直接ステータス一括変更

### G. PieceDetailPanel 親子関係UI
- 詳細パネルで子ピース一覧を表示
- 子ピースのステータスを一括変更

### H. ボードパフォーマンス改善
- 75ピース以上での描画最適化（仮想化・LOD）
- キャンバス外のノードをレンダリングしない

---

## 重要ファイル一覧

| ファイル | 役割 |
|---|---|
| `frontend/src/components/board/PuzzleBoard.tsx` | メインボード — 全機能統合 |
| `frontend/src/components/board/PieceNode.tsx` | ピースSVGノード（階層インジケーター含む） |
| `frontend/src/components/board/WorkloadRingPanel.tsx` | 負荷ビュー（loadモード） |
| `frontend/src/components/board/SprintPlannerPanel.tsx` | スプリント計画（AI割当ボタン追加） |
| `frontend/src/components/board/PieceCreatePanel.tsx` | ピース作成（親ピース選択あり） |
| `frontend/src/components/board/GanttView.tsx` | ガントチャートビュー |
| `frontend/src/services/api.ts` | APIクライアント（ai.suggestSprint含む） |
| `frontend/src/types/index.ts` | 型定義（parent_id追加済み） |
| `backend/src/controllers/pieceController.ts` | ピースCRUD（parent_id対応） |
| `backend/src/routes/ai.ts` | AIルート（suggest-sprint追加） |

## DB確認コマンド
```bash
psql postgresql://mouritetsuya@localhost:5432/puzzlework -c "
SELECT
  (SELECT COUNT(*) FROM pieces) AS pieces,
  (SELECT COUNT(*) FROM projects) AS projects,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM connections) AS connections;
"
```

## デザイン方針
- **亜鉛合金カラーパレット** — locked:砂色、ready:緑、in_progress:青、done:グレー
- **バルミューダ/I-NE風** — 絵文字最小限、余白重視、金属質感
- **CSS変数**: `--bg`, `--surface`, `--border`, `--accent`, `--accent-sub`, `--text-1/2/3`
- **ピースサイズ**: W=196, H=132, TAB=20, SVG_W=216, SVG_H=152

## キーボードショートカット
| キー | 動作 |
|---|---|
| `Space` | 全体表示にフィット |
| `F` | フィルターパネル開閉 |
| `I` | 島（ProjectIsland）ON/OFF |
| `Esc` | コンテキストメニュー閉じる |
| `Delete` / `Backspace` | 選択中エッジを削除 |
| ダブルクリック | ステータスサイクル（locked→ready→in_progress→done） |
