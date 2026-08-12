import 'dotenv/config';
import { resolveServerPort, serverEnvSchema } from '@suppliesignal/shared';
import { createApp } from './app.js';

const env = serverEnvSchema.parse(process.env);
const app = createApp({ env });
const port = resolveServerPort(env);

app.listen(port, '0.0.0.0', () => {
  console.info(
    JSON.stringify({
      operation: 'server_start',
      status: 'ok',
      environment: env.APP_ENV,
      port,
    }),
  );
});
