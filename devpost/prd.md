---
doc: prd
status: approved
---

# UndoTable — Product Requirements

UndoTable remembers how you took something apart, so a first-time tinkerer can put it back together without a spare screw. Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey

1. **Arrive.** The first screen says what the app does in one line and offers two buttons: "Start a teardown" and "Try the sample (desk fan)". It also says photos never leave the device.
2. **Starting photo.** "Start a teardown" asks for a name ("Desk fan") and a first photo of the whole object, taken from above. A tip says: keep the phone roughly where it was, and move removed parts out of the frame.
3. **Take something off, snap again.** After each removal the user adds the next photo. The app lines the new photo up with the previous one, compares them, and draws a box around each area that changed, on the *previous* photo (where the part still is). Each box gets a suggested name ("screw", "knob", "keycap").
4. **Confirm.** For each box the user keeps it, renames it, sets a count ("2 × screw"), or deletes it. If the app missed something they drag a box by hand. Confirmed parts appear in a parts tray grouped by step.
5. **Repeat** until the object is apart. Every step is saved on the device, so closing the tab is safe.
6. **Put it back.** "Put it back" starts at the last step and goes backwards. Each screen shows the photo from before that step with its parts circled ("Step 5 of 5: put back 2 × screw, here"). The user ticks each part as replaced; a counter shows "7 of 9 parts back".
7. **Where does this go?** At any time the user takes a photo of a loose part. The app shows the best match: the step and spot it came from, circled, with a confidence word. If two parts look too alike, it says so and shows both to choose from.
8. **Done.** When every part is ticked the app shows "All 9 parts accounted for" and the original photo.

Success = the user ends with zero unaccounted parts, and every "Where does this go?" answer either points to the right step or honestly says it is unsure.

## Screens and Layout

One page, three views switched by a top bar: **Record**, **Put it back**, **Parts**.

- **Home**: product line, two big buttons, privacy note, sample link.
- **Record**: the latest step's photo large, change boxes on top, a list of found parts under it with name/count fields, "Add next photo" button pinned at the bottom on phones. A filmstrip of earlier steps.
- **Put it back**: one step at a time, photo with circled parts, checklist of that step's parts, Back/Next, progress counter, "Where does this go?" button.
- **Parts**: the tray. Every part as a small cropped thumbnail with name, count and step number. Tapping one jumps to its step in Put it back.
- **Lookup sheet**: opens over any view after a lookup photo; shows the matched crop, the step photo with the spot circled, and the runner-up when unsure.

## Look and Feel

Workbench, not dashboard (`scope.md > Inspiration & Identity`). Warm off-white background like a cutting mat's border, dark ink text, one strong accent (safety orange) for the change boxes and the primary button; a teal for "back in place" ticks. A sturdy grotesque type, numbers in tabular figures. Photos are the hero; controls are big enough for greasy fingers (44px+). No gradients, no glowing AI imagery.

## Features and Behavior

### Recording a teardown
- As a first-time tinkerer, I want the app to notice what I just removed so that I don't have to label every photo by hand.
  - [ ] After a second photo, boxes appear on the previous photo around the areas that changed, largest change first, at most 6.
  - [ ] If the two photos can't be lined up (too different), the app says "These two photos don't line up — retake from about the same spot, or draw the box yourself" and still lets the user draw a box.
  - [ ] Each box has a suggested name from a fixed list of common part words; the user can type any name and set a count.
  - [ ] Deleting a box and drawing a new box both work on phone and desktop.
- Removed parts lying in the frame (on the mat) would also show as "changed"; the tip asks users to move parts out of frame, and the user can delete such boxes.

### Putting it back
- As the same tinkerer, I want the steps in reverse with my own photos so that I can rebuild in the right order.
  - [ ] Steps play last to first; each shows the photo before that step with its parts circled.
  - [ ] Ticking parts updates "N of M parts back"; the last tick shows the all-accounted-for screen.

### Where does this go?
- As someone holding a mystery screw, I want to photograph it and see where it came from.
  - [ ] The lookup returns the best-matching part with its step number and circled spot.
  - [ ] When the best two candidates are close, the sheet says "Not sure — it's one of these" and shows both; the user picks.
  - [ ] Picking an answer jumps Put it back to that step.

### Sample teardown
- [ ] "Try the sample" loads a 5-step desk-fan teardown and its loose-part photos, labelled as AI-generated sample photos, so a visitor can try every feature without taking anything apart.

## States and Boundaries

- **First visit / empty**: home screen with the two buttons; Put it back and Parts say "Record a teardown first".
- **Models loading**: the first comparison downloads the vision models once (about 100 MB total); a progress line says so, and later visits use the browser cache.
- **Can't line up**: message above, manual box still possible.
- **Nothing changed**: "No change found between these photos" with "Draw it" and "Retake".
- **Persistence**: the current teardown (photos, boxes, names, ticks) is kept in the browser on this device and restored on reload. "Start over" clears it after a confirm.
- **Privacy**: no uploads; all processing happens in the page.

## Product Decisions

- In-browser only, no API key — so judges and users can try it from a link, and photos stay private.
- Boxes go on the *previous* photo — that is where the part still is, which is what you need when putting it back.
- Honest uncertainty over a confident wrong answer — a wrong "it goes here" is worse than "one of these two".
- A measured test on generated teardown photos is part of done, not an extra (learner's explicit request).

## What We're Building

Home, Record (auto-detect + correct + name), Parts tray, Put it back (reverse + ticks + counter), Where does this go? (photo lookup + unsure state), on-device persistence, the sample teardown, and the generated-photo test with its written results.

## Deferred From the POC

- Multiple saved teardowns — one at a time proves the loop.
- Voice notes per step — nice, not needed for the kernel.
- Export as a shareable guide — needs layout work and sharing.

## Possible Later Enhancements

- Live camera overlay of the previous photo to help hold the phone in the same place.
- Grouping identical parts across steps ("6 × M2 screw, steps 3 and 5").

## Non-Goals

- Repair advice or diagnosis — the app records, it does not know how things work.
- Accounts, cloud, sharing — privacy and scope.
- Perfect recognition of identical-looking parts — the app asks instead.

## Open Questions

- Which in-browser model matches loose parts best (general image model vs. self-supervised one)? Decided in `spec.md` by measuring, not by guessing. Does not block the spec.
