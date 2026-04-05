import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shedGroupsRouter from "./shed_groups";
import readingsRouter from "./readings";
import deliveriesRouter from "./deliveries";
import onedriveRouter from "./onedrive";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(exportRouter);
router.use(shedGroupsRouter);
router.use(readingsRouter);
router.use(deliveriesRouter);
router.use(onedriveRouter);

export default router;
