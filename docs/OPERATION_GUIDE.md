# Antigravity 運用ガイド

## 🚀 起動手順（毎回やること）

### ステップ1：サーバー起動
PowerShellで実行：
```powershell
cd c:\Users\onigi\.gemini\antigravity\playground\phantom-sunspot
node server.js
```

### ステップ2：Cloudflareトンネル起動
**別のPowerShellウィンドウ**で実行：
```powershell
C:\cloudflared\cloudflared.exe tunnel --url http://localhost:8080
```

→ 表示されるURL（例：`https://xxx-xxx.trycloudflare.com`）をコピー

### ステップ3：アプリにアクセス
GitHub Pages版を使用：
```
https://mii0415.github.io/antigravity-/
```

設定画面で**ゲートウェイURL**を更新（ステップ2でコピーしたURL）

---

## ❓ PowerShell再起動するとどうなる？

| 操作 | サーバー | トンネルURL |
|------|---------|-------------|
| **PowerShell閉じる** | ❌ 停止 | ❌ 変わる |
| **PCスリープ/復帰** | ✅ 継続 | ✅ 継続 |
| **PC再起動** | ❌ 停止 | ❌ 変わる |

→ **PowerShellを閉じたら、ステップ1から再実行が必要**

---

## 🔧 TTS設定

### アプリ設定画面で：
1. **TTS有効** → ON
2. **TTS音声** → 好みの音声を選択
3. **音量** → 調整

### 動作：
- AIの応答が自動で読み上げられる
- 通知クリック時も読み上げ

---

## 🤖 Ollama設定

### 1. Ollamaインストール
https://ollama.ai からダウンロード・インストール

### 2. モデル取得
```powershell
ollama pull llama3.2
```

### 3. Ollama起動
```powershell
ollama serve
```
（デフォルトで `http://localhost:11434` で動作）

### 4. アプリ設定
設定画面で：
- **API選択** → `Ollama`
- **モデル名** → `llama3.2`（取得したモデル名）

---

## 📌 よく使うコマンド一覧

```powershell
# サーバー起動
cd c:\Users\onigi\.gemini\antigravity\playground\phantom-sunspot
node server.js

# Cloudflareトンネル起動
C:\cloudflared\cloudflared.exe tunnel --url http://localhost:8080

# Ollama起動
ollama serve

# Ollamaモデル一覧
ollama list
```

---

## 🌐 URL早見表

| 用途 | URL |
|------|-----|
| **GitHub Pages版** | https://mii0415.github.io/antigravity-/ |
| **ローカル直接** | http://localhost:8080/antigravity-/ |
| **Tailscale経由** | http://100.126.88.16:8080/antigravity-/ |
| **Cloudflareトンネル** | ※毎回変わる（起動時に確認） |
