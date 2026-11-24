import "server-only";

/**
 * Typed, lazily-read server environment.
 *
 * Values are read on access (not at import time) so `next build` works with
 * missing or dummy values; anything required throws only when it is used.
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get appUrl() {
    return read("NEXT_PUBLIC_APP_URL") ?? read("BETTER_AUTH_URL") ?? "http://localhost:3000";
  },
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get googleClientId() {
    return read("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return read("GOOGLE_CLIENT_SECRET");
  },
  get googleEnabled() {
    return !!(read("GOOGLE_CLIENT_ID") && read("GOOGLE_CLIENT_SECRET"));
  },
  get stripeSecretKey() {
    return read("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return read("STRIPE_WEBHOOK_SECRET");
  },
  read,
};
