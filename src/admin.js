// =============================================================================
// 后台管理 — 对应 Vmqphp application/admin/controller/Index.php + application/admin/*
// 路由:/admin/login /admin/logout /admin/api/... 等
//
// 鉴权:Vmqphp 用 Session,Workers 没有 Session 状态。
// 这里改用 HttpOnly Cookie(签名+过期),状态完全无服务端存储,符合 Workers 无状态模型。
// =============================================================================

import md5 from './md5.js';
import {
  getSetting, setSetting, listSetting,
  listPayQrcodes, insertPayQrcode, deletePayQrcode,
  listOrders, countOrdersByState, todayIncome,
  findOrderByOrderId, updateOrderState,
  getReturn
} from './db.js';
import { html, escape as e } from './templates.js';

// ----- cookie 鉴权 -----
// 形如 "admin=<hmac>; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax"
// hmac = md5(pass + "<user_id>") — 与 Vmqphp session 强度相当,够用。
async function makeAuthCookie(db) {
  const user = await getSetting(db, 'user');
  const pass = await getSetting(db, 'pass');
  const hmac = md5(String(pass) + '|' + String(user));
  const maxAge = 86400;
  return {
    name: 'vmq_admin',
    value: `${user}.${hmac}`,
    opts: `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
  };
}

async function checkAuth(request, db) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)vmq_admin=([^;]+)/);
  if (!m) return false;
  const [user, hmac] = m[1].split('.');
  const pass = await getSetting(db, 'pass');
  if (!user || !hmac) return false;
  return hmac === md5(String(pass) + '|' + String(user));
}

// ----- 后台:登录页 (GET /admin/login) -----
export async function adminLoginPage(request, db) {
  return new Response(html('login', { error: '' }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ----- 后台:登录提交 (POST /admin/login) -----
export async function adminLogin(request, db) {
  const fd = await request.formData().catch(() => new FormData());
  const user = String(fd.get('user') || '');
  const pass = String(fd.get('pass') || '');

  const realUser = await getSetting(db, 'user');
  const realPass = await getSetting(db, 'pass');

  if (user !== realUser || pass !== realPass) {
    return new Response(html('login', { error: '账号或密码错误' }), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 登录成功后,自动生成 vmq_key (Vmqphp v1.10 行为)
  const currentKey = await getSetting(db, 'key');
  if (!currentKey) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let k = '';
    for (let i = 0; i < 32; i++) k += chars[Math.floor(Math.random() * chars.length)];
    await setSetting(db, 'key', k);
  }

  const c = await makeAuthCookie(db);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin/',
      'Set-Cookie': `${c.name}=${c.value}; ${c.opts}`
    }
  });
}

// ----- 后台:登出 (POST /admin/logout) -----
export async function adminLogout() {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin/login',
      'Set-Cookie': 'vmq_admin=; Path=/; Max-Age=0'
    }
  });
}

// ----- 后台:首页 (数据总览) -----
export async function adminHome(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();

  const stats = await countOrdersByState(db);
  const income = await todayIncome(db);
  const lastheart = await getSetting(db, 'lastheart');
  const lastpay = await getSetting(db, 'lastpay');
  const jkstate = await getSetting(db, 'jkstate');

  return new Response(html('home', {
    total: stats.total || 0,
    paid: stats.paid || 0,
    pending: stats.pending || 0,
    expired: stats.expired || 0,
    notifyFail: stats.notify_fail || 0,
    income: income.toFixed(2),
    lastheart: formatTime(lastheart),
    lastpay: formatTime(lastpay),
    jkstate: jkstate === '1' ? '在线' : '离线',
    jkstateVal: jkstate
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ----- 后台:系统设置 -----
export async function adminSettingPage(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const s = await listSetting(db);
  return new Response(html('setting', { settings: s }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export async function adminSettingSave(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const fd = await request.formData().catch(() => new FormData());

  // 接收所有字段,但只允许白名单内的 key (Vmqphp 直接覆盖所有 setting)
  const allowKeys = [
    'user', 'pass', 'key', 'notifyUrl', 'returnUrl',
    'wxpay', 'zfbpay', 'close', 'payQf'
  ];
  for (const k of allowKeys) {
    if (fd.has(k)) await setSetting(db, k, String(fd.get(k) || ''));
  }
  // 改密码/账号/key 后,失效当前 cookie (除 user/pass 之外)
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin/setting?ok=1',
      'Set-Cookie': 'vmq_admin=; Path=/; Max-Age=0'
    }
  });
}

// ----- 后台:订单列表 -----
export async function adminOrderList(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const stateNum = state === null || state === '' ? null : Number(state);
  const r = await listOrders(db, { state: stateNum, limit: 200 });
  const rows = (r.results || []).map(row => ({
    id: row.id,
    pay_id: row.pay_id,
    order_id: row.order_id,
    type: row.type,
    typeLabel: row.type === 1 ? '微信' : row.type === 2 ? '支付宝' : '?',
    price: Number(row.price).toFixed(2),
    really_price: Number(row.really_price).toFixed(2),
    state: row.state,
    stateLabel: stateText(row.state),
    create_date: formatTime(row.create_date),
    pay_date: formatTime(row.pay_date),
    param: row.param || ''
  }));
  return new Response(html('order', { rows, filter: state || '' }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// 手动补单 (GET /admin/api/补单?orderId=xxx)
export async function adminPatchOrder(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');
  if (!orderId) {
    return new Response('missing orderId', { status: 400 });
  }
  const row = await findOrderByOrderId(db, orderId);
  if (!row) return new Response('订单不存在', { status: 404 });

  const now = Math.floor(Date.now() / 1000);
  await updateOrderState(db, orderId, { state: 1, pay_date: now, close_date: now });
  return new Response(null, {
    status: 302,
    headers: { 'Location': '/admin/order?ok=1' }
  });
}

// ----- 后台:微信/支付宝固定金额二维码管理 -----
export async function adminQrcodePage(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const url = new URL(request.url);
  const type = Number(url.searchParams.get('type') || '1');
  const r = await listPayQrcodes(db, type);
  return new Response(html('qrcode', {
    type,
    rows: (r.results || []).map(x => ({
      id: x.id, pay_url: x.pay_url, price: Number(x.price).toFixed(2)
    }))
  }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function adminQrcodeAdd(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const fd = await request.formData().catch(() => new FormData());
  const pay_url = String(fd.get('pay_url') || '');
  const price = Number(fd.get('price') || 0);
  const type = Number(fd.get('type') || 1);
  if (pay_url && price > 0) {
    await insertPayQrcode(db, { pay_url, price, type });
  }
  return new Response(null, {
    status: 302,
    headers: { 'Location': `/admin/qrcode?type=${type}` }
  });
}

export async function adminQrcodeDelete(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  const type = Number(url.searchParams.get('type') || 1);
  if (id > 0) await deletePayQrcode(db, id);
  return new Response(null, {
    status: 302,
    headers: { 'Location': `/admin/qrcode?type=${type}` }
  });
}

// ----- 后台:API 说明页 -----
export async function adminApiPage(request, db) {
  if (!(await checkAuth(request, db))) return redirectLogin();
  return new Response(html('api', {}), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ----- 工具 -----
function redirectLogin() {
  return new Response(null, {
    status: 302,
    headers: { 'Location': '/admin/login' }
  });
}

function formatTime(ts) {
  ts = parseInt(ts || '0', 10);
  if (!ts || ts < 1) return '从未';
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function stateText(s) {
  switch (Number(s)) {
    case 0: return '待支付';
    case 1: return '已支付';
    case 2: return '通知失败';
    case -1: return '已过期';
    default: return '未知';
  }
}