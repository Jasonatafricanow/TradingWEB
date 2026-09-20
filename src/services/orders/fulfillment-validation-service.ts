export type FulfillmentMethod = "in_store" | "pickup" | "ship";

export interface FulfillmentValidationInput {
  method: FulfillmentMethod;
  contact_name?: string;
  phone?: string;
  address?: string;
  pickup_at?: string;
}

export interface ValidatedFulfillment {
  method: FulfillmentMethod;
  contact_name?: string;
  phone?: string;
  address?: string;
  pickup_at?: string;
}

export class FulfillmentValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "FulfillmentValidationError";
  }
}

function required(value: string | undefined, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new FulfillmentValidationError(code);
  return normalized;
}

export function validateFulfillment(input: FulfillmentValidationInput): ValidatedFulfillment {
  if (input.method === "in_store") return { method: "in_store" };

  const pickup_at = input.method === "pickup"
    ? required(input.pickup_at, "PICKUP_AT_REQUIRED")
    : undefined;
  const contact_name = required(input.contact_name, "CONTACT_NAME_REQUIRED");
  const phone = required(input.phone, "PHONE_REQUIRED");

  if (input.method === "pickup") {
    return { method: "pickup", contact_name, phone, pickup_at: pickup_at! };
  }

  if (input.method === "ship") {
    const address = required(input.address, "ADDRESS_REQUIRED");
    return { method: "ship", contact_name, phone, address };
  }

  throw new FulfillmentValidationError("FULFILLMENT_METHOD_INVALID");
}
