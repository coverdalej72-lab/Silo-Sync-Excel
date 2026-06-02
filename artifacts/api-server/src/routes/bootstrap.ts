import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { db, farmsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

const router: IRouter = Router();

/**
 * POST /api/bootstrap/first-operator
 *
 * One-time endpoint that promotes the authenticated caller to the "operator"
 * role. Only succeeds when no Clerk users have publicMetadata.role = "operator"
 * yet. After the first operator exists this endpoint returns 409.
 *
 * Also reconciles any farms provisioned by the Stripe webhook before the
 * operator had a Clerk account (stored with clerkOrgId = "pending:<email>").
 *
 * The caller must have a valid Clerk session (handled by requireAuth upstream).
 */
router.post("/bootstrap/first-operator", async (req, res): Promise<void> => {
  const callerId = req.clerkUserId;

  // 1. Check if the caller is already an operator
  const caller = await clerkClient.users.getUser(callerId);
  const callerMeta = (caller.publicMetadata ?? {}) as Record<string, unknown>;

  // Get the caller's primary email
  const callerEmail = caller.emailAddresses?.[0]?.emailAddress ?? "";

  if (callerMeta.role === "operator") {
    // Already an operator — still reconcile any pending farms in case they
    // were paid before they had a Clerk account.
    await reconcilePendingFarms(callerId, callerEmail);
    res.json({ ok: true, message: "Already an operator", userId: callerId });
    return;
  }

  // 2. Search Clerk for any existing operator accounts
  //    getUserList returns up to 500 users by default — plenty for a bootstrap check.
  const { data: allUsers } = await clerkClient.users.getUserList({ limit: 500 });
  const operatorExists = allUsers.some(
    (u) => (u.publicMetadata as Record<string, unknown>)?.role === "operator",
  );

  if (operatorExists) {
    res.status(409).json({
      error: "An operator account already exists. Contact your operator to grant access.",
    });
    return;
  }

  // 3. No operator yet — promote the caller
  await clerkClient.users.updateUserMetadata(callerId, {
    publicMetadata: { role: "operator" },
  });

  req.log.info({ userId: callerId }, "Bootstrap: first operator account created");

  // 4. Reconcile any farms provisioned by Stripe webhook before this user
  //    had a Clerk account (stored with clerkOrgId = "pending:<email>").
  const reconciled = await reconcilePendingFarms(callerId, callerEmail);
  if (reconciled > 0) {
    req.log.info({ userId: callerId, callerEmail, reconciled }, "Bootstrap: pending farms linked");
  }

  res.status(201).json({
    ok: true,
    message: "You have been granted the operator role. Refresh the page to access the Operations Dashboard.",
    userId: callerId,
    farmsLinked: reconciled,
  });
});

/**
 * Link any farms that were provisioned before the operator had a Clerk account.
 * The Stripe webhook stores these as clerkOrgId = "pending:<email>".
 */
async function reconcilePendingFarms(clerkUserId: string, email: string): Promise<number> {
  if (!email) return 0;
  const pendingKey = `pending:${email}`;
  const result = await db
    .update(farmsTable)
    .set({ clerkOrgId: clerkUserId })
    .where(eq(farmsTable.clerkOrgId, pendingKey))
    .returning();
  return result.length;
}

export default router;
