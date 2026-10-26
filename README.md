# shortsong — OCT Medley 配信リポジトリ

```
shortsong/
├─ songs/                         ← 楽曲登録で書き出した .oct8 を置くだけ
├─ tools/build-catalog.mjs        ← カタログ生成スクリプト（Actions が実行）
├─ .github/workflows/build-catalog.yml
└─ oct-medley.html                ← 任意：置くと Pages のトップでアプリが開けます
```

## 初回設定（1回だけ）
1. このフォルダの中身をリポジトリにコミット＆プッシュ
2. GitHub のリポジトリ → **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更
3. **Actions** タブで「Build OCT catalog & deploy Pages」が緑になれば完了
   - 公開先：`https://yumenyan.github.io/shortsong/`
4. 暗号キーを独自に変えた場合のみ：Settings → Secrets and variables → Actions に `OCT_PASSPHRASE` を登録

## ふだんの運用
- **追加**：`songs/` に `.oct8` を置いてプッシュ → 1〜2分でアプリに反映
- **修正**：アプリの「既存の曲を修正」で同じIDのまま書き出し、同名ファイルを上書き
- **削除**：`songs/` からファイルを消すだけ（カタログからも自動で消えます）
- `catalog.oct8c` は毎回すべての `.oct8` から作り直すため、手で編集・コミットする必要はありません
- タイトル・作曲者の空欄、ID・番号の重複は Actions の警告とアプリの楽曲登録画面に表示されます
