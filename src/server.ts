import { createApp } from "./http.js";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORTには1〜65535の整数を指定してください。");
}

createApp(undefined, { designer: process.argv.includes("--designer") }).listen(port, "127.0.0.1", () => {
  console.log(`ThinVisual: http://127.0.0.1:${port}`);
}).on("error", (error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
