import path from 'node:path';
import { createApp } from '../server.mjs';

if (!process.env.ULTHARNESS_DATA || !process.env.ULTHARNESS_ROOT) {
  throw new Error('The desktop launcher must supply the workspace and data directories.');
}
const app = createApp({ dataDir: path.resolve(process.env.ULTHARNESS_DATA), root: path.resolve(process.env.ULTHARNESS_ROOT) });
app.server.once('error', error => { console.error(error.message); process.exit(1); });
app.server.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'ultharness-ready', port: app.server.address().port }));
});
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  await app.close();
  // Allow the runner's escalation timer to kill any process that ignored SIGTERM.
  await new Promise(resolve => setTimeout(resolve, 2200));
  process.exit(0);
});
