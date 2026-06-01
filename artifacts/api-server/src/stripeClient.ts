import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  // Fallback: use STRIPE_SECRET_KEY env var directly (for production deployments
  // where the Replit Stripe connector only provides a sandbox/development connection)
  let envSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  // Fix accidental double-prefix (e.g. sk_live_sk_live_...)
  if (envSecretKey) {
    const doublePrefix = envSecretKey.match(/^(sk_live_|sk_test_)(sk_live_|sk_test_)/);
    if (doublePrefix) envSecretKey = envSecretKey.slice(doublePrefix[1].length);
  }
  const envPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (envSecretKey?.startsWith('sk_')) {
    return {
      publishableKey: envPublishableKey ?? '',
      secretKey: envSecretKey,
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const connectorName = 'stripe';
  // Always try development connection first — the Replit Stripe connector only
  // provides sandbox connections, so we never request 'production' from it.
  // Live keys come from the STRIPE_SECRET_KEY env var above.
  const targetEnvironment = 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Replit-Token': xReplitToken
    }
  });

  const data = await response.json() as { items?: { settings: { publishable: string; secret: string } }[] };
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

// WARNING: Never cache this client. Always call fresh.
export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as any });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

export async function getStripeSync() {
  const { StripeSync } = await import('stripe-replit-sync');
  const secretKey = await getStripeSecretKey();
  return new StripeSync({
    poolConfig: { connectionString: process.env.DATABASE_URL!, max: 2 },
    stripeSecretKey: secretKey,
  });
}
