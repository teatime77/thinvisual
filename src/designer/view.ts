import { escapeHtml } from "../html.js";
import { fieldLabels, type ScreenDesign } from "./schema.js";
import { compatibleProperties, fieldBinding, fieldVisibility } from "./bindings.js";
import { renderInspector, type InspectorSnapshot } from "./inspector.js";

export interface DesignerContext {
  selected: string;
  revision: string;
  onlyLowStock: boolean;
  error?: string;
  notice?: string;
  inspector?: InspectorSnapshot;
}

export function selectionUrl(selected: string, onlyLowStock: boolean, sample?: string): string {
  return `/?${new URLSearchParams({ designer: "1", selected, ...(onlyLowStock ? { lowStock: "1" } : {}), ...(sample ? { sample } : {}) })}`;
}

export function selectionLink(content: string, selected: string, context: DesignerContext): string {
  const url = escapeHtml(selectionUrl(selected, context.onlyLowStock, context.inspector?.sampleId));
  return `<a class="design-select${context.selected === selected ? " selected" : ""}" href="${url}"
    hx-get="${url}" hx-target="#workspace" hx-swap="outerHTML"${context.selected === selected ? ' aria-current="true"' : ""}>${content}</a>`;
}

export function renderDesigner(design: ScreenDesign, context: DesignerContext): string {
  const field = design.fields.find((candidate) => candidate.id === context.selected);
  const selected = field?.id ?? (context.selected === "title" ? "title" : "layout");
  const hidden = `<input type="hidden" name="designer" value="1">
    <input type="hidden" name="lowStock" value="${context.onlyLowStock ? "1" : "0"}">
    <input type="hidden" name="selected" value="${escapeHtml(selected)}">
    ${context.inspector?.sampleId ? `<input type="hidden" name="sample" value="${escapeHtml(context.inspector.sampleId)}">` : ""}
    <input type="hidden" name="revision" value="${context.revision}">`;
  const mode = design.layout.kind === "grid" ? `grid-${design.layout.columns}` : `flex-${design.layout.direction}`;
  const modes = { "grid-1": "Grid：1列", "grid-2": "Grid：2列", "grid-3": "Grid：3列", "grid-4": "Grid：4列", "flex-column": "Flex：縦並び", "flex-row": "Flex：横並び（折り返し）" };

  return `<aside class="designer" aria-label="GUIデザイナー">
    <h2>GUIデザイナー</h2>
    <p>部品一覧またはプレビューの表示項目を選択します。</p>
    ${context.error ? `<p class="error" role="alert">${escapeHtml(context.error)}</p>` : ""}
    ${context.notice ? `<p role="status">${escapeHtml(context.notice)}</p>` : ""}
    <nav class="part-list" aria-label="部品一覧">
      ${selectionLink("画面タイトル", "title", context)}
      ${selectionLink("一覧レイアウト", "layout", context)}
      ${design.fields.map((part) => selectionLink(escapeHtml(part.label), part.id, context)).join("")}
    </nav>
    <form method="post" action="/designer" hx-post="/designer" hx-target="#workspace" hx-swap="outerHTML">
      ${hidden}
      <h3>${field ? escapeHtml(fieldLabels[field.kind]) : selected === "title" ? "画面タイトル" : "一覧レイアウト"}の設定</h3>
      ${selected === "layout" ? `<label>配置<select name="mode">${Object.entries(modes).map(([value, label]) => `<option value="${value}"${value === mode ? " selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>間隔（px）<input name="gap" type="number" min="0" max="48" step="1" required value="${design.layout.gap}"></label>`
        : `<label>表示文言<input name="label" required maxlength="80" value="${escapeHtml(field ? field.label : design.title)}"></label>`}
      ${field && context.inspector ? `${field.kind !== "restock" ? `<label>表示するデータ<select name="binding">
        ${field.kind === "text" ? `<option value=""${fieldBinding(field) === undefined ? " selected" : ""}>固定テキスト</option>` : ""}
        ${compatibleProperties(field, context.inspector.types).map((property) => `<option value="${escapeHtml(property.name)}"${fieldBinding(field) === property.name ? " selected" : ""}>${escapeHtml(property.name)} : ${escapeHtml(property.type)}</option>`).join("")}
      </select></label>` : ""}
      <label>表示条件<select name="visibility">
        <option value="always"${fieldVisibility(field) === "always" ? " selected" : ""}>常に表示</option>
        <option value="never"${fieldVisibility(field) === "never" ? " selected" : ""}>非表示</option>
        ${context.inspector.types.rules.map((rule) => `<option value="${escapeHtml(rule.name)}"${fieldVisibility(field) === rule.name ? " selected" : ""}>${escapeHtml(rule.name)} ${escapeHtml(rule.signature)}</option>`).join("")}
      </select></label>` : ""}
      <button name="action" value="update" type="submit">保存して反映</button>
      ${field ? `<div class="actions">
        <button name="action" value="up" type="submit" formnovalidate${design.fields[0].id === field.id ? " disabled" : ""}>上へ</button>
        <button name="action" value="down" type="submit" formnovalidate${design.fields.at(-1)?.id === field.id ? " disabled" : ""}>下へ</button>
        <button name="action" value="remove" type="submit" formnovalidate>削除</button>
      </div>` : ""}
    </form>
    <form method="post" action="/designer" hx-post="/designer" hx-target="#workspace" hx-swap="outerHTML">
      ${hidden}
      <label>追加する部品<select name="kind">${Object.entries(fieldLabels).map(([kind, label]) => `<option value="${kind}">${escapeHtml(label)}</option>`).join("")}</select></label>
      <button name="action" value="add" type="submit">部品を追加</button>
    </form>
    <p>保存先：src/app/design.ts</p>
    ${context.inspector ? renderInspector(context.inspector, context) : ""}
  </aside>`;
}
