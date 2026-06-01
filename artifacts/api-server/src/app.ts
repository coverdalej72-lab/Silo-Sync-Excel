import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

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

// Clerk proxy must be mounted BEFORE body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk authentication — reads CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY from env
app.use(clerkMiddleware());

app.use("/api", router);

// Serve static builds for artifacts whose Vite dev server is not reliable
// Both fall back to their production build served directly from the API server

const videoDistPath = path.resolve(__dirname, "..", "..", "..", "artifacts", "how-to-video", "dist", "public");
app.use("/how-to-video", express.static(videoDistPath));
app.use("/how-to-video", (_req, res) => {
  res.sendFile(path.join(videoDistPath, "index.html"));
});

const homeDistPath = path.resolve(__dirname, "..", "..", "..", "artifacts", "farm-buddy-home", "dist", "public");
app.use("/home", express.static(homeDistPath));
app.use("/home", (_req, res) => {
  res.sendFile(path.join(homeDistPath, "index.html"));
});

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
