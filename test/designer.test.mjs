import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createDesignStore, serializeDesign } from "../dist/designer/store.js";
import { validateDesign } from "../dist/designer/schema.js";
import { fixture } from "../test-support/fixture.mjs";

test("開発時に同じアプリ内で部品を選択し、在庫操作後もモードを保持する", async (t) => {
  const app = await fixture(t, { designer: true });
  const normal = await app.request("/", undefined, {});
  assert.match(normal.html, /デザイナーモードへ/);
  assert.doesNotMatch(normal.html, /<aside/);
  const page = await app.request("/?designer=1&selected=field-quantity&lowStock=1", undefined, {});
  assert.match(page.html, /<aside class="designer"/);
  assert.match(page.html, /name="selected" value="field-quantity"/);
  const before = readFileSync(app.path, "utf8");
  const changed = await app.request("/items/usb-cable/adjust", {
    change: "1", designer: "1", selected: "field-quantity", lowStock: "1",
  });
  assert.match(changed.html, /<main id="workspace"/);
  assert.match(changed.html, /<aside class="designer"/);
  assert.match(changed.html, /表示 1 \/ 全 3 件/);
  assert.equal(app.inventory.list()[0].quantity, 3);
  assert.equal(readFileSync(app.path, "utf8"), before);
});

test("FlexとGridをTSへ保存し、再読込後も設定を使い、在庫データを保持する", async (t) => {
  const app = await fixture(t, { designer: true });
  await app.request("/items/usb-cable/adjust", { change: "1" });
  const flex = await app.save({ action: "update", mode: "flex-column", gap: "24" });
  assert.equal(flex.status, 200);
  assert.match(flex.html, /display:flex;flex-direction:column;flex-wrap:wrap;gap:24px/);
  assert.doesNotMatch(flex.html, /grid-template-columns:repeat\(/);
  assert.deepEqual(createDesignStore(app.path).read().design.layout, { kind: "flex", direction: "column", gap: 24 });
  assert.equal(app.inventory.list()[0].quantity, 3);
  const grid = await app.save({ action: "update", mode: "grid-3", gap: "8" });
  assert.equal(grid.status, 200);
  assert.match(grid.html, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:8px/);
  assert.deepEqual(app.store.read().design.layout, { kind: "grid", columns: 3, gap: 8 });
  const native = await app.save({ selected: "title", action: "update", label: "道具管理" }, {});
  assert.equal(native.status, 303);
  const page = await app.request("/", undefined, {});
  assert.match(page.html, /<h1>道具管理<\/h1>/);
});

test("部品を追加・編集・並べ替え・削除し、表示文言をエスケープする", async (t) => {
  const app = await fixture(t, { designer: true });
  const added = await app.save({ action: "add", kind: "text" });
  assert.equal(added.status, 200);
  const field = app.store.read().design.fields.at(-1);
  const edited = await app.save({ selected: field.id, action: "update", label: '<img src=x onerror="alert(1)">' });
  assert.equal(edited.status, 200);
  assert.doesNotMatch(edited.html, /<img/);
  assert.match(edited.html, /&lt;img/);
  await app.save({ selected: field.id, action: "up" });
  assert.equal(app.store.read().design.fields.at(-2).id, field.id);
  await app.save({ selected: field.id, action: "down" });
  assert.equal(app.store.read().design.fields.at(-1).id, field.id);
  await app.save({ selected: field.id, action: "remove" });
  assert.equal(app.store.read().design.fields.length, 4);
  assert.ok(!app.store.read().design.fields.some((part) => part.id === field.id));
});

test("不正な設定・古い編集・手書きコードを拒否してソースを保護する", async (t) => {
  const app = await fixture(t, { designer: true });
  const original = readFileSync(app.path, "utf8");
  for (const fields of [
    { action: "update", mode: "flex-column", gap: "-1" },
    { action: "update", mode: "grid-9", gap: "16" },
    { selected: "title", action: "update", label: " " },
    { action: "add", kind: "script" },
  ]) {
    const result = await app.save(fields);
    assert.equal(result.status, 400);
    assert.match(result.html, /class="error" role="alert"/);
    assert.equal(readFileSync(app.path, "utf8"), original);
  }
  assert.throws(() => validateDesign({ ...app.store.read().design, layout: { kind: "flex", direction: "row", columns: 2, gap: 16 } }), /排他的/);
  const staleRevision = app.store.read().revision;
  await app.save({ selected: "title", action: "update", label: "別の編集" });
  const current = readFileSync(app.path, "utf8");
  const stale = await app.save({ revision: staleRevision, action: "update", mode: "grid-1", gap: "0" });
  assert.equal(stale.status, 409);
  assert.equal(readFileSync(app.path, "utf8"), current);
  const handEdited = `${current}\n// ユーザーの手書きコード\n`;
  writeFileSync(app.path, handEdited);
  const refused = await app.request("/designer", {
    designer: "1", revision: staleRevision, selected: "title", action: "update", label: "上書き",
  });
  assert.equal(refused.status, 422);
  assert.equal(readFileSync(app.path, "utf8"), handEdited);
  writeFileSync(app.path, serializeDesign({ title: "不正", layout: { kind: "grid", columns: 1, gap: 0 }, fields: [] }).replace('"columns": 1', '"columns": 9'));
  const invalid = await app.request("/?designer=1");
  assert.equal(invalid.status, 422);
  assert.match(invalid.html, /Gridの列数は1〜4/);
});

test("通常起動ではソース保存を公開せず、開発時も別サイトからの保存を拒否する", async (t) => {
  const normal = await fixture(t);
  const before = readFileSync(normal.path, "utf8");
  assert.doesNotMatch((await normal.request("/?designer=1", undefined, {})).html, /<aside|デザイナーモードへ/);
  assert.equal((await normal.save({ action: "update", selected: "title", label: "変更" })).status, 404);
  assert.equal(readFileSync(normal.path, "utf8"), before);
  const dev = await fixture(t, { designer: true });
  const blocked = await dev.save({ action: "update", selected: "title", label: "変更" }, { "HX-Request": "true", Origin: "https://another-site.example" });
  assert.equal(blocked.status, 403);
  assert.equal(readFileSync(dev.path, "utf8"), before);
});
