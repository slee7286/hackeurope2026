"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateImagesWithClaude = validateImagesWithClaude;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const anthropic = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1])
        return fenced[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start)
        return text.slice(start, end + 1);
    return text.trim();
}
async function validateImagesWithClaude(target, candidates) {
    if (candidates.length === 0) {
        return { hasAnyCorrect: false, correctIndices: [] };
    }
    const candidateLines = candidates
        .map((c) => `${c.index}: ${c.description || "(no description)"}`)
        .join("\n");
    const prompt = [
        "You are helping select images for a stroke therapy app.",
        "Images should be simple and clearly depict the target object/concept.",
        "Avoid abstract/artistic/busy interpretations.",
        `Target concept: "${target}"`,
        "",
        "Candidate images (index: description):",
        candidateLines,
        "",
        'Respond ONLY in JSON with this exact shape: {"correctIndices":[0],"hasAnyCorrect":true}',
    ].join("\n");
    const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 220,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
    });
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const jsonText = extractJson(text);
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        return { hasAnyCorrect: false, correctIndices: [] };
    }
    const validIndices = new Set(candidates.map((c) => c.index));
    const correctIndices = Array.isArray(parsed.correctIndices)
        ? parsed.correctIndices.filter((i) => Number.isInteger(i) && validIndices.has(i))
        : [];
    return {
        hasAnyCorrect: Boolean(parsed.hasAnyCorrect) && correctIndices.length > 0,
        correctIndices,
    };
}
