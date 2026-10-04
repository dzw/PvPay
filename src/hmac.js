// =============================================================================
// WebCrypto 摘要/签名工具 — api.js (v2 监控端签名) 与 api_v1.js (HMAC JSON 协议) 共用
// =============================================================================

const enc = new TextEncoder();

export function isHex(s, len) {
  return typeof s === 'string' && s.length === len && /^[0-9a-f]+$/.test(s);
}

export async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret, message) {
  const ck = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', ck, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 长度相等的 hex 比较,逐字符累积差异,避免早退时序侧信道
export function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
