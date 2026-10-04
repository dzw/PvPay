// =============================================================================
// 主入口 — Cloudflare Workers 路由
// 所有路径都在这里统一处理:
//   /createOrder /getOrder /checkOrder /closeOrder /getState
//   /appHeart /appPush /closeEndOrder
//   /payPage/pay.html  /pay/qrcode  (公开支付页/二维码代理,可选)
//   /admin/login  /admin/  /admin/setting  /admin/order  /admin/qrcode  /admin/api
// =============================================================================

import {
  createOrder, getOrder, checkOrder, closeOrder, getState,
  appHeart, appPush, _closeEndOrder
} from './api.js';

import {
  adminLoginPage, adminLogin, adminLogout, adminHome,
  adminSettingPage, adminSettingSave,
  adminOrderList, adminPatchOrder,
  adminQrcodePage, adminQrcodeAdd, adminQrcodeDelete,
  adminApiPage
} from './admin.js';

import { findOrderByOrderId, getReturn } from './db.js';
import { html } from './templates.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB;

    try {
      // =========================================================
      // 核心 API — 与 Vmqphp 协议一致
      // =========================================================
      if (path === '/createOrder' || path === '/index/createOrder' || path === '/index.php/index/createOrder') {
        return await createOrder(request, db);
      }
      if (path === '/getOrder' || path === '/index/getOrder') {
        return await getOrder(request, db);
      }
      if (path === '/checkOrder' || path === '/index/checkOrder') {
        return await checkOrder(request, db);
      }
      if (path === '/closeOrder' || path === '/index/closeOrder') {
        return await closeOrder(request, db);
      }
      if (path === '/getState' || path === '/index/getState') {
        return await getState(request, db);
      }
      if (path === '/appHeart' || path === '/index/appHeart') {
        return await appHeart(request, db);
      }
      if (path === '/appPush' || path === '/index/appPush') {
        return await appPush(request, db);
      }
      if (path === '/closeEndOrder' || path === '/index/closeEndOrder') {
        const n = await _closeEndOrder(db);
        return new Response(JSON.stringify(getReturn(1, `清理了 ${n} 条过期订单`)), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      // =========================================================
      // 公开支付页
      // =========================================================
      if (path === '/payPage/pay.html' || path === '/pay') {
        const orderId = url.searchParams.get('orderId');
        if (!orderId) return new Response('missing orderId', { status: 400 });
        const row = await findOrderByOrderId(db, orderId);
        if (!row) return new Response('订单不存在', { status: 404 });
        const closeMin = await db.prepare("SELECT vvalue FROM setting WHERE vkey='close'").bind().first();
        return new Response(html('payPage', {
          order: {
            orderId: row.order_id,
            price: Number(row.price),
            reallyPrice: Number(row.really_price),
            payUrl: row.pay_url,
            state: row.state,
            timeOut: Number(closeMin?.vvalue || 5)
          }
        }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // =========================================================
      // 后台管理
      // =========================================================
      if (path === '/admin' || path === '/admin/') return await adminHome(request, db);
      if (path === '/admin/login' && request.method === 'GET')  return await adminLoginPage(request, db);
      if (path === '/admin/login' && request.method === 'POST') return await adminLogin(request, db);
      if (path === '/admin/logout') return await adminLogout();

      if (path === '/admin/setting' && request.method === 'GET')  return await adminSettingPage(request, db);
      if (path === '/admin/setting/save') return await adminSettingSave(request, db);

      if (path === '/admin/order') return await adminOrderList(request, db);
      if (path === '/admin/api/patch') return await adminPatchOrder(request, db);

      if (path === '/admin/qrcode' && request.method === 'GET') return await adminQrcodePage(request, db);
      if (path === '/admin/qrcode/add')  return await adminQrcodeAdd(request, db);
      if (path === '/admin/qrcode/del')  return await adminQrcodeDelete(request, db);

      if (path === '/admin/api') return await adminApiPage(request, db);

      // =========================================================
      // 根:默认文档提示 (对齐 Vmqphp index.html)
      // =========================================================
      if (path === '/' || path === '/index.html') {
        return new Response(ROOT_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error('Worker error:', e);
      return new Response(JSON.stringify(getReturn(-1, 'server error: ' + e.message)), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  },

  // Workers 的定时任务 (Cron Triggers) — 每分钟清理过期订单
  async scheduled(event, env, ctx) {
    ctx.waitUntil(_closeEndOrder(env.DB));
  }
};

const ROOT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>检测到默认文档未设定</title>
<style>body{font-family:sans-serif;padding:40px;background:#0f172a;color:#e2e8f0;text-align:center}
h1{color:#ef4444}</style></head><body>
<h1>检测到默认文档未设定</h1>
<p>请将 Cloudflare Pages 或域名配置中的默认文档指向 <code>/</code> 路径</p>
<p>或直接访问 <a href="/admin/" style="color:#3b82f6">/admin/</a> 进入管理后台</p>
</body></html>`;