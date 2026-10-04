// 简单的本地接收 server,打印收到的 notify,返回 "success"
import { createServer } from 'node:http';

let received = null;

const server = createServer((req, res) => {
  received = req.url;
  console.log('[notify]', req.method, req.url);
  res.end('success');
});

const port = 9999;
server.listen(port, '127.0.0.1', () => {
  console.log(`notify server listening on http://127.0.0.1:${port}`);
});

// 保持运行
setInterval(() => {}, 1 << 30);