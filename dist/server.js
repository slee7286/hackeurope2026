"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const session_1 = require("./routes/session");
const tts_1 = require("./routes/tts");
const stt_1 = require("./routes/stt");
const pictureImages_1 = require("./routes/pictureImages");
dotenv_1.default.config({
    path: path_1.default.resolve(process.cwd(), ".env"),
    override: true,
});
// ─── Env Validation ───────────────────────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY environment variable is not set.");
    console.error("Copy .env.example to .env and add your API key.");
    process.exit(1);
}
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
// ─── App Setup ────────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: [CORS_ORIGIN],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express_1.default.json({ limit: "10kb" }));
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/session", session_1.sessionRouter);
app.use("/api/tts", tts_1.ttsRouter);
// STT needs raw binary body — apply express.raw() before sttRouter.
// express.json() (above) only parses application/json, so audio/* passes through untouched.
app.use("/api/stt", express_1.default.raw({ type: "*/*", limit: "10mb" }), stt_1.sttRouter);
app.use("/api/picture-images", pictureImages_1.pictureImagesRouter);
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
});
// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
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
exports.default = app;
