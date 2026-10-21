// webcache-relay v2: reverse proxy + websocket tunneling
const http = require('http');
const https = require('https');

const UP = process.env.UPSTREAM_HOST; if (!UP) { console.error('set UPSTREAM_HOST'); process.exit(1); }
const UP_WS_HOST = process.env.UPSTREAM_WS_HOST || ''; // ex: monroe-unallayable-annalistically.ngrok-free.dev
const PORT = process.env.PORT || 3000;

function fwd(req, res) {
  const opt = { host: UP, port: 443, path: req.url, method: req.method,
    headers: Object.assign({}, req.headers, { host: UP }), timeout: 30000 };
  delete opt.headers['x-forwarded-host'];
  const r = https.request(opt, (ur) => {
    const h = Object.assign({}, ur.headers, { 'access-control-allow-origin': '*' });
    const loc = h['location'];
    if (loc && typeof loc === 'string' && loc.includes('://' + UP)) h['location'] = loc.split('://' + UP).join('');
    res.writeHead(ur.statusCode, h);
    ur.pipe(res);
  });
  r.on('error', (e) => { res.statusCode = 502; res.end('upstream error: ' + e.message); });
  req.pipe(r);
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

// websocket tunnel: wss://<relay>/ws...  ->  wss://<UP_WS_HOST>/...
srv.on('upgrade', (req, socket, head) => {
  if (!UP_WS_HOST) { socket.destroy(); return; }
  let p = req.url || '/';
  if (p === '/ws' || p === '/ws/') p = '/';
  else if (p.startsWith('/ws/')) p = p.slice(3);
  const h = Object.assign({}, req.headers, {
    host: UP_WS_HOST,
    origin: 'https://' + UP,
  });
  const r = https.request({ host: UP_WS_HOST, port: 443, path: p, method: 'GET', headers: h, timeout: 0 });
  r.end();
  r.on('upgrade', (ures, usock, uhead) => {
    let headBuf = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (const [k, v] of Object.entries(ures.headers))
      if (!/^connection$/i.test(k)) headBuf += k + ': ' + v + '\r\n';
    headBuf += 'Connection: Upgrade\r\n\r\n';
    socket.write(headBuf);
    if (uhead && uhead.length) socket.write(uhead);
    usock.pipe(socket); socket.pipe(usock);
    const bye = () => { try { usock.destroy(); } catch (e) {} try { socket.destroy(); } catch (e) {} };
    usock.on('error', bye); socket.on('error', bye); usock.on('close', bye); socket.on('close', bye);
  });
  r.on('response', (res) => {
    let b = 'HTTP/1.1 ' + res.statusCode + ' ' + (res.statusMessage || '') + '\r\n';
    for (const [k, v] of Object.entries(res.headers)) b += k + ': ' + v + '\r\n';
    socket.end(b + '\r\n');
  });
  r.on('error', () => { try { socket.destroy(); } catch (e) {} });
});

srv.listen(PORT, () => console.log('webcache-relay v2 on :' + PORT + ' -> ' + UP + ' ws->' + (UP_WS_HOST || 'off')));
