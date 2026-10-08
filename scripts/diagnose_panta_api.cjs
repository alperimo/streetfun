// Unsigned API reproduction. Quotes reserve sessions; no transaction is signed,
// broadcast or registered. Live-host comparison requires --live-control.
require('@next/env').loadEnvConfig(process.cwd());
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../tests/tsconfig.json');
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const fs = require('fs'), path = require('path');
const { randomUUID, createHash } = require('crypto');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { getServerConnection, assertDevnetCluster } = require('../src/server/rpc');
const { pantaCredentials } = require('../src/server/pantaService');
const { MAINNET_GENESIS_HASH } = require('../src/lib/solanaClusters');

async function main() {
  const allowed = new Set(['--live-control']);
  if (process.argv.slice(2).some(arg => !allowed.has(arg))) throw new Error('INVALID_ARGUMENT');
  const { url, key } = pantaCredentials();
  const devnet = getServerConnection();
  await assertDevnetCluster(devnet);
  const wallet = new PublicKey(process.env.DEVNET_TEST_WALLET_ADDRESS).toBase58();
  const output = path.resolve('artifacts/panta-api-diagnostics.json');
  const report = { run: randomUUID(), checkedAt: new Date().toISOString(), signed: false,
    broadcast: false, requests: [], chainConfigurations: [], questionAccounts: [] };
  const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); };
  const hosts = [url];
  let mainnet;
  if (process.argv.includes('--live-control')) {
    hosts.push('https://live-api.panta.market/api/v1');
    const rpcUrl = process.env.HELIUS_API_KEY
      ? 'https://mainnet.helius-rpc.com/?api-key=' + process.env.HELIUS_API_KEY
      : 'https://api.mainnet-beta.solana.com';
    mainnet = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true,
      fetch: (endpoint, init) => fetch(endpoint, { ...init, signal: AbortSignal.timeout(10000) }) });
    if (await mainnet.getGenesisHash() !== MAINNET_GENESIS_HASH) throw new Error('CONTROL_CLUSTER_MISMATCH');
  }
  async function request(host, route, payload) {
    const response = await fetch(host + route, { method: payload ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}) });
    if (!response.body) throw new Error('EMPTY_RESPONSE');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 65536) { await reader.cancel(); throw new Error('RESPONSE_TOO_LARGE'); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8').replaceAll(key, '[redacted]'));
    const recorded = route === '/whoami/' ? { status: body.status, canCreateMarkets: body.canCreateMarkets,
      accountFingerprint: body.userId ? createHash('sha256').update(body.userId).digest('hex') : null } : body;
    const entry = { checkedAt: new Date().toISOString(), host, route, payload, httpStatus: response.status,
      requestId: response.headers.get('x-request-id'), response: recorded };
    report.requests.push(entry); save();
    console.log(JSON.stringify({ host: new URL(host).host, route, httpStatus: response.status, code: body.code,
      createId: body.createId, canCreateMarkets: body.canCreateMarkets }));
    return { entry, body, ok: response.ok };
  }
  for (const [network, rpc] of [['devnet', devnet], ...(mainnet ? [['mainnet-beta', mainnet]] : [])]) {
    for (const id of ['6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp', '4CQ4LWv7194V3Qe3iEYZq33cFPQbmKU3e1xVQkpTegLU']) {
      const program = new PublicKey(id), config = PublicKey.findProgramAddressSync([Buffer.from('market_config')], program)[0];
      const info = await rpc.getAccountInfo(config, 'confirmed');
      report.chainConfigurations.push({ network, program: id, config: config.toBase58(), exists: !!info,
        owner: info?.owner.toBase58(), bytes: info?.data.length,
        mint: info && info.data.length >= 276 ? new PublicKey(info.data.subarray(244, 276)).toBase58() : null });
    }
  }
  for (const host of hosts) await request(host, '/whoami/');
  await request(url, '/markets/create/quote/', { wallet }); // Validation control.
  const now = Math.floor(Date.now() / 1000);
  for (const marketType of ['standard', 'breaking']) {
    const payload = { wallet, question: `Panta API isolation ${report.run} ${marketType}: ETH above 5000?`,
      resolutionRule: 'CoinGecko daily close UTC >= 5000', sourcesOfTruth: ['https://www.coingecko.com'], category: 'crypto',
      imageUrl: 'https://raw.githubusercontent.com/Kaito-HQ/panta-api-playground/main/public/sample-market-1024.png',
      marketType, startTime: marketType === 'standard' ? now + 7200 : now - 60,
      endTime: now + 7 * 86400, resolutionTime: now + 7 * 86400 + 3600,
      ...(marketType === 'breaking' ? { eventInProgress: true } : {}) };
    const questionHash = createHash('sha256').update(payload.question, 'utf8').digest();
    const events = report.chainConfigurations.filter(item => item.network === 'devnet').map(item => ({
      program: item.program,
      event: PublicKey.findProgramAddressSync([Buffer.from('event_usdc'), new PublicKey(wallet).toBuffer(), questionHash], new PublicKey(item.program))[0],
    }));
    const accounts = await devnet.getMultipleAccountsInfo(events.map(item => item.event), 'confirmed');
    report.questionAccounts.push({ question: payload.question, checkedAt: new Date().toISOString(),
      devnet: events.map((item, index) => ({ program: item.program, event: item.event.toBase58(), exists: !!accounts[index] })) });
    save();
    for (const host of hosts) {
      const quote = await request(host, '/markets/create/quote/', payload);
      if (!quote.ok || !quote.body.createId) continue;
      const built = await request(host, '/markets/create/build/', { createId: quote.body.createId, wallet });
      if (!built.ok || !built.body.transaction) continue;
      const tx = VersionedTransaction.deserialize(Buffer.from(built.body.transaction, 'base64'));
      const valid = await Promise.all([devnet.isBlockhashValid(tx.message.recentBlockhash),
        ...(mainnet ? [mainnet.isBlockhashValid(tx.message.recentBlockhash)] : [])]);
      built.entry.transactionNetwork = { checkedAt: new Date().toISOString(), bytes: tx.serialize().length,
        blockhashValidDevnet: valid[0].value, blockhashValidMainnet: valid[1]?.value,
        programs: [...new Set(tx.message.compiledInstructions.map(ix => tx.message.staticAccountKeys[ix.programIdIndex].toBase58()))],
        includesMainnetUsdc: tx.message.staticAccountKeys.some(k => k.toBase58() === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') };
      save();
    }
  }
  report.completedAt = new Date().toISOString(); save();
  console.log('Saved ' + output);
}
main().catch(() => { console.error('PANTA_DIAGNOSTIC_FAILED'); process.exitCode = 1; });
