import { createRequire } from "node:module";
import express, { type Request, type Response } from "express";
import {
  createInventory, ItemNotFoundError, ValidationError, type ItemInput,
} from "./app/logic.js";
import { renderInventory, renderPage } from "./app/view.js";

const require = createRequire(import.meta.url);
const htmxPath = require.resolve("htmx.org/dist/htmx.min.js");

export function createApp(inventory = createInventory()) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.urlencoded({ extended: false, limit: "8kb" }));

  app.use((request, response, next) => {
    // ブラウザーからの別オリジンのフォーム送信では在庫を変更させない。
    const origin = request.get("origin");
    if (request.method === "POST" && origin && origin !== `${request.protocol}://${request.get("host")}`) {
      response.status(403);
      sendInventory(request, response, { error: "別のサイトからの操作は受け付けません。" });
      return;
    }
    next();
  });

  function onlyLowStock(request: Request): boolean {
    return (request.method === "GET" ? request.query.lowStock : request.body?.lowStock) === "1";
  }

  function sendInventory(request: Request, response: Response, options: {
    error?: string; notice?: string; draft?: ItemInput;
  } = {}) {
    const fragment = renderInventory({
      items: inventory.list(onlyLowStock(request)),
      total: inventory.list().length,
      onlyLowStock: onlyLowStock(request),
      ...options,
    });
    response.set("Cache-Control", "no-store");
    response.vary("HX-Request");
    response.type("html").send(request.get("HX-Request") === "true" ? fragment : renderPage(fragment));
  }

  function mutate(request: Request, response: Response, operation: () => string, draft?: ItemInput) {
    try {
      const notice = operation();
      if (request.get("HX-Request") !== "true") {
        response.redirect(303, onlyLowStock(request) ? "/?lowStock=1" : "/");
        return;
      }
      sendInventory(request, response, { notice });
    } catch (error) {
      if (!(error instanceof ValidationError || error instanceof ItemNotFoundError)) throw error;
      response.status(error instanceof ItemNotFoundError ? 404 : 400);
      sendInventory(request, response, { error: error.message, draft });
    }
  }

  app.get("/assets/htmx.min.js", (_request, response) => response.sendFile(htmxPath));
  app.get(["/", "/items"], (request, response) => sendInventory(request, response));

  app.post("/items", (request, response) => {
    const draft = {
      name: request.body?.name,
      quantity: request.body?.quantity,
      minimumStock: request.body?.minimumStock,
    };
    mutate(request, response, () => {
      const item = inventory.add(draft);
      return `${item.name}を追加しました。`;
    }, draft);
  });

  app.post("/items/:id/adjust", (request, response) => {
    mutate(request, response, () => {
      const change = request.body?.change;
      if (change !== "1" && change !== "-1") {
        throw new ValidationError("在庫は1個ずつ増減してください。");
      }
      const item = inventory.adjust(request.params.id, Number(change));
      return `${item.name}の在庫を${item.quantity}個に変更しました。`;
    });
  });

  return app;
}
