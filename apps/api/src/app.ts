import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { HealthResponse, ServerEnv } from '@suppliesignal/shared';
import { assertProductionAuthSafety } from '@suppliesignal/shared';
import { assertCustomerAccess, createUserResolver, requireAuth, type ResolveUser } from './auth.js';
import { createLogger } from './logger.js';
import { createSupplyChainRouter, supplyChainErrorHandler } from './routes/supply-chain.js';
import { createSourceIntelligenceRouter } from './routes/source-intelligence.js';
import { createNewsRadarRouter } from './routes/news-radar.js';
import { createExtractionRouter } from './routes/extraction.js';
import { createPocEvaluationRouter } from './routes/poc-evaluation.js';
import { createEventRouter } from './routes/events.js';
import { createCustomerExposureRouter } from './routes/customer-exposure.js';

type AppOptions = {
  env: ServerEnv;
  resolveUser?: ResolveUser;
};

export function createApp({ env, resolveUser = createUserResolver(env) }: AppOptions): Express {
  assertProductionAuthSafety(env);
  const app = express();
  const logger = createLogger(env.LOG_LEVEL);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, origin === undefined || origin === env.WEB_ORIGIN),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (request, response) => {
        const requestId = request.headers['x-request-id']?.toString() ?? crypto.randomUUID();
        response.setHeader('x-request-id', requestId);
        return requestId;
      },
    }),
  );

  app.get('/api/health', (_request, response) => {
    const payload: HealthResponse = {
      status: 'ok',
      service: 'suppliesignal-api',
      environment: env.APP_ENV,
      timestamp: new Date().toISOString(),
    };
    response.json(payload);
  });

  app.get('/api/me', requireAuth(resolveUser), (request, response) => {
    response.json({ data: request.authUser });
  });

  app.get('/api/customers/:customerId/foundation', requireAuth(resolveUser), (request, response) => {
    const user = request.authUser;
    const customerId = request.params.customerId;
    if (typeof customerId !== 'string') {
      response.status(400).json({ error: { code: 'INVALID_CUSTOMER_ID', message: 'A customer ID is required' } });
      return;
    }
    if (!user || !assertCustomerAccess(user, customerId)) {
      response.status(403).json({ error: { code: 'CUSTOMER_ACCESS_DENIED', message: 'Customer data is isolated by account' } });
      return;
    }
    response.json({
      data: {
        customerId,
        phase: 'POC_V1',
        modules: { supplyChain: 'AVAILABLE', intelligence: 'NEWS_RADAR_AVAILABLE', dailyBrief: 'AVAILABLE', enterpriseWorkflows: 'DISABLED' },
      },
    });
  });

  app.use('/api', createSupplyChainRouter(resolveUser));
  app.use('/api', createSourceIntelligenceRouter(resolveUser));
  app.use('/api', createNewsRadarRouter(resolveUser));
  // Existing enterprise capabilities remain available to their authorized
  // callers, but are deliberately omitted from the simplified POC navigation.
  app.use('/api', createExtractionRouter(resolveUser));
  app.use('/api', createPocEvaluationRouter(resolveUser));
  app.use('/api', createEventRouter(resolveUser));
  app.use('/api', createCustomerExposureRouter(resolveUser));
  app.use(supplyChainErrorHandler);

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    request.log.error({ error }, 'Unhandled request error');
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: request.id } });
  });

  return app;
}
