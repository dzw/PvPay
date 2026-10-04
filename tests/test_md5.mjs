// Self-test for src/md5.js
process.env.NODE_OPTIONS = '';
globalThis.self = { __MD5_SELFTEST__: true };
const md5 = (await import('../src/md5.js')).default;

const cases = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ['The quick brown fox jumps over the lazy dog', '9e107d9d372bb6826bd81d3542a419d6'],
  ['123456', 'e10adc3949ba59abbe56e057f20f883e'],
  // Vmqphp 签名场景
  ['CF1234567890' + '000151' + '1' + '8.00' + 'changeme_xxx',
   '357c9ee…'] // 占位,运行时再算
];

let pass = 0, fail = 0;
for (const [input, expect] of cases) {
  if (expect.endsWith('…')) continue;
  const got = md5(input);
  if (got === expect) { pass++; console.log('✓', JSON.stringify(input).slice(0, 40), '→', got); }
  else { fail++; console.log('✗', JSON.stringify(input).slice(0, 40), '→ got', got, 'want', expect); }
}
console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail > 0 ? 1 : 0);