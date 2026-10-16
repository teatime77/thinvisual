import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createInventory, needsRestock } from "../dist/app/logic.js";
import { createApp } from "../dist/http.js";

async function fixture(t) {
  const inventory = createInventory();
  const server = createApp(inventory).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    inventory,
    async request(path, fields, headers = { "HX-Request": "true" }) {
      const response = await fetch(`${base}${path}`, {
        method: fields ? "POST" : "GET",
        body: fields ? new URLSearchParams(fields) : undefined,
        headers,
        redirect: "manual",
      });
      return { status: response.status, headers: response.headers, html: await response.text() };
    },
  };
}

test("初期画面・HTML断片・htmxを配信し、不足品を絞り込める", async (t) => {
  const { request } = await fixture(t);
  const page = await request("/", undefined, {});
  assert.equal(page.status, 200);
  assert.match(page.html, /<!doctype html>/);
  assert.match(page.html, /表示 3 \/ 全 3 件/);
  const partial = await request("/items?lowStock=1");
  assert.equal(partial.status, 200);
  assert.doesNotMatch(partial.html, /<!doctype html>/);
  assert.match(partial.html, /表示 2 \/ 全 3 件/);
  assert.match(partial.html, /data-item-id="usb-cable"/);
  assert.doesNotMatch(partial.html, /data-item-id="batteries"/);
  assert.match(partial.html, /name="lowStock" value="1" checked/);
  const asset = await request("/assets/htmx.min.js");
  assert.equal(asset.status, 200);
  assert.ok(asset.html.length > 10000);
});

test("追加した名前をHTMLとして実行させず、不正な入力ではデータを変更しない", async (t) => {
  const { request, inventory } = await fixture(t);
  const name = '<img src=x onerror=alert(1)> & "備品"';
  const added = await request("/items", { name, quantity: "2", minimumStock: "3" });
  assert.equal(added.status, 200);
  assert.match(added.html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;備品&quot;/);
  assert.doesNotMatch(added.html, /<img/);
  assert.equal(inventory.list().at(-1).name, name);
  const before = inventory.list();
  for (const fields of [
    { name: " ", quantity: "1", minimumStock: "1" },
    { name: "x".repeat(81), quantity: "1", minimumStock: "1" },
    ...["", "-1", "1.5", "NaN", "9007199254740992"].map((quantity) => ({ name: "無効", quantity, minimumStock: "1" })),
    { name: "無効", quantity: "1", minimumStock: "-1" },
  ]) {
    const rejected = await request("/items", fields);
    assert.equal(rejected.status, 400);
    assert.match(rejected.html, /role="alert"/);
    assert.deepEqual(inventory.list(), before);
  }
});

test("在庫を1個ずつ増減し、負数・範囲外・存在しない備品を拒否する", async (t) => {
  const { request, inventory } = await fixture(t);
  assert.equal((await request("/items/usb-cable/adjust", { change: "-1" })).status, 200);
  assert.equal(inventory.list()[0].quantity, 1);
  assert.equal((await request("/items/usb-cable/adjust", { change: "1" })).status, 200);
  assert.equal(inventory.list()[0].quantity, 2);
  assert.equal((await request("/items/paper/adjust", { change: "-1" })).status, 400);
  assert.equal(inventory.list()[2].quantity, 0);
  assert.equal((await request("/items/usb-cable/adjust", { change: "5" })).status, 400);
  assert.equal((await request("/items/missing/adjust", { change: "1" })).status, 404);
  const maximum = inventory.add({ name: "上限", quantity: String(Number.MAX_SAFE_INTEGER), minimumStock: "0" });
  assert.equal((await request(`/items/${maximum.id}/adjust`, { change: "1" })).status, 400);
  assert.equal(inventory.list().at(-1).quantity, Number.MAX_SAFE_INTEGER);
});

test("補充判定の境界と絞り込みを、在庫操作・追加後にも反映する", async (t) => {
  const { request, inventory } = await fixture(t);
  assert.equal(needsRestock(inventory.list()[0]), true);
  const adjusted = await request("/items/usb-cable/adjust", { change: "1", lowStock: "1" });
  assert.equal(adjusted.status, 200);
  assert.equal(needsRestock(inventory.list()[0]), false);
  assert.match(adjusted.html, /表示 1 \/ 全 3 件/);
  assert.doesNotMatch(adjusted.html, /data-item-id="usb-cable"/);
  const added = await request("/items", { name: "テープ", quantity: "0", minimumStock: "1", lowStock: "1" });
  assert.match(added.html, /表示 2 \/ 全 4 件/);
  assert.match(added.html, /テープ/);
  await request("/items/paper/adjust", { change: "1", lowStock: "1" });
  const tape = inventory.list().find((item) => item.name === "テープ");
  const empty = await request(`/items/${tape.id}/adjust`, { change: "1", lowStock: "1" });
  assert.match(empty.html, /該当する備品はありません/);
});

test("通常のフォーム送信にも対応し、別サイトからの変更を拒否する", async (t) => {
  const { request, inventory } = await fixture(t);
  const native = await request("/items", { name: "テープ", quantity: "1", minimumStock: "1", lowStock: "1" }, {});
  assert.equal(native.status, 303);
  assert.equal(native.headers.get("location"), "/?lowStock=1");
  const before = inventory.list();
  const rejected = await request("/items/usb-cable/adjust", { change: "1" }, {
    "HX-Request": "true", Origin: "https://another-site.example",
  });
  assert.equal(rejected.status, 403);
  assert.match(rejected.html, /role="alert"/);
  assert.deepEqual(inventory.list(), before);
});
