// 허브 화면을 브라우저로 미리 보기: npm run preview → http://localhost:4183
// (Tauri가 없으니 창 버튼·트레이·자동 실행은 안 되고, 화면과 데이터는 그대로 돈다)
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = process.argv[2] || 'ui', port = +process.argv[3] || 4183;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(path.join(root, p)); res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
