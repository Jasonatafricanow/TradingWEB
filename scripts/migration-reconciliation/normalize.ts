import type {
  ColumnContract,
  IndexContract,
  ReferentialAction,
} from "./contracts/model";
import type { ColumnEvidence, IndexEvidence } from "./types";

function stripBalancedOuterParentheses(input: string): string {
  let value = input.trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    let depth = 0;
    let inString = false;
    let wrapsWholeExpression = true;
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index]!;
      if (char === "'" && value[index - 1] !== "\\") inString = !inString;
      if (inString) continue;
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        wrapsWholeExpression = false;
        break;
      }
    }
    if (!wrapsWholeExpression) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function lowerOutsideStrings(input: string): string {
  let output = "";
  let inString = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (char === "'") {
      output += char;
      if (inString && input[index + 1] === "'") {
        output += input[index + 1];
        index += 1;
      } else {
        inString = !inString;
      }
      continue;
    }
    output += inString ? char : char.toLowerCase();
  }
  return output;
}

export function normalizeDefault(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  if (/^current_timestamp(?:\(\))?$/i.test(trimmed)) return "current_timestamp";
  if (/^uuid\(\)$/i.test(trimmed)) return "uuid()";
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

export function normalizeExpression(value: string | null): string | null {
  if (value === null) return null;
  let normalized = value
    .replace(/`/g, "")
    .replace(/\\'/g, "'")
    .replace(/_utf8mb4(?=')/gi, "");
  normalized = stripBalancedOuterParentheses(normalized);
  normalized = lowerOutsideStrings(normalized);
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/\s*([(),=<>+*/-])\s*/g, "$1");
  normalized = normalized.replace(/\bin\(/g, "in (");
  return normalized;
}

export function normalizeCheck(value: string): string {
  const normalized = normalizeExpression(value);
  if (normalized === null) throw new Error("CHECK expression is required");
  return normalized;
}

export function normalizeColumn(evidence: ColumnEvidence): ColumnContract {
  return {
    name: evidence.name,
    columnType: evidence.column_type.toLowerCase().replace(/\s+/g, ""),
    nullable: evidence.nullable,
    default: normalizeDefault(evidence.default),
    extra: evidence.extra
      .toLowerCase()
      .replace(/current_timestamp\(\)/g, "current_timestamp")
      .replace(/\s+/g, " ")
      .trim(),
    generationExpression: normalizeExpression(evidence.generation_expression),
  };
}

export function normalizeIndex(evidence: IndexEvidence): IndexContract {
  if (evidence.index_type.trim().toUpperCase() !== "BTREE") {
    throw new Error(`Unsupported index type ${evidence.index_type}`);
  }
  return {
    name: evidence.name,
    unique: evidence.unique,
    kind: evidence.name === "PRIMARY" ? "PRIMARY" : "BTREE",
    columns: evidence.columns.map((column) => ({
      name: column.name,
      order: column.order,
      prefixLength: column.prefix_length,
    })),
  };
}

export function normalizeReferentialAction(value: string): ReferentialAction {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized === "NO ACTION") return "RESTRICT";
  if (
    normalized === "RESTRICT"
    || normalized === "CASCADE"
    || normalized === "SET NULL"
  ) {
    return normalized;
  }
  throw new Error(`Unknown referential action ${value}`);
}
