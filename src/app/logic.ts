import { randomUUID } from "node:crypto";

export interface Item {
  id: string;
  name: string;
  quantity: number;
  minimumStock: number;
}

export interface ItemInput {
  name: unknown;
  quantity: unknown;
  minimumStock: unknown;
}

export class ValidationError extends Error {}
export class ItemNotFoundError extends Error {}

export function needsRestock(item: Item): boolean {
  return item.quantity < item.minimumStock;
}

export function hasStock(item: Item): boolean {
  return item.quantity > 0;
}

// デザイナーに公開する同期の表示判定関数。
export const visibilityRules = { needsRestock, hasStock } satisfies Record<string, (item: Item) => boolean>;

export type VisibilityRuleName = keyof typeof visibilityRules;

function readCount(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    throw new ValidationError(`${label}には0以上の整数を入力してください。`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    throw new ValidationError(`${label}が大きすぎます。`);
  }
  return count;
}

// PoCではメモリ上に保持する。サーバー再起動時に初期データへ戻る。
export function createInventory() {
  const items: Item[] = [
    { id: "usb-cable", name: "USBケーブル", quantity: 2, minimumStock: 3 },
    { id: "batteries", name: "乾電池", quantity: 12, minimumStock: 4 },
    { id: "paper", name: "コピー用紙", quantity: 0, minimumStock: 1 },
  ];

  return {
    list(onlyLowStock = false): Item[] {
      return items.filter((item) => !onlyLowStock || needsRestock(item))
        .map((item) => ({ ...item }));
    },

    add(input: ItemInput): Item {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length > 80) {
        throw new ValidationError("備品名は1〜80文字で入力してください。");
      }
      const quantity = readCount(input.quantity, "在庫数");
      const minimumStock = readCount(input.minimumStock, "最低在庫数");
      const item = { id: randomUUID(), name, quantity, minimumStock };
      items.push(item);
      return { ...item };
    },

    adjust(id: string, change: number): Item {
      if (change !== 1 && change !== -1) {
        throw new ValidationError("在庫は1個ずつ増減してください。");
      }
      const item = items.find((candidate) => candidate.id === id);
      if (!item) throw new ItemNotFoundError("備品が見つかりません。");
      const quantity = item.quantity + change;
      if (quantity < 0 || !Number.isSafeInteger(quantity)) {
        throw new ValidationError("在庫数は0以上の安全な整数の範囲にしてください。");
      }
      item.quantity = quantity;
      return { ...item };
    },
  };
}

export type Inventory = ReturnType<typeof createInventory>;
