// =============================================================================
// D1 数据库访问层 (env.DB 即 wrangler.toml 中绑定的 d1_databases)
// 完全对齐 Vmqphp 的 Db::name(...)->where(...)->find()/select()/insert()/execute()
// =============================================================================

// ---------- 通用响应封装 (Vmqphp getReturn) ----------
export function getReturn(code = 1, msg = '成功', data = null) {
  return { code, msg, data };
}

// ---------- setting (kv 配置) ----------
// Vmqphp: Db::name("setting")->where("vkey",$key)->find() / ->update(array("vvalue"=>...))
export async function getSetting(db, key) {
  const row = await db.prepare('SELECT vvalue FROM setting WHERE vkey = ?')
                    .bind(key).first();
  return row ? row.vvalue : null;
}

export async function getSettingRow(db, key) {
  return db.prepare('SELECT vkey, vvalue FROM setting WHERE vkey = ?')
           .bind(key).first();
}

export async function setSetting(db, key, value) {
  // D1 没有真正的 ON DUPLICATE KEY,这里用 INSERT OR REPLACE
  return db.prepare('INSERT OR REPLACE INTO setting (vkey, vvalue) VALUES (?, ?)')
           .bind(key, String(value ?? '')).run();
}

export async function listSetting(db) {
  const r = await db.prepare('SELECT vkey, vvalue FROM setting').all();
  const out = {};
  for (const row of (r.results || [])) out[row.vkey] = row.vvalue;
  return out;
}

// ---------- pay_order ----------
// Vmqphp: Db::name("pay_order")->where("pay_id",$payId)->find()
export async function findOrderByPayId(db, payId) {
  return db.prepare('SELECT * FROM pay_order WHERE pay_id = ?')
           .bind(payId).first();
}

export async function findOrderByOrderId(db, orderId) {
  return db.prepare('SELECT * FROM pay_order WHERE order_id = ?')
           .bind(orderId).first();
}

// 关键查询:Vmqphp appPush 里根据 really_price + type + state=0 找订单
export async function findMatchingOrder(db, reallyPrice, type) {
  return db.prepare(
    `SELECT * FROM pay_order
     WHERE really_price = ? AND type = ? AND state = 0
     ORDER BY create_date ASC
     LIMIT 1`
  ).bind(reallyPrice, type).first();
}

// Vmqphp listOrders 是后台分页,这里提供一个简化版
export async function listOrders(db, { state = null, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM pay_order';
  const args = [];
  if (state !== null) {
    sql += ' WHERE state = ?';
    args.push(state);
  }
  sql += ' ORDER BY id DESC';   // 用 id 当时间序:D1 ROWID
  return db.prepare(sql).bind(...args).all();
}

export async function countOrdersByState(db) {
  const r = await db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN state = 1 THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN state = -1 THEN 1 ELSE 0 END) AS expired,
       SUM(CASE WHEN state = 2 THEN 1 ELSE 0 END) AS notify_fail
     FROM pay_order`
  ).first();
  return r || {};
}

export async function todayIncome(db) {
  // Vmqphp 后台首页统计今日收入(秒级时间戳)
  const startOfDay = Math.floor(Date.now() / 1000) - 86400;
  const r = await db.prepare(
    `SELECT COALESCE(SUM(price), 0) AS income
     FROM pay_order
     WHERE state = 1 AND pay_date >= ?`
  ).bind(startOfDay).first();
  return r ? Number(r.income || 0) : 0;
}

export async function insertOrder(db, data) {
  return db.prepare(
    `INSERT INTO pay_order
       (close_date, create_date, is_auto, notify_url, order_id, param,
        pay_date, pay_id, pay_url, price, really_price, return_url, state, type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    data.close_date ?? 0,
    data.create_date ?? 0,
    data.is_auto ?? 0,
    data.notify_url ?? '',
    data.order_id ?? '',
    data.param ?? '',
    data.pay_date ?? 0,
    data.pay_id ?? '',
    data.pay_url ?? '',
    Number(data.price ?? 0),
    Number(data.really_price ?? 0),
    data.return_url ?? '',
    data.state ?? 0,
    data.type ?? 0
  ).run();
}

export async function updateOrderState(db, orderId, patch) {
  const fields = [];
  const args = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    args.push(v);
  }
  args.push(orderId);
  return db.prepare(
    `UPDATE pay_order SET ${fields.join(', ')} WHERE order_id = ?`
  ).bind(...args).run();
}

export async function updateOrderById(db, id, patch) {
  const fields = [];
  const args = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    args.push(v);
  }
  args.push(id);
  return db.prepare(
    `UPDATE pay_order SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...args).run();
}

// 关闭过期订单 (Vmqphp closeEndOrder)
//   - create_date <= now - close*60
//   - state = 0  → state = -1, close_date = now
export async function closeExpiredOrders(db, closeMinutes) {
  const cutoff = Math.floor(Date.now() / 1000) - closeMinutes * 60;
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(
    `UPDATE pay_order
     SET state = -1, close_date = ?
     WHERE create_date <= ? AND state = 0`
  ).bind(now, cutoff).run();
}

export async function getCloseMinutes(db) {
  const v = await getSetting(db, 'close');
  return Math.max(1, parseInt(v || '5', 10));
}

// ---------- tmp_price (锁定金额) ----------
// Vmqphp: INSERT IGNORE INTO tmp_price (price,oid) VALUES ('...','...')
export async function tryLockTmpPrice(db, reallyPrice, type, oid) {
  const key = `${reallyPrice}-${type}`;
  try {
    const r = await db.prepare(
      'INSERT OR IGNORE INTO tmp_price (price, oid) VALUES (?, ?)'
    ).bind(key, oid).run();
    return r.meta && r.meta.changes > 0;
  } catch (e) {
    return false;
  }
}

export async function unlockTmpPriceByOid(db, oid) {
  return db.prepare('DELETE FROM tmp_price WHERE oid = ?').bind(oid).run();
}

// 清理孤立 tmp_price (oid 在 pay_order 已不存在)
// 对应 Vmqphp 中 closeEndOrder 后半段
export async function cleanOrphanTmpPrices(db) {
  const r = await db.prepare('SELECT oid FROM tmp_price').bind().all();
  const rows = r.results || [];
  let cleaned = 0;
  for (const row of rows) {
    const exists = await db.prepare(
      'SELECT 1 AS x FROM pay_order WHERE order_id = ? LIMIT 1'
    ).bind(row.oid).first();
    if (!exists) {
      await db.prepare('DELETE FROM tmp_price WHERE oid = ?').bind(row.oid).run();
      cleaned++;
    }
  }
  return cleaned;
}

// ---------- pay_qrcode (固定金额二维码) ----------
// Vmqphp: Db::name("pay_qrcode")->where("price",$p)->where("type",$t)->find()
export async function findPayQrcode(db, price, type) {
  return db.prepare('SELECT * FROM pay_qrcode WHERE price = ? AND type = ?')
           .bind(price, type).first();
}

export async function listPayQrcodes(db, type = null) {
  if (type === null) {
    return db.prepare('SELECT * FROM pay_qrcode ORDER BY id DESC').all();
  }
  return db.prepare('SELECT * FROM pay_qrcode WHERE type = ? ORDER BY id DESC')
           .bind(type).all();
}

export async function insertPayQrcode(db, { pay_url, price, type }) {
  return db.prepare(
    'INSERT INTO pay_qrcode (pay_url, price, type) VALUES (?, ?, ?)'
  ).bind(pay_url, Number(price), Number(type)).run();
}

export async function deletePayQrcode(db, id) {
  return db.prepare('DELETE FROM pay_qrcode WHERE id = ?').bind(id).run();
}

// ---------- pay_log (收款推送日志,setting.paylog 开关控制是否写入) ----------
const PAY_LOG_KEEP = 1000;

export async function recordPayLog(db, {
  type, price, appId = '', isRetry = false, tryCount = 1,
  orderId = '', code = 0, msg = ''
}) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO pay_log (create_date, type, price, app_id, is_retry, try_count, order_id, code, msg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(now, Number(type), Number(price), String(appId || ''),
         isRetry ? 1 : 0, Number(tryCount) || 1, String(orderId || ''),
         Number(code), String(msg || '')).run();
  // 裁剪:只保留最近 PAY_LOG_KEEP 条,避免 D1 无限膨胀
  await db.prepare('DELETE FROM pay_log WHERE id <= (SELECT MAX(id) - ? FROM pay_log)')
           .bind(PAY_LOG_KEEP).run();
}

export async function listPayLogs(db, { type = null, limit = 200 } = {}) {
  if (type === null) {
    return db.prepare('SELECT * FROM pay_log ORDER BY id DESC LIMIT ?').bind(limit).all();
  }
  return db.prepare('SELECT * FROM pay_log WHERE type = ? ORDER BY id DESC LIMIT ?')
           .bind(Number(type), limit).all();
}

export async function clearPayLogs(db) {
  return db.prepare('DELETE FROM pay_log').run();
}