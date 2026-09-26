export interface LaunchMetadata {
  avatarUrl: string;
  description: string;
}

export function normalizeLaunchMetadata(value: { avatarUrl?: unknown; description?: unknown }): LaunchMetadata {
  const avatarUrl = value.avatarUrl == null ? "" : value.avatarUrl;
  const description = value.description == null ? "" : value.description;
  if (typeof avatarUrl !== "string" || typeof description !== "string" || avatarUrl.length > 2048 || description.length > 2000) {
    throw new Error("Invalid token image or description.");
  }
  if (avatarUrl && new URL(avatarUrl).protocol !== "https:") throw new Error("The token image URL must use HTTPS.");
  return { avatarUrl: avatarUrl.trim(), description: description.trim() };
}

/** The immutable DBC URI commits the creator's transaction to these exact values. */
export async function launchMetadataDigest(value: LaunchMetadata): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([1, value.avatarUrl, value.description]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
