-- Migration: 0011 - seed physical delivery method
--
-- 0009 created delivery_methods before physical fulfillment had a default
-- delivery option. This idempotently adds a shipping method for physical
-- products on existing deployments.

INSERT IGNORE INTO delivery_methods (
  id,
  code,
  label,
  label_en,
  applicable_types,
  sort_order,
  is_active
) VALUES (
  UUID(),
  'shipping',
  '物流发货',
  'Shipping',
  JSON_ARRAY('physical'),
  7,
  1
);
