import { Router, type IRouter } from "express";
import healthRouter from "./health";
import silosRouter from "./silos";
import readingsRouter from "./readings";
import onedriveRouter from "./onedrive";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(exportRouter);
router.use(silosRouter);
router.use(readingsRouter);
router.use(onedriveRouter);

export default router;
