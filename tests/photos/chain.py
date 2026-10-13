"""Generate a teardown photo chain with Codex image_gen (edit-from-previous) + loose-part photos.
python3 chain.py spec.json outdir
"""
import json, subprocess, sys
from pathlib import Path
spec = json.load(open(sys.argv[1])); out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
here = Path(__file__).parent
def gen(name, prompt, refs=()):
    dst = out / f"{name}.png"
    if dst.exists():
        print("skip", dst); return dst
    pf = out / f"{name}.txt"; pf.write_text(prompt)
    for attempt in range(2):
        r = subprocess.run(["python3", str(here/"codex_img.py"), str(dst), str(pf), "--style", "photo", "--image", *map(str, refs)], capture_output=True, text=True)
        print(name, r.stdout.strip(), r.stderr.strip()[-300:], flush=True)
        if dst.exists(): return dst
    sys.exit(f"failed {name}")
prev = gen("step0", spec["base"])
for i, s in enumerate(spec["steps"], 1):
    p = ("Edit the attached photo. It is a top-down photo of a teardown in progress. "
         f"Remove ONLY this part: {s['part']}. Where it was, show what is underneath: {s['under']}. "
         + spec.get("keep", "Keep EVERYTHING else exactly the same: same camera position and framing, same lighting, same mat, "
         "same position and look of every other part.") + " Do not place the removed part anywhere in the frame.")
    prev = gen(f"step{i}", p, [prev])
for i, s in enumerate(spec["steps"], 1):
    p = (spec.get("part_scene", "Close-up phone photo of a single loose part lying on a wooden kitchen table:") + f" {s.get('loose', s['part'])} "
         "(it is the same part that appears in the attached photo; match its exact color, shape and material). "
         + spec.get("part_view", "Shot from a slightly angled view, natural window light, nothing else in frame except table texture."))
    gen(f"part{i}", p, [out / f"step{i-1}.png"])
