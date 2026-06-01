import { Router, type IRouter } from 'express';
import {
  createSubscription,
  createOrder,
  captureOrder,
  getClientId,
} from '../paypalClient';

const router: IRouter = Router();

router.get('/paypal/client-id', (_req, res): void => {
  const clientId = getClientId();
  if (!clientId) { res.status(503).json({ error: 'PayPal not configured' }); return; }
  res.json({ clientId });
});

router.post('/paypal/create-subscription', async (req, res): Promise<void> => {
  const { tier, interval, email, charityId, successUrl, cancelUrl } = req.body;
  if (!tier || !interval || !email) {
    res.status(400).json({ error: 'tier, interval, and email are required' });
    return;
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

router.post('/paypal/create-order', async (req, res): Promise<void> => {
  const { tier, successUrl, cancelUrl } = req.body;

  const TIERS: Record<string, { amount: number; description: string }> = {
    seed:    { amount: 100,  description: 'Seed Supporter — Farm Buddy' },
    backer:  { amount: 500,  description: 'Project Backer — Farm Buddy' },
    founder: { amount: 1000, description: 'Founding Supporter — Farm Buddy' },
  };

  const selected = TIERS[tier];
  if (!selected) { res.status(400).json({ error: 'Invalid tier' }); return; }

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

router.post('/paypal/capture-order', async (req, res): Promise<void> => {
  const { orderId } = req.body;
  if (!orderId) { res.status(400).json({ error: 'orderId is required' }); return; }
  try {
    const result = await captureOrder(orderId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
