# Test photos and results

UndoTable does two jobs:
1. **Spot what came off.** It compares each teardown photo with the next one and boxes the part that disappeared.
2. **Say where a loose part goes.** Given a photo of a loose part, it names the step that part came off at.

I had no real teardown photos of my own, so I generated test sets with an image model (OpenAI image generation through Codex, script `chain.py`).
- Each step photo is an edit of the previous one, made with the instruction "remove ONLY this part, keep everything else the same".
- Each loose-part photo is generated from the photo the part was still in.
- The prompts sit next to every image (`*.prompt.txt`), and each set's plan is in its `spec.json`.

| Set | What | Why it's here | Loose parts shot on |
|---|---|---|---|
| `fan/` | USB desk fan, 5 steps | Big and small parts, mostly white plastic | wooden table |
| `kb/` | 60% keyboard, 5 steps | Small, colourful parts | wooden table |
| `remote/` | TV remote, 5 steps | **Held out.** Generated after the settings were chosen. Has look-alike parts (two kinds of screws), and the loose parts are held in a palm | palm of a hand |
| `remote-moved/` | `remote/` with every step photo moved by up to 4%, turned by up to 4°, zoomed by up to 6% and re-exposed (`tests/harness/move.mjs`) | The image model kept the camera perfectly still, so this set simulates a hand-held phone | palm of a hand |

`fan` and `kb` were used to choose the settings. `remote` was generated afterwards and run with the chosen settings.

Run it yourself:

```bash
npm install
ONLY=dino/masked/cut CW=0.1 node tests/harness/eval.mjs tests/photos/remote tests/photos/results/remote
node tests/harness/summary.mjs tests/photos/results/{fan,kb,remote,remote-moved}
node tests/harness/noalign.mjs tests/photos/remote-moved tests/photos/results/remote-moved
```

## 1. Spotting what came off: 20 of 20 steps

A separate reviewer looked at every `results/*/detect-stepN.jpg`, which is the photo before step N with the boxes drawn on it.

| Set | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 |
|---|---|---|---|---|---|
| fan | clip ring (box covers the whole grille, loose) | grille ✓ | spinner cap ✓ | fan blade ✓ | 2 screws ✓ (two boxes) |
| kb | knob ✓ | Esc key ✓ | Enter key ✓ | spacebar ✓ | 2 screws ✓ (two boxes) |
| remote | battery lid ✓ | batteries ✓ | 2 silver screws ✓ (two boxes) | black screw ✓ | rubber foot ✓ |
| remote-moved | battery lid ✓ | batteries ✓ | 2 silver screws ✓ (two boxes) | black screw ✓ | rubber foot ✓ |

No step got a false box. Getting here took three fixes:
- **Screws.** The screws are only 15–20 px wide in a 1448 px photo, and the first version missed every one of them. Two changes found them:
  - A smaller minimum size for a change.
  - A finer second pass at 1600 px, which runs only when the normal pass finds nothing. See `detect()` in `src/vision.js`.
- **Exposure.** In `remote-moved`, the exposure change raised the noise level above the black screw's signal. Matching the brightness and contrast of each colour channel before comparing fixed it. See `matchLevels()`.
- **Alignment.** Lining the photos up first is what makes this work. The same detector without alignment (`results/remote-moved/noalign-step*.jpg`) got 2 steps roughly right by luck, missed 1, and boxed lamp shadows and edges on the other 2.

## 2. Saying where a loose part goes: right step on screen 19 of 20

These are the outcomes a person would see for each loose-part photo, with the settings the app ships:
- DINOv2-small image vectors
- the part cut out of its teardown photo
- the loose part cut out of its background
- colour weight 0.1

| Outcome | Count |
|---|---|
| "It goes here: step N", and right | **9** |
| "It goes here", but wrong | **0** |
| Two steps shown ("Not sure" or "best guesses"), right one among them | 10 |
| Two steps shown, right one missing | 1 (fan screws) |

Per photo (`node tests/harness/summary.mjs …`):

| Set | Part 1 | Part 2 | Part 3 | Part 4 | Part 5 |
|---|---|---|---|---|---|
| fan | sure ✓ | not sure, ✓ in 2 | sure ✓ | sure ✓ | best guesses ✗ (screws) |
| kb | sure ✓ | sure ✓ | not sure, ✓ in 2 | sure ✓ | best guesses, ✓ in 2 |
| remote (held out) | best guesses, ✓ in 2 | sure ✓ | best guesses, ✓ 2nd | best guesses, ✓ in 2 | best guesses, ✓ in 2 |
| remote-moved | best guesses, ✓ in 2 | sure ✓ | best guesses, ✓ 2nd | best guesses, ✓ in 2 | sure ✓ |

The app was also run in a real browser on the fan sample (`tests/e2e/smoke.py`, 1100 px and 390 px wide):
- Parts 1–4 come back confident and right.
- The screws come back as "No close match — best guesses". The app shows one card per step: step 5 first, then the next-best other step.

### What this means

- **Big and colourful parts work.** Knobs, keycaps, caps, blades and batteries get a confident, correct answer.
- **Small plain parts don't.** On a screw, photo-to-photo similarity is close to noise (scores around 0.1–0.3). The app says so and shows its two best guesses instead of pretending.
- **On the held-out remote, confidence drops.** The palm background lowered the scores. The right step was still among the two shown every time, but only 1–2 of 5 answers were confident. I did not retune the confidence threshold on the held-out set, because that would make it no longer held out.
- **Look-alike parts get confused.** The two silver screws ranked second, behind the black screw.

### Settings that were tried (fan + kb, 10 lookups)

48 combinations were tried:
- model: CLIP ViT-B/32 or DINOv2-small
- part view: the plain crop, or only the changed pixels
- query view: the whole photo, or a GrabCut cut-out
- colour weight: 0 to 1

The table was measured before exposure matching was added; the shipped setting was re-measured afterwards in the tables above. "Top-1" means the first-ranked step was right, whatever the confidence.

| Setting | Top-1 | Right step in top 2 | Confident but wrong |
|---|---|---|---|
| DINOv2, cut-out part and query, colour 0.1 **(shipped)** | 9/10 | 10/10 | 0 |
| DINOv2, cut-out part and query, no colour | 9/10 | 10/10 | 1 |
| DINOv2, cut-out part and query, colour 0.5 | 8/10 | 10/10 | 0 |
| Best CLIP setting | 7/10 | 8–10/10 | 0–3 |
| CLIP, plain crops, no colour (the first version) | 4/10 | 6/10 | 1 |

Colour helps the colourful keyboard. Weighted heavily, it hurts the all-white fan: with CLIP at weight 1, three answers were confident and wrong.

Part names are still suggested with CLIP, against a fixed list of 50 words (`data/vocab.json`). The suggestions are rough. A fan grille comes back as "fan blade" and a screw as "spinner cap". The person types the real name, and the sample uses typed names.

## Known problems with the test photos themselves

These are AI-generated images, not photos. A reviewer checked every image and found these problems:
- `fan/part1`: the clip ring is plain white, while in the teardown it is grey.
- `kb`: the photos get a little softer and duller with each edit.
- `remote` step 1: the lid came off together with a rubber foot stuck on it. So step 5 removes one foot, but `part5` shows two.
- `remote` steps 4–5: the colour tone shifts. I kept these as a lighting-change test.

Two images were regenerated, and the originals are not used:
- The first `kb/step5` did not actually remove the screws.
- The first `fan/part2` showed the grille with the cap still on.

Real phone photos will have more blur, glare and movement than these, so they are the next test.
