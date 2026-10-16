# thinvisual
HTML-over-the-wire applications with a GUI designer

## 開発環境

- Node.js 24以上（npm付属）
- TypeScript / Express / htmx

PowerShellでリポジトリのディレクトリを開き、実行します。

```powershell
npm.cmd ci
npm.cmd run dev
```

ブラウザーで http://127.0.0.1:3000 を開きます。「サーバーとの接続を確認」を押すと、
サーバーから返されたHTMLでメッセージが更新されます。htmxはローカルのnpmパッケージから配信します。

開発中は `tsx watch` がTypeScriptの保存を検知してサーバーを再起動します。
ブラウザーは手動で再読み込みしてください。Viteによる自動反映は後続の実装で追加します。
停止するには `Ctrl+C` を押します。

ポートを変える場合は、起動前に `$env:PORT = '3001'` のように指定します。
サーバーはローカルPCの `127.0.0.1` で待ち受けます。

## チェックとビルド

```powershell
npm.cmd run verify
npm.cmd start
```

`verify` は型チェックとJavaScriptへのビルドを実行します。
`start` はビルド済みの `dist/server.js` をNode.jsで実行します。
ブラウザーでの操作確認は別途行ってください。

## 現在の範囲

開発用の起動確認画面まで用意しています。
備品管理、DB、デザイナーモード、ts-morphによる型情報表示は後続の実装です。
