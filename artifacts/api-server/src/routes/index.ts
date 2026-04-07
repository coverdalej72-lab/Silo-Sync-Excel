import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shedGroupsRouter from "./shed_groups";
import readingsRouter from "./readings";
import deliveriesRouter from "./deliveries";
import onedriveRouter from "./onedrive";
import exportRouter from "./export";
import batchRouter from "./batch";
import stripeRouter from "./stripe";
import sponsorsRouter from "./sponsors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(exportRouter);
router.use(shedGroupsRouter);
router.use(readingsRouter);
router.use(deliveriesRouter);
router.use(onedriveRouter);
router.use(batchRouter);
router.use(stripeRouter);
router.use(sponsorsRouter);

export default router;
