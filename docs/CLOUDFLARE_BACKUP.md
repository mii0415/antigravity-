# Cloudflare Tunnel 設定（バックアップ）

> ⚠️ 通常運用では不要です。Tailscale + Firebase で完結しています。
> 外出先で Tailscale が使えない場合の代替手段として参照してください。

---

## Cloudflare Quick Tunnel 起動

```powershell
C:\cloudflared\cloudflared.exe tunnel --url http://localhost:8080
```

→ 表示されるURL（例：`https://xxx.trycloudflare.com`）をゲートウェイに設定

---

## 特徴

| 項目 | 内容 |
|------|------|
| **URL** | 起動するたびに変わる |
| **HTTPS** | ✅ 有効 |
| **どこからでも** | ✅ インターネット経由でアクセス可能 |
| **Tailscale不要** | ✅ VPNなしでOK |

---

## 使う場面

- Tailscale VPNが使えない環境
- 外出先から一時的にアクセスしたい時

---

## Cloudflare Zero Trust（固定URL版）

Zero Trust を使えば固定URLも可能ですが、**独自ドメインが必要**です。

### 手順

1. Cloudflare にドメインを登録
2. Zero Trust ダッシュボードでトンネル作成
3. Public Hostname を設定

現在はドメインがないため使用していません。

---

*最終更新: 2025-12-19*
