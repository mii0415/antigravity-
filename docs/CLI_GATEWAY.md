# CLI Gateway System ドキュメント

## テスト環境

**PCサーバー:**
- `node server.js` を `C:\Users\onigi\.gemini\antigravity\playground\phantom-sunspot` で実行
- ポート: 8080

**ngrok設定:**
- ngrokでポート8080を公開
- URL例: `https://semivoluntary-arie-unripening.ngrok-free.dev`

**スマホテスト:**
- ngrok URLで `/antigravity-/` にアクセス
- 設定画面でGateway URLをngrok URLに設定
- TTSは `/tts` パス経由でプロキシ

---

## 概要
Antigravityアプリは、ローカルで動作するGemini CLIを経由してAIと会話できます。

## アーキテクチャ

```
[スマホ/PC ブラウザ]
    ↓ (HTTPS via ngrok)
[server.js (localhost:8080)]
    ↓ (CLI実行)
[Gemini CLI (@google/gemini-cli)]
    ↓ (API)
[Google Gemini API]
```

## 設定ファイル

### .env (server.js用)
```
GEMINI_CLI_COMMAND=C:\Users\onigi\AppData\Roaming\npm\gemini.cmd -y
```
- `-y` フラグはYOLOモード（自動承認）

### GEMINI.md (CLI用システムプロンプト)
- 場所: `C:\Users\onigi\.gemini\GEMINI.md`
- CLIは起動時にこのファイルを自動的に読み込む
- キャラクター設定やルールを記載

## CLIに送信されるデータ

server.jsがCLIに渡すメッセージは以下の順序で構成されます：

1. **チャット指示** - 「コードを書かず会話として応答して」
2. **キャラクター名** - 設定画面のプロファイル名
3. **ユーザー設定** - userProfileの内容
4. **キャラクター設定** - systemPrompt + memory (Context)
5. **会話履歴** - 直近N件（設定可能）
6. **現在のメッセージ** - ユーザーの入力

## フロントエンド設定

### Gateway URL
- 設定画面 → Local Gateway → Gateway URL
- PC: `http://localhost:8080`
- スマホ: `https://xxxxx.ngrok-free.dev` または Tailscale IP

### CLI Model
- 設定画面 → Local Gateway → CLI Model
- 例: `gemini-2.5-pro`, `gemini-3-pro-preview`

### CLI Model Favorites
- お気に入りモデルリスト
- Reset Defaultsで `gemini-2.5-pro`, `gemini-3-pro-preview` に復元

## トラブルシューティング

### ERR_NGROK_8012
- 原因: server.jsが停止している
- 対処: `node server.js` を実行

### CLIが見つからない
- 原因: PATHにCLIがない
- 対処: .envでフルパスを指定

### "I'm ready for your first command"
- 原因: メッセージがCLIに渡っていない
- 対処: server.jsのCLI呼び出しロジックを確認

## サーバー起動手順

```powershell
cd c:\Users\onigi\.gemini\antigravity\playground\phantom-sunspot
node server.js
```

## ビルド手順

```powershell
cd c:\Users\onigi\.gemini\antigravity\playground\phantom-sunspot
npm run build
```

## 関連ファイル

- `server.js` - Gatewayサーバー
- `src/App.jsx` - フロントエンド
- `.env` - 環境変数
- `GEMINI.md` - CLIシステムプロンプト
