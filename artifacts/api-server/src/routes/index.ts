import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shedGroupsRouter from "./shed_groups";
import readingsRouter from "./readings";
import deliveriesRouter from "./deliveries";
import onedriveRouter from "./onedrive";
import exportRouter from "./export";
import batchRouter from "./batch";
import paypalRouter from "./paypal";
import sponsorsRouter, { publicSponsorsRouter } from "./sponsors";
import weighBirdRouter from "./weigh-bird";
import stripeRouter from "./stripe";
import farmsRouter from "./farms";
import bootstrapRouter from "./bootstrap";
import silosRouter from "./silos";
import scanDocketRouter from "./scan-docket";
import { requireAuth } from "../middlewares/requireAuth";
import { attachFarmScope } from "../middlewares/farmScope";

const router: IRouter = Router();

// Root probe — the workflow runner checks GET /api for HTTP 200
router.get("/", (_req, res) => { res.status(200).json({ ok: true }); });

// Public routes — no auth required
router.use(healthRouter);
router.use(stripeRouter);
router.use(publicSponsorsRouter);
router.use(scanDocketRouter);

// All other routes require authentication + farm scope
router.use(requireAuth);
router.use(bootstrapRouter);  // needs auth but not farm scope
router.use(attachFarmScope);
router.use(farmsRouter);
router.use(silosRouter);
router.use(shedGroupsRouter);
router.use(readingsRouter);
router.use(deliveriesRouter);
router.use(onedriveRouter);
router.use(exportRouter);
router.use(batchRouter);
router.use(paypalRouter);
router.use(sponsorsRouter);
router.use(weighBirdRouter);

export default router;
