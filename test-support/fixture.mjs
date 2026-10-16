import { once } from "node:events";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInventory } from "../dist/app/logic.js";
import { createApp } from "../dist/http.js";
import { createDesignStore, serializeDesign } from "../dist/designer/store.js";

// GUIで実際のdesign.tsを編集しても、自動テストは独立した初期画面で実行する。
const initialDesign = {
  title: "備品管理", layout: { kind: "grid", columns: 2, gap: 16 },
  fields: [
    { id: "field-name", kind: "name", label: "備品名" },
    { id: "field-quantity", kind: "quantity", label: "在庫" },
    { id: "field-minimum", kind: "minimumStock", label: "最低在庫" },
    { id: "field-restock", kind: "restock", label: "⚠ 補充が必要" },
  ],
};

export async function fixture(t, { designer = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "thinvisual-test-"));
  const path = join(directory, "design.ts");
  writeFileSync(path, serializeDesign(initialDesign));
  const store = createDesignStore(path);
  const inventory = createInventory();
  const server = createApp(inventory, { designer, designStore: store }).listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
    unlinkSync(path);
    rmdirSync(directory);
  });
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    inventory, store, path,
    async request(path, fields, headers = { "HX-Request": "true" }) {
      const response = await fetch(`${base}${path}`, {
        method: fields ? "POST" : "GET",
        body: fields ? new URLSearchParams(fields) : undefined,
        headers,
        redirect: "manual",
      });
      return { status: response.status, headers: response.headers, html: await response.text() };
    },
    async save(fields, headers) {
      return this.request("/designer", {
        designer: "1", selected: "layout", revision: store.read().revision, ...fields,
      }, headers);
    },
  };
}
