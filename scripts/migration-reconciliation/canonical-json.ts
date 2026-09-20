import { createHash } from "node:crypto";

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

function normalizeCanonical(
  value: unknown,
  ancestors: Set<object>,
  path: string,
): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${path}`);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(`Unsafe integer at ${path}`);
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new TypeError(`Unsupported value at ${path}`);
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Cyclic value at ${path}`);
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    const output: CanonicalJson[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new TypeError(`Sparse array at ${path}[${index}]`);
      }
      output.push(normalizeCanonical(value[index], nextAncestors, `${path}[${index}]`));
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`Non-plain object at ${path}`);
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, CanonicalJson> = {};
  for (const key of Object.keys(input).sort()) {
    output[key] = normalizeCanonical(input[key], nextAncestors, `${path}.${key}`);
  }
  return output;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value, new Set(), "$"));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function fingerprintSnapshot(snapshot: Record<string, unknown>): string {
  const fingerprintedEvidence = { ...snapshot };
  delete fingerprintedEvidence.captured_at;
  delete fingerprintedEvidence.content_fingerprint;
  return sha256Hex(canonicalStringify(fingerprintedEvidence));
}
