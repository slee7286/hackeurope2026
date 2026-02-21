"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageSearchRouter = void 0;
const express_1 = require("express");
exports.imageSearchRouter = (0, express_1.Router)();
async function fetchWikipediaImages(query, count) {
    const params = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: query,
        gsrlimit: String(Math.max(count * 2, 8)),
        prop: "pageimages|info",
        piprop: "thumbnail|original",
        pithumbsize: "600",
        inprop: "url",
    });
    const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
    if (!wikiRes.ok)
        return [];
    const payload = (await wikiRes.json());
    const pages = Object.values(payload.query?.pages ?? {});
    const mapped = pages.map((page) => {
        const originalUrl = page.original?.source ?? "";
        const thumbUrl = page.thumbnail?.source ?? originalUrl;
        const url = originalUrl || thumbUrl;
        if (!url)
            return null;
        const result = {
            url,
            thumbnailUrl: thumbUrl || url,
            title: page.title ?? "Wikipedia image",
            width: page.original?.width ?? page.thumbnail?.width,
            height: page.original?.height ?? page.thumbnail?.height,
        };
        return result;
    });
    return mapped.filter((img) => img !== null).slice(0, count);
}
/**
 * GET /api/image-search?query=cat&count=4
 * Legacy also supported: /api/image-search?query=cat&query=dog...
 *
 * Primary mode:
 * - One query string + count => top N Bing images.
 *
 * Legacy mode:
 * - Multiple query params => one image per query.
 *
 * Returns: { results: ImageResult[] }
 *
 * Setup:
 *   1. Create a Bing Search v7 resource in Azure Cognitive Services
 *      https://portal.azure.com → Create resource → "Bing Search v7"
 *   2. Copy either key to .env as BING_IMAGE_API_KEY
 *
 * Security: the API key never reaches the browser — all calls are proxied here.
 */
exports.imageSearchRouter.get("/", async (req, res, next) => {
    try {
        const apiKey = process.env.BING_IMAGE_API_KEY;
        const raw = req.query.query;
        const queries = Array.isArray(raw)
            ? raw
            : raw
                ? [raw]
                : [];
        if (queries.length === 0) {
            res
                .status(400)
                .json({ error: "Provide at least one 'query' parameter." });
            return;
        }
        // New preferred mode: one query + count images
        if (queries.length === 1) {
            const countRaw = Number(req.query.count ?? 4);
            const count = Number.isFinite(countRaw)
                ? Math.max(1, Math.min(8, countRaw))
                : 4;
            let results = [];
            if (apiKey) {
                const bingUrl = `https://api.bing.microsoft.com/v7.0/images/search` +
                    `?q=${encodeURIComponent(queries[0])}` +
                    `&count=${count}` +
                    `&safeSearch=Strict` +
                    `&imageType=Photo`;
                const bingRes = await fetch(bingUrl, {
                    headers: { "Ocp-Apim-Subscription-Key": apiKey },
                });
                if (bingRes.ok) {
                    const data = (await bingRes.json());
                    results = (data.value ?? [])
                        .map((img) => ({
                        url: img.contentUrl ?? "",
                        thumbnailUrl: img.thumbnailUrl ?? img.contentUrl ?? "",
                        title: img.name ?? "Image result",
                        width: img.width,
                        height: img.height,
                    }))
                        .filter((img) => Boolean(img.url));
                }
            }
            // Fallback: Wikipedia images when Bing key is missing/fails/insufficient.
            if (results.length < count) {
                const wikiResults = await fetchWikipediaImages(queries[0], count);
                results = results.length > 0 ? [...results, ...wikiResults] : wikiResults;
            }
            res.json({ results: results.slice(0, count) });
            return;
        }
        // Legacy mode: one image per query term
        if (!apiKey) {
            res.status(503).json({
                error: "Image search is not configured for multi-query mode. Add BING_IMAGE_API_KEY to .env.",
            });
            return;
        }
        const capped = queries.slice(0, 6);
        const results = await Promise.all(capped.map(async (q) => {
            const bingUrl = `https://api.bing.microsoft.com/v7.0/images/search` +
                `?q=${encodeURIComponent(q)}` +
                `&count=1&safeSearch=Strict&imageType=Photo`;
            const bingRes = await fetch(bingUrl, {
                headers: { "Ocp-Apim-Subscription-Key": apiKey },
            });
            if (!bingRes.ok)
                return null;
            const data = (await bingRes.json());
            const img = data.value?.[0];
            if (!img?.contentUrl)
                return null;
            return {
                url: img.contentUrl,
                thumbnailUrl: img.thumbnailUrl ?? img.contentUrl,
                title: img.name ?? q,
                width: img.width,
                height: img.height,
            };
        }));
        res.json({ results: results.filter((r) => r !== null) });
    }
    catch (err) {
        next(err);
    }
});
