import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DesignConflictError, DesignError, validateDesign, type ScreenDesign } from "./schema.js";

const prefix = '// ThinVisual GUI設定。手書きの処理はlogic.ts、画面生成はview.tsに記述してください。\n'
  + 'import type { ScreenDesign } from "../designer/schema.js";\n\n'
  + 'export const design: ScreenDesign = ';

export function serializeDesign(design: ScreenDesign): string {
  return `${prefix}${JSON.stringify(validateDesign(design), null, 2)};\n`;
}

function parseSource(source: string): ScreenDesign {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(prefix) || !normalized.endsWith(";\n")) {
    throw new DesignError("design.tsがGUIの対応形式ではありません。手書きコードの上書きを防ぐため保存を停止しました。");
  }
  try {
    return validateDesign(JSON.parse(normalized.slice(prefix.length, -2)));
  } catch (error) {
    if (error instanceof DesignError) throw error;
    throw new DesignError("design.tsを読み取れません。設定はJSON形式のリテラルで記述してください。");
  }
}

function revision(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function createDesignStore(path = fileURLToPath(new URL("../../src/app/design.ts", import.meta.url))) {
  function read() {
    let source: string;
    try { source = readFileSync(path, "utf8"); }
    catch { throw new DesignError("src/app/design.tsを読み込めません。"); }
    return { design: parseSource(source), revision: revision(source) };
  }

  return {
    read,
    save(design: ScreenDesign, expectedRevision: string) {
      const source = serializeDesign(design);
      if (read().revision !== expectedRevision) {
        throw new DesignConflictError("別の操作または手動編集で設定が変更されました。画面を再読み込みしてから編集してください。");
      }
      const temporaryPath = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporaryPath, source, { encoding: "utf8", flag: "wx" });
        if (read().revision !== expectedRevision) {
          throw new DesignConflictError("保存中に設定が変更されました。画面を再読み込みしてください。");
        }
        renameSync(temporaryPath, path);
      } catch (error) {
        if (error instanceof DesignError) throw error;
        throw new DesignError("設定ファイルを保存できませんでした。");
      } finally {
        try { unlinkSync(temporaryPath); } catch { /* rename後は一時ファイルが存在しない */ }
      }
    },
  };
}

export type DesignStore = ReturnType<typeof createDesignStore>;
