import { Router, type IRouter } from "express";
import healthRouter from "./health";
import silosRouter from "./silos";
import readingsRouter from "./readings";
import onedriveRouter from "./onedrive";

const router: IRouter = Router();

router.use(healthRouter);
router.use(silosRouter);
router.use(readingsRouter);
router.use(onedriveRouter);

export default router;
