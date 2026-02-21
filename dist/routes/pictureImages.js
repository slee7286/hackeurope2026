"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pictureImagesRouter = void 0;
const express_1 = require("express");
const pictureImageProvider_1 = require("../services/pictureImageProvider");
exports.pictureImagesRouter = (0, express_1.Router)();
exports.pictureImagesRouter.get("/", async (req, res, next) => {
    try {
        const target = String(req.query.targetConcept ?? req.query.target ?? "").trim();
        if (!target) {
            res.status(400).json({ error: "Missing required 'targetConcept' query parameter." });
            return;
        }
        const choices = await (0, pictureImageProvider_1.getPictureDescriptionChoices)(target);
        res.json({ choices });
    }
    catch (err) {
        next(err);
    }
});
