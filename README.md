# UndoTable

**Take something apart, photo by photo. UndoTable remembers which part came off where, and walks you back in reverse.**

**Try it:** https://kangraemin.github.io/undotable/ (press "Try the sample") · **Demo video:** https://youtu.be/76SbhcEdTPQ

You open a desk fan and three screws, a clip and a cap come out. Twenty minutes later there is a loose screw on the table and no idea where it came from. UndoTable is for the first-time tinkerer who wants to put it back without a spare part.

1. **Snap a photo after each part you remove.** The app lines the new photo up with the previous one and boxes what disappeared.
2. **Name the part.** You get a suggestion, or you type your own. Fix a box or draw one if the app missed it.
3. **Put it back.** The steps play in reverse, with each part circled on the photo where it still was.
4. **Where does this go?** Photograph a loose part. The app says which step it came off at, or, when it can't tell, shows its two best guesses.

Everything runs in your browser. Photos never leave the device, there is no server and you don't need an API key. The first run downloads the image models, about 110 MB, and after that they come from the browser cache.

## Try it

```bash
npm run serve      # or: python3 -m http.server 8642
# open http://localhost:8642 and press "Try the sample"
```

The sample is a desk fan teardown made of **AI-generated photos**; the app says so on screen.

## How it works

| Job | How | Code |
|---|---|---|
| Line two photos up | ORB keypoints + RANSAC homography (OpenCV.js) | `src/vision.js` `align` |
| Find what came off | Lab colour difference after matching exposure, adaptive threshold, connected regions. If nothing is found, a second, finer pass at 1600 px catches screws | `src/vision.js` `changes`, `detect` |
| Remember a part | DINOv2-small image vector of the changed pixels and of the crop, plus a colour histogram | `src/engine.js` `describe` |
| Suggest a name | CLIP image vector against 50 precomputed part-name vectors | `src/match.js` `suggestNames`, `data/vocab.json` |
| Match a loose part | Cut the part out of its background (GrabCut), compare it with every stored part that isn't back in yet, then decide: sure, not sure (two shown) or no close match (two best guesses); each card is a different step | `src/engine.js` `lookup`, `src/match.js` `rank` |
| Keep the teardown | IndexedDB on the device | `src/store.js` |

The models run with [Transformers.js](https://huggingface.co/docs/transformers.js) and [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html), both loaded from jsDelivr.

## Does it work? Tested on generated photos

I had no teardown photos of my own, so I generated four sets with an image model, edited step by step:
- a desk fan
- a keyboard
- a TV remote, held out
- the same remote with every shot moved, turned, zoomed and re-exposed

The full write-up is in [`tests/photos/RESULTS.md`](tests/photos/RESULTS.md).

- **Spotting what came off:** the removed part was boxed on 20 of 20 steps, including 15–20 px screws, with no false boxes. One box (fan step 1) is much bigger than the part.
- **Matching a loose part to its step** (20 photos):
  - **9** answers were confident and right.
  - **0** were confident and wrong.
  - In the other 11 the app showed two candidates, and the right one was among them 10 times.
- **What doesn't work yet:**
  - Small plain parts like screws. The app says it isn't sure instead of guessing.
  - Real phone photos with glare and blur. These haven't been tested yet.

```bash
npm install
npm test                                   # unit tests
ONLY=dino/masked/cut CW=0.1 node tests/harness/eval.mjs tests/photos/fan /tmp/out
python3 tests/e2e/smoke.py --width 390     # whole app in a real browser (Playwright)
```

## Built with

Planned and built with the [Build With AI: Basics](https://learn-ai-basics.devpost.com/) skill pack in Claude Code. The planning documents are in [`devpost/`](devpost/). The test photos were generated with OpenAI's image generation through Codex, and the prompts sit next to each image.

## License

MIT
