import 'dotenv/config';
import { serverEnvSchema } from '@suppliesignal/shared';
import { createApp } from './app.js';

const env = serverEnvSchema.parse(process.env);
const app = createApp({ env });

app.listen(env.API_PORT, () => {
  console.info(JSON.stringify({ operation: 'server_start', status: 'ok', port: env.API_PORT }));
});
