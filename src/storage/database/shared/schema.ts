import { check, mysqlTable, serial, varchar, char, text, timestamp, boolean, int, index, json, decimal, uniqueIndex, mysqlEnum } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const healthCheck = mysqlTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// ==================== 鐢ㄦ埛琛紙鍘?Supabase Auth 鈫?鏈湴鍖栵級 ====================
export const users = mysqlTable(
	"users",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		name: varchar("name", { length: 100 }),
		phone: varchar("phone", { length: 50 }),
		avatar_url: varchar("avatar_url", { length: 500 }),
		password_hash: varchar("password_hash", { length: 255 }),
		is_active: boolean("is_active").default(true).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("users_email_idx").on(table.email),
	]
);

// ==================== 鍟嗗搧鍒嗙被锛堟爲褰級 ====================
export const categories = mysqlTable(
	"categories",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		name: varchar("name", { length: 100 }).notNull(),
		name_en: varchar("name_en", { length: 100 }),
		name_ja: varchar("name_ja", { length: 100 }),
		name_es: varchar("name_es", { length: 100 }),
		slug: varchar("slug", { length: 150 }).unique(),
		parent_id: varchar("parent_id", { length: 36 }),
		level: int("level").default(0).notNull(),
		type: varchar("type", { length: 20 }).notNull().default("service"),
		icon: varchar("icon", { length: 50 }),
		sort_order: int("sort_order").default(0).notNull(),
		is_active: boolean("is_active").default(true).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("categories_type_idx").on(table.type),
		index("categories_sort_order_idx").on(table.sort_order),
		index("categories_parent_id_idx").on(table.parent_id),
		index("categories_slug_idx").on(table.slug),
	]
);

// ==================== 鍟嗗搧锛堝惈 Tags锛?====================
export const products = mysqlTable(
	"products",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		title: varchar("title", { length: 200 }).notNull(),
		title_en: varchar("title_en", { length: 200 }),
		title_ja: varchar("title_ja", { length: 200 }),
		title_es: varchar("title_es", { length: 200 }),
		title_pt: varchar("title_pt", { length: 200 }),
		description: text("description"),
		description_en: text("description_en"),
		description_ja: text("description_ja"),
		description_es: text("description_es"),
		description_pt: text("description_pt"),
		slug: varchar("slug", { length: 200 }).unique(),
		price: decimal("price", { precision: 10, scale: 2 }).notNull(),
		compare_at_price: decimal("compare_at_price", { precision: 10, scale: 2 }),
		cost_price: decimal("cost_price", { precision: 12, scale: 2 }),
		category_id: varchar("category_id", { length: 36 }).notNull().references(() => categories.id),
		type: varchar("type", { length: 20 }).notNull().default("service"),
		image_key: varchar("image_key", { length: 500 }),
		seller_id: varchar("seller_id", { length: 36 }).notNull(),
		status: varchar("status", { length: 20 }).notNull().default("active"),
		barcode: varchar("barcode", { length: 100 }),
		vendor: varchar("vendor", { length: 150 }),
		collection: varchar("collection", { length: 150 }),
		tags: text("tags"),
		duration: varchar("duration", { length: 50 }),
		delivery_method: varchar("delivery_method", { length: 255 }),
		attribute_unit: varchar("attribute_unit", { length: 20 }),
		meta_title: varchar("meta_title", { length: 200 }),
		meta_title_pt: varchar("meta_title_pt", { length: 200 }),
		meta_description: text("meta_description"),
		meta_description_pt: text("meta_description_pt"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("products_category_id_idx").on(table.category_id),
		index("products_seller_id_idx").on(table.seller_id),
		index("products_status_idx").on(table.status),
		index("products_type_idx").on(table.type),
		index("products_created_at_idx").on(table.created_at),
		index("products_slug_idx").on(table.slug),
		index("products_barcode_idx").on(table.barcode),
		index("products_vendor_idx").on(table.vendor),
		index("products_collection_idx").on(table.collection),
	]
);

// ==================== 鍟嗗搧瑙勬牸/鍙樹綋 ====================
export const productVariants = mysqlTable(
	"product_variants",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		title: varchar("title", { length: 200 }),
		sku: varchar("sku", { length: 100 }),
		barcode: varchar("barcode", { length: 100 }),
		price: decimal("price", { precision: 10, scale: 2 }).notNull(),
		compare_at_price: decimal("compare_at_price", { precision: 10, scale: 2 }),
		cost: decimal("cost", { precision: 10, scale: 2 }),
		weight: decimal("weight", { precision: 10, scale: 2 }),
		weight_unit: varchar("weight_unit", { length: 10 }).default("kg"),
		stock: int("stock").default(0).notNull(),
		option1: varchar("option1", { length: 255 }),
		option2: varchar("option2", { length: 255 }),
		option3: varchar("option3", { length: 255 }),
		position: int("position").default(1),
		is_default: boolean("is_default").default(false).notNull(),
		image: varchar("image", { length: 500 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("pv_product_id_idx").on(table.product_id),
		index("pv_sku_idx").on(table.sku),
		index("pv_barcode_idx").on(table.barcode),
	]
);

// ==================== 鍟嗗搧鍥剧墖 ====================
export const productImages = mysqlTable(
	"product_images",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		variant_id: varchar("variant_id", { length: 36 }),
		src: text("src").notNull(),
		original_url: varchar("original_url", { length: 2048 }),
		mirror_status: varchar("mirror_status", { length: 20 }).default("pending").notNull(),
		mirrored_at: timestamp("mirrored_at"),
		alt: varchar("alt", { length: 500 }),
		position: int("position").default(1),
		width: int("width"),
		height: int("height"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("pi_product_id_idx").on(table.product_id),
		index("pi_variant_id_idx").on(table.variant_id),
		index("pi_mirror_status_idx").on(table.mirror_status),
	]
);

// ==================== 璁㈠崟锛堝弻鐘舵€?+ 瀹屾暣鍦板潃锛?====================
export const orders = mysqlTable(
	"orders",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }).notNull(),
		store_id: varchar("store_id", { length: 36 }),
		shift_id: varchar("shift_id", { length: 36 }),
		staff_id: varchar("staff_id", { length: 36 }),
		account_user_id: varchar("account_user_id", { length: 36 }),
		source: varchar("source", { length: 20 }).notNull().default("web"),
		client_ref: varchar("client_ref", { length: 160 }),
		order_no: varchar("order_no", { length: 32 }).notNull().unique(),
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		financial_status: varchar("financial_status", { length: 20 }).default("pending"),
		fulfillment_status: varchar("fulfillment_status", { length: 20 }).default("unfulfilled"),
		total_amount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
		currency: varchar("currency", { length: 3 }).notNull().default("USD"),
		payment_method: varchar("payment_method", { length: 64 }),
		payment_status: varchar("payment_status", { length: 20 }).default("unpaid"),
		payment_id: varchar("payment_id", { length: 200 }),
		buyer_email: varchar("buyer_email", { length: 255 }),
		buyer_name: varchar("buyer_name", { length: 128 }),
		buyer_phone: varchar("buyer_phone", { length: 50 }),
		pickup_contact_name: varchar("pickup_contact_name", { length: 100 }),
		pickup_phone: varchar("pickup_phone", { length: 50 }),
		pickup_store_id: varchar("pickup_store_id", { length: 36 }),
		pickup_ready_at: timestamp("pickup_ready_at"),
		picked_up_at: timestamp("picked_up_at"),
		delivery_zone_id: varchar("delivery_zone_id", { length: 36 }),
		shipping_cost: decimal("shipping_cost", { precision: 10, scale: 2 }),
		delivery_date: varchar("delivery_date", { length: 20 }),
		delivery_time_slot: varchar("delivery_time_slot", { length: 100 }),
		shipping_address: json("shipping_address"),
		billing_address: json("billing_address"),
		notes: text("notes"),
		tags: text("tags"),
		coupon_id: varchar("coupon_id", { length: 36 }),
		discount_amount: decimal("discount_amount", { precision: 10, scale: 2 }),
		has_refund: boolean("has_refund").default(false).notNull(),
		refunded_total: decimal("refunded_total", { precision: 12, scale: 2 }).default("0.00").notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("orders_user_id_idx").on(table.user_id),
		index("orders_status_idx").on(table.status),
		index("orders_order_no_idx").on(table.order_no),
		index("orders_created_at_idx").on(table.created_at),
		index("orders_financial_status_idx").on(table.financial_status),
		index("orders_fulfillment_status_idx").on(table.fulfillment_status),
		index("orders_source_idx").on(table.source),
		index("orders_shift_id_idx").on(table.shift_id),
		index("orders_store_created_idx").on(table.store_id, table.created_at, table.id),
		index("orders_store_staff_created_idx").on(table.store_id, table.staff_id, table.created_at, table.id),
		index("orders_customer_created_idx").on(table.user_id, table.created_at, table.id),
		index("orders_pickup_status_idx").on(table.pickup_store_id, table.fulfillment_status, table.created_at),
		uniqueIndex("orders_client_ref_unique_idx").on(table.client_ref),
	]
);

export const orderPayments = mysqlTable(
	"order_payments",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		order_id: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
		channel: varchar("channel", { length: 20 }).notNull(),
		method: varchar("method", { length: 64 }).notNull(),
		label: varchar("label", { length: 100 }).notNull(),
		amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
		reference: varchar("reference", { length: 200 }),
		provider_transaction_id: varchar("provider_transaction_id", { length: 200 }),
		status: varchar("status", { length: 20 }).notNull().default("recorded"),
		recorded_by: varchar("recorded_by", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_payments_order_idx").on(table.order_id),
		index("order_payments_provider_idx").on(table.provider_transaction_id),
	]
);

// 璁㈠崟鏄庣粏
export const orderItems = mysqlTable(
	"order_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		order_id: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
		variant_id: varchar("variant_id", { length: 36 }),
		product_title: varchar("product_title", { length: 200 }).notNull(),
		product_type: varchar("product_type", { length: 20 }).notNull(),
		sku: varchar("sku", { length: 100 }),
		quantity: int("quantity").notNull().default(1),
		unit_price: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
		subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
		delivery_method: varchar("delivery_method", { length: 32 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_items_order_id_idx").on(table.order_id),
		index("order_items_product_id_idx").on(table.product_id),
		index("order_items_variant_id_idx").on(table.variant_id),
	]
);

// ==================== 搴撳瓨蹇収 ====================
export const inventory = mysqlTable(
	"inventory",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		variant_id: varchar("variant_id", { length: 36 }),
		store_id: varchar("store_id", { length: 36 }),
		warehouse_id: varchar("warehouse_id", { length: 36 }).references(() => warehouses.id),
		variant_scope_key: varchar("variant_scope_key", { length: 36 })
			.generatedAlwaysAs(sql`COALESCE(variant_id, '')`, { mode: "stored" }),
		store_scope_key: varchar("store_scope_key", { length: 36 })
			.generatedAlwaysAs(sql`COALESCE(store_id, '')`, { mode: "stored" }),
		warehouse_scope_key: varchar("warehouse_scope_key", { length: 36 })
			.generatedAlwaysAs(sql`COALESCE(warehouse_id, '')`, { mode: "stored" }),
		stock: int("stock").notNull().default(0),
		low_stock_threshold: int("low_stock_threshold").notNull().default(10),
		updated_at: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("inventory_product_id_idx").on(table.product_id),
		index("inventory_variant_id_idx").on(table.variant_id),
		uniqueIndex("inventory_scope_unique").on(
			table.product_id,
			table.variant_scope_key,
			table.store_scope_key,
			table.warehouse_scope_key,
		),
	]
);

// 搴撳瓨鍙樺姩鏃ュ織
export const inventoryTransactions = mysqlTable(
	"inventory_transactions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		variant_id: varchar("variant_id", { length: 36 }),
		type: varchar("type", { length: 20 }).notNull(),
		quantity: int("quantity").notNull(),
		before_stock: int("before_stock").notNull(),
		after_stock: int("after_stock").notNull(),
		note: text("note"),
		operator_id: varchar("operator_id", { length: 36 }),
		reference_type: varchar("reference_type", { length: 30 }),
		reference_id: varchar("reference_id", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("inv_tx_product_id_idx").on(table.product_id),
		index("inv_tx_created_at_idx").on(table.created_at),
		index("inv_tx_ref_idx").on(table.reference_type, table.reference_id),
	]
);

// 鍛樺伐绠＄悊
export const staff = mysqlTable(
	"staff",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }).unique(),
		store_id: varchar("store_id", { length: 36 }),
		role: varchar("role", { length: 20 }).notNull().default("support"),
		name: varchar("name", { length: 100 }).notNull(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		phone: varchar("phone", { length: 50 }),
		avatar_url: varchar("avatar_url", { length: 500 }),
		is_active: boolean("is_active").default(true).notNull(),
		permissions: json("permissions"),
		pos_enabled: boolean("pos_enabled").default(false).notNull(),
		pos_pin_hash: varchar("pos_pin_hash", { length: 255 }),
		pos_permissions: json("pos_permissions"),
		pos_pin_failed_attempts: int("pos_pin_failed_attempts").default(0).notNull(),
		pos_pin_last_failed_at: timestamp("pos_pin_last_failed_at"),
		pos_pin_locked_until: timestamp("pos_pin_locked_until"),
		last_login_at: timestamp("last_login_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("staff_user_id_idx").on(table.user_id),
		index("staff_role_idx").on(table.role),
		index("staff_email_idx").on(table.email),
		index("staff_pos_store_enabled_active_idx").on(table.store_id, table.pos_enabled, table.is_active),
	]
);

export const posOperatorSessions = mysqlTable(
	"pos_operator_sessions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		token_hash: char("token_hash", { length: 64 }).notNull(),
		account_user_id: varchar("account_user_id", { length: 36 }).notNull(),
		staff_id: varchar("staff_id", { length: 36 }).notNull(),
		store_id: varchar("store_id", { length: 36 }).notNull(),
		device_id: varchar("device_id", { length: 100 }).notNull(),
		permissions: json("permissions").notNull(),
		expires_at: timestamp("expires_at").notNull(),
		revoked_at: timestamp("revoked_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("pos_operator_sessions_token_unique").on(table.token_hash),
		index("pos_operator_sessions_staff_idx").on(table.staff_id, table.expires_at),
		index("pos_operator_sessions_device_idx").on(table.device_id, table.revoked_at),
	]
);

export const posApprovalTokens = mysqlTable(
	"pos_approval_tokens",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		token_hash: char("token_hash", { length: 64 }).notNull(),
		operation: varchar("operation", { length: 40 }).notNull(),
		resource_hash: char("resource_hash", { length: 64 }).notNull(),
		approved_by: varchar("approved_by", { length: 36 }).notNull(),
		store_id: varchar("store_id", { length: 36 }).notNull(),
		expires_at: timestamp("expires_at").notNull(),
		consumed_at: timestamp("consumed_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("pos_approval_tokens_token_unique").on(table.token_hash),
	]
);

// 椤甸潰璁块棶缁熻
export const pageViews = mysqlTable(
	"page_views",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		path: varchar("path", { length: 500 }).notNull(),
		title: varchar("title", { length: 500 }),
		referrer: text("referrer"),
		user_agent: varchar("user_agent", { length: 500 }),
		ip_anonymized: varchar("ip_anonymized", { length: 64 }),
		country: varchar("country", { length: 100 }),
		visitor_id: varchar("visitor_id", { length: 64 }),
		utm_source: varchar("utm_source", { length: 100 }),
		utm_medium: varchar("utm_medium", { length: 100 }),
		utm_campaign: varchar("utm_campaign", { length: 200 }),
		utm_content: varchar("utm_content", { length: 200 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("pv_path_idx").on(table.path),
		index("pv_created_at_idx").on(table.created_at),
		index("pv_visitor_id_idx").on(table.visitor_id),
		index("pv_utm_campaign_idx").on(table.utm_campaign),
	]
);

// 浼樻儬鍒革紙鍚椂闂磋寖鍥达級
export const coupons = mysqlTable(
	"coupons",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		code: varchar("code", { length: 50 }).notNull().unique(),
		type: varchar("type", { length: 10 }).notNull(),
		value: decimal("value", { precision: 10, scale: 2 }).notNull(),
		min_order_amount: decimal("min_order_amount", { precision: 10, scale: 2 }).default("0"),
		max_discount: decimal("max_discount", { precision: 10, scale: 2 }),
		usage_limit: int("usage_limit").default(0),
		used_count: int("used_count").default(0),
		starts_at: timestamp("starts_at"),
		expires_at: timestamp("expires_at"),
		is_active: boolean("is_active").default(true).notNull(),
		campaign_source: varchar("campaign_source", { length: 50 }),
		campaign_name: varchar("campaign_name", { length: 200 }),
		customer_segment: varchar("customer_segment", { length: 50 }),
		description: text("description"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("coupons_code_idx").on(table.code),
		index("coupons_expires_at_idx").on(table.expires_at),
	]
);

// 閫€娆?
export const refunds = mysqlTable(
	"refunds",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		order_id: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
		order_item_id: varchar("order_item_id", { length: 36 }),
		shift_id: varchar("shift_id", { length: 36 }),
		user_id: varchar("user_id", { length: 36 }),
		reason: text("reason").notNull(),
		amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		evidence: text("evidence"),
		admin_note: text("admin_note"),
		restocked: boolean("restocked").default(false).notNull(),
		processed_by: varchar("processed_by", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
		processed_at: timestamp("processed_at"),
	},
	(table) => [
		index("refunds_order_id_idx").on(table.order_id),
		index("refunds_status_idx").on(table.status),
		index("refunds_shift_id_idx").on(table.shift_id),
	]
);

// 閭欢妯℃澘
export const emailTemplates = mysqlTable(
	"email_templates",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		key: varchar("key", { length: 50 }).notNull().unique(),
		name: varchar("name", { length: 100 }).notNull(),
		subject: varchar("subject", { length: 200 }).notNull(),
		body_html: text("body_html").notNull(),
		variables: text("variables"),
		is_active: boolean("is_active").default(true).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [index("et_key_idx").on(table.key)]
);

// 閭欢鍙戦€佹棩蹇?
export const emailLogs = mysqlTable(
	"email_logs",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		to_email: varchar("to_email", { length: 255 }).notNull(),
		subject: varchar("subject", { length: 200 }).notNull(),
		template_key: varchar("template_key", { length: 50 }),
		status: varchar("status", { length: 20 }).notNull().default("sent"),
		error: text("error"),
		order_id: varchar("order_id", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("el_created_at_idx").on(table.created_at)]
);

// 寮冭喘杩藉洖
export const abandonedCarts = mysqlTable(
	"abandoned_carts",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }),
		email: varchar("email", { length: 255 }),
		phone: varchar("phone", { length: 50 }),
		whatsapp: varchar("whatsapp", { length: 50 }),
		items: json("items"),
		total: decimal("total", { precision: 10, scale: 2 }),
		coupon_id: varchar("coupon_id", { length: 36 }),
		coupon_sent: boolean("coupon_sent").default(false).notNull(),
		notified_at: timestamp("notified_at"),
		abandoned_at: timestamp("abandoned_at").defaultNow().notNull(),
		recovered_at: timestamp("recovered_at"),
	},
	(table) => [
		index("ac_user_id_idx").on(table.user_id),
		index("ac_abandoned_at_idx").on(table.abandoned_at),
	]
);

// 浼氬憳绛夌骇
export const membershipTiers = mysqlTable(
	"membership_tiers",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		name: varchar("name", { length: 50 }).notNull(),
		level: int("level").notNull().unique(),
		min_total_spent: decimal("min_total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
		discount_percent: decimal("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
		badge_color: varchar("badge_color", { length: 20 }),
		benefits: text("benefits"),
		is_active: boolean("is_active").default(true).notNull(),
		type: varchar("type", { length: 20 }).default("warehouse").notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("mt_level_idx").on(table.level)]
);

// 鐢ㄦ埛浼氬憳
export const userMemberships = mysqlTable(
	"user_memberships",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }).notNull().unique(),
		tier_id: varchar("tier_id", { length: 36 }),
		total_spent: decimal("total_spent", { precision: 10, scale: 2 }).default("0").notNull(),
		total_orders: int("total_orders").default(0).notNull(),
		joined_at: timestamp("joined_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [index("um_user_id_idx").on(table.user_id)]
);

// 鎿嶄綔瀹¤鏃ュ織
export const auditLogs = mysqlTable(
	"audit_logs",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }),
		action: varchar("action", { length: 100 }).notNull(),
		entity_type: varchar("entity_type", { length: 50 }),
		entity_id: varchar("entity_id", { length: 36 }),
		details: json("details"),
		ip_address: varchar("ip_address", { length: 50 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("al_user_id_idx").on(table.user_id),
		index("al_entity_type_idx").on(table.entity_type),
		index("al_created_at_idx").on(table.created_at),
	]
);

// 蹇冩効鍗?
export const wishlistItems = mysqlTable(
	"wishlist_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }).notNull(),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("wi_user_id_idx").on(table.user_id),
		index("wi_product_id_idx").on(table.product_id),
		uniqueIndex("wi_user_product_idx").on(table.user_id, table.product_id),
	]
);

// 浠撳簱
export const warehouses = mysqlTable(
	"warehouses",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		name: varchar("name", { length: 100 }).notNull(),
		location: varchar("location", { length: 200 }),
		is_active: boolean("is_active").default(true).notNull(),
		type: varchar("type", { length: 20 }).default("warehouse").notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	}
);

// ==================== 澶氬簵閾虹鐞?====================
export const stores = mysqlTable(
	"stores",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		name: varchar("name", { length: 100 }).notNull(),
		slug: varchar("slug", { length: 100 }).unique(),
		type: varchar("type", { length: 20 }).notNull().default("permanent"),
		status: varchar("status", { length: 20 }).notNull().default("active"),
		warehouse_id: varchar("warehouse_id", { length: 36 }).references(() => warehouses.id),
		contact_name: varchar("contact_name", { length: 100 }),
		contact_phone: varchar("contact_phone", { length: 50 }),
		address_line1: varchar("address_line1", { length: 200 }),
		address_line2: varchar("address_line2", { length: 200 }),
		city: varchar("city", { length: 100 }),
		state: varchar("state", { length: 100 }),
		zip: varchar("zip", { length: 20 }),
		country: varchar("country", { length: 100 }).default("Moz"),
		open_time: varchar("open_time", { length: 10 }),
		close_time: varchar("close_time", { length: 10 }),
		open_at: timestamp("open_at"),
		close_at: timestamp("close_at"),
		metadata: json("metadata"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("stores_slug_idx").on(table.slug),
		index("stores_type_idx").on(table.type),
		index("stores_status_idx").on(table.status),
	]
);

// ==================== 鐗╂祦/鍙戣揣杩借釜 ====================
export const shipments = mysqlTable(
	"shipments",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		order_id: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
		store_id: varchar("store_id", { length: 36 }).references(() => stores.id),
		tracking_number: varchar("tracking_number", { length: 100 }),
		carrier: varchar("carrier", { length: 100 }),
		carrier_code: varchar("carrier_code", { length: 50 }),
		status: varchar("status", { length: 30 }).notNull().default("pending"),
		shipping_method: varchar("shipping_method", { length: 100 }),
		estimated_delivery: timestamp("estimated_delivery"),
		shipped_at: timestamp("shipped_at"),
		delivered_at: timestamp("delivered_at"),
		weight: decimal("weight", { precision: 10, scale: 2 }),
		weight_unit: varchar("weight_unit", { length: 10 }).default("kg"),
		package_count: int("package_count").default(1),
		notes: text("notes"),
		tracking_events: json("tracking_events"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("ship_order_id_idx").on(table.order_id),
		index("ship_store_id_idx").on(table.store_id),
		index("ship_tracking_number_idx").on(table.tracking_number),
		index("ship_status_idx").on(table.status),
	]
);

export const shipmentItems = mysqlTable(
	"shipment_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		shipment_id: varchar("shipment_id", { length: 36 }).notNull().references(() => shipments.id, { onDelete: "cascade" }),
		order_item_id: varchar("order_item_id", { length: 36 }).notNull().references(() => orderItems.id, { onDelete: "cascade" }),
		variant_id: varchar("variant_id", { length: 36 }),
		quantity: int("quantity").notNull().default(1),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("si_shipment_id_idx").on(table.shipment_id),
		index("si_order_item_id_idx").on(table.order_item_id),
	]
);

// 璋冩嫧鍗?
export const stockTransfers = mysqlTable(
	"stock_transfers",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		reference_no: varchar("reference_no", { length: 50 }).notNull().default(""),
		store_id: varchar("store_id", { length: 36 }).references(() => stores.id),
		from_warehouse_id: varchar("from_warehouse_id", { length: 36 }).notNull().references(() => warehouses.id),
		to_warehouse_id: varchar("to_warehouse_id", { length: 36 }).notNull().references(() => warehouses.id),
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		note: text("note"),
		shipping_method: varchar("shipping_method", { length: 30 }),
		packaging_info: json("packaging_info"),
		unit_cost: decimal("unit_cost", { precision: 12, scale: 2 }),
		total_cost: decimal("total_cost", { precision: 12, scale: 2 }),
		operator_id: varchar("operator_id", { length: 36 }),
		initiated_by: varchar("initiated_by", { length: 36 }),
		approved_by: varchar("approved_by", { length: 36 }),
		completed_at: timestamp("completed_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("st_reference_no_idx").on(table.reference_no),
		index("st_status_idx").on(table.status),
		index("st_store_id_idx").on(table.store_id),
		index("st_from_wh_idx").on(table.from_warehouse_id),
		index("st_to_wh_idx").on(table.to_warehouse_id),
	]
);

// 璋冩嫧鏄庣粏
export const transferItems = mysqlTable(
	"transfer_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		transfer_id: varchar("transfer_id", { length: 36 }).notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
		variant_id: varchar("variant_id", { length: 36 }),
		quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
		unit_cost: decimal("unit_cost", { precision: 12, scale: 2 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("ti_transfer_id_idx").on(table.transfer_id),
		index("ti_product_id_idx").on(table.product_id),
	]
);

export const conversations = mysqlTable(
	"conversations",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }),
		title: varchar("title", { length: 200 }),
		status: varchar("status", { length: 20 }).notNull().default("active"),
		assigned_to: varchar("assigned_to", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	}
);

// 瀹㈡湇娑堟伅
export const messages = mysqlTable(
	"messages",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		conversation_id: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
		role: varchar("role", { length: 20 }).notNull(),
		content: text("content").notNull(),
		metadata: json("metadata"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("msg_conversation_id_idx").on(table.conversation_id),
		index("msg_created_at_idx").on(table.created_at),
	]
);

// 鍟嗗搧璇勪环
export const productReviews = mysqlTable(
	"product_reviews",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		user_id: varchar("user_id", { length: 36 }),
		rating: int("rating").notNull(),
		title: varchar("title", { length: 200 }),
		content: text("content"),
		is_verified: boolean("is_verified").default(false).notNull(),
		is_approved: boolean("is_approved").default(true).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("pr_product_id_idx").on(table.product_id),
		index("pr_user_id_idx").on(table.user_id),
	]
);

// 鍟嗗搧鎺ㄨ崘鍏宠仈
export const productRecommendations = mysqlTable(
	"product_recommendations",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		recommended_product_id: varchar("recommended_product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
		type: varchar("type", { length: 10 }).notNull().default("manual"),
		sort_order: int("sort_order").default(0),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("rec_product_id_idx").on(table.product_id),
	]
);

// ==================== 瀹㈡埛鍦板潃 ====================
export const customerAddresses = mysqlTable(
	"customer_addresses",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }).notNull(),
		label: varchar("label", { length: 50 }),
		first_name: varchar("first_name", { length: 100 }),
		last_name: varchar("last_name", { length: 100 }),
		company: varchar("company", { length: 200 }),
		phone: varchar("phone", { length: 50 }),
		address_line1: varchar("address_line1", { length: 200 }).notNull(),
		address_line2: varchar("address_line2", { length: 200 }),
		city: varchar("city", { length: 100 }).notNull(),
		state: varchar("state", { length: 100 }),
		zip: varchar("zip", { length: 20 }),
		country: varchar("country", { length: 100 }).notNull().default("Moz"),
		is_default: boolean("is_default").default(false).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("ca_user_id_idx").on(table.user_id),
	]
);

// ==================== 鐢ㄦ埛妗ｆ锛堝惈钀ラ攢/鏍囩瀛楁锛?====================
export const profiles = mysqlTable(
	"profiles",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		email: varchar("email", { length: 255 }),
		phone: varchar("phone", { length: 50 }),
		whatsapp: varchar("whatsapp", { length: 50 }),
		display_name: varchar("display_name", { length: 100 }),
		avatar_url: varchar("avatar_url", { length: 500 }),
		locale: varchar("locale", { length: 10 }).default("en"),
		currency: varchar("currency", { length: 3 }).default("USD"),
		is_admin: boolean("is_admin").default(false).notNull(),
		tags: text("tags"),
		accepts_marketing: boolean("accepts_marketing").default(false).notNull(),
		tax_exempt: boolean("tax_exempt").default(false).notNull(),
		total_spent: decimal("total_spent", { precision: 12, scale: 2 }).default("0"),
		orders_count: int("orders_count").default(0),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("profiles_email_idx").on(table.email),
	]
);

export const shippingTemplates = mysqlTable(
	"shipping_templates",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		name: varchar("name", { length: 200 }).notNull(),
		type: varchar("type", { length: 20 }).notNull().default("flat"),
		base_rate: decimal("base_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
		free_shipping_min: decimal("free_shipping_min", { precision: 10, scale: 2 }),
		conditions: json("conditions"),
		regions: json("regions"),
		description: text("description"),
		is_active: boolean("is_active").default(true).notNull(),
		sort_order: int("sort_order").default(0).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("shipping_templates_active_idx").on(table.is_active),
	]
);

// ==================== Maputo 本地配送区域（B3-A） ====================
export const deliveryZones = mysqlTable(
	"delivery_zones",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		name: varchar("name", { length: 100 }).notNull(),
		name_en: varchar("name_en", { length: 100 }),
		base_rate: decimal("base_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
		free_shipping_min: decimal("free_shipping_min", { precision: 10, scale: 2 }),
		time_slots: json("time_slots"),
		is_active: boolean("is_active").default(true).notNull(),
		sort_order: int("sort_order").default(0).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("dz_active_idx").on(table.is_active),
		index("dz_sort_order_idx").on(table.sort_order),
	]
);

export const notifications = mysqlTable(
	"notifications",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		user_id: varchar("user_id", { length: 36 }).notNull(),
		type: varchar("type", { length: 50 }).notNull(),
		title: varchar("title", { length: 255 }).notNull(),
		body: text("body"),
		reference_type: varchar("reference_type", { length: 50 }),
		reference_id: varchar("reference_id", { length: 36 }),
		is_read: boolean("is_read").default(false).notNull(),
		channel: varchar("channel", { length: 20 }).default("in_app"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		read_at: timestamp("read_at"),
	},
	(table) => [
		index("notifications_user_idx").on(table.user_id),
		index("notifications_read_idx").on(table.is_read),
		index("notifications_type_idx").on(table.type),
		index("notifications_created_idx").on(table.created_at),
	]
);


export const orderTimeline = mysqlTable(
	"order_timeline",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		order_id: varchar("order_id", { length: 36 }).notNull(),
		action: varchar("action", { length: 100 }).notNull(),
		description: text("description"),
		old_value: text("old_value"),
		new_value: text("new_value"),
		operator_id: varchar("operator_id", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_timeline_order_idx").on(table.order_id),
		index("order_timeline_created_idx").on(table.created_at),
	]
);
// ==================== Media Library ====================
export const mediaLibrary = mysqlTable(
	"media_library",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		filename: varchar("filename", { length: 255 }).notNull(),
		original_name: varchar("original_name", { length: 255 }).notNull(),
		mime_type: varchar("mime_type", { length: 100 }).notNull(),
		size: int("size").notNull().default(0),
		url: varchar("url", { length: 500 }).notNull(),
		alt_text: varchar("alt_text", { length: 500 }),
		uploaded_by: varchar("uploaded_by", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("ml_uploaded_by_idx").on(table.uploaded_by),
	]
);

// ==================== 交付方式字典 ====================
export const deliveryMethods = mysqlTable(
	"delivery_methods",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		code: varchar("code", { length: 64 }).notNull().unique(),
		label: varchar("label", { length: 128 }).notNull(),
		label_en: varchar("label_en", { length: 128 }),
		applicable_types: json("applicable_types").notNull().default([]),
		sort_order: int("sort_order").default(0).notNull(),
		is_active: boolean("is_active").default(true).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		deleted_at: timestamp("deleted_at"),
	},
	(table) => [
		index("dm_code_idx").on(table.code),
		index("dm_active_idx").on(table.is_active),
	]
);

// ==================== 商品类型字典 ====================
export const productTypes = mysqlTable(
	"product_types",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		code: varchar("code", { length: 64 }).notNull().unique(),
		label: varchar("label", { length: 128 }).notNull(),
		label_en: varchar("label_en", { length: 128 }),
		description: text("description"),
		sort_order: int("sort_order").default(0).notNull(),
		is_active: boolean("is_active").default(true).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
		deleted_at: timestamp("deleted_at"),
	},
	(table) => [
		index("pt_code_idx").on(table.code),
		index("pt_active_idx").on(table.is_active),
		index("pt_sort_order_idx").on(table.sort_order),
	]
);

// ==================== 通用导入接收器 ====================
export const importSessions = mysqlTable(
	"import_sessions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		source: varchar("source", { length: 50 }).notNull(),
		source_store: varchar("source_store", { length: 100 }).notNull(),
		status: varchar("status", { length: 20 }).notNull().default("open"),
		expected_jobs: json("expected_jobs"),
		customer_link_strategy: varchar("customer_link_strategy", { length: 30 }).notNull().default("auto_create_user"),
		started_by: varchar("started_by", { length: 36 }),
		started_at: timestamp("started_at").defaultNow().notNull(),
		finished_at: timestamp("finished_at"),
	},
	(table) => [
		index("is_source_idx").on(table.source, table.source_store, table.started_at),
		index("is_status_idx").on(table.status),
	]
);

export const importJobs = mysqlTable(
	"import_jobs",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		session_id: varchar("session_id", { length: 36 }).notNull().references(() => importSessions.id, { onDelete: "cascade" }),
		job_type: varchar("job_type", { length: 50 }).notNull(),
		total_rows: int("total_rows").notNull().default(0),
		success_rows: int("success_rows").notNull().default(0),
		failed_rows: int("failed_rows").notNull().default(0),
		errors: json("errors"),
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		started_at: timestamp("started_at").defaultNow().notNull(),
		finished_at: timestamp("finished_at"),
	},
	(table) => [
		index("ij_session_idx").on(table.session_id),
		index("ij_status_idx").on(table.status),
		index("ij_type_idx").on(table.job_type),
	]
);

export const externalSourceMappings = mysqlTable(
	"external_source_mappings",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		source: varchar("source", { length: 50 }).notNull(),
		source_store: varchar("source_store", { length: 100 }).notNull(),
		source_type: varchar("source_type", { length: 50 }).notNull(),
		source_id: varchar("source_id", { length: 255 }).notNull(),
		local_table: varchar("local_table", { length: 50 }).notNull(),
		local_id: varchar("local_id", { length: 36 }).notNull(),
		raw_snapshot: json("raw_snapshot"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("esm_source_unique_idx").on(table.source, table.source_store, table.source_type, table.source_id),
		index("esm_local_idx").on(table.local_table, table.local_id),
		index("esm_source_idx").on(table.source, table.source_store),
	]
);

export const posRefundItems = mysqlTable(
	"pos_refund_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		refund_id: varchar("refund_id", { length: 36 }).notNull().references(() => refunds.id, { onDelete: "cascade" }),
		order_item_id: varchar("order_item_id", { length: 36 }).notNull().references(() => orderItems.id),
		quantity: int("quantity").notNull(),
		restock: boolean("restock").notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("pos_refund_items_refund_item_unique").on(table.refund_id, table.order_item_id),
		index("pos_refund_items_order_item_idx").on(table.order_item_id),
	]
);

export const posExchanges = mysqlTable(
	"pos_exchanges",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		idempotency_key: varchar("idempotency_key", { length: 160 }).notNull(),
		store_id: varchar("store_id", { length: 36 }).notNull(),
		original_order_id: varchar("original_order_id", { length: 36 }).notNull().references(() => orders.id),
		replacement_order_id: varchar("replacement_order_id", { length: 36 }).notNull().references(() => orders.id),
		refund_id: varchar("refund_id", { length: 36 }).references(() => refunds.id),
		refund_amount: decimal("refund_amount", { precision: 12, scale: 2 }).notNull(),
		new_order_amount: decimal("new_order_amount", { precision: 12, scale: 2 }).notNull(),
		difference_amount: decimal("difference_amount", { precision: 12, scale: 2 }).notNull(),
		approval_token_id: varchar("approval_token_id", { length: 36 }),
		operator_id: varchar("operator_id", { length: 36 }).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("pos_exchanges_idempotency_unique").on(table.idempotency_key),
		index("pos_exchanges_original_idx").on(table.original_order_id),
		index("pos_exchanges_replacement_idx").on(table.replacement_order_id),
		uniqueIndex("pos_exchanges_refund_unique").on(table.refund_id),
	]
);

export const posShifts = mysqlTable(
	"pos_shifts",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		store_id: varchar("store_id", { length: 36 }).notNull(),
		opened_by: varchar("opened_by", { length: 36 }).notNull(),
		closed_by: varchar("closed_by", { length: 36 }),
		status: varchar("status", { length: 20 }).notNull().default("open"),
		opening_float: decimal("opening_float", { precision: 12, scale: 2 }).notNull(),
		expected_cash: decimal("expected_cash", { precision: 12, scale: 2 }),
		counted_cash: decimal("counted_cash", { precision: 12, scale: 2 }),
		difference_cash: decimal("difference_cash", { precision: 12, scale: 2 }),
		opened_at: timestamp("opened_at").defaultNow().notNull(),
		closed_at: timestamp("closed_at"),
	},
	(table) => [index("pos_shifts_store_status_idx").on(table.store_id, table.status)]
);

export const posCashMovements = mysqlTable(
	"pos_cash_movements",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		shift_id: varchar("shift_id", { length: 36 }).notNull().references(() => posShifts.id, { onDelete: "cascade" }),
		kind: varchar("kind", { length: 10 }).notNull(),
		amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
		reason: varchar("reason", { length: 255 }).notNull(),
		operator_id: varchar("operator_id", { length: 36 }).notNull(),
		idempotency_key: varchar("idempotency_key", { length: 160 }).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("pos_cash_movements_idempotency_unique").on(table.idempotency_key),
		index("pos_cash_movements_shift_idx").on(table.shift_id, table.created_at),
	]
);

export const posAuditOutbox = mysqlTable(
	"pos_audit_outbox",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		event_type: varchar("event_type", { length: 80 }).notNull(),
		entity_type: varchar("entity_type", { length: 40 }).notNull(),
		entity_id: varchar("entity_id", { length: 36 }).notNull(),
		store_id: varchar("store_id", { length: 36 }),
		operator_id: varchar("operator_id", { length: 36 }),
		payload: json("payload").notNull(),
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		attempts: int("attempts").notNull().default(0),
		next_attempt_at: timestamp("next_attempt_at"),
		processed_at: timestamp("processed_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("pos_audit_outbox_status_idx").on(table.status, table.next_attempt_at),
		index("pos_audit_outbox_entity_idx").on(table.entity_type, table.entity_id),
	]
);

export const posPurchaseOrders = mysqlTable(
	"pos_purchase_orders",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		number: varchar("number", { length: 64 }).notNull(),
		supplier: varchar("supplier", { length: 200 }).notNull(),
		store_id: varchar("store_id", { length: 36 }).notNull().references(() => stores.id),
		location_id: varchar("location_id", { length: 36 }).references(() => warehouses.id),
		status: varchar("status", { length: 20 }).notNull().default("ordered"),
		created_by: varchar("created_by", { length: 36 }).notNull().references(() => staff.id),
		received_by: varchar("received_by", { length: 36 }).references(() => staff.id),
		idempotency_key: varchar("idempotency_key", { length: 160 }).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		received_at: timestamp("received_at"),
	},
	(table) => [
		uniqueIndex("pos_purchase_orders_number_unique").on(table.number),
		uniqueIndex("pos_purchase_orders_idempotency_unique").on(table.idempotency_key),
		index("pos_purchase_orders_store_status_idx").on(table.store_id, table.status, table.created_at),
		check("pos_purchase_orders_status_check", sql`${table.status} IN ('ordered', 'received', 'cancelled')`),
	]
);

export const posPurchaseOrderItems = mysqlTable(
	"pos_purchase_order_items",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		purchase_order_id: varchar("purchase_order_id", { length: 36 }).notNull()
			.references(() => posPurchaseOrders.id, { onDelete: "cascade" }),
		product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
		variant_id: varchar("variant_id", { length: 36 }).references(() => productVariants.id),
		ordered_qty: int("ordered_qty").notNull(),
		received_qty: int("received_qty").notNull().default(0),
		unit_cost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
	},
	(table) => [
		index("pos_purchase_order_items_order_idx").on(table.purchase_order_id),
		index("pos_purchase_order_items_product_idx").on(table.product_id, table.variant_id),
		check("pos_purchase_order_items_ordered_qty_check", sql`${table.ordered_qty} > 0`),
		check("pos_purchase_order_items_received_qty_check", sql`${table.received_qty} BETWEEN 0 AND ${table.ordered_qty}`),
		check("pos_purchase_order_items_unit_cost_check", sql`${table.unit_cost} >= 0`),
	]
);

export const posInventoryMigrationExceptions = mysqlTable(
	"pos_inventory_migration_exceptions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		exception_type: varchar("exception_type", { length: 40 }).notNull(),
		product_id: varchar("product_id", { length: 36 }).notNull(),
		variant_id: varchar("variant_id", { length: 36 }),
		details: json("details").notNull(),
		resolved_at: timestamp("resolved_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("pos_inventory_migration_exceptions_type_idx").on(table.exception_type, table.created_at),
		index("pos_inventory_migration_exceptions_product_idx").on(table.product_id, table.variant_id),
	],
);

export const posDeviceAuditLogs = mysqlTable(
	"pos_device_audit_logs",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		device_id: varchar("device_id", { length: 100 }).notNull(),
		store_id: varchar("store_id", { length: 36 }).notNull(),
		operator_id: varchar("operator_id", { length: 36 }).notNull(),
		event_type: varchar("event_type", { length: 80 }).notNull(),
		entity_type: varchar("entity_type", { length: 40 }).notNull(),
		entity_id: varchar("entity_id", { length: 36 }),
		payload: json("payload").notNull(),
		hash: char("hash", { length: 64 }).notNull(),
		prev_hash: char("prev_hash", { length: 64 }),
		occurred_at: timestamp("occurred_at", { fsp: 3 }).notNull(),
		uploaded_at: timestamp("uploaded_at", { fsp: 3 }).notNull(),
	},
	(table) => [index("pos_device_audit_logs_device_idx").on(table.device_id, table.uploaded_at)]
);

// ==================== URL Redirects锛圫hopify/SEO 杩佺Щ锛?====================
export const urlRedirects = mysqlTable(
	"url_redirects",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		old_path: varchar("old_path", { length: 767 }).notNull(),
		new_path: varchar("new_path", { length: 1024 }).notNull(),
		status_code: int("status_code").notNull().default(301),
		source: varchar("source", { length: 50 }),
		source_store: varchar("source_store", { length: 100 }),
		source_id: varchar("source_id", { length: 255 }),
		hits: int("hits").notNull().default(0),
		is_active: boolean("is_active").notNull().default(true),
		last_hit_at: timestamp("last_hit_at"),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		uniqueIndex("ur_old_path_unique_idx").on(table.old_path),
		index("ur_source_idx").on(table.source, table.source_store),
		index("ur_active_idx").on(table.is_active),
	]
);

// ==================== 自定义收款方式 ====================
export const paymentMethods = mysqlTable(
	"payment_methods",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		code: varchar("code", { length: 64 }).notNull().unique(),
		name: varchar("name", { length: 128 }).notNull(),
		name_en: varchar("name_en", { length: 128 }),
		type: mysqlEnum("type", ["online_gateway", "offline_manual"]).notNull().default("offline_manual"),
		config: json("config"),
		enabled: boolean("enabled").default(true).notNull(),
		sort_order: int("sort_order").default(0).notNull(),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at"),
	},
	(table) => [
		index("pm_code_idx").on(table.code),
		index("pm_enabled_idx").on(table.enabled),
	]
);

// ==================== WhatsApp 点击追踪（FJ-B1-C） ====================
export const whatsappClicks = mysqlTable(
	"whatsapp_clicks",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		visitor_id: varchar("visitor_id", { length: 64 }),
		product_id: varchar("product_id", { length: 36 }),
		variant_id: varchar("variant_id", { length: 36 }),
		path: varchar("path", { length: 500 }).notNull(),
		locale: varchar("locale", { length: 10 }),
		referrer: text("referrer"),
		utm_source: varchar("utm_source", { length: 100 }),
		utm_medium: varchar("utm_medium", { length: 100 }),
		utm_campaign: varchar("utm_campaign", { length: 200 }),
		utm_content: varchar("utm_content", { length: 200 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("wc_visitor_id_idx").on(table.visitor_id),
		index("wc_product_id_idx").on(table.product_id),
		index("wc_created_at_idx").on(table.created_at),
	]
);

// ==================== POS 幂等键表 ====================
export const posIdempotencyKeys = mysqlTable(
	"pos_idempotency_keys",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
		idempotency_key: varchar("idempotency_key", { length: 160 }).notNull(),
		operation: varchar("operation", { length: 40 }).notNull(),
		store_id: varchar("store_id", { length: 36 }),
		request_hash: char("request_hash", { length: 64 }).notNull(),
		status: varchar("status", { length: 20 }).notNull().default("processing"),
		response_status: int("response_status"),
		response_body: json("response_body"),
		resource_type: varchar("resource_type", { length: 40 }),
		resource_id: varchar("resource_id", { length: 36 }),
		created_at: timestamp("created_at").defaultNow().notNull(),
		updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
		expires_at: timestamp("expires_at"),
	},
	(table) => [
		uniqueIndex("pos_idempotency_key_unique").on(table.idempotency_key),
		index("pos_idempotency_store_created_idx").on(table.store_id, table.created_at),
		index("pos_idempotency_status_idx").on(table.status),
	]
);
