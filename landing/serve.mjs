import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root = path.join(import.meta.dirname, 'dist');
const port = Number(process.env.PORT || 4380);
http.createServer((req,res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname)); } catch { res.writeHead(400); return res.end(); }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (file === root || statSafe(file)?.isDirectory()) file = path.join(file, 'index.html');
  const stat = statSafe(file);
  if (!stat?.isFile()) { res.writeHead(404); return res.end('Page not found'); }
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.dmg':'application/x-apple-diskimage','.sha256':'text/plain; charset=utf-8'};
  const headers = {'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'X-Content-Type-Options':'nosniff'};
  if(file.endsWith('.dmg')) headers['Content-Disposition']='attachment; filename="Ultharness-0.3.1-arm64.dmg"';
  res.writeHead(200,headers); if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Ultharness landing page: http://127.0.0.1:${port}`));
function statSafe(file) { try { return existsSync(file) ? statSync(file) : null; } catch { return null; } }
