---
doc: spec
status: approved
---

# UndoTable — Technical Spec

## How This Works, In Plain Language

UndoTable is a single web page. Everything happens inside the browser tab; there is no server and no account.

- **The comparer** takes two photos in a row, lines the new one up with the old one (phones never sit in exactly the same spot), and looks for areas whose colour changed. Those areas become boxes on the old photo: "something left from here."
- **The namer** looks at each box and suggests a word ("screw", "knob") by asking a vision-language model which word from a fixed list fits best.
- **The matcher** turns every recorded part into a list of numbers (an *embedding*: a fingerprint of what the image looks like). A photo of a loose part gets the same treatment, and the closest fingerprint wins. If the top two are almost tied, the app says it is unsure.
- **The keeper** saves the teardown in the browser's own database (IndexedDB) so a reload or a closed tab loses nothing.
- **The page** shows Record, Put it back and Parts, and the lookup sheet.

Why this shape: running the models in the page means anyone can try it from a link without a key or a bill, and the photos of someone's stuff never leave their phone. The cost is a one-time ~110 MB model download and slower phones.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. User adds the first photo → `app.js` downsizes it to 1600 px, saves it as step 0 through `store.js`.
2. User adds the next photo → `engine.js` loads OpenCV.js once, calls `vision.align` (ORB keypoints + RANSAC homography) to warp the new photo onto the old one, then `vision.changes` (Lab colour difference after matching exposure, adaptive threshold, clean-up, connected regions) → up to 6 boxes on the old photo. `vision.detect` runs this at 960 px and, only if nothing is found, once more at 1600 px with a lower noise floor so screws are not missed.
3. For each box `engine.js` crops the old photo (`pixels.crop`), keeps a second copy with only the changed pixels (`pixels.keepMasked`), stores DINOv2 vectors of both plus a colour histogram (`pixels.colorSignature`), and gets a CLIP vector to call `match.suggestNames` against `data/vocab.json` (text vectors computed ahead of time by `tools/build-vocab.mjs`).
4. User keeps/renames/deletes/draws boxes → `store.js` saves the step's parts.
5. Put it back → `app.js` walks steps from last to first, drawing each step's boxes on its "before" photo; ticks are saved.
6. Where does this go? → the loose part is cut out of its background (`vision.foreground`, GrabCut); the cut-out and the whole photo are embedded; `match.rank` compares them with every part's vectors plus 0.1 × colour similarity → `sure` (one answer) / `unsure` (two shown) / `none` ("no close match", two best guesses) → the lookup sheet.

## Stack

- Plain HTML, CSS and JavaScript modules, no build step (same as the learner's last project; nothing to compile for GitHub Pages).
- **OpenCV.js 4.12** (`@techstark/opencv-js@4.12.0-release.1`, https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html): feature matching, homography, image maths. Loaded from jsDelivr only when the first comparison runs.
- **Transformers.js 4.2** (`@huggingface/transformers@4.2.0`, https://huggingface.co/docs/transformers.js): runs ONNX models in the browser (WebAssembly; WebGPU when available).
  - **CLIP ViT-B/32** (`Xenova/clip-vit-base-patch32`, image half, 8-bit, 89 MB): names.
  - **DINOv2-small** (`onnx-community/dinov2-small`, 8-bit, 24 MB): part matching. Chosen by measurement, see `Decisions and Open Issues`.
- Node 20+ for tests: `node --test` for unit tests, the same modules run in Node via npm packages for the photo test, Playwright (Python) for the browser smoke test.

## Where It Runs and How Someone Tries It

- Runs in any recent browser (Chrome, Safari, Firefox; phone or desktop). Needs internet the first time to fetch the libraries and models.
- Local: `npm run serve` (or `python3 -m http.server 8642`) and open http://localhost:8642.
- Live (optional deployment): GitHub Pages from `main` via `.github/workflows/pages.yml`.
- Demo recording: `python3 tests/e2e/record_demo.py` drives the sample teardown in a real browser.

## Look and Feel

From `prd.md > Look and Feel`. Background #F4F1EA (mat border), ink #1D1B18, accent safety orange #E8590C for boxes and primary buttons, teal #0F766E for "back in place". Type: "Archivo" (sturdy grotesque) for UI, tabular numbers for counts. Photos big with 8 px radius, thin ink outlines, no gradients or glow. Buttons 48 px tall. Copy is short and direct ("Something left from here", "Put back: 2 × screw").

## Components

### Comparer (`src/vision.js`)
`toMat`, `align`, `changes` (with the internal `matchLevels` exposure match), `detect` (the two passes in `PASSES`), `foreground` (GrabCut), `dilate`, `maskRegion`, `pad`. Pure functions over OpenCV Mats; `cv` is passed in.
PRD ref: `prd.md > Recording a teardown`.

### Namer and matcher (`src/embed.js`, `src/match.js`, `data/vocab.json`)
`makeEmbedder(T, 'clip' | 'dino')` returns `rgba → unit vector`. `rank` returns ranked parts plus a verdict; `suggestNames` returns three words.
PRD ref: `prd.md > Where does this go?`, `prd.md > Recording a teardown`.

### Engine (`src/engine.js`)
Browser glue: lazy-loads OpenCV.js and Transformers.js, decodes photos to pixels, runs compare → crop → embed for a new step, and lookup for a loose part. Reports loading progress.

### Keeper (`src/store.js`)
IndexedDB with one record for the current teardown and one blob per photo.
PRD ref: `prd.md > States and Boundaries`.

### Page (`index.html`, `styles.css`, `src/app.js`)
Views, box overlay (percent-positioned divs over the photo), box drawing with pointer events, Put it back walkthrough, lookup sheet.

## Data Model

```
teardown = {
  name, createdAt,
  steps: [{ photoId, width, height,              // step 0 = assembled object
            parts: [{ id, box:{x,y,w,h}, name, count, thumb(dataURL),
                      vecs:[[...dino],[...dino]], back:false, manual:false }],
            status: 'ok' | 'misaligned' | 'nochange' }]
}
photos: photoId -> Blob (JPEG, long side 1600)
```
A step's `parts` are the things removed *between* this photo and the next one; boxes are in this photo's pixels. Everything lives in IndexedDB; reload restores it; "Start over" deletes it.

## File Structure

```
undotable/
├── index.html            # page shell
├── styles.css
├── src/
│   ├── app.js            # views and interaction
│   ├── engine.js         # loads libraries/models, runs the pipeline in the browser
│   ├── vision.js         # align + change detection (OpenCV.js)
│   ├── embed.js          # CLIP / DINOv2 vectors (Transformers.js)
│   ├── match.js          # ranking, unsure verdict, name suggestions
│   ├── pixels.js         # crop / centre / scale helpers
│   └── store.js          # IndexedDB keeper
├── data/vocab.json       # CLIP text vectors for part names
├── samples/fan/          # sample teardown (AI-generated photos, labelled as such)
├── tools/build-vocab.mjs
├── tests/
│   ├── unit/             # node --test
│   ├── harness/          # Node photo pipeline + accuracy test
│   ├── photos/           # generated test teardowns, prompts, results
│   └── e2e/              # Playwright smoke + demo recorder
├── devpost/              # scope, prd, spec, checklist, app map
└── LICENSE (MIT)
```

## External Services and Dependencies

- jsDelivr CDN: OpenCV.js and Transformers.js files. Free, no key.
- Hugging Face Hub: model files fetched by Transformers.js on first use, cached by the browser. Free, no key, anonymous.
- No APIs that receive user photos.

## Important Failure Modes

- **Photos can't be lined up** (camera moved a lot, too few matching features) → step marked `misaligned`, message asks to retake or draw the box; manual box still works.
- **Model download fails or is slow** (offline, blocked) → recording still works with manual boxes; naming and lookup say "AI unavailable, try again" and keep the parts.
- **Lookalike parts** (two identical screws from different steps) → `unsure` verdict shows both; the user decides.
- **Small plain parts** (screws) → similarity is near noise; the sheet says "No close match" and shows two best guesses. On the test photos the right step was among them in all but one case (fan screws).
- **Lighting changes between shots** → `matchLevels` evens out brightness and contrast per colour channel before comparing; without it the moved-remote set missed a black screw.

## What Was Simplified and Why

- **One teardown at a time** instead of a library of projects — enough to prove the loop.
- **Fixed name list (50 words)** instead of free captioning — a 64 MB text model would otherwise download on every phone; the list covers common small parts and the user can type anything.
- **Main-thread processing** instead of a Web Worker — each step takes a second or two; the page shows a busy state.

## Decisions and Open Issues

- **Line up first, then compare** (learner's uncertainty, resolved by a test): on the moved remote set the same detector without alignment boxed the right part roughly on 2 of 5 steps and lamp shadows or edges on the others; with alignment 5 of 5. Evidence: `tests/photos/RESULTS.md`, `tests/harness/noalign.mjs`.
- **Which model matches loose parts** (open question carried from `prd.md > Open Questions`): measured 48 combinations of CLIP / DINOv2, crop views and colour weight on the generated fan and keyboard. DINOv2 on cut-out parts with colour weight 0.1 had the best top-1 (9/10) and no confident wrong answer; CLIP stays only for name suggestions. On held-out sets: right step on screen 19/20, confident and wrong 0. Numbers: `tests/photos/RESULTS.md`.
- **Show best guesses instead of "No match"**: small plain parts (screws) score near noise; saying "no match" hid the right answer that was usually ranked first or second, so the sheet shows the two closest steps under "No close match — best guesses".
- **Lookup skips parts already back in, one card per step**: during Put it back a loose part can't be one already ticked, and two screws from the same step are one answer. This changes only what the sheet shows, not the scores measured in `tests/photos/RESULTS.md`.
- **Unsure margin 0.03** on cosine similarity: tuned on the test photos; recorded with the results.
- **AI-generated test photos**: the learner asked for photos generated by an image model (Codex) to test the app before calling it done. The sample in the app uses them and says so on screen.
