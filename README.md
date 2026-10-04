# PvPay — Cloudflare Workers V免签

> 🚀 基于 **Cloudflare Workers + D1** 实现的零成本 V免签个人收款服务端
>
> 完全对齐 [szvone/Vmqphp](https://github.com/szvone/Vmqphp) 协议,协议规范参考 [net5705632/Cloudflare-Workers-VMQ](https://github.com/net5705632/Cloudflare-Workers-VMQ) 文档

## 📁 目录

```
PvPay/
├── src/
│   ├── index.js       # 主路由
│   ├── api.js         # createOrder / appPush / appHeart / checkOrder / closeOrder / getState
│   ├── admin.js       # 后台:登录/设置/订单/二维码/补单
│   ├── db.js          # D1 封装 (setting/pay_order/tmp_price/pay_qrcode)
│   ├── md5.js         # 纯 JS MD5 (crypto.subtle 不支持 MD5)
│   └── templates.js   # HTML 模板 (login/home/setting/order/qrcode/api/payPage)
├── tests/             # Node 本地自测
│   ├── test_md5.mjs   # MD5 与 PHP md5() 比对
│   └── test_api.mjs   # 端到端 30 个核心场景
├── schema.sql         # D1 建表 + 初始数据 (对齐 vmq.sql)
├── wrangler.toml      # Wrangler 配置
└── package.json
```

## 🆚 与原版对照

| 协议 | Vmqphp 路径 | PvPay 路径 | 签名规则 |
|------|------------|-----------|---------|
| 创建订单 | `Index::createOrder()` | `/createOrder` | `md5(payId+param+type+price+key)` |
| 查订单 | `Index::getOrder()` | `/getOrder` | — |
| 查支付结果 | `Index::checkOrder()` | `/checkOrder` | 返回 URL 含 `md5(payId+param+type+price+reallyPrice+key)` |
| 关单 | `Index::closeOrder()` | `/closeOrder` | `md5(orderId+key)` |
| 心跳 | `Index::appHeart()` | `/appHeart` | `md5(t+key)` |
| 推送 | `Index::appPush()` | `/appPush` | `md5(type+price+t+key)` |
| 监控状态 | `Index::getState()` | `/getState` | `md5(t+key)` |

数据库结构 1:1 对应 `vmq.sql`,包含:
- `pay_order` (订单)
- `pay_qrcode` (固定金额二维码)
- `setting` (kv 配置)
- `tmp_price` (金额锁)

## 🚀 快速部署

### 1. 安装 wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 D1

```bash
wrangler d1 create pvpay-db
```

把返回的 `database_id` 填到 `wrangler.toml`。

### 3. 初始化 schema

```bash
# 本地
wrangler d1 execute pvpay-db --file=./schema.sql
# 线上 (部署后必须执行)
wrangler d1 execute pvpay-db --file=./schema.sql --remote
```

### 4. 部署

```bash
wrangler deploy
```

### 5. 登录后台

打开 `https://<your-worker>.workers.dev/admin/login`
默认账号密码:`admin / admin`

首次登录后会**自动生成通讯密钥 `key`**,立即去"系统设置"修改 admin 密码。

## 🧪 本地测试

```bash
node tests/test_md5.mjs   # MD5 与 PHP md5() 一致性
node tests/test_api.mjs   # 端到端 30 个场景
```

> 测试用 Node 22+ 内置 `node:sqlite` 模拟 D1,无需任何额外依赖。

## 🔐 API 协议示例

### 创建订单

```bash
KEY=$(curl -s https://your.workers.dev/... | jq -r .data.key)  # 实际从后台获取

# 签名
PAYID="ORDER$(date +%s)"
PRICE="0.02"
SIGN=$(php -r "echo md5('${PAYID}1${PRICE}${KEY}');")
# 或 node -e "console.log(require('crypto').createHash('md5').update('${PAYID}1${PRICE}${KEY}').digest('hex'))"

curl "https://your.workers.dev/createOrder?payId=${PAYID}&type=1&price=${PRICE}&sign=${SIGN}"
```

返回:

```json
{
  "code": 1,
  "msg": "成功",
  "data": {
    "payId": "ORDER1700000000",
    "orderId": "V202510041234567",
    "payType": 1,
    "price": 0.02,
    "reallyPrice": 0.02,
    "payUrl": "weixin://wxpay/bizpayurl?pr=xxx",
    "isAuto": 1,
    "state": 0,
    "timeOut": 5,
    "date": 1700000000
  }
}
```

### 监控端推送 (Python 监控端 → PvPay)

```bash
curl -X POST "https://your.workers.dev/appPush" \
  -d "type=1" \
  -d "price=0.02" \
  -d "t=$(date +%s)" \
  -d "sign=$(node -e "console.log(require('crypto').createHash('md5').update('1'+'0.02'+'$(date +%s)'+'YOUR_KEY').digest('hex'))")"
```

## ❓ 常见问题

### `MD5 is not supported`
crypto.subtle 不支持 MD5 → 已内置 `src/md5.js` 纯 JS 实现,无需任何改动。

### `sign error`
1. 确认两边的 `key` 完全一致
2. 签名拼接前 **所有数字转字符串**:`String(type)` 而不是 `type`
3. `price` 用 `.toFixed(2)` 格式化为 `8.00`

### Worker 之间 fetch 超时 (8s)
PvPay → 商户 Worker 的 `notifyUrl` 必须用 Cloudflare 原生域名(`.workers.dev`),
不能用优选 IP 域名。或者改用 Service Bindings。

### 订单超时未清理
- 检查 `setting.close`(默认 5 分钟)
- `appHeart` / `closeEndOrder` 任一被定时调用都会触发清理
- 也可以加 Cron Trigger 到 wrangler.toml(已注释,自行启用)

## 📊 当前测试覆盖

`tests/test_api.mjs` 30/30 通过:
- ✓ MD5 与 PHP md5() 一致
- ✓ 元/分转换 (BigInt 避免精度问题)
- ✓ createOrder (验签/价格锁定/jkstate/重复 pay_id)
- ✓ 并发抢同价 (payQf 自增分避冲突)
- ✓ appHeart / appPush / checkOrder / closeOrder / getState
- ✓ 异步通知商户 URL 拼接 (`?` vs `&` 兼容)
- ✓ closeEndOrder 清理过期订单

## 📄 License

MIT — 与 Vmqphp 一致

## 🙏 致谢

- [szvone/Vmqphp](https://github.com/szvone/Vmqphp) — V免签原版协议
- [net5705632/Cloudflare-Workers-VMQ](https://github.com/net5705632/Cloudflare-Workers-VMQ) — README 文档规范
- Cloudflare Workers / D1 — 免费边缘计算

## ⚠️ 免责声明

仅供个人开发者学习、测试、个人博客收款使用。请勿用于非法用途。