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