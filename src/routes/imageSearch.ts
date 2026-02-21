import { Router, Request, Response, NextFunction } from "express";

export const imageSearchRouter = Router();

export interface ImageResult {
  query: string;
  url: string;
  thumbnailUrl: string;
  title: string;
}

/**
 * GET /api/image-search?query=cat&query=dog&query=bird&query=fish
 *
 * Fetches exactly one image per query term from Bing Image Search (v7).
 * Returns { results: ImageResult[] }, one entry per successfully resolved query.
 * Queries that return no Bing result are silently dropped from the response.
 *
 * Setup:
 *   1. Create a Bing Search v7 resource in Azure Cognitive Services
 *      https://portal.azure.com → Create resource → "Bing Search v7"
 *   2. Copy either key to .env as BING_IMAGE_API_KEY
 *
 * Security: the API key never reaches the browser — all calls are proxied here.
 */
imageSearchRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = process.env.BING_IMAGE_API_KEY;
      if (!apiKey) {
        res.status(503).json({
          error:
            "Image search is not configured. Add BING_IMAGE_API_KEY to .env.",
        });
        return;
      }

      // Accept one or multiple ?query= values
      const raw = req.query.query;
      const queries: string[] = Array.isArray(raw)
        ? (raw as string[])
        : raw
        ? [raw as string]
        : [];

      if (queries.length === 0) {
        res
          .status(400)
          .json({ error: "Provide at least one 'query' parameter." });
        return;
      }

      // Cap at 6 simultaneous outbound calls
      const capped = queries.slice(0, 6);

      const results = await Promise.all(
        capped.map(async (q): Promise<ImageResult | null> => {
          const bingUrl =
            `https://api.bing.microsoft.com/v7.0/images/search` +
            `?q=${encodeURIComponent(q)}` +
            `&count=1&safeSearch=Strict&imageType=Photo`;

          const bingRes = await fetch(bingUrl, {
            headers: { "Ocp-Apim-Subscription-Key": apiKey },
          });

          if (!bingRes.ok) {
            console.warn(
              `[imageSearch] Bing returned ${bingRes.status} for query "${q}"`
            );
            return null;
          }

          type BingValue = {
            contentUrl: string;
            thumbnailUrl: string;
            name: string;
          };
          const data = (await bingRes.json()) as { value?: BingValue[] };
          const img = data.value?.[0];
          if (!img) return null;

          return {
            query: q,
            url: img.contentUrl,
            thumbnailUrl: img.thumbnailUrl,
            title: img.name,
          };
        })
      );

      const valid = results.filter((r): r is ImageResult => r !== null);
      res.json({ results: valid });
    } catch (err) {
      next(err);
    }
  }
);
