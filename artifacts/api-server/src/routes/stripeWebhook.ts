import { Router, type IRouter } from "express";
import { db, farmsTable, shedGroupsTable, silosTable } from "@workspace/db";
import { eq, and, like } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_TIERS = new Set(["bronze", "silver", "gold", "platinum"]);

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe events. Must be mounted BEFORE express.json() so the raw
 * body is available for signature verification.
 *
 * Set STRIPE_WEBHOOK_SECRET in env to the signing secret from the Stripe
 * dashboard → Developers → Webhooks → your endpoint → Signing secret.
 *
 * Events handled:
 *   checkout.session.completed  (bundle_type = "operations")
 *     → provision farms, invite managers, send operator access
 */
router.post(
  "/stripe/webhook",
  async (req, res): Promise<void> => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    }

    let event: import("stripe").Stripe.Event;

    try {
      const stripe = await getUncachableStripeClient();

      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, webhookSecret);
      } else {
        event = JSON.parse((req.body as Buffer).toString()) as import("stripe").Stripe.Event;
      }
    } catch (err: unknown) {
      logger.error({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: "Webhook signature invalid" });
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;
      const meta = session.metadata ?? {};

      if (meta["bundle_type"] === "operations") {
        try {
          await handleBundleCheckoutCompleted(session, meta);
        } catch (err: unknown) {
          logger.error({ err, sessionId: session.id }, "Error provisioning bundle farms");
          res.status(500).json({ error: "Provisioning failed" });
          return;
        }
      }
    }

    res.json({ received: true });
  }
);

// ── Provisioning logic ───────────────────────────────────────────────────────

interface FarmSpec {
  name: string;
  managerEmail: string;
  tier: string;
}

async function handleBundleCheckoutCompleted(
  session: import("stripe").Stripe.Checkout.Session,
  meta: Record<string, string>,
): Promise<void> {
  const opsEmail = meta["ops_email"];
  const farmsRaw = meta["farms"] ?? "";

  if (!opsEmail) {
    logger.warn({ sessionId: session.id }, "Bundle checkout missing ops_email");
    return;
  }

  // Parse farms from "name|managerEmail|tier,..." format
  const specs: FarmSpec[] = farmsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [name = "", managerEmail = "", tier = "bronze"] = chunk.split("|");
      return {
        name: name.trim() || "Unnamed Farm",
        managerEmail: managerEmail.trim(),
        tier: VALID_TIERS.has(tier.trim()) ? tier.trim() : "bronze",
      };
    });

  if (specs.length === 0) {
    logger.warn({ sessionId: session.id }, "Bundle checkout: no farms in metadata");
    return;
  }

  // Find the operator in Clerk by email
  let clerkOrgId: string;
  try {
    const { data: users } = await clerkClient.users.getUserList({
      emailAddress: [opsEmail],
      limit: 1,
    });

    if (users.length > 0) {
      const operator = users[0];
      clerkOrgId = operator.id;

      // Ensure they have the operator role
      const meta = (operator.publicMetadata ?? {}) as Record<string, unknown>;
      if (meta["role"] !== "operator") {
        await clerkClient.users.updateUserMetadata(operator.id, {
          publicMetadata: { role: "operator" },
        });
        logger.info({ userId: operator.id, email: opsEmail }, "Granted operator role to existing Clerk user");
      }
    } else {
      // Not in Clerk yet — invite them as operator and store farms as pending
      clerkOrgId = `pending:${opsEmail}`;
      try {
        await clerkClient.invitations.createInvitation({
          emailAddress: opsEmail,
          publicMetadata: {
            role: "operator",
            pendingSetup: true,
          },
          notify: true,
        });
        logger.info({ email: opsEmail }, "Clerk invitation sent to new operator");
      } catch (inviteErr: unknown) {
        logger.warn({ err: (inviteErr as Error)?.message, email: opsEmail }, "Clerk invite failed (may already exist)");
      }
    }
  } catch (clerkErr: unknown) {
    logger.error({ err: (clerkErr as Error)?.message, email: opsEmail }, "Clerk lookup failed — using pending");
    clerkOrgId = `pending:${opsEmail}`;
  }

  // Provision each farm
  for (const spec of specs) {
    await provisionFarm(spec, clerkOrgId, session.id);
  }

  logger.info(
    { sessionId: session.id, opsEmail, farmCount: specs.length, clerkOrgId },
    "Bundle checkout: farms provisioned",
  );
}

async function provisionFarm(spec: FarmSpec, clerkOrgId: string, sessionId: string): Promise<void> {
  // Create the farm
  const [farm] = await db
    .insert(farmsTable)
    .values({ name: spec.name, planTier: spec.tier, clerkOrgId })
    .returning();

  // Default shed group
  const [group] = await db
    .insert(shedGroupsTable)
    .values({ farmId: farm.id, name: "Shed 1", displayOrder: 0 })
    .returning();

  // Default silos A and B
  await db.insert(silosTable).values([
    { farmId: farm.id, shedGroupId: group.id, letter: "A", name: "Silo A" },
    { farmId: farm.id, shedGroupId: group.id, letter: "B", name: "Silo B" },
  ]);

  // Invite the farm manager if a valid email was provided
  if (spec.managerEmail.includes("@")) {
    try {
      await clerkClient.invitations.createInvitation({
        emailAddress: spec.managerEmail,
        publicMetadata: {
          role: "farm_manager",
          farmId: farm.id,
          farmName: spec.name,
        },
        notify: true,
      });
    } catch (err: unknown) {
      logger.warn(
        { err: (err as Error)?.message, managerEmail: spec.managerEmail, farmId: farm.id },
        "Farm manager invite failed (may already be a Clerk user)",
      );
    }
  }

  logger.info({ farmId: farm.id, name: spec.name, clerkOrgId, sessionId }, "Farm provisioned");
}

export default router;
