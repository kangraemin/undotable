---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. You can add two photos and see a box around the part that came off**
  Becomes usable: A running page where a starting photo and a second photo produce a box on the first photo around what disappeared.
  Why now: Lining photos up and spotting the change is the kernel; if it fails, nothing else matters.
  PRD ref: `prd.md > The Core Journey` (steps 1-3)
  Spec ref: `spec.md > Components > Comparer`, `spec.md > File Structure`
  Build: Static page scaffold, OpenCV.js loader in `src/engine.js`, `align` + `changes` in `src/vision.js`, box overlay in `src/app.js`.
  Verify (mechanical): `npm test` passes the vision unit tests; the sample fan step 1 → 2 shows one box on the grille.
  Learner check: Start a teardown, take a photo, remove one thing, take another, and say whether the box lands on the part you removed.
  Commit: `feat: UndoTable teardown recorder with change detection and part lookup`

- [x] **2. Each box gets a name you can keep, change or delete, and you can draw a missed box**
  Becomes usable: The parts tray fills up step by step with named parts, including hand-drawn ones.
  Why now: Detection is only useful once a person can correct it.
  PRD ref: `prd.md > Recording a teardown`
  Spec ref: `spec.md > Components > Namer and matcher`, `spec.md > Components > Page`
  Build: CLIP name suggestions against `data/vocab.json`, confirm/rename/count/delete controls, pointer-drawn boxes.
  Verify (mechanical): Smoke test confirms parts appear in the tray after each step.
  Learner check: Rename a part, delete a wrong box, and draw one by hand.
  Commit: `feat: UndoTable teardown recorder with change detection and part lookup`

- [x] **3. The teardown survives closing the tab**
  Becomes usable: Reopening the page brings back every step and part.
  Why now: A teardown takes longer than one sitting.
  PRD ref: `prd.md > States and Boundaries`
  Spec ref: `spec.md > Data Model`, `spec.md > Components > Keeper`
  Build: IndexedDB store in `src/store.js`, save after every change, load on start.
  Verify (mechanical): `tests/e2e/smoke.py` reloads mid-walkthrough and checks "teardown survives reload".
  Learner check: Record two steps, close the tab, reopen and check they are there.
  Commit: `feat: UndoTable teardown recorder with change detection and part lookup`

- [x] **4. Put it back walks the steps in reverse until every part is accounted for**
  Becomes usable: The reverse walkthrough with ticks, a parts counter and the "All parts accounted for" screen.
  Why now: This is the payoff the user came for.
  PRD ref: `prd.md > The Core Journey` (steps 6, 8), `prd.md > Putting it back`
  Spec ref: `spec.md > Components > Page`
  Build: Reverse step view with the parts circled on the photo before each step, tick list, done screen.
  Verify (mechanical): Smoke test ticks every part and reaches "All parts accounted for".
  Learner check: Run Put it back on the sample and say whether each step is clear.
  Commit: `feat: UndoTable teardown recorder with change detection and part lookup`

- [x] **5. A photo of a loose part says which step it came from**
  Becomes usable: "Where does this go?" answers with one step when sure, or two candidates when not.
  Why now: Needs recorded parts from slices 1-2 to compare against.
  PRD ref: `prd.md > Where does this go?`
  Spec ref: `spec.md > Decisions and Open Issues` (which model matches loose parts)
  Build: GrabCut cut-out of the loose part, DINOv2 vectors plus colour, `rank` verdicts, lookup sheet.
  Verify (mechanical): Smoke test looks up all five sample parts: no confident wrong answer, right step shown for at least 4 of 5. Harness on four generated sets: `tests/photos/RESULTS.md`.
  Learner check: Photograph a part from your own teardown and say whether the answer is right.
  Commit: `test: exposure matching, moved-camera set, final results and README`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 1, on a real object of the learner's
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: Not done yet. App map generated from commit b8cce33; route not toured with the learner.
Route and stops: Reference route only — `src/app.js` lookup flow → `src/engine.js` `lookup` → `src/match.js` `rank`.
Edit outcome: not applicable yet
Reflection: not offered yet
Activity mode: not started

## Revisions

- Matching uses DINOv2 instead of CLIP; CLIP only suggests names — measured on generated photos, CLIP put the right step first on 7 of 10 at best, DINOv2 on cut-out parts 9 of 10.
- Parts are stored as the changed pixels only, and the loose part is cut out of its background — plain crops let the table and background dominate the match.
- Detection runs a second, finer pass at 1600 px when the first finds nothing — the first version missed every screw (15–20 px wide).
- Exposure is matched per colour channel before comparing — a re-exposed shot raised the noise above a black screw's signal.
- "No match" became "No close match — best guesses" with two steps shown — for screws the right step was usually ranked first or second even when the score was low.
