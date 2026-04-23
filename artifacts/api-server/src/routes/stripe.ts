import { Router, type IRouter } from 'express';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';

const router: IRouter = Router();

// 3 charities subscribers can choose from
const CHARITIES = [
  { id: 'rural-aid',    name: 'Rural Aid Australia',           url: 'https://www.ruralaid.org.au' },
  { id: 'beyond-blue',  name: 'Beyond Blue',                   url: 'https://www.beyondblue.org.au' },
  { id: 'wires',        name: 'WIRES Wildlife Rescue',         url: 'https://www.wires.org.au' },
];

router.get('/stripe/charities', (_req, res) => {
  res.json({ data: CHARITIES });
});

router.get('/stripe/publishable-key', async (_req, res) => {
  try {
    const key = await getStripePublishableKey();
    res.json({ publishableKey: key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List active plans (products + prices from stripe schema)
router.get('/stripe/plans', async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active as price_active,
        pr.metadata as price_metadata
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY p.metadata->>'sort_order', pr.unit_amount
    `);

    const productsMap = new Map<string, any>();
    for (const row of result.rows as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata || {},
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          metadata: row.price_metadata || {},
        });
      }
    }

    res.json({ data: Array.from(productsMap.values()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create checkout session
// Body: { priceId, email, charityId, successUrl, cancelUrl }
router.post('/stripe/checkout', async (req, res) => {
  try {
    const { priceId, email, charityId, successUrl, cancelUrl } = req.body;

    if (!priceId || !email) {
      return res.status(400).json({ error: 'priceId and email are required' });
    }

    const charity = CHARITIES.find(c => c.id === charityId) || CHARITIES[0];

    const stripe = await getUncachableStripeClient();

    // Create / find customer by email
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer = existing.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email,
        metadata: { chosen_charity: charity.id },
      });
    } else {
      await stripe.customers.update(customer.id, {
        metadata: { chosen_charity: charity.id },
      });
    }

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          chosen_charity: charity.id,
          chosen_charity_name: charity.name,
        },
      },
      metadata: {
        chosen_charity: charity.id,
        chosen_charity_name: charity.name,
      },
      success_url: successUrl || `${baseUrl}/plans/?checkout=success`,
      cancel_url: cancelUrl || `${baseUrl}/plans/?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// One-time supporter / backer checkout
// Body: { tier, email, name, successUrl, cancelUrl }
router.post('/stripe/supporter-checkout', async (req, res) => {
  try {
    const { tier, email, name, successUrl, cancelUrl } = req.body;
    if (!tier || !email) {
      return res.status(400).json({ error: 'tier and email are required' });
    }

    const TIERS: Record<string, { name: string; description: string; amount: number }> = {
      seed:       { name: 'Seed Supporter',      description: 'Help get the ideas off the ground — early backer of Farm Buddy.',          amount: 10000  },
      backer:     { name: 'Project Backer',      description: 'A meaningful contribution to building the future of farm management tech.',  amount: 50000  },
      founder:    { name: 'Founding Supporter',  description: 'Founding supporter of Farm Buddy — your name in our founding story.',      amount: 100000 },
      foundation: { name: 'Foundation Partner',  description: 'Foundation Partner of Farm Buddy — logo on site, priority support, and a direct role in shaping the product.', amount: 100000 },
    };

    const selected = TIERS[tier];
    if (!selected) return res.status(400).json({ error: 'Invalid tier' });

    const stripe = await getUncachableStripeClient();

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: selected.name,
            description: selected.description,
          },
          unit_amount: selected.amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        supporter_tier: tier,
        supporter_name: name || '',
      },
      success_url: successUrl || `${baseUrl}/plans/?supporter=success`,
      cancel_url:  cancelUrl  || `${baseUrl}/plans/?supporter=cancel`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Inline subscription checkout — no pre-created Stripe price needed
// Body: { planName, amountAUD, interval, email, charityId, successUrl, cancelUrl }
router.post('/stripe/subscribe', async (req, res) => {
  try {
    const { planName, amountAUD, interval, email, charityId, successUrl, cancelUrl } = req.body;
    if (!planName || !amountAUD || !interval || !email) {
      return res.status(400).json({ error: 'planName, amountAUD, interval and email are required' });
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    // Find or create customer
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer = existing.data[0];
    if (!customer) {
      customer = await stripe.customers.create({ email, metadata: { chosen_charity: charityId || '' } });
    } else if (charityId) {
      await stripe.customers.update(customer.id, { metadata: { chosen_charity: charityId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: `Farm Buddy — ${planName} Plan`,
            description: `${planName} subscription billed ${interval === 'year' ? 'annually' : 'monthly'}.`,
          },
          unit_amount: Math.round(amountAUD * 100),
          recurring: { interval: interval === 'year' ? 'year' : 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      subscription_data: {
        metadata: { plan: planName.toLowerCase(), chosen_charity: charityId || '' },
      },
      success_url: successUrl || `${baseUrl}/plans/?checkout=success`,
      cancel_url:  cancelUrl  || `${baseUrl}/plans/?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manage subscription (customer portal)
router.post('/stripe/portal', async (req, res) => {
  try {
    const { email, returnUrl } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const stripe = await getUncachableStripeClient();
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0];
    if (!customer) return res.status(404).json({ error: 'No subscription found for that email' });

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl || `${baseUrl}/plans/`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
