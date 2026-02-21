import { Router, Request, Response, NextFunction } from "express";
import { getPictureDescriptionChoices } from "../services/pictureImageProvider";

export const pictureImagesRouter = Router();

pictureImagesRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const target = String(req.query.targetConcept ?? req.query.target ?? "").trim();
      if (!target) {
        res.status(400).json({ error: "Missing required 'targetConcept' query parameter." });
        return;
      }
      const choices = await getPictureDescriptionChoices(target);
      res.json({ choices });
    } catch (err) {
      next(err);
    }
  }
);
