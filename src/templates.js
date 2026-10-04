// =============================================================================
// HTML 模板 — Vmqphp admin/* 页面的 Workers 版
// 把所有页面放进一个文件,Workers 没有文件系统,模板必须为内嵌字符串
// =============================================================================

// HTML 转义
export function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 共用 head 资源
const HEAD_CSS = `
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--primary:#3b82f6;--bg:#0f172a;--panel:#1e293b;--panel2:#334155;--text:#e2e8f0;--muted:#94a3b8;--green:#22c55e;--red:#ef4444;--yellow:#eab308}
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
body{min-height:100vh}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px}
.card{background:var(--panel);border-radius:8px;padding:20px;margin-bottom:16px}
.card h2{margin:0 0 12px;font-size:18px}
.btn{display:inline-block;padding:6px 14px;background:var(--primary);color:#fff;border:0;border-radius:4px;cursor:pointer;text-decoration:none;font-size:14px}
.btn:hover{opacity:.85;text-decoration:none}
.btn.danger{background:var(--red)} .btn.gray{background:var(--panel2)}
input,select,textarea{background:var(--panel2);border:1px solid #475569;color:var(--text);padding:6px 10px;border-radius:4px;font-size:14px;width:100%}
input.inline,select.inline{width:auto}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.form-row{margin-bottom:12px}
.form-row label{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #334155}
th{background:var(--panel2);font-weight:600}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}
.badge.green{background:var(--green);color:#000}
.badge.red{background:var(--red);color:#fff}
.badge.gray{background:var(--panel2);color:var(--text)}
.badge.yellow{background:var(--yellow);color:#000}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.stat{background:var(--panel2);padding:16px;border-radius:6px}
.stat .n{font-size:24px;font-weight:700}
.stat .l{color:var(--muted);font-size:12px;margin-top:4px}
.nav{display:flex;gap:8px;margin-bottom:20px;padding:10px;background:var(--panel);border-radius:6px}
.nav a{padding:6px 12px;border-radius:4px;color:var(--text)}
.nav a.active,.nav a:hover{background:var(--panel2);text-decoration:none}
.error{background:var(--red);color:#fff;padding:8px 12px;border-radius:4px;margin-bottom:12px}
pre{background:var(--panel2);padding:12px;border-radius:4px;overflow-x:auto;font-size:12px}
</style>`;

const NAV = (active) => `
<div class="nav">
  <a href="/admin/" ${active==='home'?'class="active"':''}>📊 数据总览</a>
  <a href="/admin/order" ${active==='order'?'class="active"':''}>📋 订单管理</a>
  <a href="/admin/setting" ${active==='setting'?'class="active"':''}>⚙️ 系统设置</a>
  <a href="/admin/qrcode?type=1" ${active==='wxqr'?'class="active"':''}>💚 微信二维码</a>
  <a href="/admin/qrcode?type=2" ${active==='zfbqr'?'class="active"':''}>💙 支付宝二维码</a>
  <a href="/admin/api" ${active==='api'?'class="active"':''}>🔌 API 说明</a>
  <a href="/admin/logout" style="margin-left:auto;color:#fca5a5">登出</a>
</div>`;

const LAYOUT = (title, active, body) => `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(title)} · PvPay</title>${HEAD_CSS}</head>
<body><div class="wrap"><h1 style="margin:0 0 16px;font-size:22px">💰 PvPay — V免签控制台</h1>${NAV(active)}${body}</div></body></html>`;

// =========================================================================
// LOGIN
// =========================================================================
function loginTpl({ error }) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>登录 · PvPay</title>${HEAD_CSS}
<style>.login{max-width:380px;margin:80px auto}.login h1{text-align:center;font-size:24px;margin-bottom:20px}</style>
</head><body><div class="wrap"><div class="login card">
<h1>💰 PvPay 登录</h1>
${error ? `<div class="error">${escape(error)}</div>` : ''}
<form method="POST" action="/admin/login">
  <div class="form-row"><label>账号</label><input name="user" autofocus required></div>
  <div class="form-row"><label>密码</label><input type="password" name="pass" required></div>
  <button type="submit" class="btn" style="width:100%;padding:10px">登 录</button>
</form>
<p style="text-align:center;color:var(--muted);font-size:12px;margin-top:20px">默认账号密码均为 admin,首次登录后立即修改</p>
</div></div></body></html>`;
}

// =========================================================================
// HOME (数据总览)
// =========================================================================
function homeTpl(d) {
  return LAYOUT('数据总览', 'home', `
<div class="card"><h2>📈 订单统计</h2>
  <div class="stats">
    <div class="stat"><div class="n">${d.total}</div><div class="l">订单总数</div></div>
    <div class="stat"><div class="n" style="color:var(--green)">${d.paid}</div><div class="l">已支付</div></div>
    <div class="stat"><div class="n" style="color:var(--yellow)">${d.pending}</div><div class="l">待支付</div></div>
    <div class="stat"><div class="n">${d.expired}</div><div class="l">已过期</div></div>
    <div class="stat"><div class="n" style="color:var(--red)">${d.notifyFail}</div><div class="l">通知失败</div></div>
    <div class="stat"><div class="n">¥${d.income}</div><div class="l">24h 收入</div></div>
  </div>
</div>

<div class="card"><h2>📡 监控端状态</h2>
  <p>状态: <span class="badge ${d.jkstateVal === '1' ? 'green' : 'red'}">${d.jkstate}</span></p>
  <p>最近心跳: ${escape(d.lastheart)}</p>
  <p>最近收款: ${escape(d.lastpay)}</p>
</div>

<div class="card"><h2>🚀 快速接入</h2>
  <p>下单示例:</p>
  <pre>curl "${'$'}{ORIGIN}/createOrder?payId=YOUR_ORDER_ID&type=1&price=0.02&sign=YOUR_SIGN&param=YOUR_PARAM"</pre>
  <p style="color:var(--muted);font-size:13px">
    签名规则:<code>md5(payId + param + type + price + key)</code>,key 在系统设置中获取
  </p>
</div>`);
}

// =========================================================================
// SETTING
// =========================================================================
function settingTpl({ settings }) {
  const s = settings || {};
  const row = (k, label, tip = '') => `
    <div class="form-row">
      <label>${escape(label)}</label>
      <input name="${k}" value="${escape(s[k] ?? '')}" />
      ${tip ? `<div style="color:var(--muted);font-size:12px;margin-top:4px">${escape(tip)}</div>` : ''}
    </div>`;
  return LAYOUT('系统设置', 'setting', `
<div class="card"><h2>⚙️ 系统设置</h2>
<form method="POST" action="/admin/setting/save">
  ${row('user', '管理员账号')}
  ${row('pass', '管理员密码')}
  ${row('key', '通讯密钥 (vmq_key)', '监控端签名密钥;首次登录后自动生成')}
  ${row('notifyUrl', '默认异步回调地址 (notifyUrl)')}
  ${row('returnUrl', '默认同步跳转地址 (returnUrl)')}
  ${row('wxpay', '默认微信收款码 (pay_url)', 'weixin://wxpay/bizpayurl?pr=xxx 形式')}
  ${row('zfbpay', '默认支付宝收款码 (pay_url)', 'HTTPS://qr.alipay.com/xxx 形式')}
  ${row('close', '订单超时分钟 (close)', '超过此时间未支付的订单自动关闭,默认 5')}
  ${row('payQf', '金额冲突策略 (payQf)', '1=加 1 分避开冲突;2=减 1 分;其他=不调整')}
  <div class="row">
    <button class="btn" type="submit">保存设置</button>
    <a class="btn gray" href="/admin/">返回</a>
  </div>
</form>
</div>`);
}

// =========================================================================
// ORDER
// =========================================================================
function orderTpl({ rows, filter }) {
  const r = (row) => `
    <tr>
      <td>${row.id}</td>
      <td><code>${escape(row.pay_id)}</code><br><span style="color:var(--muted);font-size:12px">${escape(row.param)}</span></td>
      <td>${escape(row.order_id)}</td>
      <td>${row.typeLabel}</td>
      <td>¥${row.price}<br><span style="color:var(--muted);font-size:12px">实付 ¥${row.really_price}</span></td>
      <td><span class="badge ${row.state===1?'green':row.state===0?'yellow':row.state===2?'red':'gray'}">${row.stateLabel}</span></td>
      <td><span style="font-size:12px">${escape(row.create_date)}</span><br><span style="font-size:12px;color:var(--muted)">${escape(row.pay_date)}</span></td>
      <td>
        ${row.state === 0 ? `<a class="btn" href="/admin/api/patch?orderId=${encodeURIComponent(row.order_id)}" onclick="return confirm('确认补单?')">补单</a>` : ''}
      </td>
    </tr>`;
  return LAYOUT('订单管理', 'order', `
<div class="card"><h2>📋 订单管理 (最新 ${rows.length} 条)</h2>
  <div class="row" style="margin-bottom:12px">
    <a class="btn gray" href="/admin/order">全部</a>
    <a class="btn gray" href="/admin/order?state=0">待支付</a>
    <a class="btn gray" href="/admin/order?state=1">已支付</a>
    <a class="btn gray" href="/admin/order?state=2">通知失败</a>
    <a class="btn gray" href="/admin/order?state=-1">已过期</a>
    <span style="margin-left:auto;color:var(--muted);font-size:13px">当前筛选: ${escape(filter || '全部')}</span>
  </div>
  <table>
    <thead><tr><th>#</th><th>商户单号/参数</th><th>云端订单号</th><th>类型</th><th>金额</th><th>状态</th><th>创建/支付</th><th>操作</th></tr></thead>
    <tbody>${rows.length ? rows.map(r).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">暂无订单</td></tr>'}</tbody>
  </table>
</div>`);
}

// =========================================================================
// QRCODE
// =========================================================================
function qrcodeTpl({ type, rows }) {
  const title = type === 1 ? '微信二维码' : '支付宝二维码';
  return LAYOUT(title, type === 1 ? 'wxqr' : 'zfbqr', `
<div class="card">
  <h2>${type === 1 ? '💚' : '💙'} ${title}管理 (固定金额)</h2>
  <p style="color:var(--muted);font-size:13px">
    配置后,对应金额的订单会自动选用这里的二维码 (<code>is_auto=0</code>);
    未配置的金额走系统默认收款码 (<code>is_auto=1</code>,需要监控端按金额匹配)。
  </p>
  <form method="POST" action="/admin/qrcode/add" class="row" style="margin-bottom:20px">
    <input type="hidden" name="type" value="${type}">
    <input name="price" placeholder="金额 (如 8.00)" required style="width:140px">
    <input name="pay_url" placeholder="收款码 URL" required style="flex:1">
    <button class="btn" type="submit">添加</button>
  </form>
  <table>
    <thead><tr><th>#</th><th>金额</th><th>收款码</th><th>操作</th></tr></thead>
    <tbody>${rows.length ? rows.map(r => `
      <tr><td>${r.id}</td><td>¥${r.price}</td><td><code style="font-size:12px">${escape(r.pay_url).slice(0, 60)}${r.pay_url.length>60?'…':''}</code></td>
      <td><a class="btn danger" href="/admin/qrcode/del?id=${r.id}&type=${type}" onclick="return confirm('删除?')">删除</a></td></tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">暂未配置</td></tr>'}</tbody>
  </table>
</div>`);
}

// =========================================================================
// API
// =========================================================================
function apiTpl() {
  return LAYOUT('API 说明', 'api', `
<div class="card"><h2>🔌 API 说明</h2>
<p>本服务提供与 Vmqphp 完全兼容的 API,签名规则一致。</p>

<h3>① 创建订单 <code>GET/POST /createOrder</code></h3>
<pre>参数:
  payId     商户订单号 (必填,唯一)
  type      1=微信 2=支付宝
  price     订单金额,两位小数
  sign      md5(payId + param + type + price + key)
  param     附加参数 (可选,会原样回调)
  notifyUrl 异步回调地址 (可选,覆盖系统默认)
  returnUrl 同步跳转地址 (可选,覆盖系统默认)
  isHtml    1=返回跳转 HTML;0=返回 JSON (默认 0)

返回: { code:1, msg:'成功', data:{ orderId, payUrl, reallyPrice, ... } }</pre>

<h3>② 查询订单 <code>GET /getOrder?orderId=xxx</code></h3>
<pre>返回订单完整信息,包括 state。</pre>

<h3>③ 检查订单支付结果 <code>GET /checkOrder?orderId=xxx</code></h3>
<pre>已支付时,返回商户 returnUrl + 签名参数:
  payId=&param=&type=&price=&reallyPrice=&sign=
sign = md5(payId + param + type + price + reallyPrice + key)</pre>

<h3>④ 关闭订单 <code>GET/POST /closeOrder</code></h3>
<pre>参数: orderId, sign=md5(orderId + key)</pre>

<h3>⑤ 监控端心跳 <code>POST /appHeart</code></h3>
<pre>参数: t=秒级时间戳, sign=md5(t + key)</pre>

<h3>⑥ 监控端推送 <code>POST /appPush</code></h3>
<pre>参数:
  type   1=微信 2=支付宝
  price  实付金额
  t      秒级时间戳
  sign   md5(type + price + t + key)

返回 'success' 表示订单匹配并已通知商户。</pre>

<h3>⑦ 监控端状态查询 <code>GET /getState</code></h3>
<pre>参数: t, sign=md5(t + key)
返回 { lastheart, lastpay, jkstate }</pre>
</div>`);
}

// =========================================================================
// PUBLIC PAY PAGE (用户扫码后看到的页面,Vmqphp 是 payPage/pay.html)
// =========================================================================
function payPageTpl({ order }) {
  if (!order) return new Response('订单不存在', { status: 404 });
  const stateBadge = order.state === 1 ? '<span class="badge green">已支付</span>'
                   : order.state === -1 ? '<span class="badge red">已过期</span>'
                   : '<span class="badge yellow">待支付</span>';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>订单 ${escape(order.orderId)}</title>${HEAD_CSS}</head>
<body><div class="wrap" style="max-width:480px">
<div class="card" style="text-align:center">
  <h2>${stateBadge}</h2>
  <p style="font-size:14px;color:var(--muted)">订单 ${escape(order.orderId)}</p>
  <p style="font-size:32px;font-weight:700;margin:8px 0">¥${escape(order.reallyPrice.toFixed(2))}</p>
  ${order.state === 0 ? `<p style="color:var(--muted);font-size:13px">超时时间: ${escape(order.timeOut)} 分钟</p>` : ''}
  ${order.state === 0 ? `<p style="margin:24px 0"><a href="${escape(order.payUrl)}" class="btn" style="font-size:16px;padding:12px 24px">📱 打开支付</a></p>` : ''}
  <p style="color:var(--muted);font-size:12px" id="status">正在监听支付状态...</p>
</div>
<script>
  (function(){
    var oid = "${escape(order.orderId)}";
    var paid = ${order.state === 1};
    if (paid) { document.getElementById('status').innerText = '支付完成,正在跳转...'; return; }
    if (${order.state === -1}) { document.getElementById('status').innerText = '订单已过期'; return; }
    var start = Date.now();
    function poll() {
      fetch('/checkOrder?orderId=' + encodeURIComponent(oid))
        .then(r => r.json())
        .then(d => {
          if (d.code === 1 && typeof d.data === 'string') {
            document.getElementById('status').innerText = '支付成功!跳转中...';
            window.location.href = d.data;
          } else if (d.msg && d.msg.indexOf('过期') >= 0) {
            document.getElementById('status').innerText = '订单已过期';
            location.reload();
          } else if (Date.now() - start < 300000) {
            setTimeout(poll, 1500);
          }
        }).catch(() => setTimeout(poll, 3000));
    }
    setTimeout(poll, 1000);
  })();
</script>
</div></body></html>`;
}

// =========================================================================
// ROUTER
// =========================================================================
export function html(page, data) {
  switch (page) {
    case 'login': return loginTpl(data);
    case 'home':  return homeTpl(data);
    case 'setting': return settingTpl(data);
    case 'order': return orderTpl(data);
    case 'qrcode': return qrcodeTpl(data);
    case 'api': return apiTpl();
    case 'payPage': return payPageTpl(data);
    default: return `<h1>Unknown template: ${escape(page)}</h1>`;
  }
}