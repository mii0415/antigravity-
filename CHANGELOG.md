# Antigravity 変更履歴

最新の変更が上に来るように記録。

---

## 2024-12-14

### メッセージ削除時の表情・背景復元
- **ファイル**: `src/App.jsx` (handleDeleteMessage関数)
- **変更内容**: メッセージを削除した時、残りのメッセージから最新のAI応答の表情・背景を自動復元
- **理由**: 削除後も適切な表情・背景状態を維持するため

### プロファイルコピー設定の文字色修正
- **ファイル**: `src/App.jsx` (Line 4576-4584)
- **変更内容**: チェックボックスラベル（プロンプト、メモリ、画像設定）の文字色を `#333`（黒）に変更
- **理由**: 文字が見づらかったため

### 自動同期機能の改善
- **ファイル**: `src/App.jsx`
- **変更内容**:
  - `fetchGeminiModels` と `fetchOpenRouterModels` に `silent` パラメータを追加
  - 自動同期時は `silent=true` で呼び出し、alert を非表示に
  - 自動同期 `useEffect` を関数定義後（Line 1932付近）に移動（TDZ修正）
- **理由**: 起動時に大量の alert が表示されるのを防ぐ

### 検索UIの改善
- **ファイル**: `src/App.jsx`
- **変更内容**:
  - `isGeminiSeeking`, `isOrSeeking`, `isOllamaSeeking` state を追加
  - 検索ボックスに `onFocus`/`onBlur` ハンドラを追加
  - モデルリストはフォーカス時または検索入力時のみ表示
- **理由**: 画面スペースの有効活用

---

## 過去の変更

履歴の詳細は `.gemini/antigravity/brain/` のログファイルを参照
