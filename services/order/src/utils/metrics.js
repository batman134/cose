import client from 'prom-client';

// Default registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// HTTP metrics
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);

export function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route && req.route.path ? req.route.path : req.path;
    const status = res.statusCode;
    httpRequestsTotal.inc({ method: req.method, route, status });
    end({ method: req.method, route, status });
  });
  next();
}

export async function metricsHandler(req, res) {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
}

export default { register, metricsMiddleware, metricsHandler };
