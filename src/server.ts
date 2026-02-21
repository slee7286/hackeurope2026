import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { sessionRouter } from "./routes/session";
import { ttsRouter } from "./routes/tts";
import { sttRouter } from "./routes/stt";

// ─── Env Validation ───────────────────────────────────────────────────────────

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("FATAL: ANTHROPIC_API_KEY environment variable is not set.");
  console.error("Copy .env.example to .env and add your API key.");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();

app.use(
  cors({
    origin: [CORS_ORIGIN],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10kb" }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api/session", sessionRouter);
app.use("/api/tts", ttsRouter);
// STT needs raw binary body — apply express.raw() before sttRouter.
// express.json() (above) only parses application/json, so audio/* passes through untouched.
app.use("/api/stt", express.raw({ type: "*/*", limit: "10mb" }), sttRouter);

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message);

  if (err.message.toLowerCase().includes("anthropic")) {
    res.status(502).json({
      error: "AI service error. Please try again.",
      detail: err.message,
    });
    return;
  }

  res.status(500).json({
    error: "Internal server error.",
    detail: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Therapy backend running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
});

export default app;
