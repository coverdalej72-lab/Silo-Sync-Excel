/**
 * Update Stripe prices to match the plans page.
 * - Archives all old prices for Bronze, Silver, Gold
 * - Creates correct prices for Bronze, Silver, Gold, Platinum
 * - Adds Platinum product if it doesn't exist
 * - Backfills the database
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/update-prices.ts
 */

import { getUncachableStripeClient, getStripeSync } from './stripeClient';

const PLANS = [
  {
    name: 'Bronze Plan',
    tier: 'bronze',
    sortOrder: '1',
    description: 'Perfect for solo growers just getting started.',
    monthlyAud: 3000,
    yearlyAud: 21600,
  },
  {
    name: 'Silver Plan',
    tier: 'silver',
    sortOrder: '2',
    description: 'Full batch management for active farms.',
    monthlyAud: 6000,
    yearlyAud: 54000,
  },
  {
    name: 'Gold Plan',
    tier: 'gold',
    sortOrder: '3',
    description: 'For large operations and integrators.',
    monthlyAud: 15000,
    yearlyAud: 162000,
  },
  {
    name: 'Platinum Plan',
    tier: 'platinum',
    sortOrder: '4',
    description: 'Complete lifecycle management for breeder & parent stock farms.',
    monthlyAud: 25000,
    yearlyAud: 270000,
  },
];

async function run() {
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    console.log(`\n── ${plan.name} ──`);

    // Find or create product
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    let product: any;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`✓ Product exists: ${product.id}`);
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
      console.log(`✓ Product created: ${product.id}`);
    }

    // Archive all existing prices for this product
    const existingPrices = await stripe.prices.list({ product: product.id, active: true });
    for (const price of existingPrices.data) {
      await stripe.prices.update(price.id, { active: false });
      console.log(`  Archived old price: ${price.id}`);
    }

    // Create correct monthly price
    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyAud,
      currency: 'aud',
      recurring: { interval: 'month' },
      metadata: { billing: 'monthly' },
    });
    console.log(`  ✓ Monthly: $${(plan.monthlyAud / 100).toFixed(2)}/mo (${monthly.id})`);

    // Create correct yearly price
    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.yearlyAud,
      currency: 'aud',
      recurring: { interval: 'year' },
      metadata: { billing: 'yearly' },
    });
    console.log(`  ✓ Yearly:  $${(plan.yearlyAud / 100).toFixed(2)}/yr (${yearly.id})`);
  }

  // Backfill DB
  console.log('\n── Syncing to database ──');
  const sync = await getStripeSync();
  for (const obj of ['product', 'price'] as const) {
    console.log(`  Syncing ${obj}s…`);
    await sync.syncBackfill({ object: obj });
    console.log(`  ✓ Done`);
  }

  console.log('\n✅ All prices updated and synced!');
}

run().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
