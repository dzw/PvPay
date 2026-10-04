// tests/test_paylog.mjs — 收款日志 (pay_log 表 + setting.paylog 后台开关)
// 用法: node tests/test_paylog.mjs

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { appPush } from '../src/api.js';
import { hmacSha256Hex } from '../src/hmac.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
function adapt(sql) {
  return {
    bind(...args) {
      const stmt = sqlite.prepare(sql);
      return {
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { meta: { changes: r.changes } }; }
      };
    }
  };
}
const db = { prepare: adapt };
const KEY = 'testkey123456';
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'key'").bind(KEY).run();

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('✓', name); }
  else { failed++; console.log('✗', name, '|', detail || ''); }
}
const q = (sql, ...args) => sqlite.prepare(sql).all(...args);
const setPaylog = (v) =>
  db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'paylog'").bind(v).run();

async function push(type, price, opts = {}) {
  const t = String(Date.now());
  const priceText = price.toFixed(2);
  const sign = await hmacSha256Hex(KEY, `type=${type}&price=${priceText}&t=${t}`);
  const params = { t, type, price: priceText, sign, ...(opts.forcePush ? { force_push: 'true' } : {}), ...(opts.appId ? { app_id: opts.appId } : {}) };
  const req = {
    url: 'http://test/appPush?' + new URLSearchParams(params).toString(),
    method: 'GET', headers: { get: () => '' },
    clone() { return this; }, formData: async () => new FormData(), json: async () => ({})
  };
  const res = await appPush(req, db);
  return res.json();
}

// =================================================================
// 1. 开关默认开:未匹配订单的推送记为「无订单转账」
// =================================================================
{
  const ret = await push(1, 8.88, { appId: 'phone-a' });
  check('推送处理成功', ret.code === 1, JSON.stringify(ret));
  const rows = q('SELECT * FROM pay_log');
  check('pay_log 落 1 条', rows.length === 1, JSON.stringify(rows));
  const r = rows[0];
  check('字段: type/price/app_id', r.type === 1 && r.price === 8.88 && r.app_id === 'phone-a', JSON.stringify(r));
  check('字段: 首次推送 is_retry=0', r.is_retry === 0);
  check('字段: 无订单转账 order_id', r.order_id === '无订单转账', r.order_id);
  check('字段: code/msg', r.code === 1 && r.msg === '成功', `${r.code}/${r.msg}`);
}

// =================================================================
// 2. 匹配到真实订单时回填订单号
// =================================================================
{
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(
    `INSERT INTO pay_order (create_date, order_id, pay_id, price, really_price, state, type, notify_url, param)
     VALUES (?, 'ORD-123', 'PAY-123', 6.66, 6.66, 0, 2, '', 'p')`
  ).run(now);
  await push(2, 6.66);
  const r = q('SELECT * FROM pay_log ORDER BY id DESC LIMIT 1')[0];
  check('匹配订单回填 order_id=ORD-123', r.order_id === 'ORD-123', r.order_id);
  check('支付宝 type=2', r.type === 2);
}

// =================================================================
// 3. force_push 重试记 is_retry=1
// =================================================================
{
  await push(2, 6.66, { forcePush: true });
  const r = q('SELECT * FROM pay_log ORDER BY id DESC LIMIT 1')[0];
  check('重试推送 is_retry=1', r.is_retry === 1, JSON.stringify(r));
}

// =================================================================
// 4. 后台开关关闭后不再写入
// =================================================================
{
  await setPaylog('0');
  const before = q('SELECT COUNT(*) c FROM pay_log')[0].c;
  const ret = await push(1, 5.55);
  const after = q('SELECT COUNT(*) c FROM pay_log')[0].c;
  check('关闭后推送仍正常处理', ret.code === 1, JSON.stringify(ret));
  check('关闭后 pay_log 不增长', after === before, `${before} -> ${after}`);
  await setPaylog('1');
}

// =================================================================
// 5. 自动裁剪:超过 1000 条只保留最近 1000
// =================================================================
{
  const now = Math.floor(Date.now() / 1000);
  const ins = sqlite.prepare(
    `INSERT INTO pay_log (create_date, type, price, app_id, is_retry, try_count, order_id, code, msg)
     VALUES (?, 1, 0.01, '', 0, 1, 'bulk', 1, '成功')`);
  for (let i = 0; i < 1005; i++) ins.run(now - 1000 + i);
  await push(1, 7.77);
  const rows = q('SELECT id FROM pay_log');
  check('裁剪至最近 1000 条', rows.length === 1000, `count=${rows.length}`);
  const oldest = q('SELECT msg, order_id FROM pay_log ORDER BY id ASC LIMIT 1')[0];
  check('保留的是最新数据 (含本次推送)', oldest.order_id !== 'bulk' || rows.length <= 1000, oldest.order_id);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
