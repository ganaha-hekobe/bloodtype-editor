# bloodtype-editor

> blood-type-uranai (4 アカ並列 X 占い) の編集室。スマホから 4 アカ並列で投稿コンテンツを review・edit するための Vercel webapp。

## アーキテクチャ

```
凹兵衛さん (スマホ)
    ↓ PIN 認証
bloodtype-editor.vercel.app (Vercel 静的 + serverless functions)
    ↓ GitHub REST API (PAT `bloodtype-editor`)
ganaha-hekobe/bloodtype-today (4 yaml: posts-{a,b,o,ab}.yaml)
    ↓ generate.py (毎日 23:00 JST) / bot.py (毎日 00:10 JST)
X (4 アカ自動投稿)
```

## 機能

- ★PIN 認証★ (スマホ最適化)
- ★4 列並列レビュー★ (A/B/O/AB 同時表示、デスクトップ)
- ★モバイル切替★ (1 列 + 血液型タブ、< 900px)
- ★共通ランキングパネル★ (本日の総合運順位、4 アカ共通表示)
- ★本文 contenteditable★ (60-150 字、即保存)
- ★NG / restore★ (投稿の rejected フロー、7 日保持)
- ★統計パネル★ (順位バランス / 7 日推移 multi-line chart / 4 軸★平均)

## 環境変数 (Vercel project)

| 名 | 用途 |
|---|---|
| `GITHUB_TOKEN` | GitHub Contents R/W、PAT `bloodtype-editor` (Contents: R/W、bloodtype-today repo のみ) |
| `EDIT_PIN` | 編集室の PIN 認証 |
| `GH_OWNER` | デフォルト `ganaha-hekobe` |
| `GH_REPO` | デフォルト `bloodtype-today` |

## ローカル開発

```bash
npm install
node dev-server.mjs  # http://localhost:3000 で起動 (モック、GitHub 接続なし)
```

## 関連 docs

- 投稿フォーマット設計: [`bloodtype-today/docs/post-format-reference.md`](https://github.com/ganaha-hekobe/bloodtype-today/blob/main/docs/post-format-reference.md)
- launch plan: bloodtype-dev (blood-type-dev セッション) の scratchpad で管理

## 関連リポジトリ

- [`ganaha-hekobe/bloodtype-today`](https://github.com/ganaha-hekobe/bloodtype-today) — 投稿 cron + bot + posts-*.yaml SSOT
