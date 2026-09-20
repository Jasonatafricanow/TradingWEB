import { describe, expect, it } from "vitest";
import {
  compareViolationCounts,
  scanSourceText,
  type LiteralViolation,
} from "./i18n-hardcoded";

describe("hard-coded user-text scanner", () => {
  it("finds visible JSX, visible attributes, alerts, and API free-text errors", () => {
    const source = `
      export function Demo() {
        console.log("developer log");
        const item = { label: "Menu item" };
        const warning = "Variable warning";
        Alert.alert("Warning", "Try again");
        Alert.alert(warning);
        setError("Not allowed in state");
        return <button
          aria-label="Save"
          aria-current={true ? "page" : undefined}
          className={true ? "text-blue" : "text-gray"}
        >保存</button>;
      }
      export async function GET() {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
    `;

    expect(scanSourceText("src/app/api/demo/route.tsx", source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "jsx-text", literal: "保存" }),
        expect.objectContaining({ category: "visible-attribute", literal: "Save" }),
        expect.objectContaining({ category: "visible-attribute", literal: "Menu item" }),
        expect.objectContaining({ category: "alert", literal: "Warning" }),
        expect.objectContaining({ category: "alert", literal: "Try again" }),
        expect.objectContaining({ category: "alert", literal: "Variable warning" }),
        expect.objectContaining({ category: "alert", literal: "Not allowed in state" }),
        expect.objectContaining({ category: "api-error", literal: "Not allowed" }),
      ]),
    );
    const literals = scanSourceText("src/app/api/demo/route.tsx", source).map(
      (violation) => violation.literal,
    );
    expect(literals).not.toContain("developer log");
    expect(literals).not.toContain("page");
    expect(literals).not.toContain("text-blue");
  });

  it("allows baseline removals and reports only new or duplicated violations", () => {
    const baseline: LiteralViolation[] = [
      { file: "src/a.tsx", category: "jsx-text", literal: "Legacy" },
      { file: "src/a.tsx", category: "jsx-text", literal: "Duplicate" },
    ];
    const current: LiteralViolation[] = [
      { file: "src/a.tsx", category: "jsx-text", literal: "Duplicate" },
      { file: "src/a.tsx", category: "jsx-text", literal: "Duplicate" },
      { file: "src/b.tsx", category: "alert", literal: "New warning" },
    ];

    expect(compareViolationCounts(current, baseline)).toEqual([
      {
        file: "src/a.tsx",
        category: "jsx-text",
        literal: "Duplicate",
        count: 1,
      },
      {
        file: "src/b.tsx",
        category: "alert",
        literal: "New warning",
        count: 1,
      },
    ]);
  });

  it("follows const bindings and logical expressions at visible sinks", () => {
    const violations = scanSourceText(
      "src/demo.tsx",
      `const label = "Checkout";
       const warning = "New warning";
       export const Demo = () => <Text>{true && label}</Text>;
       Alert.alert(warning);`,
    );

    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "jsx-expression", literal: "Checkout" }),
      expect.objectContaining({ category: "alert", literal: "New warning" }),
    ]));
  });

  it("resolves shadowed constants in lexical scope and scans description properties", () => {
    const violations = scanSourceText(
      "src/shadowed.tsx",
      `const label = "Outer label";
       const item = { description: "Delete this order?" };
       function Inner() {
         const label = "Inner label";
         return <Text>{label}</Text>;
       }
       function Outer() { return <Text>{label}</Text>; }`,
    );
    const literals = violations.map(({ literal }) => literal);

    expect(literals).toEqual(expect.arrayContaining([
      "Outer label",
      "Inner label",
      "Delete this order?",
    ]));
  });
});
