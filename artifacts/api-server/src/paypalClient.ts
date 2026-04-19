import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const PAYPAL_API = () =>
  process.env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('PayPal credentials not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to your secrets.');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${PAYPAL_API()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as any;
  if (!data.access_token) throw new Error(`PayPal auth failed: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

export async function ensurePlansTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paypal_plans (
      key TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

const PLAN_DEFS = [
  { tier: 'bronze',   interval: 'month', amount: '30.00',   name: 'Poultry Mate Bronze — Monthly' },
  { tier: 'bronze',   interval: 'year',  amount: '216.00',  name: 'Poultry Mate Bronze — Yearly' },
  { tier: 'silver',   interval: 'month', amount: '60.00',   name: 'Poultry Mate Silver — Monthly' },
  { tier: 'silver',   interval: 'year',  amount: '540.00',  name: 'Poultry Mate Silver — Yearly' },
  { tier: 'gold',     interval: 'month', amount: '100.00',  name: 'Poultry Mate Gold — Monthly' },
  { tier: 'gold',     interval: 'year',  amount: '1080.00', name: 'Poultry Mate Gold — Yearly' },
  { tier: 'platinum', interval: 'month', amount: '150.00',  name: 'Poultry Mate Platinum — Monthly' },
  { tier: 'platinum', interval: 'year',  amount: '1620.00', name: 'Poultry Mate Platinum — Yearly' },
];

async function getOrCreatePlanId(tier: string, interval: string, amount: string, name: string): Promise<string> {
  const key = `${tier}_${interval}`;

  const existing = await db.execute(sql`SELECT plan_id FROM paypal_plans WHERE key = ${key}`);
  if ((existing.rows as any[]).length > 0) return (existing.rows[0] as any).plan_id;

  const token = await getAccessToken();

  const productRes = await fetch(`${PAYPAL_API()}/v1/catalogs/products`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Poultry Mate', type: 'SERVICE', category: 'SOFTWARE' }),
  });
  const product = await productRes.json() as any;
  if (!product.id) throw new Error(`Failed to create PayPal product: ${JSON.stringify(product)}`);

  const planRes = await fetch(`${PAYPAL_API()}/v1/billing/plans`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: product.id,
      name,
      status: 'ACTIVE',
      billing_cycles: [{
        frequency: { interval_unit: interval === 'year' ? 'YEAR' : 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: amount, currency_code: 'AUD' } },
      }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
    }),
  });
  const plan = await planRes.json() as any;
  if (!plan.id) throw new Error(`Failed to create PayPal plan: ${JSON.stringify(plan)}`);

  await db.execute(sql`
    INSERT INTO paypal_plans (key, plan_id) VALUES (${key}, ${plan.id})
    ON CONFLICT (key) DO UPDATE SET plan_id = EXCLUDED.plan_id
  `);

  return plan.id;
}

export async function createSubscription(
  tier: string,
  interval: string,
  email: string,
  charityId: string,
  returnUrl: string,
  cancelUrl: string,
) {
  const planDef = PLAN_DEFS.find(p => p.tier === tier && p.interval === interval);
  if (!planDef) throw new Error('Invalid plan tier or interval');

  const planId = await getOrCreatePlanId(planDef.tier, planDef.interval, planDef.amount, planDef.name);
  const token = await getAccessToken();

  const res = await fetch(`${PAYPAL_API()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      subscriber: { email_address: email },
      custom_id: charityId,
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: 'Poultry Mate',
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  });
  const subscription = await res.json() as any;
  const approveLink = (subscription.links ?? []).find((l: any) => l.rel === 'approve')?.href;
  if (!approveLink) throw new Error(subscription.message ?? `Failed to create subscription: ${JSON.stringify(subscription)}`);
  return { url: approveLink, subscriptionId: subscription.id };
}

export async function createOrder(
  amount: number,
  description: string,
  returnUrl: string,
  cancelUrl: string,
) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        description,
        amount: { currency_code: 'AUD', value: amount.toFixed(2) },
      }],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: 'Poultry Mate',
        user_action: 'PAY_NOW',
      },
    }),
  });
  const order = await res.json() as any;
  const approveLink = (order.links ?? []).find((l: any) => l.rel === 'payer-action')?.href;
  if (!approveLink) throw new Error(order.message ?? `Failed to create order: ${JSON.stringify(order)}`);
  return { url: approveLink, orderId: order.id };
}

export async function captureOrder(orderId: string) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': '0' },
  });
  return res.json();
}

export function getClientId() {
  return process.env.PAYPAL_CLIENT_ID ?? '';
}
