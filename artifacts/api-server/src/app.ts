import express, { type Express, type Request, type Response, type NextFunction } from "express";
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

// Global error handler — catches any unhandled errors thrown by routes
// Must have 4 params for Express to treat it as an error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? "Internal server error";
  logger.error({ err }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
