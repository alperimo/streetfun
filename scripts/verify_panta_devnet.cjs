// Explicit Devnet transaction verification. Never switches clusters or fabricates receipts.
require('@next/env').loadEnvConfig(process.cwd());
process.env.TS_NODE_PROJECT = require('path').resolve(__dirname, '../tests/tsconfig.json');
require('ts-node/register/transpile-only'); require('tsconfig-paths/register');
const fs = require('fs'), path = require('path');
const { Keypair, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, getAccount } = require('@solana/spl-token');
const bs58 = require('bs58').default;
const { getServerConnection, assertDevnetCluster } = require('../src/server/rpc');
const { getDbcLaunchPda } = require('../src/sdk/pda');
const { PROGRAM_ID, USDC_MINT } = require('../src/sdk/constants');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const origin = 'http://127.0.0.1:3000';
const output = path.resolve('artifacts/panta-completion-2026-10-08');
fs.mkdirSync(output, { recursive: true });
const reportPath = path.join(output, 'transactions.json');
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : { network: 'devnet', transactions: [] };
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const nativeFetch = global.fetch;
global.fetch = (url, init) => nativeFetch(typeof url === 'string' && url.startsWith('/') ? new URL(url, origin) : url, init);
async function api(url, body) {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data;
}
async function main() {
  const rpc = getServerConnection(); await assertDevnetCluster(rpc);
  const keyPath = process.env.DEVNET_TEST_WALLET_KEYPAIR_PATH;
  if (!keyPath) throw new Error('Set DEVNET_TEST_WALLET_KEYPAIR_PATH to the intended creator wallet.');
  const signer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8'))));
  if (process.env.DEVNET_TEST_WALLET_ADDRESS !== signer.publicKey.toBase58()) throw new Error('Creator wallet address does not match its configured keypair.');
  if (report.creator && report.creator !== signer.publicKey.toBase58()) throw new Error('Saved token belongs to a different creator.');
  report.creator = signer.publicKey.toBase58();
  const wallet = { publicKey: signer.publicKey, async sendTransaction(tx, connection) {
    if (!tx.message) tx.partialSign(signer); else tx.sign([signer]);
    const signature = bs58.encode(tx.message ? tx.signatures[0] : tx.signature);
    report.transactions.push({ signature, status: 'signed', kind: process.argv[2], recordedAt: new Date().toISOString() }); save();
    const sent = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2, preflightCommitment: 'confirmed' });
    if (sent !== signature) throw new Error('Unexpected transaction signature.');
    const result = await connection.confirmTransaction(signature, 'confirmed');
    const record = report.transactions.find(t => t.signature === signature); record.status = result.value.err ? 'failed' : 'confirmed'; save();
    if (result.value.err) throw new Error('Transaction rejected on chain.');
    console.log('Confirmed',signature); return signature;
  }};
  if (process.argv[2] === 'launch') {
    if (report.mint) throw new Error('A test token already exists in the report. Verify it instead of launching again.');
    const meme = Keypair.generate();
    const metadata = { name: 'Panta Lifecycle Test', symbol: 'PANTEST', targetEquitySymbol: 'T-OpenAI',
      description: 'Real Devnet lifecycle verification. Test collateral has no real-world equity value.', avatarUrl: '' };
    const prepared = await api('/api/launch/prepare', { ...metadata, caller: wallet.publicKey.toBase58(), mint: meme.publicKey.toBase58() });
    const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
    if (!tx.feePayer.equals(wallet.publicKey) || !tx.signatures.some(s => s.publicKey.equals(meme.publicKey))) throw new Error('Launch signer mismatch.');
    tx.partialSign(meme);
    report.mint = meme.publicKey.toBase58(); report.metadata = metadata; report.pool = prepared.pool; save();
    report.launchSignature = await wallet.sendTransaction(tx, rpc); save();
    report.launch = await api('/api/launch/confirm', { ...metadata, mint: report.mint, signature: report.launchSignature }); save();
    console.log('Created token',report.mint,'creator',report.creator);
  } else if (process.argv[2] === 'buy') {
    if (!report.mint) throw new Error('Launch a token first.');
    const amount = process.argv[3]; if (!/^(?:[1-9]\d?|100)(?:\.\d{1,6})?$/.test(amount || '') || Number(amount)>100) throw new Error('Verification buys must be 1–100 test USDC.');
    const ata = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
    const account = await getAccount(rpc, ata).catch(()=>null);
    if (!account || account.amount < BigInt(Math.round(Number(amount)*1e6))) throw new Error(`Fund ${wallet.publicKey.toBase58()} with test USDC mint ${USDC_MINT.toBase58()} before trading.`);
    const prepared = await api('/api/trade/quote', { mint: report.mint, direction: 'buy', amount, slippageBps: 100, trader: wallet.publicKey.toBase58() });
    const tx = Transaction.from(Buffer.from(prepared.transaction,'base64'));
    if (!tx.feePayer.equals(wallet.publicKey)) throw new Error('Buy signer mismatch.');
    const signature = await wallet.sendTransaction(tx,rpc);
    report.buys ??= []; report.buys.push(await api('/api/trades/confirm',{ mint: report.mint, signature, protocol:'meteora-dbc' })); save();
  } else if (process.argv[2] === 'graduate') {
    if (!report.mint) throw new Error('Launch a token first.');
    const program = new Program({...require('../src/idl/streetfun.json'),address:PROGRAM_ID.toBase58()},new AnchorProvider(rpc,new Wallet(signer),{commitment:'confirmed'}));
    const state = await program.account.dbcLaunchAccount.fetch(getDbcLaunchPda(new PublicKey(report.mint))[0]);
    if (!state.creator.equals(wallet.publicKey)) throw new Error('Only the verified token creator may run this test.');
    // Reuse the server RPC in this CLI; never put its credential in NEXT_PUBLIC_* or a browser.
    require('../src/sdk/network').getBrowserRpcUrl = () => rpc.rpcEndpoint;
    const { graduateToken } = require('../src/services/solana/solanaGraduationService');
    report.graduation = await graduateToken(report.mint,wallet,100,'meteora-dbc'); save();
    report.graduationIndex = await api('/api/trades/confirm',{ mint:report.mint, signature:report.graduation.signature, protocol:'meteora-dbc',purpose:'graduation' }); save();
  } else if (process.argv[2] !== 'inspect') throw new Error('Usage: node scripts/verify_panta_devnet.cjs launch | buy <test USDC> | graduate | inspect');
  if (report.mint) {
    report.market = await api('/api/panta/market?mint='+report.mint).catch(e=>({error:e.message}));
    report.lastCheckedAt=new Date().toISOString(); save();
    console.log('Market',JSON.stringify(report.market));
  }
}
main().catch(error=>{ console.error(error.message.replace(/api-key=[^\s"']+/g,'api-key=[redacted]'));process.exitCode=1; });
