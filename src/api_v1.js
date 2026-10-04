// =============================================================================
// API v1 — 兼容 altmanlib/vmq-apk (Kotlin 重写版客户端) 的签名 JSON 协议
//
// 端点 (均为 POST + JSON body + HMAC 头):
//   /api/v1/system/heartbeat   body: {}
//   /api/v1/payments/notify    body: {"channel":1|2,"price":12.34}
//
// 签名协议 (VMQ-HMAC-SHA256-V1,与客户端 RequestSignature.kt 逐字节对齐):
//   X-VMQ-Timestamp: 秒级时间戳
//   X-VMQ-Nonce:     UUID
//   canonical = "VMQ-HMAC-SHA256-V1\n{METHOD}\n{pathname}\n{timestamp}\n{nonce}\n{sha256hex(body)}"
//   X-VMQ-Signature: "v1=" + hex(HMAC-SHA256(key, canonical))
//
// 服务端策略:
//   - 时间戳容差 ±300s;nonce 内存防重放 (per-isolate,窗口 10min)
//   - 校验失败 → 401 (客户端视为不可重试)
//   - 内部异常 → 500 (客户端 retry 工具会指数退避重试,订单匹配天然幂等:
//     重试分支对 state=1 订单直接返回成功,不会重复通知商户)
// =============================================================================

import { getSetting } from './db.js';
import { processAppPush, recordHeartbeat, _closeEndOrder } from './api.js';
import { sha256Hex, hmacSha256Hex, timingSafeEqualHex } from './hmac.js';

const VERSION = 'VMQ-HMAC-SHA256-V1';
const PREFIX = 'v1=';
const TS_HEADER = 'X-VMQ-Timestamp';
const NONCE_HEADER = 'X-VMQ-Nonce';
const SIG_HEADER = 'X-VMQ-Signature';

const TS_TOLERANCE_SEC = 300;
const NONCE_TTL_MS = 10 * 60 * 1000;

// per-isolate 重放防护。D1 未存 nonce:重放窗口仅 300s(时间戳容差),
// 且 notify 本身按订单状态幂等,单 isolate 缓存已足够。
const seenNonces = new Map();

function pruneNonces(nowMs) {
  for (const [nonce, ts] of seenNonces) {
    if (nowMs - ts > NONCE_TTL_MS) seenNonces.delete(nonce);
  }
}

// 校验通过返回 { body: parsedJson } ;失败返回 { error: string }
export async function verifySignedRequest(request, key, bodyText) {
  const timestamp = request.headers.get(TS_HEADER) || '';
  const nonce = request.headers.get(NONCE_HEADER) || '';
  const signature = request.headers.get(SIG_HEADER) || '';
  if (!timestamp || !nonce || !signature) return { error: 'missing signature headers' };

  const ts = Number(timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > TS_TOLERANCE_SEC) {
    return { error: 'timestamp out of window' };
  }

  const nowMs = Date.now();
  pruneNonces(nowMs);
  if (seenNonces.has(nonce)) return { error: 'nonce replayed' };

  const url = new URL(request.url);
  const bodyBuf = new TextEncoder().encode(bodyText);
  const canonical = [
    VERSION, request.method.toUpperCase(), url.pathname,
    timestamp, nonce, await sha256Hex(bodyBuf)
  ].join('\n');
  const expected = PREFIX + await hmacSha256Hex(key, canonical);
  if (!timingSafeEqualHex(expected, signature)) return { error: 'bad signature' };

  seenNonces.set(nonce, nowMs);
  return { body: bodyText };
}

// 供测试注入密钥的包装:两个端点共用入口逻辑
async function handle(request, db, fn) {
  const key = await getSetting(db, 'key');
  const bodyText = await request.text();
  const verified = await verifySignedRequest(request, key, bodyText);
  if (verified.error) {
    return new Response(JSON.stringify({ code: -1, msg: verified.error }), {
      status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  return fn(verified.body);
}

// POST /api/v1/system/heartbeat
export async function apiHeartbeat(request, db) {
  return handle(request, db, async () => {
    await _closeEndOrder(db);
    await recordHeartbeat(db);
    return new Response('ok', { status: 200 });
  });
}

// POST /api/v1/payments/notify  body: {"channel":1|2,"price":12.34}
export async function apiNotify(request, db) {
  return handle(request, db, async (bodyText) => {
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (_) {
      return new Response(JSON.stringify({ code: -1, msg: 'invalid json body' }), {
        status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    const channel = Number(payload.channel);
    const price = Number(payload.price);
    if (channel !== 1 && channel !== 2) {
      return new Response(JSON.stringify({ code: -1, msg: 'channel must be 1 or 2' }), {
        status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return new Response(JSON.stringify({ code: -1, msg: 'price must be > 0' }), {
        status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    await _closeEndOrder(db);
    const result = await processAppPush(db, {
      type: channel, price, isFirstPush: true, tryCount: 1
    });
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  });
}
