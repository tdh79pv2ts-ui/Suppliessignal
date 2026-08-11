import pino from 'pino';

export function createLogger(level = 'info') {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', '*.password', '*.token', '*.secret'],
      censor: '[REDACTED]',
    },
  });
}
