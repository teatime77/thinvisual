import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Project, type Signature, type SourceFile, type Symbol as MorphSymbol, type Type } from "ts-morph";
import { DesignError } from "./schema.js";

export interface PropertyInfo {
  name: string;
  type: string;
  kind: "string" | "number" | "boolean" | "unsupported";
}
export interface RuleInfo { name: string; signature: string }
export interface AppTypes {
  itemType: string;
  collectionType: string;
  properties: PropertyInfo[];
  rules: RuleInfo[];
  warnings: string[];
}

function scalarKind(type: Type): PropertyInfo["kind"] {
  const base = type.getNonNullableType().getBaseTypeOfLiteralType();
  if (base.isString()) return "string";
  if (base.isNumber()) return "number";
  if (base.isBoolean() || base.isBooleanLiteral()) return "boolean";
  return "unsupported";
}

// ソースは解析のみ行い、ここからユーザーのコードを実行しない。
export function analyzeTypes(source: SourceFile): AppTypes {
  if (source.getProject().getProgram().getSyntacticDiagnostics(source).length) {
    throw new DesignError("logic.tsに構文エラーがあるため型情報を読み取れません。");
  }
  const item = source.getInterface("Item");
  const registry = source.getVariableDeclaration("visibilityRules");
  const inventory = source.getFunction("createInventory");
  if (!item?.isExported() || !registry?.isExported() || !inventory?.isExported()) {
    throw new DesignError("logic.tsでItem、createInventory、visibilityRulesを公開してください。");
  }
  const itemType = item.getType();
  const list = inventory.getReturnType().getProperty("list")?.getTypeAtLocation(inventory).getCallSignatures()[0];
  const collectionType = list?.getReturnType();
  const element = collectionType?.getArrayElementType();
  if (!collectionType || !element || !element.isAssignableTo(itemType) || !itemType.isAssignableTo(element)) {
    throw new DesignError("createInventory().list()はItem[]を返す必要があります。");
  }
  const properties = itemType.getProperties().map((property) => {
    const type = property.getTypeAtLocation(item);
    return { name: property.getName(), type: type.getText(item), kind: scalarKind(type) };
  });
  const rules: RuleInfo[] = [];
  const warnings: string[] = [];
  for (const rule of registry.getType().getProperties()) {
    if (["always", "never", "__proto__", "prototype", "constructor"].includes(rule.getName())) {
      warnings.push(`${rule.getName()}は予約名のため表示判定関数に使えません。`);
      continue;
    }
    const signatures: Signature[] = rule.getTypeAtLocation(registry).getCallSignatures();
    const signature: Signature | undefined = signatures[0];
    const parameters: MorphSymbol[] = signature?.getParameters() ?? [];
    const parameterType = parameters[0]?.getTypeAtLocation(registry);
    const result = signature?.getReturnType();
    if (signatures.length !== 1 || !signature || parameters.length !== 1 || !parameterType || parameterType.isAny()
      || parameterType.isUnknown() || !itemType.isAssignableTo(parameterType)
      || !result || !(result.isBoolean() || result.isBooleanLiteral()) || signature.getTypeParameters().length) {
      warnings.push(`${rule.getName()}は(Item) => booleanの同期関数ではないため選択できません。`);
      continue;
    }
    rules.push({ name: rule.getName(), signature: `(${parameters[0].getName()}: ${parameterType.getText(registry)}) => ${result.getText(registry)}` });
  }
  return { itemType: item.getName(), collectionType: collectionType.getText(inventory), properties, rules, warnings };
}

export function createTypeInspector(
  path = fileURLToPath(new URL("../../src/app/logic.ts", import.meta.url)),
  tsconfig = fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
) {
  let project: Project | undefined;
  let previous: string | undefined;
  let cached: AppTypes | undefined;
  return {
    read(): AppTypes {
      try {
        const text = readFileSync(path, "utf8");
        if (text === previous && cached) return cached;
        project ??= new Project({ tsConfigFilePath: tsconfig, skipAddingFilesFromTsConfig: true });
        const source = project.getSourceFile(path) ?? project.addSourceFileAtPath(path);
        source.replaceWithText(text);
        const metadata = analyzeTypes(source);
        previous = text;
        cached = metadata;
        return metadata;
      } catch (error) {
        if (error instanceof DesignError) throw error;
        throw new DesignError("logic.tsの型情報を読み込めません。ソースとTypeScript設定を確認してください。");
      }
    },
  };
}

// HTTPリクエストごとにコンパイラーを作り直さない。
export const appTypeInspector = createTypeInspector();
