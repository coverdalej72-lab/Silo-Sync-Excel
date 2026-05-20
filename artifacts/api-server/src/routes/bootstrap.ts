import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";

const router: IRouter = Router();

/**
 * POST /api/bootstrap/first-operator
 *
 * One-time endpoint that promotes the authenticated caller to the "operator"
 * role. Only succeeds when no Clerk users have publicMetadata.role = "operator"
 * yet. After the first operator exists this endpoint returns 409.
 *
 * The caller must have a valid Clerk session (handled by requireAuth upstream).
 */
router.post("/bootstrap/first-operator", async (req, res): Promise<void> => {
  const callerId = req.clerkUserId;

  // 1. Check if the caller is already an operator
  const caller = await clerkClient.users.getUser(callerId);
  const callerMeta = (caller.publicMetadata ?? {}) as Record<string, unknown>;
  if (callerMeta.role === "operator") {
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

  res.status(201).json({
    ok: true,
    message: "You have been granted the operator role. Refresh the page to access the Operations Dashboard.",
    userId: callerId,
  });
});

export default router;
