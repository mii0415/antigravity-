# Antigravity 運用ガイド

## 🚀 起動手順

### ターミナル1：サーバー起動
```powershell
cd c:\Users\onigi\.gemini\antigravity\playground\phantom-sunspot
node server.js
```

### ターミナル2：Ollama起動（使用時のみ）
```powershell
$env:OLLAMA_HOST = "0.0.0.0"; ollama serve
```

---

## 🌐 アクセス方法

### スマホ（Tailscale VPN有効時）
```
https://mii0415.github.io/antigravity-/
```

### 設定画面で入力するゲートウェイURL
```
http://100.126.88.16:8080
```

---

## ✅ 動作する機能

| 機能 | 状態 |
|------|------|
| チャット | ✅ |
| TTS（読み上げ） | ✅ |
| Ollama | ✅ |
| Push通知（フォアグラウンド） | ✅ |
| Push通知（バックグラウンド） | ✅ |
| Live2D | ✅ |

---

## 🔧 トラブルシューティング

### Ollamaに接続できない
```powershell
$env:OLLAMA_HOST = "0.0.0.0"; ollama serve
```

### ゲートウェイがオフライン
1. `node server.js` が起動しているか確認
2. Tailscale VPNがスマホで有効か確認

### 通知が来ない
1. GitHub Pages版を使用しているか確認
2. ブラウザの通知許可を確認

---

## 📁 重要なファイル

| ファイル | 役割 |
|----------|------|
| `server.js` | メインサーバー |
| `docs/CLOUDFLARE_BACKUP.md` | Cloudflare設定（参考用） |

---

## 🌟 URL早見表

| 用途 | URL |
|------|-----|
| **メインアプリ** | https://mii0415.github.io/antigravity-/ |
| **ゲートウェイ** | http://100.126.88.16:8080 |
| **Ollama** | http://100.126.88.16:11434 |

---

*最終更新: 2025-12-19*
