-- ============================================================
-- Cloudflare D1 schema, 完全对齐 Vmqphp(vm/php) 数据库结构
-- 字段命名参考 vmq.sql (pay_order / pay_qrcode / setting / tmp_price)
-- ============================================================

-- 订单主表
CREATE TABLE IF NOT EXISTS pay_order (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    close_date    INTEGER NOT NULL DEFAULT 0,
    create_date   INTEGER NOT NULL DEFAULT 0,
    is_auto       INTEGER NOT NULL DEFAULT 0,
    notify_url    TEXT,
    order_id      TEXT,
    param         TEXT,
    pay_date      INTEGER NOT NULL DEFAULT 0,
    pay_id        TEXT,
    pay_url       TEXT,
    price         REAL NOT NULL DEFAULT 0,
    really_price  REAL NOT NULL DEFAULT 0,
    return_url    TEXT,
    state         INTEGER NOT NULL DEFAULT 0,  -- 0=待支付 1=已支付 2=通知失败 -1=已过期
    type          INTEGER NOT NULL DEFAULT 0   -- 1=微信 2=支付宝
);
CREATE INDEX IF NOT EXISTS idx_pay_order_pay_id ON pay_order(pay_id);
CREATE INDEX IF NOT EXISTS idx_pay_order_order_id ON pay_order(order_id);
CREATE INDEX IF NOT EXISTS idx_pay_order_match ON pay_order(really_price, type, state);

-- 固定金额二维码表 (is_auto=0 时使用)
CREATE TABLE IF NOT EXISTS pay_qrcode (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    pay_url  TEXT,
    price    REAL NOT NULL DEFAULT 0,
    type     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pay_qrcode_match ON pay_qrcode(price, type);

-- KV 配置表 (保留 Vmqphp 的 vkey/vvalue 二元结构,避免破坏监控端协议)
CREATE TABLE IF NOT EXISTS setting (
    vkey    TEXT PRIMARY KEY,
    vvalue  TEXT
);

-- 锁定金额表,防止并发同金额冲突
CREATE TABLE IF NOT EXISTS tmp_price (
    price   TEXT PRIMARY KEY,
    oid     TEXT NOT NULL
);

-- ============================================================
-- 初始配置 (与 vmq.sql 中的 INSERT 完全一致)
-- ============================================================
INSERT OR IGNORE INTO setting (vkey, vvalue) VALUES
    ('user',      'admin'),
    ('pass',      'admin'),
    ('notifyUrl', ''),
    ('returnUrl', ''),
    ('key',       ''),
    ('lastheart', '0'),
    ('lastpay',   '0'),
    ('jkstate',   '-1'),
    ('close',     '5'),
    ('payQf',     '1'),
    ('wxpay',     ''),
    ('zfbpay',    '');

-- ============================================================
-- 安装说明
-- ============================================================
-- 本地:
--   wrangler d1 execute vmq-db --file=./schema.sql
-- 线上 (部署后必须执行一次,否则线上库是空的):
--   wrangler d1 execute vmq-db --file=./schema.sql --remote