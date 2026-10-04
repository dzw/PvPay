// 本地单元测试:用 better-sqlite3 (需要 npm install) 或 Node 内置 sql.js 都不行,
// 所以这里用最简 in-memory mock 来模拟 D1.prepare(...).bind(...).first()/all()/run()
//
// 用法:
//   node tests/test_api.mjs

import { createOrder, getOrder, checkOrder, closeOrder, getState,
         appHeart, appPush, _closeEndOrder, _yuanToCents, _centsToYuan }
  from '../src/api.js';

import md5 from '../src/md5.js';

// ----- 一个最小 D1 兼容层,用 better-sqlite3 不行就用数组 -----
// 这里直接手写一个 in-memory SQL 引擎太复杂,所以 mock 接口只实现:
//   prepare(sql).bind(...).first() / all() / run()
//
// 我们的 sql 都非常简单(SELECT/UPDATE/INSERT/DELETE 单表),手写一个 SQLite-like
// mock 即可。最干净的做法是用 node:sqlite (Node 22+) — 试试看。

let Database;
try {
  Database = (await import('node:sqlite')).DatabaseSync;
  console.log('use node:sqlite');
} catch (e) {
  console.error('需要 Node 22+ 的 node:sqlite');
  process.exit(1);
}

const sqlite = new Database(':memory:');
// 读 schema.sql 初始化
import { readFileSync } from 'node:fs';
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
sqlite.exec(schema);

// ----- D1 适配器:把 SQLite 行对象的方法改造成 D1 风格 -----
function adapt(sqlite, sql) {
  return {
    bind(...args) {
      const stmt = sqlite.prepare(sql);
      return {
        async first() {
          try { return stmt.get(...args) || null; }
          catch (e) { console.error('first err:', sql, e.message); throw e; }
        },
        async all() {
          const rows = stmt.all(...args);
          return { results: rows };
        },
        async run() {
          const r = stmt.run(...args);
          // SQLite 返回 { changes, lastInsertRowid };D1 用 { meta: { changes } }
          return { meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
        }
      };
    }
  };
}

function makeDb() {
  return {
    prepare(sql) { return adapt(sqlite, sql); }
  };
}

// =================================================================
// 准备测试数据
// =================================================================
const db = makeDb();

await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'key'")
        .bind('testkey123').run();
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'jkstate'")
        .bind('1').run();
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'user'")
        .bind('admin').run();
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'pass'")
        .bind('admin').run();
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'wxpay'")
        .bind('weixin://wxpay/bizpayurl?pr=test').run();
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'notifyUrl'")
        .bind('').run();

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('✓', name); }
  else      { failed++; console.log('✗', name, '|', detail || ''); }
}

// =================================================================
// Test 1: md5 与 PHP md5 一致
// =================================================================
check('md5("123456") == e10adc...',
      md5('123456') === 'e10adc3949ba59abbe56e057f20f883e');

// =================================================================
// Test 2: 元↔分转换
// =================================================================
check('yuanToCents("0.02") == 2n', _yuanToCents('0.02') === 2n);
check('yuanToCents("8") == 800n', _yuanToCents('8') === 800n);
check('centsToYuan(2n) == "0.02"', _centsToYuan(2n) === '0.02');
check('centsToYuan(800n) == "8.00"', _centsToYuan(800n) === '8.00');

// =================================================================
// Test 3: createOrder 正常下单
// =================================================================
const payId = 'TEST' + Date.now();
const price = '8.00';
const type = '1';
const param = '';
const sign = md5(payId + param + type + price + 'testkey123');

const fakeReq = (params) => ({
  url: 'http://test/createOrder?' + new URLSearchParams(params).toString(),
  method: 'GET',
  headers: { get: () => '' },
  clone() { return this; },
  formData: async () => new FormData(),
  json: async () => ({})
});

const createResp = await createOrder(fakeReq({
  payId, type, price, sign, param, isHtml: '0'
}), db);
const createData = JSON.parse(await createResp.text());
check('createOrder.code == 1', createData.code === 1, JSON.stringify(createData));
check('createOrder 真的金额 == 8.00', createData.data?.reallyPrice === 8.00);
check('createOrder 返回 orderId', !!createData.data?.orderId);
check('createOrder 返回 payUrl', createData.data?.payUrl?.startsWith('weixin://'));
check('createOrder state == 0', createData.data?.state === 0);

const orderId = createData.data?.orderId;

// =================================================================
// Test 4: 签名错误应该返回 -1
// =================================================================
const badResp = await createOrder(fakeReq({
  payId: 'X' + Date.now(), type, price, sign: 'wrongsign', param
}), db);
const badData = JSON.parse(await badResp.text());
check('createOrder 错误签名 → -1', badData.code === -1);

// =================================================================
// Test 5: 监控端 jkstate=-1 时拒绝下单
// =================================================================
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'jkstate'")
        .bind('-1').run();
const blockedResp = await createOrder(fakeReq({
  payId: 'BLOCK' + Date.now(), type, price,
  sign: md5('BLOCK' + Date.now() + param + type + price + 'testkey123')
}), db);
const blockedData = JSON.parse(await blockedResp.text());
check('jkstate=-1 拒绝', blockedData.code === -1);
// 恢复
await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'jkstate'")
        .bind('1').run();

// =================================================================
// Test 6: 并发抢同一价格 → 一个成功,一个失败 (payQf=1 自增)
// =================================================================
const p1 = 'P1' + Date.now();
const p2 = 'P2' + Date.now();
const s1 = md5(p1 + param + type + price + 'testkey123');
const s2 = md5(p2 + param + type + price + 'testkey123');
const r1 = JSON.parse(await (await createOrder(fakeReq(
  { payId: p1, type, price, sign: s1, param }), db)).text());
const r2 = JSON.parse(await (await createOrder(fakeReq(
  { payId: p2, type, price, sign: s2, param }), db)).text());
check('并发 r1 成功', r1.code === 1);
check('并发 r2 成功', r2.code === 1);
check('并发 reallyPrice 不同',
      r1.data?.reallyPrice !== r2.data?.reallyPrice);

// =================================================================
// Test 7: appHeart 更新心跳
// =================================================================
const heartReq = fakeReq({ t: String(Math.floor(Date.now()/1000)),
                           sign: md5(String(Math.floor(Date.now()/1000)) + 'testkey123') });
heartReq.url = 'http://test/appHeart?' + new URLSearchParams({ t: String(Math.floor(Date.now()/1000)),
                           sign: md5(String(Math.floor(Date.now()/1000)) + 'testkey123') }).toString();
heartReq.method = 'POST';
const hResp = await appHeart(heartReq, db);
const hData = JSON.parse(await hResp.text());
check('appHeart code=1', hData.code === 1);
const lastheart = await db.prepare("SELECT vvalue FROM setting WHERE vkey='lastheart'").bind().first();
check('appHeart 更新 lastheart', parseInt(lastheart.vvalue) > 0);

// =================================================================
// Test 8: appPush 匹配订单 + 通知
// =================================================================
let notified = '';
const fakeNotifyServer = async (req) => {
  notified = req.url;
  return new Response('success');
};
// 把 notifyMerchant 路径接到一个本地 server 太麻烦,这里直接走原 API 测
// 先把订单的通知地址指向一个能返回 success 的 data: URL 太怪,改成用 127.0.0.1
// 直接启动一个本地 HTTP 服务器
import { createServer } from 'node:http';
const server = createServer((req, res) => {
  notified = req.url;
  res.end('success');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

await db.prepare("UPDATE setting SET vvalue = ? WHERE vkey = 'notifyUrl'")
        .bind(`http://127.0.0.1:${port}/notify`).run();
// 把刚才 r1 的订单通知地址也改了
await db.prepare("UPDATE pay_order SET notify_url = ? WHERE order_id = ?")
        .bind(`http://127.0.0.1:${port}/notify`, r1.data.orderId).run();

const pushReq = fakeReq({
  type: '1', price: String(r1.data.reallyPrice),
  t: String(Math.floor(Date.now()/1000)),
  sign: md5('1' + String(r1.data.reallyPrice) + String(Math.floor(Date.now()/1000)) + 'testkey123')
});
pushReq.url = 'http://test/appPush?' + new URLSearchParams({
  type: '1', price: String(r1.data.reallyPrice),
  t: String(Math.floor(Date.now()/1000)),
  sign: md5('1' + String(r1.data.reallyPrice) + String(Math.floor(Date.now()/1000)) + 'testkey123')
}).toString();
pushReq.method = 'POST';
const pResp = await appPush(pushReq, db);
const pData = JSON.parse(await pResp.text());
check('appPush code=1', pData.code === 1, JSON.stringify(pData));
check('appPush 触发通知', notified.includes('payId=' + p1));
check('appPush 通知 URL 含 reallyPrice', notified.includes('reallyPrice=' + r1.data.reallyPrice.toFixed(2)));

// 验证订单状态变为 1
const after = await db.prepare("SELECT state FROM pay_order WHERE order_id = ?")
              .bind(r1.data.orderId).first();
check('appPush 后订单 state=1', after.state === 1);

// =================================================================
// Test 9: checkOrder 已支付返回 return_url
// =================================================================
const chkReq = fakeReq({ orderId: r1.data.orderId });
const chkResp = await checkOrder(chkReq, db);
const chkData = JSON.parse(await chkResp.text());
check('checkOrder 已支付 code=1', chkData.code === 1);
check('checkOrder 返回 URL', typeof chkData.data === 'string' && chkData.data.includes('payId=' + p1));
check('checkOrder URL 含 sign',
      /sign=[a-f0-9]{32}/.test(chkData.data));

// =================================================================
// Test 10: closeOrder 关闭未支付订单 (关 r2)
// =================================================================
const clReq = fakeReq({
  orderId: r2.data.orderId,
  sign: md5(r2.data.orderId + 'testkey123')
});
const clResp = await closeOrder(clReq, db);
const clData = JSON.parse(await clResp.text());
check('closeOrder code=1', clData.code === 1);
const closed = await db.prepare("SELECT state FROM pay_order WHERE order_id = ?")
               .bind(r2.data.orderId).first();
check('closeOrder 后 state=-1', closed.state === -1);

// =================================================================
// Test 11: getState 返回监控状态
// =================================================================
const gsReq = fakeReq({
  t: String(Math.floor(Date.now()/1000)),
  sign: md5(String(Math.floor(Date.now()/1000)) + 'testkey123')
});
const gsResp = await getState(gsReq, db);
const gsData = JSON.parse(await gsResp.text());
check('getState code=1', gsData.code === 1);
check('getState jkstate=1', gsData.data?.jkstate === '1');

// =================================================================
// Test 12: closeEndOrder 清理过期
// =================================================================
const cutoffOld = Math.floor(Date.now()/1000) - 3600; // 1 小时前
await db.prepare(`INSERT INTO pay_order
  (create_date, state, type, price, really_price, pay_id, order_id, is_auto)
  VALUES (?, 0, 1, 9.99, 9.99, 'OLD1', 'OLD1', 1)`).bind(cutoffOld).run();
const cleaned = await _closeEndOrder(db);
check('closeEndOrder 清理 >=1', cleaned >= 1);
const oldAfter = await db.prepare("SELECT state FROM pay_order WHERE order_id='OLD1'").bind().first();
check('closeEndOrder 旧订单 state=-1', oldAfter.state === -1);

server.close();

console.log(`\n========================`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);