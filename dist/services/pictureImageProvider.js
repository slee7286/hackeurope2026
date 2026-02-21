"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPictureDescriptionChoices = getPictureDescriptionChoices;
const MAX_UPSTREAM_IMAGES = 16;
const DEFAULT_DECOYS = ["chair", "car", "tree", "house", "bicycle", "book", "clock"];
const CATEGORY_MAP = {
    rugby: {
        category: "sports",
        decoys: ["soccer", "basketball", "tennis", "golf", "table tennis", "baseball"],
    },
    soccer: {
        category: "sports",
        decoys: ["rugby", "basketball", "tennis", "golf", "volleyball", "baseball"],
    },
    basketball: {
        category: "sports",
        decoys: ["rugby", "soccer", "tennis", "golf", "table tennis", "baseball"],
    },
    tennis: {
        category: "sports",
        decoys: ["rugby", "soccer", "basketball", "golf", "table tennis", "baseball"],
    },
    golf: {
        category: "sports",
        decoys: ["rugby", "soccer", "basketball", "tennis", "table tennis", "baseball"],
    },
    cat: { category: "animals", decoys: ["dog", "rabbit", "horse", "bird", "cow"] },
    dog: { category: "animals", decoys: ["cat", "rabbit", "horse", "bird", "cow"] },
    apple: { category: "fruit", decoys: ["banana", "orange", "grape", "strawberry", "pear"] },
    banana: { category: "fruit", decoys: ["apple", "orange", "grape", "strawberry", "pear"] },
};
const BANNED_DESC_WORDS = [
    "abstract",
    "art",
    "painting",
    "illustration",
    "pattern",
    "crowd",
    "busy",
    "cityscape",
    "poster",
    "text",
    "typography",
    "logo",
];
function normalize(text) {
    return text.toLowerCase().trim();
}
function isSimpleImage(description, target) {
    const desc = normalize(description);
    const t = normalize(target);
    if (BANNED_DESC_WORDS.some((word) => desc.includes(word)))
        return false;
    if (desc.includes(t))
        return true;
    return desc.length > 0 && desc.length < 120;
}
function toDataSvg(text, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="#111">${text}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
function buildPlaceholders(target) {
    const safeTarget = target.trim() || "Object";
    return [
        { imageUrl: toDataSvg(`${safeTarget} 1`, "#e7f1f4") },
        { imageUrl: toDataSvg(`${safeTarget} 2`, "#f9f2dc") },
        { imageUrl: toDataSvg(`${safeTarget} 3`, "#d9e8ec") },
        { imageUrl: toDataSvg(`${safeTarget} 4`, "#eef3f5") },
    ];
}
function buildChoicePlaceholders(target) {
    const labels = ["A", "B", "C", "D"];
    return labels.map((id, index) => ({
        id,
        imageUrl: toDataSvg(`${target || "Object"} ${id}`, ["#e7f1f4", "#f9f2dc", "#d9e8ec", "#eef3f5"][index]),
        isCorrect: id === "A",
    }));
}
function ensureCount(images, count, target) {
    if (images.length === 0)
        return buildPlaceholders(target).slice(0, count);
    const copy = [...images];
    let idx = 0;
    while (copy.length < count) {
        copy.push(copy[idx % images.length]);
        idx += 1;
    }
    return copy.slice(0, count);
}
function pickRandomDistinct(values, count) {
    const unique = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
    for (let i = unique.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [unique[i], unique[j]] = [unique[j], unique[i]];
    }
    return unique.slice(0, count);
}
async function searchUnsplashSimpleImages(query) {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey)
        return [];
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(MAX_UPSTREAM_IMAGES));
    url.searchParams.set("content_filter", "high");
    url.searchParams.set("orientation", "squarish");
    const response = await fetch(url.toString(), {
        headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!response.ok)
        return [];
    const payload = (await response.json());
    return (payload.results ?? [])
        .map((item) => ({
        imageUrl: item.urls?.regular ?? item.urls?.small ?? "",
        description: item.alt_description?.trim() ||
            item.description?.trim() ||
            "simple object photo",
    }))
        .filter((item) => Boolean(item.imageUrl));
}
async function searchWikipediaImages(query) {
    const params = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: query,
        gsrlimit: "24",
        prop: "pageimages|info",
        piprop: "thumbnail|original",
        pithumbsize: "700",
        inprop: "url",
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
    if (!res.ok)
        return [];
    const payload = (await res.json());
    return Object.values(payload.query?.pages ?? {})
        .map((page) => ({
        imageUrl: page.original?.source ?? page.thumbnail?.source ?? "",
    }))
        .filter((img) => Boolean(img.imageUrl));
}
function dedupeImages(images) {
    const seen = new Set();
    const output = [];
    for (const img of images) {
        if (!img.imageUrl || seen.has(img.imageUrl))
            continue;
        seen.add(img.imageUrl);
        output.push(img);
    }
    return output;
}
async function getConceptImage(concept) {
    const queryVariants = [concept.trim(), `${concept.trim()} photo`].filter(Boolean);
    let combined = [];
    for (const query of queryVariants) {
        try {
            const unsplash = await searchUnsplashSimpleImages(query);
            const filtered = unsplash.filter((img) => isSimpleImage(img.description, concept));
            if (filtered.length > 0) {
                return { imageUrl: filtered[0].imageUrl };
            }
        }
        catch {
            // Continue to fallback.
        }
        try {
            const wiki = await searchWikipediaImages(query);
            combined = dedupeImages([...combined, ...wiki]);
            if (combined.length > 0)
                return combined[0];
        }
        catch {
            // Continue.
        }
    }
    return null;
}
function buildDecoyConceptPool(target) {
    const key = target.toLowerCase().trim();
    const mapped = CATEGORY_MAP[key]?.decoys ?? [];
    const pool = [...mapped, ...DEFAULT_DECOYS].filter((candidate) => candidate.toLowerCase().trim() !== key);
    return Array.from(new Set(pool));
}
function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
async function getPictureDescriptionChoices(targetConcept) {
    const target = targetConcept.trim();
    if (!target)
        return buildChoicePlaceholders("Object");
    const correctImage = await getConceptImage(target);
    if (!correctImage) {
        return buildChoicePlaceholders(target);
    }
    const decoyPool = buildDecoyConceptPool(target);
    const pickedDecoys = pickRandomDistinct(decoyPool, 6);
    const decoyImages = [];
    for (const decoyConcept of pickedDecoys) {
        if (decoyImages.length >= 3)
            break;
        const image = await getConceptImage(decoyConcept);
        if (!image)
            continue;
        if (image.imageUrl === correctImage.imageUrl)
            continue;
        if (decoyImages.some((existing) => existing.imageUrl === image.imageUrl))
            continue;
        decoyImages.push(image);
    }
    while (decoyImages.length < 3) {
        const filler = ensureCount([], 1, `Not ${target}`)[0];
        if (!filler)
            break;
        decoyImages.push(filler);
    }
    const combined = shuffleArray([
        { imageUrl: correctImage.imageUrl, isCorrect: true },
        ...decoyImages.slice(0, 3).map((img) => ({ imageUrl: img.imageUrl, isCorrect: false })),
    ]);
    const labels = ["A", "B", "C", "D"];
    const choices = combined.slice(0, 4).map((choice, index) => ({
        id: labels[index],
        imageUrl: choice.imageUrl,
        isCorrect: choice.isCorrect,
    }));
    if (choices.length < 4) {
        const placeholders = buildChoicePlaceholders(target);
        for (const placeholder of placeholders) {
            if (choices.length >= 4)
                break;
            choices.push({ ...placeholder, isCorrect: false });
        }
    }
    // Guarantee exactly one correct answer.
    const firstCorrectIndex = choices.findIndex((c) => c.isCorrect);
    if (firstCorrectIndex === -1) {
        choices[0].isCorrect = true;
    }
    else {
        choices.forEach((choice, index) => {
            if (index !== firstCorrectIndex)
                choice.isCorrect = false;
        });
    }
    return choices.slice(0, 4);
}
