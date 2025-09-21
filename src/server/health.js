const http = require('node:http');

function startHealthServer({ queue, metrics, version, port = 3000, host = '0.0.0.0' }, logger = console) {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      const payload = JSON.stringify({ status: 'ok', queue_depth: queue?.depth?.() || 0, version });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
      return;
    }

    if (req.url === '/metrics') {
      if (!metrics) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('metrics disabled');
        return;
      }
      if (queue?.depth) {
        metrics.setGauge('micromanager_queue_depth', queue.depth());
      }
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      res.end(`${metrics.toPrometheus()}\n`);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  server.listen(port, host, () => {
    logger.info?.(`health server listening on http://${host}:${port}`);
  });

  return server;
}

module.exports = { startHealthServer };
