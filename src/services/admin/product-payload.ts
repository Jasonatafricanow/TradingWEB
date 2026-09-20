import { ValidationError } from "@/lib/errors";

const OPTIONAL_TEXT_FIELDS = [
  "title_en",
  "title_pt",
  "description",
  "description_en",
  "description_pt",
  "duration",
  "attribute_unit",
  "delivery_method",
  "meta_title",
  "meta_title_pt",
  "meta_description",
  "meta_description_pt",
  "image_key",
  "barcode",
  "vendor",
  "collection",
  "tags",
] as const;

const OPTIONAL_DECIMAL_FIELDS = ["compare_at_price", "cost_price"] as const;

export function normalizeProductPayload(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...input };

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = output[field];
    if (typeof value === "string") {
      const trimmed = value.trim();
      output[field] = trimmed || null;
    }
  }

  for (const field of OPTIONAL_DECIMAL_FIELDS) {
    if (!(field in output)) continue;

    const value = output[field];
    if (value === "" || value === null) {
      output[field] = null;
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new ValidationError(`${field} must be a non-negative number`);
    }
    output[field] = numeric.toFixed(2);
  }

  return output;
}
