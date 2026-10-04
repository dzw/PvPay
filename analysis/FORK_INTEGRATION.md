# vmqApk Fork 改动整合分析

> **目标仓库**:`zwc456baby/vmqApk`(原 fork 当前 master)
> **网络数据源**:`https://github.com/zwc456baby/vmqApk/network` (50 most recent fork commits)
> **关键 PR**:`https://github.com/szvone/vmqApk/pull/45`(open, 35 commits, zwc456baby 贡献)
> **分析时间**:2026-10-04
> **状态**:6 个 fork 仓库全部已 404,只能从 commit 消息 + PR diff 还原改动

---

## 一、网络 fork 拓扑(基于网络表 + API 查询)

```
                          szvone/vmqApk (root, 2019 起,v1.8.1)
                                  │
                                  ├─ zwc456baby/vmqApk ★ 当前主用,35 commits
                                  │     │
                                  │     └─ PR #45 (open, 35 commits) ──→ szvone
                                  │
                                  ├─ net5705632/vmqApk (★ Cloudflare-Workers-VMQ README 作者)
                                  ├─ DawninShelter/vmqApk (★ 大量省电/防掉单重构)
                                  ├─ panghaoyu/vmqApk (★ 接码平台+自定义金额)
                                  ├─ Mr-Tony505/vmqApk (★ 补单+阿里腾讯云短信)
                                  ├─ JooYoo/vmqApk (★ 补单)
                                  └─ John-rong/vmqApk (小修)
```

> **重要事实**:这 6 个 fork 的 GitHub 仓库现已 404(被作者删/改私)。仅能从 GitHub 保留的 commit graph 还原改动。SHA 用 GitHub commit API 也已 422(孤儿 commit)。

---

## 二、按"提交次数 + 最近修改"排序的活跃 fork

通过 PR #45(35 commits)得知 `zwc456baby` 是贡献量最大的 fork,但 PR #45 实际上**尚未被合并到上游**,所以 zwc456baby 的所有改动都还停在 fork 上。

| Fork | 提交数 | 最近 commit | 关键特性 |
|------|--------|------------|----------|
| **zwc456baby** | **35** | 2024-12-04 | PR #45 大合集:开机自启+5 次重试+企业微信+Alipay 匹配+VPN 连接池优化+内存优化+Android15 |
| **panghaoyu** | 4 | (历史) | 接码平台自动回复 + 自定义金额 + 店员通收款识别 + APK 更新 |
| **net5705632** | 4 | (历史) | 微信 8.0.55 兼容 + 商家到账播报 + VPN/内存优化(已并入 zwc) |
| **DawninShelter** | 3 | (历史) | 大重构省电/防掉单 + 禁止重复扫码 |
| **Mr-Tony505** | 2 | (历史) | 补单接口 + 阿里云/腾讯云短信 |
| **JooYoo** | 2 | (历史) | 补单接口(独立实现) |
| **John-rong** | 2 | (历史) | 小修 |

---

## 三、有意义的 commit 清单(按"对 PvPay 服务端的影响"分类)

### A. 协议层(直接影响服务端)

| Commit | Fork | 标题 | 服务端应对 |
|---------|------|------|------------|
| `7c7423f` | zwc | 增加一个参数供后台判断是重试还是首次推送 | **接受 `isFirstPush=1/0` 参数** |
| `2c250d3` | zwc | 增加五次重试机制 | **appPush 接受 `force_push=true` 与 `try_count`** |
| `1ac9fb7` | zwc | 增加通知信息文件写入功能 + 错误捕获 | 客户端日志,服务端无需改 |
| `4bc2759` | zwc | VPN 连接池假死 | 客户端 OkHttp 连接池,服务端无关 |
| `7a5a463` | Mr-Tony505 | **增加补单接口** | **新增 `POST /admin/api/patch`** |
| `06d09ec` | JooYoo | **增加补单接口**(重复实现) | 同上 |
| `b3d2771` | panghaoyu | 对接接码平台实现自动回复 | 客户端功能,服务端无需改 |

### B. 兼容/识别层(客户端适配)

| Commit | Fork | 标题 | 客户端需 |
|---------|------|------|----------|
| `9987e9c` | zwc | 兼容最新企业微信对外收款 | 通知文本正则 |
| `eacc657` | zwc | 修复企业微信大额匹配 | 金额正则边界 |
| `2ddd715` | zwc | 支持企业微信小薇商户 | 新包名匹配 |
| `e0d236d` | zwc | 新版支付宝带积分 | 金额正则 |
| `f24c4d3` | zwc | 修复新版支付宝匹配 | 通知文本正则 |
| `e56a800` | zwc | 兼容微信 8.0.50 | 通知文本正则 |
| `b80fb88` | net5705 | 微信 8.0.55 兼容 | 通知文本正则 |
| `ae46af8` | net5705 | 兼容支付宝/微信商家到账播报 | 新通知源 |
| `556969d` | zwc | 支持支付宝店员收款 | 店员通知处理 |
| `5a3cffa` | panghaoyu | 支付宝商家服务店员通收款识别 | 同上,独立正则 |
| `d3f4510` | zwc | 升级到 API 28 | AndroidManifest |
| `1d8158e` | zwc | 修复识别问题 | 通用 |
| `7e9095e` | zwc | Android15 相关说明 | 文档 |

### C. 健壮性 / 体验(客户端工程改进)

| Commit | Fork | 标题 | 影响 |
|---------|------|------|------|
| `97f24b2` | zwc | 支持开机启动 + 自动重试 + service 唤醒 | 客户端生命周期 |
| `29a2ef9` | zwc | 支持常驻 | 同上 |
| `637c790` | zwc | 开机自启 | 广播接收器 |
| `28eac36` | zwc | 自定义签名 | 调试/旁路 |
| `823c03e` | DawninShelter | **大重构省电/防掉单** | 大改,可参考架构 |
| `b37a59c` | DawninShelter | 前台禁止重复扫码 | UI 防抖 |
| `f1bbe2e` | zwc | 优化内存占用 | 资源回收 |

### D. 功能扩展(独立特性)

| Commit | Fork | 标题 | 接入 |
|---------|------|------|------|
| `8e0c2f4` | Mr-Tony505 | 整合阿里云/腾讯云短信 | 短信平台 SDK |
| `3acfaef` | panghaoyu | 自定义金额输入框 | UI |

---

## 四、可落地到 PvPay 服务端的项(本次实现)

把 zwc / Mr-Tony505 / JooYoo 等 fork 在协议层的关键改造,直接整合到 PvPay:

### 改动 1:`appPush` 支持 `isFirstPush` 参数 + 智能重试

**背景**:zwc 的 `7c7423f` 让客户端在首次推送和重试时携带不同的标志位,服务端据此决定是否要再次通知商户 —— 否则重试会把已经发过的回调再发一次,造成对账混乱。

**协议扩展**(向后兼容,不传**会按首次处理):
```
POST /appPush
  t=...
  type=1|2
  price=...
  isFirstPush=1  ← 新增,可选
  sign=md5(type+price+t+key)
```

**服务端行为**:
- `isFirstPush=1`(首次):正常匹配 → state=1 → 通知商户(state=2 如果回调失败)
- `isFirstPush=0`(重试):如果订单 state=2(通知失败),**重发通知**;否则视为重复推送,忽略(返回 success 但不重发)

### 改动 2:`appPush` 支持 `force_push=true`(已有客户端在用)

当前 Android 客户端失败时实际发送的是 `url + "&force_push=true"`,但 PvPay 没正式认这参数。补上:
- `force_push=true` 视为 `isFirstPush=0` 的别名
- 优先按 `isFirstPush` 判断;若只有 `force_push`,视为重试

### 改动 3:`/admin/api/patch` 改造成支持重发通知(Mr-Tony505 + JooYoo 补单接口的整合):
- 原版:补单只把 state 改成 1
- 增强:补单时如原 state=2(通知失败),**主动重发通知商户**,避免人工介入

### 改动 4:新增运维 `/admin/api/manual-resend`(force 重发)

独立端点:对任意 orderId 强制重发通知,不管当前状态如何(慎用,需后台鉴权)。

---

## 五、给客户端(Android 侧)建议整合的项

下面这些 fork-only 改动对 Android 客户端价值大,但需要源码(已 404),只能给出重构方向:

| 来源 | 特性 | 建议 |
|------|------|------|
| DawninShelter | **省电/防掉单大重构** | 把 `NeNotificationService2` 中的轮询改成事件驱动,使用 `WakeLock` + `JobScheduler` |
| DawninShelter | 前台禁止重复扫码 | `CaptureActivity` 加 isProcessing flag,扫码成功后禁用按钮直到结果处理完 |
| panghaoyu | 接码平台自动回复 | 集成第三方 SMS-receive API,收到短信后回调 confirm amount,自动掉单 |
| Mr-Tony505 | 阿里云/腾讯云短信 | 短信下发时可走云平台 SDK(成本/稳定性考量) |
| zwc | 自定义签名 | debug 时绕过强制签名校验,方便测试 |

---

## 六、未整合的项(及其原因)

| 改动 | 原因 |
|------|------|
| 接码平台(panghaoyu) | 涉及第三方服务,合规风险;且不在 PvPay 服务端范围 |
| 阿里云/腾讯云短信(Mr-Tony505) | 同样客户端 SDK,与服务端解耦 |
| Android UI 改动(DawninShelter UI) | 客户端体验优化,与协议无关 |
| 微信/支付宝版本兼容正则 | 客户端代码,服务端只关心 `appPush` 上行字段 |

---

## 七、代码改动索引(本次提交包含)

- `src/api.js`
  - `appPush` 新增 `isFirstPush` / `force_push` 解析
  - 重试时不再重复通知商户(避免对账问题)
  - 状态保留:首次 → state=1 通知失败 → state=2;重试到达 state=2 → 重发通知,成功后回 state=1
- `src/admin.js`
  - `/admin/api/patch` 改造:补单时若原 state=2,**主动重发通知**
  - 新增 `/admin/api/resend`(POST/GET 均可,需 cookie):手动强制重发指定 orderId
- `src/db.js`
  - `updateOrderById` 已存在,无需新增
- `tests/test_api.mjs`
  - 补 4 条新测试:重试不重复通知 / 重试 state=2 重发 / 补单重发 / 强制重发
---

# 第二轮:现存活跃 fork 逐个代码比对(2026-10-04)

> 数据源:`https://github.com/zwc456baby/vmqApk/network` 截图中 11 个在线 fork。
> 方法:`vmqApk-ref` 本地 fetch 全部 fork 分支,与 `origin/master`(1d8158e)做 merge-base diff,拿到的是**真实代码**而非 commit 消息推测。

## 一、总览

| Fork | 独有提交 | 实质内容 | 对 PvPay 价值 |
|------|---------|---------|--------------|
| **altmanlib/vmq-apk** | 50(独立历史) | **Kotlin 全量重写**(MVVM+协程+单测),HMAC-SHA256 签名 JSON 协议、支付回调指数退避重试 | ★★★ 已整合为服务端 `/api/v1/*` |
| **daojiAnime** | 4 | **多应用 app_id 协议**:二维码 `url/key/app_id`,心跳/推送带 `&app_id=`;host 支持完整 URL | ★★ 服务端接受 app_id(上轮 WIP)+ 客户端已并入 vmqApk-ref WIP |
| **xinyin025**(=hulisang) | 7 | 路由改名 `/api/monitor/heart` `/api/monitor/push`;UI 美化+主页日志框+收款 toast+CI | ★ 服务端已加路由别名 |
| **BUGJI** | 3 | 新版支付宝/微信通知解析(合并 title+content 判关键词、`findMoney` 优先 "X元" 模式防广告数字);移除 support 库 | 客户端,可并入自维护 APK |
| **jiaobotao** | 20 | 支付宝金额优先从标题匹配、bigText 兜底;`usesCleartextTraffic`;Gradle 7.5/AGP 7.2.2(JDK17);CI 自动发 Release;修复上游支付宝 if 缺右括号编译错误 | 客户端构建/识别改进 |
| **FantajiNeko** | 5 | http→https 硬编码、SDK 升级、CI | 客户端小改 |
| **drainlin** | 4 | 仅 JDK18 编译配置 | 无 |
| **xytxg** | 0 | 纯落后,无独有提交 | 无 |
| **laojichao** | 1 | 仅加 CLAUDE.md 文档 | 无 |
| **gldden** | - | 账号/仓库已 404 | 无 |

> hulisang 与 xinyin025 提交完全相同(hulisang 是二级 fork)。

## 二、altmanlib HMAC 签名协议(本轮重点整合)

客户端 `RequestSignature.kt`:

```
canonical = "VMQ-HMAC-SHA256-V1\n{METHOD}\n{pathname}\n{timestamp}\n{nonce}\n{sha256hex(body)}"
X-VMQ-Signature = "v1=" + hex(HMAC-SHA256(key, canonical))
```

- `POST /api/v1/system/heartbeat` body `{}`;`POST /api/v1/payments/notify` body `{"channel":1|2,"price":12.34}`
- 时间戳**秒级**(其修复 `46729db` 专门把毫秒改秒)
- 客户端重试:`Retry.kt` 指数退避 4 次(1s/2s/4s,上限 10s),**仅 5xx 与 IO 异常可重试**,callTimeout 5s、整体 deadline 30s
- 服务端策略:校验失败 401(客户端不重试)、内部错误 500(客户端重试);重试不会重复通知商户——`processAppPush` 对 state=1 订单直接返回成功

## 三、本轮服务端代码改动索引

- `src/api.js`
  - **修复 TDZ bug**:app_id 日志分支引用了后声明的 `isFirstPush`/`tryCount`,带 app_id 的推送必 500
  - 抽取 `processAppPush()` / `recordHeartbeat()`,md5 协议与 HMAC JSON 协议共用
  - **修复浮点容差**:`ABS(really_price-?)<0.01` 因 IEEE754 误差会把相邻 1 分钱订单(8.01↔8.00)误匹配,收紧为 `<0.005`
  - **`notifyMerchant` 空/非法 notify_url 不再抛异常**,按通知失败处理(state=2)
- `src/api_v1.js`(新增):HMAC-SHA256 校验(WebCrypto)+ 时间戳容差 ±300s + nonce 防重放
- `src/index.js`:`/api/monitor/heart|push` 别名 + `/api/v1/*` 路由
- `tests/test_api_v1.mjs`(新增 15 条):正常/缺头/错钥/过期/重放/篡改/参数校验/路由别名
- `src/templates.js`:后台 API 文档补 ⑧⑨ 两节

## 四、客户端(vmQApk)侧建议并入自维护分支

| 来源 | 改动 | 说明 |
|------|------|------|
| BUGJI `180dd87` | title+content 合并判断 + `findMoney` 优先 "X元" | 抗广告数字误识别 |
| jiaobotao `5b52dab` | 支付宝金额优先从标题匹配 | 与 BUGJI 同题,实现略异 |
| jiaobotao `3f190e6` | 上游支付宝分支缺右括号修复 | 上游 master 编译不过 |
| jiaobotao `24eaf90` | Gradle 7.5 / AGP 7.2.2 | JDK17 可构建 |
| FantajiNeko `ed8b5cd` | https 支持 | 与 daojiAnime 完整 URL host 方案二选一,后者更灵活 |

---

# 第三轮:全量 fetch 12 源 + v2 签名协议合入(2026-10-04)

> 12 个 fork 全部配置为 `vmqApk-ref` 的 git remote(`f-<owner>`),fetch 全部分支后逐分支对比。
> 勘误:图中 "gldden" 实为 **gdlden**(上次拼写查询 404)。gdlden/vmqApk 19 个提交全是 CI 脚本,**Java 源码零改动**,无需整合。

## 新发现的分支(第二轮只看默认分支,漏掉)

| 分支 | 内容 | 处置 |
|------|------|------|
| **hulisang/material-you-style** | **v2 监控端签名**(MonitorSign.java,HMAC-SHA256 替换 md5,毫秒时间戳、BigDecimal 金额定标、黄金向量单测)+ envelope code 校验 + retry_after_millis | ✅ 本轮合入(服务端验签 + 客户端签名) |
| hulisang/multiuser | `/api/v2/monitor/*` + `&appid=`,面向作者 Go 后端 (vmqfox) | ❌ 不合:与 daojiAnime app_id、altmanlib /api/v1 功能重复 |
| xytxg/refactor/android-modernization | PaymentParser 防误识别(退款/提现/双重金额过滤)、凭据排除云备份、ApiClient 不回显服务端内容 | ✅ 移植 PaymentFilter 守卫 + backup 排除规则 |

## v2 签名协议(已实现)

```
heartbeat: sign = HMAC-SHA256(key, "t=" + t毫秒)
push:      sign = HMAC-SHA256(key, "type=" + type + "&price=" + price + "&t=" + t毫秒)
```
- sign 64 位小写 hex;服务端按长度自动区分 md5(32) / v2(64),旧客户端零影响
- 毫秒时间戳双向新鲜度窗口 ±300s
- price 文本必须与签名文本一致(客户端 `MonitorSign.priceText` 定标两位)

## 服务端改动(PvPay)

- `src/hmac.js`(新):sha256Hex / hmacSha256Hex / 恒时比较,api.js 与 api_v1.js 共用
- `src/api.js`:新增 `verifyMonitorSignV2()`;appHeart/appPush 双格式验签(md5 || v2)
- `tests/test_sign_v2.mjs`(新 12 条):含 Java 客户端黄金向量互验、窗口边界、篡改拒绝
- `src/templates.js`:后台文档补 ⑧b 节

## 客户端改动(vmqApk-ref)

- 新增 `MonitorSign.java` + `MonitorSignTest.java`(黄金向量,原样取自 hulisang v2 提交)
- `MainActivity.java` / `NeNotificationService2.java`:心跳×4 + 推送×1 全部改用 MonitorSign;删除两处内联 md5 方法与无用 import;appPush 金额统一 `priceText` 定标
- 新增 `PaymentFilter.java`(xytxg 规则:退款/退还/失败/提现/转出/支出/待收款/汇总/合计 拒绝、金额 (0, 999999999.99]、文本 ≤8KB),挂在支付宝/微信两个 appPush 前
- `AndroidManifest.xml` + `res/xml/backup_rules.xml` / `data_extraction_rules.xml`:sharedpref(含 host/key/app_id)排除云备份与换机迁移
- 已验证:MonitorSign 与服务端黄金向量逐字节一致;PaymentFilter 11 条行为用例全过
- 未做:xytxg 整库重构(包结构大改,与 WIP 冲突面太大,只取规则);jiaobotao Gradle 升级(其修复针对 v1.8.1 老基线,当前 master 无该编译错误)
