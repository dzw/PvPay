// =============================================================================
// 纯 JS MD5 实现
// -----------------------------------------------------------------------------
// Cloudflare Workers 的 crypto.subtle 不支持 MD5,所以用纯 JS 实现。
// 算法来源: Joseph Myers 的经典 MD5 实现,做了以下适配:
//   1. 只保留字符串输入与 md5(str) 静态方法,符合 Vmqphp md5(...) 的语义。
//   2. UTF-8 编码,与 Vmqphp PHP md5() 默认一致。
//   3. 用 DataView/Uint8Array 处理字节,避免依赖 Buffer/Node API。
// =============================================================================

const MD5 = (function () {
  // 每轮使用的常量 T[i] = floor(2^32 * abs(sin(i+1))) 的整数部分
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
  ];

  // 每轮的位移量
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  function utf8Encode(str) {
    // TextEncoder 在 Workers 中可用
    return new TextEncoder().encode(str);
  }

  function toHex(n) {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += ((n >> (i * 8 + 4)) & 0xf).toString(16) +
           ((n >> (i * 8)) & 0xf).toString(16);
    }
    return s;
  }

  function add32(a, b) {
    // 把两个 32 位数相加,保留低 32 位
    return (a + b) & 0xffffffff;
  }

  function rol(n, c) {
    return (n << c) | (n >>> (32 - c));
  }

  function cmn(q, a, b, x, s, t) {
    return add32(rol(add32(add32(a, q), add32(x, t)), s), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function bytesToWords(bytes) {
    const words = new Uint32Array(bytes.length / 4);
    for (let i = 0; i < words.length; i++) {
      words[i] =
        (bytes[i * 4]) |
        (bytes[i * 4 + 1] << 8) |
        (bytes[i * 4 + 2] << 16) |
        (bytes[i * 4 + 3] << 24);
    }
    return words;
  }

  function md5(message) {
    const bytes = typeof message === 'string' ? utf8Encode(message) : message;
    const msgLen = bytes.length;

    // 填充:补 0x80,然后补 0,直到长度 ≡ 56 (mod 64),最后 8 字节写原始 bit 数
    const padLen = (((msgLen + 8) >> 6) + 1) << 6;       // 向上取整到 64 倍数
    const padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[msgLen] = 0x80;

    // 总 bit 数,用 64 位 little-endian 写入最后 8 字节
    const bitLen = BigInt(msgLen) * 8n;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padLen - 8, Number(bitLen & 0xffffffffn), true);
    dv.setUint32(padLen - 4, Number((bitLen >> 32n) & 0xffffffffn), true);

    const words = bytesToWords(padded);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let i = 0; i < words.length; i += 16) {
      const a = a0, b = b0, c = c0, d = d0;

      // Round 1
      a0 = ff(a0, b0, c0, d0, words[i + 0],  S[0],  K[0]);
      d0 = ff(d0, a0, b0, c0, words[i + 1],  S[1],  K[1]);
      c0 = ff(c0, d0, a0, b0, words[i + 2],  S[2],  K[2]);
      b0 = ff(b0, c0, d0, a0, words[i + 3],  S[3],  K[3]);
      a0 = ff(a0, b0, c0, d0, words[i + 4],  S[4],  K[4]);
      d0 = ff(d0, a0, b0, c0, words[i + 5],  S[5],  K[5]);
      c0 = ff(c0, d0, a0, b0, words[i + 6],  S[6],  K[6]);
      b0 = ff(b0, c0, d0, a0, words[i + 7],  S[7],  K[7]);
      a0 = ff(a0, b0, c0, d0, words[i + 8],  S[8],  K[8]);
      d0 = ff(d0, a0, b0, c0, words[i + 9],  S[9],  K[9]);
      c0 = ff(c0, d0, a0, b0, words[i + 10], S[10], K[10]);
      b0 = ff(b0, c0, d0, a0, words[i + 11], S[11], K[11]);
      a0 = ff(a0, b0, c0, d0, words[i + 12], S[12], K[12]);
      d0 = ff(d0, a0, b0, c0, words[i + 13], S[13], K[13]);
      c0 = ff(c0, d0, a0, b0, words[i + 14], S[14], K[14]);
      b0 = ff(b0, c0, d0, a0, words[i + 15], S[15], K[15]);

      // Round 2
      a0 = gg(a0, b0, c0, d0, words[i + 1],  S[16], K[16]);
      d0 = gg(d0, a0, b0, c0, words[i + 6],  S[17], K[17]);
      c0 = gg(c0, d0, a0, b0, words[i + 11], S[18], K[18]);
      b0 = gg(b0, c0, d0, a0, words[i + 0],  S[19], K[19]);
      a0 = gg(a0, b0, c0, d0, words[i + 5],  S[20], K[20]);
      d0 = gg(d0, a0, b0, c0, words[i + 10], S[21], K[21]);
      c0 = gg(c0, d0, a0, b0, words[i + 15], S[22], K[22]);
      b0 = gg(b0, c0, d0, a0, words[i + 4],  S[23], K[23]);
      a0 = gg(a0, b0, c0, d0, words[i + 9],  S[24], K[24]);
      d0 = gg(d0, a0, b0, c0, words[i + 14], S[25], K[25]);
      c0 = gg(c0, d0, a0, b0, words[i + 3],  S[26], K[26]);
      b0 = gg(b0, c0, d0, a0, words[i + 8],  S[27], K[27]);
      a0 = gg(a0, b0, c0, d0, words[i + 13], S[28], K[28]);
      d0 = gg(d0, a0, b0, c0, words[i + 2],  S[29], K[29]);
      c0 = gg(c0, d0, a0, b0, words[i + 7],  S[30], K[30]);
      b0 = gg(b0, c0, d0, a0, words[i + 12], S[31], K[31]);

      // Round 3
      a0 = hh(a0, b0, c0, d0, words[i + 5],  S[32], K[32]);
      d0 = hh(d0, a0, b0, c0, words[i + 8],  S[33], K[33]);
      c0 = hh(c0, d0, a0, b0, words[i + 11], S[34], K[34]);
      b0 = hh(b0, c0, d0, a0, words[i + 14], S[35], K[35]);
      a0 = hh(a0, b0, c0, d0, words[i + 1],  S[36], K[36]);
      d0 = hh(d0, a0, b0, c0, words[i + 4],  S[37], K[37]);
      c0 = hh(c0, d0, a0, b0, words[i + 7],  S[38], K[38]);
      b0 = hh(b0, c0, d0, a0, words[i + 10], S[39], K[39]);
      a0 = hh(a0, b0, c0, d0, words[i + 13], S[40], K[40]);
      d0 = hh(d0, a0, b0, c0, words[i + 0],  S[41], K[41]);
      c0 = hh(c0, d0, a0, b0, words[i + 3],  S[42], K[42]);
      b0 = hh(b0, c0, d0, a0, words[i + 6],  S[43], K[43]);
      a0 = hh(a0, b0, c0, d0, words[i + 9],  S[44], K[44]);
      d0 = hh(d0, a0, b0, c0, words[i + 12], S[45], K[45]);
      c0 = hh(c0, d0, a0, b0, words[i + 15], S[46], K[46]);
      b0 = hh(b0, c0, d0, a0, words[i + 2],  S[47], K[47]);

      // Round 4
      a0 = ii(a0, b0, c0, d0, words[i + 0],  S[48], K[48]);
      d0 = ii(d0, a0, b0, c0, words[i + 7],  S[49], K[49]);
      c0 = ii(c0, d0, a0, b0, words[i + 14], S[50], K[50]);
      b0 = ii(b0, c0, d0, a0, words[i + 5],  S[51], K[51]);
      a0 = ii(a0, b0, c0, d0, words[i + 12], S[52], K[52]);
      d0 = ii(d0, a0, b0, c0, words[i + 3],  S[53], K[53]);
      c0 = ii(c0, d0, a0, b0, words[i + 10], S[54], K[54]);
      b0 = ii(b0, c0, d0, a0, words[i + 1],  S[55], K[55]);
      a0 = ii(a0, b0, c0, d0, words[i + 8],  S[56], K[56]);
      d0 = ii(d0, a0, b0, c0, words[i + 15], S[57], K[57]);
      c0 = ii(c0, d0, a0, b0, words[i + 6],  S[58], K[58]);
      b0 = ii(b0, c0, d0, a0, words[i + 13], S[59], K[59]);
      a0 = ii(a0, b0, c0, d0, words[i + 4],  S[60], K[60]);
      d0 = ii(d0, a0, b0, c0, words[i + 11], S[61], K[61]);
      c0 = ii(c0, d0, a0, b0, words[i + 2],  S[62], K[62]);
      b0 = ii(b0, c0, d0, a0, words[i + 9],  S[63], K[63]);

      a0 = add32(a0, a);
      b0 = add32(b0, b);
      c0 = add32(c0, c);
      d0 = add32(d0, d);
    }

    return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
  }

  return { md5 };
})();

// =============================================================================
// 快速自检 (部署前可手动验证:删除此 if 后再 deploy)
// 测试向量:"abc" -> 900150983cd24fb0d6963f7d28e17f72
//         ""   -> d41d8cd98f00b204e9800998ecf8427e
// =============================================================================
if (typeof self !== 'undefined' && self.__MD5_SELFTEST__) {
  const vectors = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
    // Vmqphp 兼容测试:与 PHP md5('123456') 一致
    ['123456', 'e10adc3949ba59abbe56e057f20f883e']
  ];
  for (const [input, expect] of vectors) {
    const got = MD5.md5(input);
    if (got !== expect) {
      throw new Error(`MD5 自检失败: input=${JSON.stringify(input)} got=${got} expect=${expect}`);
    }
  }
  console.log('MD5 self-test passed');
}

export default MD5.md5;
export { MD5 };