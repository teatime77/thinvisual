// ThinVisual GUI設定。手書きの処理はlogic.ts、画面生成はview.tsに記述してください。
import type { ScreenDesign } from "../designer/schema.js";

export const design: ScreenDesign = {
  "title": "備品管理",
  "layout": {
    "kind": "grid",
    "columns": 2,
    "gap": 16
  },
  "fields": [
    {
      "id": "field-name",
      "kind": "name",
      "label": "備品名"
    },
    {
      "id": "field-quantity",
      "kind": "quantity",
      "label": "在庫"
    },
    {
      "id": "field-minimum",
      "kind": "minimumStock",
      "label": "最低在庫"
    },
    {
      "id": "field-restock",
      "kind": "restock",
      "label": "⚠ 補充が必要"
    },
    {
      "id": "field-cf6929bd-f0d0-41f4-be6d-6a501e3bf89f",
      "kind": "name",
      "label": "備品名"
    },
    {
      "id": "field-9b5602c9-e417-44e8-b14a-8d685f44e82d",
      "kind": "name",
      "label": "備品名"
    }
  ]
};
