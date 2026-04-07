/**
 * Seed Poultry Mate subscription plans into Stripe.
 * Run: pnpm --filter @workspace/scripts exec tsx src/seed-poultry-mate-plans.ts
 *
 * Plans (AUD):
 *   Bronze — $9.90/mo, $99/yr
 *   Silver — $19.90/mo, $199/yr
 *   Gold   — $39.90/mo, $399/yr
 *
 * Fund split stored in product metadata:
 *   50% infrastructure/AI, 30% developer, 20% charity (subscriber-chosen)
 */

import { getUncachableStripeClient } from './stripeClient';

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

async function seed() {
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
      console.log(`Created product: ${plan.name} (${product.id})`);
    }

    // Check/create monthly price
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
    }

    if (!hasYearly) {
      const p = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.yearlyAud,
        currency: 'aud',
        recurring: { interval: 'year' },
        metadata: { billing: 'yearly' },
      });
      console.log(`  → Yearly price:  $${(plan.yearlyAud / 100).toFixed(2)}/yr (${p.id})`);
    }
  }

  console.log('\n✅ Done! Webhooks will sync everything to the database.');
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
