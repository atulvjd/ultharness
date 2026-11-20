import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync, realpathSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2' };
export async function createPreview(projectRoot) {
  const root = realpathSync(projectRoot);
  const output = () => ['dist','build','out',''].map(p=>path.join(root,p)).find(p=>existsSync(path.join(p,'index.html')));
  function inside(file) { const actual=realpathSync(file); return (actual === root || actual.startsWith(root+path.sep)) && actual; }
  function revision(dir) {
    const hash=createHash('sha256'); let count=0;
    function walk(folder,depth=0) { if(depth>4)return; for(const item of readdirSync(folder,{withFileTypes:true})) { if(++count>1500)return; if(item.name.startsWith('.')||item.name==='node_modules'||item.isSymbolicLink())continue;const file=path.join(folder,item.name);if(item.isDirectory())walk(file,depth+1);else if(types[path.extname(file)]){const stat=statSync(file);hash.update(file+stat.mtimeMs+stat.size);} } }
    if(dir&&inside(dir))walk(dir); return hash.digest('hex');
  }
  const server=http.createServer((req,res)=>{
    try {
      if(!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||'')){res.writeHead(403);return res.end();}
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
      const base=`http://${req.headers.host}`;
      res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
      // The iframe has an opaque origin; only its local assets may make CORS requests.
      if(req.headers.origin==='null')res.setHeader('Access-Control-Allow-Origin','null');
      res.setHeader('Content-Security-Policy',`sandbox allow-scripts; default-src ${base} data: blob:; script-src ${base} 'unsafe-inline'; style-src ${base} 'unsafe-inline'; connect-src ${base}; frame-src 'none'; form-action 'none'; base-uri 'none'`);
      const pathname=decodeURIComponent(new URL(req.url,base).pathname),dir=output();
      if(pathname==='/__revision'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({revision:revision(dir),available:!!dir}));}
      if(!dir){res.setHeader('Content-Type','text/html');return res.end('<body style="background:#151a12;color:#d5edb0;font:16px system-ui;padding:40px">Waiting for a static index.html or a build in dist, build, or out.<script>setTimeout(()=>location.reload(),2000)</script>');}
      if(pathname.split('/').some(p=>p.startsWith('.')||p==='node_modules')){res.writeHead(403);return res.end();}
      let file=path.resolve(dir,'.'+pathname);
      if(!file.startsWith(dir+path.sep)&&file!==dir){res.writeHead(403);return res.end();}
      if(existsSync(file)&&statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!existsSync(file)||!inside(file)||!statSync(file).isFile()||!types[path.extname(file)]||statSync(file).size>12_000_000){res.writeHead(404);return res.end('Preview asset unavailable');}
      res.setHeader('Content-Type',types[path.extname(file)]+'; charset=utf-8');
      let body=readFileSync(file);
      if(path.extname(file)==='.html')body=Buffer.from(body.toString()+`<script>let r=${JSON.stringify(revision(dir))};setInterval(async()=>{try{let v=await(await fetch('/__revision')).json();if(r&&r!==v.revision)location.reload();r=v.revision}catch{}},2000)</script>`);
      res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404);res.end('Preview unavailable');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
