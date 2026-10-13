---
doc: scope
status: approved
---

# UndoTable

Undo for the stuff you take apart: snap a photo after each step, and when it is time to rebuild, the app shows where every loose part came from and walks you back in reverse.

## The Unique Kernel
The app records *your* teardown, not a generic repair guide. It compares each photo with the one before it, marks what disappeared, and later matches a loose part in your hand to the exact step and spot it came from. "Where did this screw come from?" gets answered with your own photo, circled.

## Who It's For
A first-time tinkerer opening a desk fan to clean it, or swapping keycaps and the knob on a mechanical keyboard. Today they take a few random phone photos (or none), end up with a spare screw, and scroll through the camera roll guessing which picture shows where it went. Repair guides (iFixit) help only if someone already wrote one for that exact model, and they never know where *you* put things.

## The Core Loop
Take a part off → snap a photo → the app circles what changed and suggests a name → confirm or fix it. Repeat until the thing is apart. Later, open "Put it back": the steps play in reverse, each part highlighted in the photo where it belongs, and a "Where does this go?" camera button answers for any loose part.

## Inspiration & Identity
A workbench, not a dashboard: calm, practical, photos first, big tap targets for greasy fingers. References: iFixit step photos (https://www.ifixit.com), the feel of a parts tray with labelled compartments. No accounts, no cloud: photos stay on the phone.

## Why This Matters to the Learner
"I always end up with one extra screw." And a real question to answer: can a model that runs inside the browser do this well enough, measured on photos it has never seen?

## What "Working" Looks Like
Open the page on a phone or laptop, record a 5-step teardown, and get the right part circled at each step. Then pick up a loose part, take its photo, and the app jumps to the step it came from with that spot circled. The "oh, that's cool" beat: you point the camera at a random screw and the app answers "Step 5, base stand, here" with your own photo.

## The POC Boundary
- One teardown at a time, kept on the device.
- Automatic "what changed" detection between consecutive photos, with manual correction (remove a box, draw one).
- Suggested part names, editable.
- Reverse "Put it back" walkthrough with a parts-accounted-for counter.
- "Where does this go?" photo lookup with an honest "not sure, is it one of these?" when two parts look alike.
- A sample teardown so anyone can try it without taking anything apart.
- A measured test on image-model-generated teardown photos (two objects), written up in the repo.

## Later
- Voice notes per step.
- Several saved teardowns, export/share as a PDF guide.
- Live camera guidance ("hold the phone where you held it last time").

## Explicitly Cut
- Repair diagnosis or instructions: the app only remembers what you did, it does not know how to fix anything.
- Accounts, cloud sync, sharing: privacy first and not needed to prove the kernel.
- Server-side AI or API keys: everything runs in the browser so anyone can try it from a link for free.
