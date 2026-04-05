import { Router, type IRouter } from "express";
import {
  isGdriveConnected,
  getGdriveFileId,
  isOnedriveConnected,
  getOnedriveFileId,
} from "../lib/onedrive";

const router: IRouter = Router();

router.get("/onedrive/status", async (_req, res): Promise<void> => {
  const onedriveConnected = isOnedriveConnected();
  const gdriveConnected = isGdriveConnected();
  const onedriveFileId = getOnedriveFileId();
  const gdriveFileId = getGdriveFileId();

  res.json({
    onedriveConnected,
    onedriveFileId: onedriveFileId ?? null,
    onedriveFileName: onedriveFileId ? "SiloReadings.csv" : null,
    gdriveConnected,
    gdriveFileId: gdriveFileId ?? null,
    gdriveFileName: gdriveFileId ? "Silo Feed Readings" : null,
  });
});

export default router;
