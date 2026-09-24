export function normalizeHandle(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new Error("Invalid handle.");
  const handle = value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("Invalid X handle.");
  return handle;
}
export function alphaClaimMessage(wallet: string, handle: string, nonce: string, issuedAt: string): string {
  return `streetfun.xyz wants you to sign in with your Solana account:\n${wallet}\n\nI accept the StreetFun Terms of Service and claim my StreetFun Alpha Pass.\nX Handle: ${handle || "none"}\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}
export function validAlphaClaim(message: unknown, wallet: string, handle: string, now = Date.now()): boolean {
  if (typeof message !== "string" || message.length > 1024) return false;
  const match = message.match(/\nNonce: ([A-Za-z0-9-]{16,64})\nIssued At: ([^\n]+)$/);
  if (!match) return false;
  const age = now - Date.parse(match[2]);
  return Number.isFinite(age) && age >= -30_000 && age < 300_000 && message === alphaClaimMessage(wallet, handle, match[1], match[2]);
}
