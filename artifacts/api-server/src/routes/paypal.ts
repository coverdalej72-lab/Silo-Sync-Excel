import { Router, type IRouter } from 'express';
import {
  createSubscription,
  createOrder,
  captureOrder,
  getClientId,
} from '../paypalClient';

const router: IRouter = Router();

router.get('/paypal/client-id', (_req, res) => {
  const clientId = getClientId();
  if (!clientId) return res.status(503).json({ error: 'PayPal not configured' });
  res.json({ clientId });
});

router.post('/paypal/create-subscription', async (req, res) => {
  const { tier, interval, email, charityId, successUrl, cancelUrl } = req.body;
  if (!tier || !interval || !email) {
    return res.status(400).json({ error: 'tier, interval, and email are required' });
  }
  try {
    const domain = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const result = await createSubscription(
      tier,
      interval,
      email,
      charityId ?? '',
      successUrl ?? `${domain}/plans/?checkout=success`,
      cancelUrl  ?? `${domain}/plans/?checkout=cancel`,
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paypal/create-order', async (req, res) => {
  const { tier, successUrl, cancelUrl } = req.body;

  const TIERS: Record<string, { amount: number; description: string }> = {
    seed:    { amount: 100,  description: 'Seed Supporter — Poultry Mate' },
    backer:  { amount: 500,  description: 'Project Backer — Poultry Mate' },
    founder: { amount: 1000, description: 'Founding Supporter — Poultry Mate' },
  };

  const selected = TIERS[tier];
  if (!selected) return res.status(400).json({ error: 'Invalid tier' });

  try {
    const domain = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const result = await createOrder(
      selected.amount,
      selected.description,
      successUrl ?? `${domain}/plans/?supporter=success`,
      cancelUrl  ?? `${domain}/plans/?supporter=cancel`,
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paypal/capture-order', async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });
  try {
    const result = await captureOrder(orderId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
