import { type Item } from "../app/logic.js";
import { escapeHtml } from "../html.js";
import { evaluateVisibility } from "./bindings.js";
import { readVisibility } from "./schema.js";
import { type AppTypes } from "./types.js";
import { type DesignerContext } from "./view.js";

export interface InspectorSnapshot { types: AppTypes; items: Item[]; sampleId?: string }

function currentValue(item: Item | undefined, key: string): string {
  if (!item) return "データなし";
  if (!Object.hasOwn(item, key)) return "未定義";
  const value: unknown = (item as unknown as Record<string, unknown>)[key];
  if (value === undefined) return "undefined";
  // 表示は単純値まで。オブジェクト内部の値を無制限に展開しない。
  if (value !== null && typeof value === "object") return Array.isArray(value) ? `配列（${value.length}件）` : "オブジェクト";
  if (typeof value === "function") return "関数";
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

export function renderInspector(snapshot: InspectorSnapshot, context: DesignerContext): string {
  const sample = snapshot.items.find((item) => item.id === snapshot.sampleId) ?? snapshot.items[0];
  return `<section class="data-inspector" aria-label="データインスペクター">
    <h3>データインスペクター</h3>
    <p><code>${escapeHtml(snapshot.types.collectionType)}</code>：${snapshot.items.length}件</p>
    <form method="get" action="/" hx-get="/" hx-trigger="change, submit" hx-target="#workspace" hx-swap="outerHTML">
      <input type="hidden" name="designer" value="1">
      <input type="hidden" name="selected" value="${escapeHtml(context.selected)}">
      <input type="hidden" name="lowStock" value="${context.onlyLowStock ? "1" : "0"}">
      <label>現在値を確認する備品<select name="sample"${snapshot.items.length ? "" : " disabled"}>
        ${snapshot.items.length ? snapshot.items.map((item) => `<option value="${escapeHtml(item.id)}"${sample?.id === item.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("") : '<option>データなし</option>'}
      </select></label>
      <button type="submit">現在値を表示</button>
    </form>
    <p><code>${escapeHtml(snapshot.types.itemType)}</code> のプロパティ・型・現在値</p>
    <dl class="inspector-values">
      ${snapshot.types.properties.map((property) => `<div class="inspector-row" data-property="${escapeHtml(property.name)}">
        <dt><code>${escapeHtml(property.name)}</code></dt>
        <dd><code>${escapeHtml(property.type)}</code></dd>
        <dd>${escapeHtml(currentValue(sample, property.name))}</dd>
      </div>`).join("")}
    </dl>
    <h4>表示判定関数</h4>
    ${snapshot.types.rules.map((rule) => {
      let result = "データなし";
      if (sample) {
        try { result = String(evaluateVisibility(readVisibility(rule.name), sample)); }
        catch { result = "実行エラー"; }
      }
      return `<div class="inspector-rule" data-rule="${escapeHtml(rule.name)}"><code>${escapeHtml(rule.name)} ${escapeHtml(rule.signature)}</code><p>現在の判定：${escapeHtml(result)}</p></div>`;
    }).join("")}
    ${snapshot.types.warnings.map((warning) => `<p class="error" role="alert">${escapeHtml(warning)}</p>`).join("")}
  </section>`;
}
