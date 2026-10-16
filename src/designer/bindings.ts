import { visibilityRules, type Item } from "../app/logic.js";
import { DesignError, type CardField, type ScreenDesign } from "./schema.js";
import { type AppTypes, type PropertyInfo } from "./types.js";

export function fieldBinding(field: CardField): keyof Item | undefined {
  return field.binding ?? (field.kind === "name" || field.kind === "quantity" || field.kind === "minimumStock" ? field.kind : undefined);
}

export function fieldVisibility(field: CardField): NonNullable<CardField["visibility"]> {
  return field.visibility ?? (field.kind === "restock" ? "needsRestock" : "always");
}

export function compatibleProperties(field: CardField, types: AppTypes): PropertyInfo[] {
  if (field.kind === "restock") return [];
  const required = field.kind === "name" ? "string"
    : field.kind === "quantity" || field.kind === "minimumStock" ? "number" : undefined;
  return types.properties.filter((property) => property.kind !== "unsupported" && (!required || property.kind === required)
    && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(property.name)
    && !["__proto__", "prototype", "constructor"].includes(property.name));
}

export function validateBindings(design: ScreenDesign, types: AppTypes): void {
  for (const field of design.fields) {
    const binding = fieldBinding(field);
    if (binding !== undefined && !compatibleProperties(field, types).some((property) => property.name === binding)) {
      throw new DesignError(`${field.label}：プロパティ「${binding}」は存在しないか、部品の型と互換性がありません。`);
    }
    const visibility = fieldVisibility(field);
    if (visibility !== "always" && visibility !== "never" && !types.rules.some((rule) => rule.name === visibility)) {
      throw new DesignError(`${field.label}：表示条件の関数「${visibility}」の型に対応していません。`);
    }
  }
}

export function evaluateVisibility(rule: NonNullable<CardField["visibility"]>, item: Item): boolean {
  if (rule === "always") return true;
  if (rule === "never") return false;
  if (!Object.hasOwn(visibilityRules, rule)) throw new DesignError("表示条件の関数が見つかりません。");
  try {
    const result = visibilityRules[rule]({ ...item });
    if (typeof result !== "boolean") throw new Error("invalid result");
    return result;
  } catch {
    throw new DesignError(`表示条件「${rule}」の実行に失敗しました。同期関数でbooleanを返してください。`);
  }
}

export function boundValue(field: CardField, item: Item): string {
  const key = fieldBinding(field);
  if (key === undefined) return "";
  if (!Object.hasOwn(item, key)) throw new DesignError(`表示するプロパティ「${key}」がデータにありません。`);
  const value: unknown = item[key];
  if (value === null || value === undefined) return "—";
  if (!["string", "number", "boolean"].includes(typeof value)) throw new DesignError(`「${key}」は単純な値ではありません。`);
  return String(value);
}
