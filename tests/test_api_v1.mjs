// tests/test_api_v1.mjs — altmanlib HMAC 签名 JSON 协议 + /api/monitor/* 别名路由
// 用法: node tests/test_api_v1.mjs

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import md5 from '../src/md5.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));

function adapt(sql) {
  return {
    bind(...args) {
      const stmt = sqlite.prepare(sql);
      return {
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() {
          const r = stmt.run(...args);
          return { meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
        }
      };
    }
  };
}
const db = { prepare: adapt };

const KEY = 'testkey123';
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'key'").bind(KEY).run();

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('✓', name); }
  else { failed++; console.log('✗', name, '|', detail || ''); }
}

// ---- 复刻客户端 RequestSignature.kt 的签名逻辑 ----
const enc = new TextEncoder();
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(secret, message) {
  const ck = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', ck, enc.encode(message));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function signedRequest(path, bodyStr, { key = KEY, ts, nonce, headers } = {}) {
  ts = ts ?? String(Math.floor(Date.now() / 1000));
  nonce = nonce ?? crypto.randomUUID();
  const canonical = ['VMQ-HMAC-SHA256-V1', 'POST', path, ts, nonce, await sha256Hex(bodyStr)].join('\n');
  const sig = 'v1=' + await hmacHex(key, canonical);
  return new Request('https://example.com' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VMQ-Timestamp': ts,
      'X-VMQ-Nonce': nonce,
      'X-VMQ-Signature': sig,
      ...headers
    },
    body: bodyStr
  });
}

const worker = (await import('../src/index.js')).default;

// =================================================================
// 1. heartbeat 正常路径
// =================================================================
{
  const resp = await worker.fetch(
    await signedRequest('/api/v1/system/heartbeat', '{}'), { DB: db });
  check('v1 heartbeat → 200', resp.status === 200, resp.status);
  check('v1 heartbeat → body ok', (await resp.text()) === 'ok');
  const lh = await db.prepare("SELECT vvalue FROM setting WHERE vkey='lastheart'").bind().first();
  check('v1 heartbeat 更新 lastheart', parseInt(lh.vvalue) > 0);
}

// =================================================================
// 2. 校验失败路径 → 401
// =================================================================
{
  const noHeaders = new Request('https://example.com/api/v1/system/heartbeat',
    { method: 'POST', body: '{}' });
  check('缺签名头 → 401', (await worker.fetch(noHeaders, { DB: db })).status === 401);

  const badKey = await worker.fetch(
    await signedRequest('/api/v1/system/heartbeat', '{}', { key: 'wrongkey' }), { DB: db });
  check('错误密钥 → 401', badKey.status === 401);

  const oldTs = await worker.fetch(
    await signedRequest('/api/v1/system/heartbeat', '{}',
      { ts: String(Math.floor(Date.now() / 1000) - 3600) }), { DB: db });
  check('过期时间戳 → 401', oldTs.status === 401);

  const fixedNonce = 'nonce-replay-test';
  const r1 = await worker.fetch(
    await signedRequest('/api/v1/system/heartbeat', '{}', { nonce: fixedNonce }), { DB: db });
  const r2 = await worker.fetch(
    await signedRequest('/api/v1/system/heartbeat', '{}', { nonce: fixedNonce }), { DB: db });
  check('nonce 重放: 第一次 200 第二次 401', r1.status === 200 && r2.status === 401);

  // body 被篡改 (签名对不上 body 的 sha256)
  const good = await signedRequest('/api/v1/payments/notify', '{"channel":1,"price":1.00}');
  const tampered = new Request(good.url, {
    method: 'POST', headers: good.headers, body: '{"channel":1,"price":999.00}'
  });
  check('body 篡改 → 401', (await worker.fetch(tampered, { DB: db })).status === 401);
}

// =================================================================
// 3. notify 匹配订单 + 商户通知
// =================================================================
{
  let notified = '';
  const server = createServer((req, res) => { notified = req.url; res.end('success'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const notifyUrl = `http://127.0.0.1:${server.address().port}/notify`;

  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(
    `INSERT INTO pay_order (create_date, notify_url, order_id, param, pay_id, price, really_price, state, type)
     VALUES (?, ?, ?, '', 'V1TEST', 8.8, 8.8, 0, 2)`
  ).run(now, notifyUrl, 'V1ORD' + now);

  const resp = await worker.fetch(
    await signedRequest('/api/v1/payments/notify', '{"channel":2,"price":8.8}'), { DB: db });
  const data = await resp.json();
  check('v1 notify → 200 code=1', resp.status === 200 && data.code === 1, JSON.stringify(data));
  check('v1 notify 触发商户通知', notified.includes('payId=V1TEST'));

  const row = sqlite.prepare("SELECT state FROM pay_order WHERE order_id=?").get('V1ORD' + now);
  check('v1 notify 后订单 state=1', row.state === 1);

  // 参数校验
  const badCh = await worker.fetch(
    await signedRequest('/api/v1/payments/notify', '{"channel":3,"price":1.00}'), { DB: db });
  check('channel=3 → 400', badCh.status === 400);
  const badJson = await worker.fetch(
    await signedRequest('/api/v1/payments/notify', 'not-json'), { DB: db });
  check('非法 JSON → 400', badJson.status === 400);
  server.close();
}

// =================================================================
// 4. xinyin025/hulisang 客户端的 /api/monitor/* 路由别名
// =================================================================
{
  const t = String(Math.floor(Date.now() / 1000));
  const heartUrl = 'https://example.com/api/monitor/heart?' +
    new URLSearchParams({ t, sign: md5(t + KEY) });
  const hr = await worker.fetch(new Request(heartUrl), { DB: db });
  const hd = await hr.json();
  check('/api/monitor/heart → code=1', hd.code === 1, JSON.stringify(hd));

  const pushUrl = 'https://example.com/api/monitor/push?' +
    new URLSearchParams({ t, type: '1', price: '6.66', sign: md5('1' + '6.66' + t + KEY) });
  const pr = await worker.fetch(new Request(pushUrl), { DB: db });
  const pd = await pr.json();
  // 无匹配订单 → 记"无订单转账",code=1
  check('/api/monitor/push → code=1', pd.code === 1, JSON.stringify(pd));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
