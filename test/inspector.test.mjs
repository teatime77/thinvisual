import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Project } from "ts-morph";
import { analyzeTypes, createTypeInspector } from "../dist/designer/types.js";
import { fixture } from "../test-support/fixture.mjs";

function card(html, id) {
  const match = html.match(new RegExp(`<article data-item-id="${id}">([\\s\\S]*?)</article>`));
  assert.ok(match, `${id}のカードが必要`);
  return match[1];
}

const sourceText = `
export interface Item { id: string; name: string; quantity: number; enabled?: boolean; tags: string[] }
export function createInventory() { return { list(): Item[] { return []; } }; }
export const visibilityRules = {
  valid: (item: Item): boolean => item.quantity > 0,
  asyncRule: async (item: Item): Promise<boolean> => true,
  wrongResult: (item: Item): string => item.name,
  noArgument: (): boolean => true,
  unknownArgument: (item: unknown): boolean => true,
};
throw new Error("型解析でこのコードを実行してはいけない");
`;

test("ts-morphでプロパティ・配列・関数の型を読み、コードは実行しない", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const metadata = analyzeTypes(project.createSourceFile("/logic.ts", sourceText));
  assert.equal(metadata.collectionType, "Item[]");
  assert.deepEqual(metadata.properties.map(({ name, kind }) => [name, kind]), [
    ["id", "string"], ["name", "string"], ["quantity", "number"], ["enabled", "boolean"], ["tags", "unsupported"],
  ]);
  assert.match(metadata.properties.find((property) => property.name === "enabled").type, /undefined/);
  assert.deepEqual(metadata.rules.map((rule) => rule.name), ["valid"]);
  assert.match(metadata.rules[0].signature, /item: Item.*boolean/);
  assert.equal(metadata.warnings.length, 4);
});

test("ソース変更後は型情報を更新し、構文エラーを通知する", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "thinvisual-types-"));
  const path = join(directory, "logic.ts");
  t.after(() => { unlinkSync(path); rmdirSync(directory); });
  writeFileSync(path, sourceText);
  const inspector = createTypeInspector(path, fileURLToPath(new URL("../tsconfig.json", import.meta.url)));
  assert.equal(inspector.read().properties.find((property) => property.name === "quantity").kind, "number");
  writeFileSync(path, sourceText.replace("quantity: number", "quantity: string"));
  assert.equal(inspector.read().properties.find((property) => property.name === "quantity").kind, "string");
  writeFileSync(path, "export interface Item { = }");
  assert.throws(() => inspector.read(), /構文エラー/);
});

test("備品を選んで型・現在値・関数結果を表示し、互換性のある候補だけを出す", async (t) => {
  const app = await fixture(t, { designer: true });
  const result = await app.request("/?designer=1&selected=field-quantity&sample=paper");
  assert.equal(result.status, 200);
  assert.match(result.html, /データインスペクター/);
  assert.match(result.html, /<code>Item\[\]<\/code>：3件/);
  assert.match(result.html, /data-property="quantity"[\s\S]*?<code>number<\/code>[\s\S]*?<dd>0<\/dd>/);
  assert.match(result.html, /data-rule="hasStock"[\s\S]*?現在の判定：false/);
  const bindingOptions = result.html.match(/<select name="binding">([\s\S]*?)<\/select>/)[1];
  assert.match(bindingOptions, /value="quantity"/);
  assert.match(bindingOptions, /value="minimumStock"/);
  assert.doesNotMatch(bindingOptions, /value="name"/);
  assert.match(result.html, /selected=field-name&amp;sample=paper/);
  const changed = await app.request("/items/paper/adjust", {
    change: "1", designer: "1", selected: "field-quantity", sample: "paper",
  });
  assert.match(changed.html, /data-rule="hasStock"[\s\S]*?現在の判定：true/);
  assert.match(changed.html, /name="sample" value="paper"/);
});

test("型に合うデータと表示関数をTSに保存し、通常画面でも反映する", async (t) => {
  const app = await fixture(t, { designer: true });
  const saved = await app.save({
    selected: "field-quantity", action: "update", label: "表示値",
    binding: "minimumStock", visibility: "hasStock", sample: "paper",
  });
  assert.equal(saved.status, 200);
  assert.match(saved.html, /name="sample" value="paper"/);
  const field = app.store.read().design.fields.find((part) => part.id === "field-quantity");
  assert.equal(field.binding, "minimumStock");
  assert.equal(field.visibility, "hasStock");
  const normal = await app.request("/", undefined, {});
  assert.match(card(normal.html, "usb-cable"), /表示値：<strong>3<\/strong>/);
  assert.doesNotMatch(card(normal.html, "paper"), /表示値/);
  assert.doesNotMatch(normal.html, /データインスペクター/);
  await app.save({ selected: "field-restock", action: "update", label: "注意", visibility: "always" });
  assert.match(card((await app.request("/items")).html, "batteries"), /注意/);
  await app.save({ selected: "field-restock", action: "update", label: "注意", visibility: "never" });
  assert.doesNotMatch(card((await app.request("/items")).html, "usb-cable"), /注意/);
});

test("型の不一致・存在しない参照・任意コードを保存せず、元のソースを維持する", async (t) => {
  const app = await fixture(t, { designer: true });
  const original = readFileSync(app.path, "utf8");
  for (const fields of [
    { selected: "field-name", binding: "quantity" },
    { selected: "field-quantity", binding: "name" },
    { selected: "field-quantity", binding: "missing" },
    { selected: "field-name", binding: "__proto__" },
    { selected: "field-name", binding: "item.name" },
    { selected: "field-restock", binding: "name" },
    { selected: "field-name", visibility: "constructor" },
    { selected: "field-name", visibility: "() => true" },
  ]) {
    const rejected = await app.save({ action: "update", label: "無効", ...fields });
    assert.equal(rejected.status, 400);
    assert.match(rejected.html, /role="alert"/);
    assert.equal(readFileSync(app.path, "utf8"), original);
  }
});

test("固定テキストをデータ表示へ変更でき、現在値もHTMLとして解釈させない", async (t) => {
  const app = await fixture(t, { designer: true });
  await app.save({ action: "add", kind: "text" });
  const field = app.store.read().design.fields.at(-1);
  await app.save({ selected: field.id, action: "update", label: "名前", binding: "name", visibility: "always" });
  const added = app.inventory.add({ name: '<img src=x onerror="alert(1)">', quantity: "1", minimumStock: "0" });
  const shown = await app.request(`/?designer=1&selected=${field.id}&sample=${added.id}`);
  assert.equal(shown.status, 200);
  assert.doesNotMatch(shown.html, /<img/);
  assert.match(shown.html, /名前：&lt;img/);
  assert.match(shown.html, /data-property="name"[\s\S]*?&lt;img/);
  await app.save({ selected: field.id, action: "update", label: "固定", binding: "", visibility: "always" });
  assert.equal(app.store.read().design.fields.at(-1).binding, undefined);
  assert.match(card((await app.request("/items")).html, "usb-cable"), /<p>固定<\/p>/);
});
