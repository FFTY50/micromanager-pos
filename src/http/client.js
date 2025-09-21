const http = require('node:http');
const https = require('node:https');

function normalizeBody(body) {
  if (body === undefined || body === null) return { payload: null, length: 0, isJson: false };
  if (Buffer.isBuffer(body)) return { payload: body, length: body.length, isJson: false };
  if (typeof body === 'string') {
    return { payload: Buffer.from(body), length: Buffer.byteLength(body), isJson: false };
  }
  const str = JSON.stringify(body);
  return { payload: Buffer.from(str), length: Buffer.byteLength(str), isJson: true };
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const target = new URL(url);
      const method = options.method || 'GET';
      const headers = { ...(options.headers || {}) };
      const { payload, length, isJson } = normalizeBody(options.body);
      if (payload) {
        if (isJson && !headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
        headers['content-length'] = length;
      }
      const lib = target.protocol === 'https:' ? https : http;
      const req = lib.request({
        method,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers,
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const bodyBuf = Buffer.concat(chunks);
          const bodyText = bodyBuf.toString('utf8');
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) {
            const error = new Error(`HTTP ${status}`);
            error.status = status;
            error.body = bodyText;
            error.headers = res.headers;
            reject(error);
            return;
          }
          resolve({
            status,
            headers: res.headers,
            body: bodyText,
          });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function postJson(url, body, headers = {}) {
  return requestJson(url, { method: 'POST', body, headers });
}

module.exports = { postJson, requestJson };
