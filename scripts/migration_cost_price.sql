ALTER TABLE products ADD COLUMN cost_price DECIMAL(12,2) DEFAULT NULL AFTER price;
ALTER TABLE products ADD COLUMN attribute_unit VARCHAR(20) DEFAULT 'min' AFTER delivery_method;
