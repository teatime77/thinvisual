export type Layout =
  | { kind: "grid"; columns: number; gap: number }
  | { kind: "flex"; direction: "row" | "column"; gap: number };

export const fieldLabels = {
  name: "備品名", quantity: "在庫", minimumStock: "最低在庫",
  restock: "⚠ 補充が必要", text: "テキスト",
};

export type FieldKind = keyof typeof fieldLabels;
export interface CardField { id: string; kind: FieldKind; label: string }
export interface ScreenDesign { title: string; layout: Layout; fields: CardField[] }

export class DesignError extends Error {}
export class DesignConflictError extends DesignError {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DesignError("設定はオブジェクトで指定してください。");
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new DesignError("排他的な設定、または未対応の設定が含まれています。");
  }
}

export function readLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
    throw new DesignError("表示文言は1〜80文字で指定してください。");
  }
  return value.trim();
}

export function isFieldKind(value: unknown): value is FieldKind {
  return typeof value === "string" && Object.hasOwn(fieldLabels, value);
}

export function validateDesign(value: unknown): ScreenDesign {
  const data = record(value);
  keys(data, ["title", "layout", "fields"]);
  const layout = record(data.layout);
  if (!Number.isInteger(layout.gap) || Number(layout.gap) < 0 || Number(layout.gap) > 48) {
    throw new DesignError("間隔は0〜48pxの整数で指定してください。");
  }
  let validLayout: Layout;
  if (layout.kind === "grid") {
    keys(layout, ["kind", "columns", "gap"]);
    if (!Number.isInteger(layout.columns) || Number(layout.columns) < 1 || Number(layout.columns) > 4) {
      throw new DesignError("Gridの列数は1〜4で指定してください。");
    }
    validLayout = { kind: "grid", columns: Number(layout.columns), gap: Number(layout.gap) };
  } else if (layout.kind === "flex") {
    keys(layout, ["kind", "direction", "gap"]);
    if (layout.direction !== "row" && layout.direction !== "column") {
      throw new DesignError("Flexの方向はrowかcolumnで指定してください。");
    }
    validLayout = { kind: "flex", direction: layout.direction, gap: Number(layout.gap) };
  } else {
    throw new DesignError("レイアウトはFlexかGridで指定してください。");
  }
  if (!Array.isArray(data.fields) || data.fields.length > 12) {
    throw new DesignError("カード内の部品は12個までです。");
  }
  const ids = new Set<string>();
  const fields = data.fields.map((value) => {
    const field = record(value);
    keys(field, ["id", "kind", "label"]);
    if (typeof field.id !== "string" || !/^field-[a-zA-Z0-9-]{1,40}$/.test(field.id) || ids.has(field.id)) {
      throw new DesignError("部品IDが不正、または重複しています。");
    }
    if (!isFieldKind(field.kind)) throw new DesignError("未対応の部品です。");
    ids.add(field.id);
    return { id: field.id, kind: field.kind, label: readLabel(field.label) };
  });
  return { title: readLabel(data.title), layout: validLayout, fields };
}
