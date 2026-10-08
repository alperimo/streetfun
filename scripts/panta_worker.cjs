require('@next/env').loadEnvConfig(process.cwd());
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../tests/tsconfig.json');
require('ts-node/register/transpile-only'); require('tsconfig-paths/register');
const { runLifecycleWorker } = require('../src/server/pantaLifecycle');
const { PantaError } = require('../src/server/pantaValidation');
const once = process.argv.includes('--once');
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
(async () => {
  do {
    try {
      const result = await runLifecycleWorker();
      if (once || result.examined) console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    } catch (error) {
      // Logs never include upstream bodies, credentials or RPC URLs.
      console.error(error instanceof PantaError ? `${error.code}: ${error.message}` : 'Panta worker unavailable.');
      if (once) process.exitCode = 1;
    }
    if (!once && !stopped) await new Promise(resolve => setTimeout(resolve, 20_000));
  } while (!once && !stopped);
})().catch(() => { console.error('Panta worker unavailable.'); process.exitCode = 1; });
