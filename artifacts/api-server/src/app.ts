import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensurePlansTable } from "./paypalClient";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the how-to-video production build at /how-to-video/
const videoDistPath = path.resolve(__dirname, "..", "..", "..", "artifacts", "how-to-video", "dist", "public");
app.use("/how-to-video", express.static(videoDistPath));
app.use("/how-to-video", (_req, res) => {
  res.sendFile(path.join(videoDistPath, "index.html"));
});

// Initialize PayPal plans table (non-blocking)
ensurePlansTable().catch(err =>
  logger.warn({ err: err.message }, 'PayPal plans table setup failed — continuing')
);

export default app;
