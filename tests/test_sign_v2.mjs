// tests/test_sign_v2.mjs — hulisang v2 HMAC-SHA256 监控端签名
// 黄金向量取自 f-hulisang/material-you-style MonitorSignTest.java,
// 验证服务端 canonical 拼接与 Java 客户端 MonitorSign.java 逐字符一致。
// 用法: node tests/test_sign_v2.mjs

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import md5 from '../src/md5.js';
import { appHeart, appPush, verifyMonitorSignV2 } from '../src/api.js';
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

// =================================================================
// 1. 黄金向量 (MonitorSignTest.java)
// =================================================================
{
  const TS = '1773500000000';
  const hb = await hmacSha256Hex(KEY, `t=${TS}`);
  check('heartbeat 黄金向量',
    hb === '71ec70d2383ec10bdb2fe39f42f60721a1808fa31884deebc9b8c88b5b527bbe', hb);
  const push = await hmacSha256Hex(KEY, `type=1&price=1.00&t=${TS}`);
  check('push 黄金向量',
    push === '61174e2503aec9c2ffe8430ba322d03b8e3c5f46c3d08f29e69ee35d0b34a51e', push);
}

// =================================================================
// 2. verifyMonitorSignV2 新鲜度窗口 (±300s, 毫秒)
// =================================================================
{
  const now = Date.now();
  const mk = async (t) => hmacSha256Hex(KEY, `t=${t}`);
  check('当前时间戳 → 通过', await verifyMonitorSignV2(`t=${now}`, String(now), KEY, await mk(now)));
  const old = now - 400_000;
  check('超出窗口 (400s 前) → 拒绝', !(await verifyMonitorSignV2(`t=${old}`, String(old), KEY, await mk(old))));
  const future = now + 400_000;
  check('未来超窗 (时钟异常) → 拒绝', !(await verifyMonitorSignV2(`t=${future}`, String(future), KEY, await mk(future))));
  check('错误密钥 → 拒绝', !(await verifyMonitorSignV2(`t=${now}`, String(now), 'wrongkey', await mk(now))));
  check('32 位 md5 hex 不走 v2 路径', !(await verifyMonitorSignV2(`t=${now}`, String(now), KEY, md5(`${now}${KEY}`))));
}

// =================================================================
// 3. 端点级: appHeart / appPush 同时接受 md5 与 v2
// =================================================================
{
  const fakeReq = (params) => ({
    url: 'http://test/x?' + new URLSearchParams(params).toString(),
    method: 'GET', headers: { get: () => '' },
    clone() { return this; }, formData: async () => new FormData(), json: async () => ({})
  });

  // md5 旧客户端
  const t1 = String(Date.now());
  const r1 = await appHeart(fakeReq({ t: t1, sign: md5(t1 + KEY) }), db);
  check('appHeart md5 仍通过', (await r1.json()).code === 1);

  // v2 新客户端
  const t2 = String(Date.now());
  const r2 = await appHeart(fakeReq({ t: t2, sign: await hmacSha256Hex(KEY, `t=${t2}`) }), db);
  check('appHeart v2 HMAC 通过', (await r2.json()).code === 1);

  // v2 超窗
  const t3 = String(Date.now() - 999_000);
  const r3 = await appHeart(fakeReq({ t: t3, sign: await hmacSha256Hex(KEY, `t=${t3}`) }), db);
  check('appHeart v2 超窗 → -1', (await r3.json()).code === -1);

  // v2 篡改金额 (签名对不上)
  const t4 = String(Date.now());
  const sign4 = await hmacSha256Hex(KEY, `type=1&price=9.99&t=${t4}`);
  const r4 = await appPush(fakeReq({ t: t4, type: '1', price: '8.88', sign: sign4 }), db);
  check('appPush v2 金额篡改 → sign error', (await r4.text()) === 'sign error');

  // v2 正常推送 (无匹配订单 → 无订单转账, code=1)
  const t5 = String(Date.now());
  const price5 = (Math.round(Math.random() * 10000) / 10000).toFixed(2);
  const r5 = await appPush(fakeReq({
    t: t5, type: '2', price: price5,
    sign: await hmacSha256Hex(KEY, `type=2&price=${price5}&t=${t5}`)
  }), db);
  check('appPush v2 通过', (await r5.json()).code === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
