import { createRequire } from "node:module";
import express, { type Request, type Response } from "express";
import {
  createInventory, ItemNotFoundError, ValidationError, type ItemInput,
} from "./app/logic.js";
import { renderInventory, renderPage, renderWorkspace } from "./app/view.js";
import { escapeHtml } from "./html.js";
import { updateDesign } from "./designer/actions.js";
import { DesignConflictError, DesignError } from "./designer/schema.js";
import { createDesignStore, type DesignStore } from "./designer/store.js";
import { selectionUrl } from "./designer/view.js";

const require = createRequire(import.meta.url);
const htmxPath = require.resolve("htmx.org/dist/htmx.min.js");

export function createApp(inventory = createInventory(), options: { designer?: boolean; designStore?: DesignStore } = {}) {
  const app = express();
  const designStore = options.designStore ?? createDesignStore();
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
    return parameter(request, "lowStock") === "1";
  }

  function parameter(request: Request, name: string): unknown {
    return request.method === "GET" ? request.query[name] : request.body?.[name];
  }

  function designMode(request: Request): boolean {
    return options.designer === true && parameter(request, "designer") === "1";
  }

  function returnUrl(request: Request): string {
    const selected = parameter(request, "selected");
    return designMode(request) ? selectionUrl(typeof selected === "string" ? selected : "layout", onlyLowStock(request))
      : onlyLowStock(request) ? "/?lowStock=1" : "/";
  }

  function sendInventory(request: Request, response: Response, messages: {
    error?: string; notice?: string; draft?: ItemInput;
    designError?: string; designNotice?: string;
  } = {}) {
    let snapshot;
    try { snapshot = designStore.read(); }
    catch (error) {
      if (!(error instanceof DesignError)) throw error;
      const partialInventory = request.get("HX-Request") === "true" && !designMode(request);
      const tag = partialInventory ? "section" : "main";
      const html = `<${tag} id="${partialInventory ? "inventory" : "workspace"}"><p class="error" role="alert">${escapeHtml(error.message)}</p><a href="/">再読み込み</a></${tag}>`;
      response.status(422).set("Cache-Control", "no-store").type("html").send(request.get("HX-Request") === "true" ? html : renderPage(html));
      return;
    }
    const selected = parameter(request, "selected");
    const designer = designMode(request) ? {
      selected: typeof selected === "string" && (selected === "title" || snapshot.design.fields.some((field) => field.id === selected)) ? selected : "layout",
      revision: snapshot.revision,
      onlyLowStock: onlyLowStock(request),
      error: messages.designError,
      notice: messages.designNotice,
    } : undefined;
    const fragment = renderInventory({
      items: inventory.list(onlyLowStock(request)),
      total: inventory.list().length,
      onlyLowStock: onlyLowStock(request),
      error: messages.error, notice: messages.notice, draft: messages.draft,
      design: snapshot.design, designer,
    });
    const workspace = renderWorkspace(fragment, snapshot.design, {
      designerEnabled: options.designer === true, onlyLowStock: onlyLowStock(request), designer,
    });
    response.set("Cache-Control", "no-store");
    response.vary("HX-Request");
    response.type("html").send(request.get("HX-Request") === "true" ? (designer ? workspace : fragment) : renderPage(workspace, snapshot.design.title));
  }

  function mutate(request: Request, response: Response, operation: () => string, draft?: ItemInput) {
    try {
      const notice = operation();
      if (request.get("HX-Request") !== "true") {
        response.redirect(303, returnUrl(request));
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

  if (options.designer) {
    app.post("/designer", (request, response) => {
      try {
        if (!designMode(request)) throw new DesignError("デザイナーモードから操作してください。");
        if (typeof request.body?.revision !== "string") throw new DesignConflictError("画面を再読み込みしてから保存してください。");
        const updated = updateDesign(designStore.read().design, request.body);
        designStore.save(updated.design, request.body.revision);
        request.body.selected = updated.selected;
        if (request.get("HX-Request") !== "true") {
          response.redirect(303, returnUrl(request));
          return;
        }
        sendInventory(request, response, { designNotice: "TypeScriptに保存して反映しました。" });
      } catch (error) {
        if (!(error instanceof DesignError)) throw error;
        response.status(error instanceof DesignConflictError ? 409 : 400);
        sendInventory(request, response, { designError: error.message, error: designMode(request) ? undefined : error.message });
      }
    });
  }

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
