/**
 * Full payment setup script.
 * 1. Seeds Bronze / Silver / Gold plans into Stripe
 * 2. Registers the webhook endpoint with Stripe (dev + prod)
 * 3. Backfills all Stripe data into the local database
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/setup-payments.ts
 */

import { getUncachableStripeClient, getStripeSync } from './stripeClient';
import { runMigrations } from 'stripe-replit-sync';

const PLANS = [
  {
    name: 'Bronze Plan',
    description: 'Perfect for small farms — Silo Tracker + Feed Mate for up to 2 sheds.',
    monthlyAud: 990,
    yearlyAud: 9900,
    sortOrder: '1',
    tier: 'bronze',
  },
  {
    name: 'Silver Plan',
    description: 'Growing operations — unlimited sheds, batch history, export & alerts.',
    monthlyAud: 1990,
    yearlyAud: 19900,
    sortOrder: '2',
    tier: 'silver',
  },
  {
    name: 'Gold Plan',
    description: 'Enterprise farms — everything in Silver plus priority support & integrations.',
    monthlyAud: 3990,
    yearlyAud: 39900,
    sortOrder: '3',
    tier: 'gold',
  },
];

async function seedPlans() {
  console.log('\n── Step 1: Seed Stripe products & prices ──');
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    let product: any;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`✓ Already exists: ${plan.name} (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: {
          tier: plan.tier,
          sort_order: plan.sortOrder,
          fund_split: JSON.stringify({ infrastructure: 50, developer: 30, charity: 20 }),
        },
      });
      console.log(`✓ Created product: ${plan.name} (${product.id})`);
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    const hasMonthly = prices.data.some(p => p.recurring?.interval === 'month');
    const hasYearly  = prices.data.some(p => p.recurring?.interval === 'year');

    if (!hasMonthly) {
      const p = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthlyAud,
        currency: 'aud',
        recurring: { interval: 'month' },
        metadata: { billing: 'monthly' },
      });
      console.log(`  → Monthly price: $${(plan.monthlyAud / 100).toFixed(2)}/mo (${p.id})`);
    } else {
      console.log(`  → Monthly price already exists`);
    }

    if (!hasYearly) {
      const p = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.yearlyAud,
        currency: 'aud',
        recurring: { interval: 'year' },
        metadata: { billing: 'yearly' },
      });
      console.log(`  → Yearly price: $${(plan.yearlyAud / 100).toFixed(2)}/yr (${p.id})`);
    } else {
      console.log(`  → Yearly price already exists`);
    }
  }
}

async function registerWebhook() {
  console.log('\n── Step 2: Register webhook endpoint ──');
  const sync = await getStripeSync();

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  const prodDomains = process.env.REPLIT_DOMAINS?.split(',').map(d => d.trim()).filter(Boolean) ?? [];

  const urls: string[] = [];
  if (devDomain) urls.push(`https://${devDomain}/api/stripe/webhook`);
  for (const d of prodDomains) {
    const url = `https://${d}/api/stripe/webhook`;
    if (!urls.includes(url)) urls.push(url);
  }

  for (const url of urls) {
    try {
      const wh = await sync.findOrCreateManagedWebhook(url, {
        enabled_events: ['*'],
        description: 'Poultry Mate — Stripe sync',
      });
      console.log(`✓ Webhook registered: ${url} (${wh.id})`);
    } catch (err: any) {
      console.warn(`⚠ Could not register webhook for ${url}: ${err.message}`);
    }
  }
}

async function backfill() {
  console.log('\n── Step 3: Backfill Stripe data into database ──');
  const sync = await getStripeSync();

  const objects = ['product', 'price', 'customer', 'subscription'] as const;
  for (const obj of objects) {
    console.log(`  Syncing ${obj}s…`);
    await sync.syncBackfill({ object: obj });
    console.log(`  ✓ ${obj}s synced`);
  }
}

async function initSchema() {
  console.log('\n── Step 0: Initialize Stripe database schema ──');
  await runMigrations({ databaseUrl: process.env.DATABASE_URL! });
  console.log('✓ Database schema ready');
}

async function main() {
  try {
    await initSchema();
    await seedPlans();
    await registerWebhook();
    await backfill();
    console.log('\n✅ Payment setup complete! Your plans page is ready.');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Setup failed:', err.message);
    process.exit(1);
  }
}

main();
