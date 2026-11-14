import { spawn } from 'node:child_process';
import os from 'node:os';

// OmniRoute loads .env from its working directory. Keep this app's client key
// out of that directory and environment so it cannot become a gateway master key.
const env = { ...process.env, OMNIROUTE_SERVER_HOST: '127.0.0.1' };
delete env.OMNIROUTE_API_KEY;
delete env.OMNIROUTE_BASE_URL;
const child = spawn('omniroute', ['serve', '--no-open', '--no-tray'], {
  cwd: os.homedir(), env, stdio: 'inherit'
});
child.once('error', err => {
  console.error(err.code === 'ENOENT' ? 'OmniRoute is not installed or is not on PATH.' : err.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('exit', code => { process.exitCode = code ?? 1; });
