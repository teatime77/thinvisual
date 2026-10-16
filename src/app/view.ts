import { needsRestock, type Item, type ItemInput } from "./logic.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

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
}

export function renderInventory(view: InventoryView): string {
  const filter = `<input type="hidden" name="lowStock" value="${view.onlyLowStock ? "1" : "0"}">`;
  const draft = view.draft ?? { name: "", quantity: "1", minimumStock: "1" };

  return `<section id="inventory" aria-label="備品管理"
    hx-target="#inventory" hx-swap="outerHTML" hx-sync="#inventory:drop"
    hx-disabled-elt="#inventory button, #inventory input">
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
      <label class="inline"><input type="checkbox" name="lowStock" value="1"${view.onlyLowStock ? " checked" : ""}>在庫が少ない備品だけ表示</label>
      <button type="submit">表示</button>
    </form>
    <p>表示 ${view.items.length} / 全 ${view.total} 件</p>
    <div class="cards">
      ${view.items.length ? view.items.map((item) => `<article data-item-id="${escapeHtml(item.id)}">
        <h2>${escapeHtml(item.name)}</h2>
        <p>在庫：<strong>${item.quantity}</strong> 個 ／ 最低在庫：${item.minimumStock} 個</p>
        ${needsRestock(item) ? '<p class="warning">⚠ 補充が必要</p>' : ""}
        <form class="actions" method="post" action="/items/${encodeURIComponent(item.id)}/adjust" hx-post="/items/${encodeURIComponent(item.id)}/adjust">
          ${filter}
          <button type="submit" name="change" value="-1" aria-label="${escapeHtml(item.name)}を1個減らす"${item.quantity === 0 ? " disabled" : ""}>−1</button>
          <button type="submit" name="change" value="1" aria-label="${escapeHtml(item.name)}を1個増やす">＋1</button>
        </form>
      </article>`).join("") : "<p>該当する備品はありません。</p>"}
    </div>
  </section>`;
}

export function renderPage(inventory: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="htmx-config" content='{"allowEval":false,"allowScriptTags":false,"responseHandling":[{"code":"204","swap":false},{"code":"[23]..","swap":true},{"code":"[45]..","swap":true,"error":true}]}'>
    <title>備品管理 | ThinVisual</title>
    <script src="/assets/htmx.min.js" defer></script>
    <style>
      * { box-sizing: border-box; }
      body { display: grid; justify-items: center; margin: 0; padding: 2rem 1rem; font-family: system-ui, sans-serif; color: #182230; background: #f5f7fa; }
      main { display: grid; gap: 1rem; width: 100%; max-width: 64rem; }
      #inventory { display: grid; gap: 1rem; }
      h1, h2, p { margin: 0; }
      h2 { font-size: 1.15rem; overflow-wrap: anywhere; }
      header { display: grid; gap: 0.5rem; }
      .add-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: 0.75rem; align-items: end; }
      label { display: grid; gap: 0.35rem; }
      input, button { font: inherit; padding: 0.5rem; min-width: 0; }
      button { cursor: pointer; }
      button:disabled { cursor: default; }
      .filter-form, .inline, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; }
      article { display: grid; align-content: start; gap: 1rem; padding: 1rem; border: 1px solid #ccd3db; border-radius: 0.5rem; background: white; }
      .warning, .error { color: #b42318; }
      .error { padding: 0.75rem; border: 1px solid currentColor; }
    </style>
  </head>
  <body>
    <main>
      <header><h1>備品管理</h1><p>備品を追加し、在庫数と補充の必要性を確認できます。</p></header>
      ${inventory}
      <p>PoC：データはサーバーのメモリ上に保持し、再起動すると初期状態に戻ります。</p>
    </main>
  </body>
</html>`;
}
