---
description: GitHub Pages へのデプロイ方法
---

# Antigravity を GitHub Pages にデプロイする

## 前提条件
- phantom-sunspot ディレクトリにいること
- 変更がコミット済みであること

## デプロイ手順

// turbo-all

1. まず変更をコミットする（まだの場合）
```bash
git add .
git commit -m "変更内容の説明"
```

2. master ブランチにプッシュ（バックアップ用）
```bash
git push origin master
```

3. ビルド＆デプロイを実行
```bash
npm run deploy
```

このコマンドは以下を自動で行います：
- `npm run build` でプロジェクトをビルド（dist フォルダ生成）
- `gh-pages -d dist` でビルド結果を gh-pages ブランチにプッシュ

4. 数分待ってから https://mii0415.github.io/antigravity-/ をハードリロード（Ctrl+Shift+R）

## 注意点
- `git push origin master` だけでは GitHub Pages に反映されない
- 必ず `npm run deploy` を実行すること
- デプロイ後、反映には数分かかることがある
