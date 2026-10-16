import { createRequire } from "node:module";
import express from "express";

const require = createRequire(import.meta.url);
const htmxPath = require.resolve("htmx.org/dist/htmx.min.js");
const app = express();
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORTには1〜65535の整数を指定してください。");
}

app.disable("x-powered-by");

app.get("/assets/htmx.min.js", (_request, response) => {
  response.sendFile(htmxPath);
});

app.get("/", (_request, response) => {
  response.type("html").send(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ThinVisual</title>
    <script src="/assets/htmx.min.js" defer></script>
    <style>
      body { display: grid; gap: 1rem; padding: 2rem; font-family: system-ui, sans-serif; }
      main { display: grid; gap: 1rem; justify-items: start; }
      button { padding: 0.5rem 1rem; font: inherit; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>ThinVisual</h1>
      <p>TypeScript + Express + htmx の開発環境です。</p>
      <button type="button" hx-get="/status" hx-target="#status" hx-swap="innerHTML">
        サーバーとの接続を確認
      </button>
      <p id="status" role="status">ボタンを押すと、サーバーから取得したHTMLでこの部分を更新します。</p>
    </main>
  </body>
</html>`);
});

app.get("/status", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.type("html").send(
    `接続できました。サーバー時刻：<time>${new Date().toISOString()}</time>`,
  );
});

app.listen(port, "127.0.0.1", () => {
  console.log(`ThinVisual: http://127.0.0.1:${port}`);
}).on("error", (error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
