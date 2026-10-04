// =============================================================================
// V免签 核心 API — 完全对齐 Vmqphp application/index/controller/Index.php
// 协议映射:
//   /createOrder  → createOrder()
//   /getOrder     → getOrder()
//   /checkOrder   → checkOrder()
//   /closeOrder   → closeOrder()
//   /getState     → getState()
//   /appHeart     → appHeart()
//   /appPush      → appPush()
//   /closeEndOrder→ closeEndOrder()
//
// 签名规则(全部与 PHP md5() 一致):
//   createOrder: md5(payId + param + type + price + key)
//   checkOrder 回调: md5(payId + param + type + price + reallyPrice + key)
//   closeOrder : md5(orderId + key)
//   getState   : md5(t + key)
//   appHeart   : md5(t + key)
//   appPush    : md5(type + price + t + key)
// =============================================================================

import md5 from './md5.js';
import {
  getSetting, findOrderByPayId, findOrderByOrderId, findMatchingOrder,
  insertOrder, updateOrderById, updateOrderState,
  closeExpiredOrders, getCloseMinutes,
  tryLockTmpPrice, unlockTmpPriceByOid, cleanOrphanTmpPrices,
  findPayQrcode, getReturn
} from './db.js';

// =========================================================================
// 通用工具
// =========================================================================

// 与 PHP input("xxx") 等价:从 query + formData 取同名参数,字符串返回
async function readParams(request, names) {
  const url = new URL(request.url);
  const out = {};
  for (const n of names) {
    let v = url.searchParams.get(n);
    if (v === null && request.method === 'POST') {
      try {
        const ct = request.headers.get('content-type') || '';
        if (ct.includes('application/x-www-form-urlencoded') ||
            ct.includes('multipart/form-data')) {
          const fd = await request.clone().formData();
          v = fd.get(n);
        } else if (ct.includes('application/json')) {
          const j = await request.clone().json();
          v = j?.[n];
        }
      } catch (_) {}
    }
    out[n] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

// 异步通知商户 (Vmqphp getCurl, GET 请求,期望返回 "success")
async function notifyMerchant(notifyUrl, params) {
  // 拼接参数到 URL (Vmqphp 是 GET 形式)
  const url = new URL(notifyUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);  // 8s 超时,符合 README 说明
  try {
    const resp = await fetch(url.toString(), {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Vmq-Workers/1.0',
        'Accept': '*/*'
      },
      redirect: 'manual'
    });
    const text = (await resp.text()).trim();
    return text === 'success' || text === '"success"';
  } catch (e) {
    console.error('notifyMerchant error:', e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 把元转成分;用 BigInt 避免 0.1+0.2 精度问题
function yuanToCents(yuan) {
  const [intPart, decPart = ''] = String(yuan).split('.');
  const dec = (decPart + '00').slice(0, 2);
  return BigInt(intPart || '0') * 100n + BigInt(dec);
}

function centsToYuan(cents) {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const i = abs / 100n;
  const d = abs % 100n;
  return sign + i.toString() + '.' + d.toString().padStart(2, '0');
}

// PHP bcdiv 的两位小数等价值(JS 没有 bcmath)
function bcdiv2(cents) {
  return centsToYuan(cents);
}

// 生成云端订单号 (Vmqphp: date("YmdHms").rand...)
function genOrderId() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const ymdhms = d.getUTCFullYear().toString() +
                 pad(d.getUTCMonth() + 1) +
                 pad(d.getUTCDate()) +
                 pad(d.getUTCHours()) +
                 pad(d.getUTCMinutes()) +
                 pad(d.getUTCSeconds());
  const r = Math.floor(Math.random() * 9000) + 1000;
  return 'V' + ymdhms + r;
}

// =========================================================================
// API: createOrder
// =========================================================================
export async function createOrder(request, db) {
  // 1. 关闭过期订单
  await closeEndOrder(db);

  const p = await readParams(request, ['payId', 'type', 'price', 'sign', 'param', 'isHtml', 'notifyUrl', 'returnUrl']);
  if (!p.payId) return jsonResp(getReturn(-1, '请传入商户订单号'));
  if (!p.type || (p.type !== '1' && p.type !== '2')) {
    return jsonResp(getReturn(-1, '支付方式错误=>1|微信 2|支付宝'));
  }
  if (!p.price) return jsonResp(getReturn(-1, '请传入订单金额'));
  if (Number(p.price) <= 0) return jsonResp(getReturn(-1, '订单金额必须大于0'));
  if (!p.sign) return jsonResp(getReturn(-1, '请传入签名'));

  const isHtml = p.isHtml === '1' ? 1 : 0;
  const param = p.param || '';

  const key = await getSetting(db, 'key');

  // 2. 签名校验 — 与 Vmqphp $_sign = md5(payId.param.type.price.key) 一致
  const signInput = String(p.payId) + String(param) + String(p.type) + String(p.price) + String(key);
  if (md5(signInput) !== p.sign) {
    return jsonResp(getReturn(-1, '签名错误'));
  }

  // 3. 监控端状态校验
  const jkstate = await getSetting(db, 'jkstate');
  if (jkstate !== '1') {
    return jsonResp(getReturn(-1, '监控端状态异常,请检查'));
  }

  // 4. 计算锁定金额 (Vmqphp payQf 防冲突)
  const payQf = await getSetting(db, 'payQf');
  const baseCents = yuanToCents(p.price);

  let reallyCents = baseCents;
  const orderId = genOrderId();

  let ok = false;
  for (let i = 0; i < 10; i++) {
    if (await tryLockTmpPrice(db, reallyCents, p.type, orderId)) {
      ok = true;
      break;
    }
    if (payQf === '1') reallyCents = reallyCents + 1n;
    else if (payQf === '2') reallyCents = reallyCents - 1n;
    else break;
  }
  if (!ok) return jsonResp(getReturn(-1, '订单超出负荷,请稍后重试'));

  const reallyPrice = bcdiv2(reallyCents);

  // 5. 选 payUrl:优先固定金额二维码,否则用全局 wxpay/zfbpay
  let payUrl = p.type === '1'
    ? await getSetting(db, 'wxpay')
    : await getSetting(db, 'zfbpay');
  if (!payUrl) return jsonResp(getReturn(-1, '请您先进入后台配置程序'));

  let isAuto = 1;
  const qrcode = await findPayQrcode(db, reallyPrice, p.type);
  if (qrcode) {
    payUrl = qrcode.pay_url;
    isAuto = 0;
  }

  // 6. 重复 pay_id 校验
  if (await findOrderByPayId(db, p.payId)) {
    return jsonResp(getReturn(-1, '商户订单号已存在'));
  }

  // 7. 写 pay_order
  const notifyUrl = p.notifyUrl || (await getSetting(db, 'notifyUrl')) || '';
  const returnUrl = p.returnUrl || (await getSetting(db, 'returnUrl')) || '';
  const createDate = Math.floor(Date.now() / 1000);

  await insertOrder(db, {
    close_date: 0,
    create_date: createDate,
    is_auto: isAuto,
    notify_url: notifyUrl,
    order_id: orderId,
    param,
    pay_date: 0,
    pay_id: p.payId,
    pay_url: payUrl,
    price: Number(p.price),
    really_price: Number(reallyPrice),
    return_url: returnUrl,
    state: 0,
    type: Number(p.type)
  });

  // 8. isHtml=1 → 返回跳转 HTML;否则返回 JSON
  if (isHtml === 1) {
    return new Response(
      `<script>window.location.href = '/payPage/pay.html?orderId=${orderId}'</script>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const close = await getSetting(db, 'close');
  return jsonResp(getReturn(1, '成功', {
    payId: p.payId,
    orderId,
    payType: Number(p.type),
    price: Number(p.price),
    reallyPrice: Number(reallyPrice),
    payUrl,
    isAuto,
    state: 0,
    timeOut: Number(close || '5'),
    date: createDate
  }));
}

// =========================================================================
// API: getOrder  (Vmqphp: getOrder)
// =========================================================================
export async function getOrder(request, db) {
  const p = await readParams(request, ['orderId']);
  const row = await findOrderByOrderId(db, p.orderId);
  if (!row) return jsonResp(getReturn(-1, '云端订单编号不存在'));

  const close = await getSetting(db, 'close');
  return jsonResp(getReturn(1, '成功', {
    payId: row.pay_id,
    orderId: row.order_id,
    payType: row.type,
    price: Number(row.price),
    reallyPrice: Number(row.really_price),
    payUrl: row.pay_url,
    isAuto: row.is_auto,
    state: row.state,
    timeOut: Number(close || '5'),
    date: row.create_date
  }));
}

// =========================================================================
// API: checkOrder (Vmqphp: checkOrder)
// =========================================================================
export async function checkOrder(request, db) {
  const p = await readParams(request, ['orderId']);
  const row = await findOrderByOrderId(db, p.orderId);
  if (!row) return jsonResp(getReturn(-1, '云端订单编号不存在'));

  if (row.state === 0)  return jsonResp(getReturn(-1, '订单未支付'));
  if (row.state === -1) return jsonResp(getReturn(-1, '订单已过期'));

  const key = await getSetting(db, 'key');
  const price = Number(row.price).toFixed(2);
  const reallyPrice = Number(row.really_price).toFixed(2);
  const type = String(row.type);
  const param = row.param || '';

  // Vmqphp: p = "payId=...&param=...&type=...&price=...&reallyPrice=..."
  const pStr = `payId=${row.pay_id}&param=${param}&type=${type}&price=${price}&reallyPrice=${reallyPrice}`;
  const signSrc = `${row.pay_id}${param}${type}${price}${reallyPrice}${key}`;
  const sign = md5(signSrc);
  const url = `${row.return_url}${row.return_url.includes('?') ? '&' : '?'}${pStr}&sign=${sign}`;
  return jsonResp(getReturn(1, '成功', url));
}

// =========================================================================
// API: closeOrder
// =========================================================================
export async function closeOrder(request, db) {
  const p = await readParams(request, ['orderId', 'sign']);
  const key = await getSetting(db, 'key');
  if (md5(String(p.orderId) + String(key)) !== p.sign) {
    return jsonResp(getReturn(-1, '签名校验不通过'));
  }
  const row = await findOrderByOrderId(db, p.orderId);
  if (!row) return jsonResp(getReturn(-1, '云端订单编号不存在'));
  if (row.state !== 0) return jsonResp(getReturn(-1, '订单状态不允许关闭'));

  await updateOrderState(db, p.orderId, { state: -1, close_date: Math.floor(Date.now() / 1000) });
  await unlockTmpPriceByOid(db, p.orderId);
  return jsonResp(getReturn(1, '成功'));
}

// =========================================================================
// API: getState (供监控端查询状态)
// =========================================================================
export async function getState(request, db) {
  const p = await readParams(request, ['t', 'sign']);
  const key = await getSetting(db, 'key');
  if (md5(String(p.t) + String(key)) !== p.sign) {
    return jsonResp(getReturn(-1, '签名校验不通过'));
  }
  return jsonResp(getReturn(1, '成功', {
    lastheart: await getSetting(db, 'lastheart'),
    lastpay:   await getSetting(db, 'lastpay'),
    jkstate:   await getSetting(db, 'jkstate')
  }));
}

// =========================================================================
// API: appHeart  (监控端心跳)
// =========================================================================
export async function appHeart(request, db) {
  await closeEndOrder(db);
  const p = await readParams(request, ['t', 'sign']);
  const key = await getSetting(db, 'key');
  if (md5(String(p.t) + String(key)) !== p.sign) {
    return jsonResp(getReturn(-1, '签名校验不通过'));
  }
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE setting SET vvalue = ? WHERE vkey = ?').bind(String(now), 'lastheart').run();
  await db.prepare('UPDATE setting SET vvalue = ? WHERE vkey = ?').bind('1', 'jkstate').run();
  return jsonResp(getReturn());
}

// =========================================================================
// API: appPush  (监控端推送收款通知) — 业务核心
// -------------------------------------------------------------------------
// 协议扩展(基于 zwc456baby PR #45 7c7423f + 2c250d3):
//   isFirstPush=1   首次推送,默认 1
//   force_push=true Android 端失败重试时附加,与 isFirstPush=0 等价
//   try_count=N     重试次数(仅日志,服务端不强制)
// =========================================================================
export async function appPush(request, db) {
  await closeEndOrder(db);
  const p = await readParams(request, ['t', 'type', 'price', 'sign', 'isFirstPush', 'force_push', 'try_count']);
  const key = await getSetting(db, 'key');
  // 签名 = md5(type + price + t + key) — 与 Vmqphp 一致
  if (md5(String(p.type) + String(p.price) + String(p.t) + String(key)) !== p.sign) {
    return new Response('sign error', { status: 200 });
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE setting SET vvalue = ? WHERE vkey = ?').bind(String(now), 'lastpay').run();

  // 判断是否重试 (zwc456baby 7c7423f)
  // 优先 isFirstPush;若未传,fallback 到 force_push;都没有则默认 1(首次)
  const isFirstPush = p.isFirstPush !== ''
    ? (p.isFirstPush === '1' || p.isFirstPush === 'true')
    : (p.force_push !== 'true' && p.force_push !== '1');
  const tryCount = parseInt(p.try_count || '1', 10);

  // ---- 重试分支:不重复通知,只对已存在的订单重发 ----
  if (!isFirstPush) {
    const numPriceR = Number(p.price);
    // 优先按订单号回查(如有);否则按价格+类型 + state=1/2
    let row = await db.prepare(
      `SELECT * FROM pay_order
       WHERE really_price = ? AND type = ? AND state IN (1, 2)
       ORDER BY pay_date DESC
       LIMIT 1`
    ).bind(numPriceR, Number(p.type)).first();

    if (!row) {
      // 也按金额兜底
      row = await db.prepare(
        `SELECT * FROM pay_order
         WHERE ABS(really_price - ?) < 0.01
           AND type = ? AND state IN (1, 2)
         ORDER BY pay_date DESC
         LIMIT 1`
      ).bind(numPriceR, Number(p.type)).first();
    }

    if (!row) {
      console.log(`[appPush retry] no matching paid/failed order (type=${p.type} price=${p.price} try=${tryCount})`);
      return jsonResp(getReturn(1, '重试:未找到已支付订单,忽略'));
    }

    // state=2(通知失败):重新发通知
    // state=1(已通知成功):直接返回 success(防对账重复)
    if (row.state === 1) {
      console.log(`[appPush retry] order ${row.order_id} already notified (state=1), skip`);
      return jsonResp(getReturn(1, '重试:订单已成功通知商户'));
    }

    // state=2 → 重发通知
    const ok = await notifyMerchantForRow(row, key);
    if (ok) {
      await updateOrderById(db, row.id, { state: 1, close_date: now });
      return jsonResp(getReturn(1, '重试:重新通知商户成功'));
    }
    // 还是失败,保持 state=2
    return jsonResp(getReturn(-1, '重试:通知仍然失败'));
  }

  // ---- 首次推送分支 ----
  // 1. 找匹配订单 (Vmqphp: really_price = price AND state = 0 AND type = type)
  const numPrice = Number(p.price);
  let row = await findMatchingOrder(db, numPrice, Number(p.type));

  // 2. 微小差异兜底 (README FAQ Q4:OCR 出来的可能是 "0.02" 但库里 "0.0200000001")
  if (!row) {
    row = await db.prepare(
      `SELECT * FROM pay_order
       WHERE ABS(really_price - ?) < 0.01
         AND type = ? AND state = 0
       ORDER BY create_date ASC
       LIMIT 1`
    ).bind(numPrice, Number(p.type)).first();
  }

  if (row) {
    // 解锁 tmp_price,标记已支付
    await unlockTmpPriceByOid(db, row.order_id);
    await updateOrderById(db, row.id, { state: 1, pay_date: now, close_date: now });

    const ok = await notifyMerchantForRow({ ...row, pay_date: now, close_date: now }, key);
    if (ok) return jsonResp(getReturn());
    await updateOrderById(db, row.id, { state: 2 });
    return jsonResp(getReturn(-1, '异步通知失败'));
  }

  // 3. 没有匹配订单:记一笔 "无订单转账"
  await insertOrder(db, {
    close_date: 0,
    create_date: now,
    is_auto: 0,
    notify_url: '',
    order_id: '无订单转账',
    param: '无订单转账',
    pay_date: now,
    pay_id: '无订单转账',
    pay_url: '',
    price: numPrice,
    really_price: numPrice,
    return_url: '',
    state: 1,
    type: Number(p.type)
  });
  return jsonResp(getReturn());
}

// 抽出"给一行订单发商户通知"的逻辑 — 重试 / 首次 / 补单 / 强制重发 都复用
export async function notifyMerchantForRow(row, key) {
  const price = Number(row.price).toFixed(2);
  const reallyPrice = Number(row.really_price).toFixed(2);
  const type = String(row.type);
  const param = row.param || '';
  const sign = md5(`${row.pay_id}${param}${type}${price}${reallyPrice}${key}`);
  return notifyMerchant(row.notify_url, {
    payId: row.pay_id,
    param,
    type,
    price,
    reallyPrice,
    sign
  });
}

// =========================================================================
// API: closeEndOrder  (定时或心跳时调用)
// =========================================================================
export async function closeEndOrder(db) {
  const closeMinutes = await getCloseMinutes(db);
  const now = Math.floor(Date.now() / 1000);

  // 监控端心跳超时 → jkstate=0
  const lastheart = parseInt(await getSetting(db, 'lastheart') || '0', 10);
  if (lastheart > 0 && (now - lastheart) > 60) {
    await db.prepare('UPDATE setting SET vvalue = ? WHERE vkey = ?').bind('0', 'jkstate').run();
  }

  // 关闭过期订单
  const cutoff = now - closeMinutes * 60;
  const r = await db.prepare(
    `UPDATE pay_order SET state = -1, close_date = ?
     WHERE create_date <= ? AND state = 0`
  ).bind(now, cutoff).run();

  // 清理孤立 tmp_price
  await cleanOrphanTmpPrices(db);

  return r.meta?.changes ?? 0;
}

// 暴露给路由
export { closeEndOrder as _closeEndOrder };
export { genOrderId as _genOrderId };
export { yuanToCents as _yuanToCents, centsToYuan as _centsToYuan };

function jsonResp(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}