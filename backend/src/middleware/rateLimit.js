const buckets = new Map();
let requestCount = 0;

const sweepExpiredBuckets = (now) => {
  requestCount += 1;
  if (requestCount % 100 !== 0) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

const createRateLimit = ({ windowMs, max, keyGenerator, message }) =>
  (req, res, next) => {
    const now = Date.now();
    sweepExpiredBuckets(now);
    const key = keyGenerator ? keyGenerator(req) : req.ip;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    bucket.count += 1;
    buckets.set(key, bucket);

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.set("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }

    return next();
  };

module.exports = { createRateLimit };
