CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_code VARCHAR(64) NOT NULL,
  store_name VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stores_store_code (store_code)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  surname VARCHAR(128) NOT NULL,
  user_chat_id BIGINT NOT NULL,
  role VARCHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_chat_id (user_chat_id),
  KEY idx_users_store_id (store_id),
  CONSTRAINT fk_users_store
    FOREIGN KEY (store_id) REFERENCES stores (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  article VARCHAR(128) NOT NULL,
  barcode VARCHAR(128) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  units_of_measurement VARCHAR(32) NOT NULL,
  category VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_barcode (barcode),
  KEY idx_products_article (article),
  KEY idx_products_category (category)
);

CREATE TABLE IF NOT EXISTS product_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  store_id INT NOT NULL,
  quantity INT NOT NULL,
  expiry_date DATE NOT NULL,
  delivery_date DATE NULL,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at DATETIME NULL,
  notified_days INT NOT NULL DEFAULT 7,
  check_status VARCHAR(32) NOT NULL DEFAULT 'new',
  checked_by_user_id INT NULL,
  checked_at DATETIME NULL,
  action_taken VARCHAR(64) NULL,
  action_note TEXT NULL,
  discussion_required BOOLEAN NOT NULL DEFAULT FALSE,
  discussion_note TEXT NULL,
  discussion_requested_by_user_id INT NULL,
  discussion_requested_at DATETIME NULL,
  admin_decision VARCHAR(64) NULL,
  admin_decision_note TEXT NULL,
  admin_decision_by_user_id INT NULL,
  admin_decision_at DATETIME NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_batches_operational (product_id, store_id, expiry_date),
  KEY idx_product_batches_store_status (store_id, check_status),
  KEY idx_product_batches_expiry_date (expiry_date),
  KEY idx_product_batches_notified (notified, notified_days),
  CONSTRAINT fk_product_batches_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_product_batches_store
    FOREIGN KEY (store_id) REFERENCES stores (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_product_batches_checked_by
    FOREIGN KEY (checked_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_product_batches_discussion_requested_by
    FOREIGN KEY (discussion_requested_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_product_batches_admin_decision_by
    FOREIGN KEY (admin_decision_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_product_batches_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_product_batches_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  batch_id INT NULL,
  product_id INT NULL,
  store_id INT NULL,
  old_quantity INT NULL,
  new_quantity INT NULL,
  old_expiry_date DATE NULL,
  new_expiry_date DATE NULL,
  comment TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_log_user_id (user_id),
  KEY idx_activity_log_batch_id (batch_id),
  KEY idx_activity_log_product_id (product_id),
  KEY idx_activity_log_store_id (store_id),
  CONSTRAINT fk_activity_log_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_activity_log_batch
    FOREIGN KEY (batch_id) REFERENCES product_batches (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_activity_log_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_activity_log_store
    FOREIGN KEY (store_id) REFERENCES stores (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NULL,
  product_id INT NULL,
  store_id INT NULL,
  user_id INT NULL,
  notification_type VARCHAR(64) NOT NULL,
  message_text TEXT NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notification_log_batch_id (batch_id),
  KEY idx_notification_log_product_id (product_id),
  KEY idx_notification_log_store_id (store_id),
  KEY idx_notification_log_user_id (user_id),
  CONSTRAINT fk_notification_log_batch
    FOREIGN KEY (batch_id) REFERENCES product_batches (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_notification_log_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_notification_log_store
    FOREIGN KEY (store_id) REFERENCES stores (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_notification_log_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_key VARCHAR(128) NOT NULL,
  session_state JSON NOT NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_sessions_user_key (user_id, session_key),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);
