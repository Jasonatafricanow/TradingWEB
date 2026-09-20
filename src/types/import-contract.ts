export type ImportSource = "shopify" | "woo" | "magento" | "excel" | (string & {});

export type ImportJobType = "products" | "customers" | "orders" | "discounts" | "redirects" | "validate";

export type ImportSessionStatus = "open" | "running" | "completed" | "failed";

export type ImportJobStatus = "pending" | "running" | "completed" | "failed";

export type CustomerLinkStrategy = "auto_create_user" | "guest_placeholder" | "skip_unmatched";

export type ImportErrorCode =
  | "VALIDATION_FAILED"
  | "MISSING_REFERENCE"
  | "DUPLICATE_SOURCE_ID"
  | "INTERNAL_ERROR";

export interface SourceIdentity {
  source: ImportSource;
  source_store: string;
  source_id: string;
}

export interface ImportEnvelope<TRecord> {
  source: ImportSource;
  source_store: string;
  schema_version: string;
  records: TRecord[];
}

export interface ImportImage {
  url: string;
  alt?: string | null;
  position?: number | null;
}

export interface ImportProductVariant {
  source_id: string;
  sku?: string | null;
  barcode?: string | null;
  title?: string | null;
  options?: Record<string, string | null | undefined>;
  price: string;
  compare_at_price?: string | null;
  cost?: string | null;
  weight?: string | null;
  weight_unit?: string | null;
  image?: string | null;
  is_default?: boolean | null;
  inventory_quantity?: number | null;
}

export interface ImportProductRecord {
  source_id: string;
  title: string;
  title_i18n?: Record<string, string | null | undefined>;
  description?: string | null;
  vendor?: string | null;
  collection?: string | null;
  barcode?: string | null;
  compare_at_price?: string | null;
  type?: string | null;
  category?: string | null;
  tags?: string[];
  status?: "active" | "inactive" | "draft" | "sold" | (string & {});
  images?: ImportImage[];
  variants?: ImportProductVariant[];
  legacy_paths?: string[];
  seo?: {
    meta_title?: string | null;
    meta_description?: string | null;
  };
}

export interface ImportAddress {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  zip?: string | null;
  phone?: string | null;
  is_default?: boolean | null;
}

export interface ImportCustomerRecord {
  source_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  accepts_marketing?: boolean | null;
  tags?: string[];
  addresses?: ImportAddress[];
  total_spent?: string | null;
  orders_count?: number | null;
  note?: string | null;
}

export interface ImportOrderLineItem {
  product_source_id?: string | null;
  variant_source_id?: string | null;
  title: string;
  sku?: string | null;
  quantity: number;
  price: string;
}

export interface ImportOrderRecord {
  source_id: string;
  order_number: string;
  customer_source_id?: string | null;
  email?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  currency?: string | null;
  total_price: string;
  subtotal_price?: string | null;
  shipping_price?: string | null;
  tax_price?: string | null;
  discount_codes?: string[];
  discount_amount?: string | null;
  billing_address?: ImportAddress | null;
  shipping_address?: ImportAddress | null;
  line_items: ImportOrderLineItem[];
  created_at?: string | null;
  note?: string | null;
}

export interface ImportRedirectRecord {
  source_id: string;
  old_path: string;
  new_path: string;
  status_code?: 301 | 302 | 307 | 308 | number;
}

export interface ImportDiscountRecord {
  source_id: string;
  code: string;
  type: "percentage" | "percent" | "fixed" | "fixed_amount" | "amount" | (string & {});
  value: string;
  min_order_amount?: string | null;
  max_discount?: string | null;
  usage_limit?: number | null;
  used_count?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean | null;
  description?: string | null;
}

export type ImportProductsEnvelope = ImportEnvelope<ImportProductRecord>;
export type ImportCustomersEnvelope = ImportEnvelope<ImportCustomerRecord>;
export type ImportOrdersEnvelope = ImportEnvelope<ImportOrderRecord>;
export type ImportDiscountsEnvelope = ImportEnvelope<ImportDiscountRecord>;
export type ImportRedirectsEnvelope = ImportEnvelope<ImportRedirectRecord>;

export interface CreateImportSessionRequest {
  source: ImportSource;
  source_store: string;
  expected_jobs: ImportJobType[];
  customer_link_strategy?: CustomerLinkStrategy;
}

export interface CreateImportSessionResponse {
  session_id: string;
  created_at: string;
}

export interface ImportRecordError {
  record_index: number;
  source_id?: string;
  code: ImportErrorCode;
  field?: string;
  message: string;
}

export interface ImportJobSummary {
  id: string;
  job_type: ImportJobType;
  status: ImportJobStatus;
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  errors?: ImportRecordError[];
}

export interface MirrorProgress {
  total: number;
  pending: number;
  mirrored: number;
  failed: number;
}

export interface ImportJobReconciliation {
  job_type: ImportJobType;
  expected: boolean;
  present: boolean;
  status: ImportJobStatus | "missing";
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  success_rate: number;
}

export interface ImportMappingSummary {
  source_type: string;
  local_table: string;
  count: number;
}

export interface ImportOrderReconciliation {
  count: number;
  total_amount: number;
  paid_amount: number;
  currency: string | null;
  currency_count: number;
}

export interface ImportErrorSummary {
  code: ImportErrorCode | string;
  count: number;
}

export interface ImportReconciliationSummary {
  expected_jobs: ImportJobType[];
  missing_jobs: ImportJobType[];
  jobs: ImportJobReconciliation[];
  mappings: ImportMappingSummary[];
  order_totals: ImportOrderReconciliation;
  errors_by_code: ImportErrorSummary[];
  total_errors: number;
  completed: boolean;
}

export interface ImportSessionDetail {
  session_id: string;
  source: ImportSource;
  source_store: string;
  status: ImportSessionStatus;
  customer_link_strategy: CustomerLinkStrategy;
  jobs: ImportJobSummary[];
  mirror_progress?: MirrorProgress;
  started_at: string;
  finished_at?: string | null;
  summary?: Record<string, unknown>;
  reconciliation?: ImportReconciliationSummary;
}

export interface ImportBatchResult {
  ok: boolean;
  session_id?: string;
  job_type: ImportJobType;
  total: number;
  success: number;
  failed: number;
  errors: ImportRecordError[];
}
