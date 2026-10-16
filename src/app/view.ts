import { needsRestock, type Item, type ItemInput } from "./logic.js";
import { escapeHtml } from "../html.js";
import { renderDesigner, selectionLink, type DesignerContext } from "../designer/view.js";
import { type CardField, type ScreenDesign } from "../designer/schema.js";

function inputValue(value: unknown): string {
  return typeof value === "string" ? escapeHtml(value) : "";
}

interface InventoryView {
  items: Item[];
  total: number;
  onlyLowStock: boolean;
  error?: string;
  notice?: string;
  draft?: ItemInput;
  design: ScreenDesign;
  designer?: DesignerContext;
}

function renderField(field: CardField, item: Item, designer?: DesignerContext): string {
  let content: string;
  const label = escapeHtml(field.label);
  if (field.kind === "name") content = `<h2><span class="field-label">${label}</span>${escapeHtml(item.name)}</h2>`;
  else if (field.kind === "quantity") content = `<p>${label}：<strong>${item.quantity}</strong> 個</p>`;
  else if (field.kind === "minimumStock") content = `<p>${label}：${item.minimumStock} 個</p>`;
  else if (field.kind === "restock") {
    if (!needsRestock(item)) return "";
    content = `<p class="warning">${label}</p>`;
  } else content = `<p>${label}</p>`;
  return designer ? selectionLink(content, field.id, designer) : content;
}

export function renderInventory(view: InventoryView): string {
  const designerFields = view.designer ? `<input type="hidden" name="designer" value="1"><input type="hidden" name="selected" value="${escapeHtml(view.designer.selected)}">` : "";
  const filter = `<input type="hidden" name="lowStock" value="${view.onlyLowStock ? "1" : "0"}">${designerFields}`;
  const draft = view.draft ?? { name: "", quantity: "1", minimumStock: "1" };
  const layout = view.design.layout;
  const layoutStyle = layout.kind === "grid"
    ? `display:grid;grid-template-columns:repeat(${layout.columns},minmax(0,1fr));gap:${layout.gap}px`
    : `display:flex;flex-direction:${layout.direction};flex-wrap:wrap;gap:${layout.gap}px`;

  return `<section id="inventory" aria-label="備品管理"
    hx-target="${view.designer ? "#workspace" : "#inventory"}" hx-swap="outerHTML" hx-sync="${view.designer ? "#workspace" : "#inventory"}:drop"
    hx-disabled-elt="${view.designer ? "#workspace button, #workspace input, #workspace select" : "#inventory button, #inventory input"}">
    <form class="add-form" method="post" action="/items" hx-post="/items">
      ${filter}
      <label>備品名<input name="name" required maxlength="80" value="${inputValue(draft.name)}"></label>
      <label>在庫数<input name="quantity" type="number" min="0" step="1" required value="${inputValue(draft.quantity)}"></label>
      <label>最低在庫数<input name="minimumStock" type="number" min="0" step="1" required value="${inputValue(draft.minimumStock)}"></label>
      <button type="submit">追加</button>
    </form>
    ${view.error ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>` : ""}
    ${view.notice ? `<p role="status">${escapeHtml(view.notice)}</p>` : ""}
    <form method="get" action="/" hx-get="/items" hx-trigger="change, submit" class="filter-form">
      ${designerFields}
      <label class="inline"><input type="checkbox" name="lowStock" value="1"${view.onlyLowStock ? " checked" : ""}>在庫が少ない備品だけ表示</label>
      <button type="submit">表示</button>
    </form>
    <p>表示 ${view.items.length} / 全 ${view.total} 件</p>
    <div class="cards${layout.kind === "flex" && layout.direction === "row" ? " flex-row" : ""}" style="${layoutStyle}">
      ${view.items.length ? view.items.map((item) => `<article data-item-id="${escapeHtml(item.id)}">
        ${view.design.fields.map((field) => renderField(field, item, view.designer)).join("")}
        <form class="actions" method="post" action="/items/${encodeURIComponent(item.id)}/adjust" hx-post="/items/${encodeURIComponent(item.id)}/adjust">
          ${filter}
          <button type="submit" name="change" value="-1" aria-label="${escapeHtml(item.name)}を1個減らす"${item.quantity === 0 ? " disabled" : ""}>−1</button>
          <button type="submit" name="change" value="1" aria-label="${escapeHtml(item.name)}を1個増やす">＋1</button>
        </form>
      </article>`).join("") : "<p>該当する備品はありません。</p>"}
    </div>
  </section>`;
}

export function renderWorkspace(inventory: string, design: ScreenDesign, options: {
  designerEnabled: boolean; onlyLowStock: boolean; designer?: DesignerContext;
}): string {
  const modeUrl = `/?${new URLSearchParams({ ...(options.onlyLowStock ? { lowStock: "1" } : {}), ...(!options.designer ? { designer: "1" } : {}) })}`;
  const title = `<h1>${escapeHtml(design.title)}</h1>`;
  return `<main id="workspace"${options.designer ? ' class="design-mode" hx-sync="#workspace:drop" hx-disabled-elt="#workspace button, #workspace input, #workspace select"' : ""}>
    <header>
      ${options.designer ? selectionLink(title, "title", options.designer) : title}
      <p>備品を追加し、在庫数と補充の必要性を確認できます。</p>
      ${options.designerEnabled ? `<a href="${escapeHtml(modeUrl)}">${options.designer ? "通常モードへ" : "デザイナーモードへ"}</a>` : ""}
    </header>
    <div class="${options.designer ? "designer-shell" : "preview"}">
      <div class="preview">${options.designer ? selectionLink("一覧レイアウトを選択", "layout", options.designer) : ""}${inventory}</div>
      ${options.designer ? renderDesigner(design, options.designer) : ""}
    </div>
    <p>PoC：備品データはメモリ上に保持し、再起動すると初期状態に戻ります。</p>
  </main>`;
}

export function renderPage(workspace: string, title = "備品管理"): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="htmx-config" content='{"allowEval":false,"allowScriptTags":false,"responseHandling":[{"code":"204","swap":false},{"code":"[23]..","swap":true},{"code":"[45]..","swap":true,"error":true}]}'>
    <title>${escapeHtml(title)} | ThinVisual</title>
    <script src="/assets/htmx.min.js" defer></script>
    <style>
      * { box-sizing: border-box; }
      body { display: grid; justify-items: center; margin: 0; padding: 2rem 1rem; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
      main { display: grid; gap: 1rem; width: 100%; max-width: 64rem; }
      #inventory { display: grid; gap: 1rem; }
      h1, h2, h3, p { margin: 0; }
      h2 { font-size: 1.15rem; overflow-wrap: anywhere; }
      header { display: grid; gap: 0.5rem; }
      .add-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: 0.75rem; align-items: end; }
      label { display: grid; gap: 0.35rem; }
      input, button, select { font: inherit; padding: 0.5rem; min-width: 0; }
      button { cursor: pointer; }
      button:disabled { cursor: default; }
      .filter-form, .inline, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
      .cards.flex-row > article { flex: 1 1 14rem; }
      article { display: grid; align-content: start; gap: 1rem; padding: 1rem; border: 1px solid #ccd3db; border-radius: 0.5rem; background: white; }
      .warning, .error { color: #b42318; }
      .error { padding: 0.75rem; border: 1px solid currentColor; }
      .field-label { display: grid; font-size: 0.8rem; font-weight: normal; }
      .design-mode { max-width: 84rem; }
      .designer-shell { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem); gap: 1rem; align-items: start; }
      .preview, .designer, .designer form, .part-list { display: grid; gap: 0.75rem; min-width: 0; }
      .designer { padding: 1rem; border: 1px solid #ccd3db; background: white; }
      .design-select { display: grid; gap: 0.25rem; padding: 0.25rem; border: 1px dashed #667085; color: inherit; text-decoration: none; overflow-wrap: anywhere; }
      .design-select.selected { outline: 2px solid #175cd3; background: #eff8ff; }
      @media (max-width: 800px) { .designer-shell { grid-template-columns: minmax(0, 1fr); } }
    </style>
  </head>
  <body>
    ${workspace}
  </body>
</html>`;
}
