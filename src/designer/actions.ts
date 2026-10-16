import { randomUUID } from "node:crypto";
import {
  DesignError, fieldLabels, isFieldKind, readLabel, validateDesign, type ScreenDesign,
} from "./schema.js";

export function updateDesign(design: ScreenDesign, input: Record<string, unknown>): { design: ScreenDesign; selected: string } {
  const next = structuredClone(design);
  let selected = typeof input.selected === "string" ? input.selected : "layout";
  const index = next.fields.findIndex((field) => field.id === selected);
  if (input.action === "add") {
    if (!isFieldKind(input.kind)) throw new DesignError("追加する部品を選んでください。");
    selected = `field-${randomUUID()}`;
    next.fields.push({ id: selected, kind: input.kind, label: fieldLabels[input.kind] });
  } else if (input.action === "update" && selected === "title") {
    next.title = readLabel(input.label);
  } else if (input.action === "update" && selected === "layout") {
    if (typeof input.gap !== "string" || !/^\d+$/.test(input.gap)) {
      throw new DesignError("間隔は0〜48pxの整数で指定してください。");
    }
    const gap = Number(input.gap);
    const mode = input.mode;
    if (typeof mode === "string" && /^grid-[1-4]$/.test(mode)) {
      next.layout = { kind: "grid", columns: Number(mode.slice(-1)), gap };
    } else if (mode === "flex-row" || mode === "flex-column") {
      next.layout = { kind: "flex", direction: mode === "flex-row" ? "row" : "column", gap };
    } else {
      throw new DesignError("配置を選んでください。");
    }
  } else if (index >= 0) {
    if (input.action === "update") next.fields[index].label = readLabel(input.label);
    else if (input.action === "remove") {
      next.fields.splice(index, 1);
      selected = "layout";
    } else if (input.action === "up" || input.action === "down") {
      const destination = index + (input.action === "up" ? -1 : 1);
      if (destination < 0 || destination >= next.fields.length) throw new DesignError("これ以上移動できません。");
      [next.fields[index], next.fields[destination]] = [next.fields[destination], next.fields[index]];
    } else throw new DesignError("未対応の操作です。");
  } else throw new DesignError("編集する部品が見つかりません。");
  return { design: validateDesign(next), selected };
}
