# Demo Video Pipeline

## Where we are going

Happy's desktop and native phone demo should be repeatable from the current
production product. The recording must show a synchronized real desktop and
phone, and it must keep a truthful boundary between real app state, sync, and
actions and any scripted inference, fictional author, or offline-deployment
narrative used to tell the story.

The current published recording and its screenshots are completed history, not
the source of truth for the next recording. The stable-message-identity fix for
the phone's jump is already on `main`; the next step is to record current
`main`, not to implement that fix again.

The opening should communicate the product's value within the first second in
a familiar desktop frame by showing the actual model picker: Happy is natively
multi-model, which must not be confused with multimodal. Collaboration is a
secondary, later beat, shown with concrete and relatable people rather than
leading with a dense multiplayer scene. The phone is first-class but is not the
flagship surface. Keeping it visible at the side without enlarging it is a
direction to revisit during editorial selection, not approved choreography.
Current editorial feedback and temporary copy decisions live in
`scripts/demo/demos/core/FEEDBACK.md` rather than becoming permanent product
requirements here.

## How we get there

First, audit the recording changes in the mobile `core-demo-phone-recording`
workspace and explain how the existing capture works. Compare every patch with
current `main`: discard what the product now makes obsolete, separate genuine
product fixes from recording-only tooling or fixtures, and do not let recording
changes modify either production app.

Then isolate only the recording-specific necessities that remain. Prefer a real
completed lifecycle when it can be captured reliably. If the unwanted
`Working in sub-agents` moment still needs control, use a recording network or
event fixture rather than globally suppressing real production state, and
record the fixture boundary honestly. Filming stays under Auto permissions,
with no permission escalation, Electron host-process change, or host restart.

Next, record and inspect the desktop and real native phone together from current
production code. Capture guidance remains reproducible, and the derived preview
comes from the actual model-selection frame with text on the left, screens on
the right, and the phone peeking into the composition. Select the result only
after inspecting synchronization, stable message identity, narrative truth,
and the pending human feedback. Publish only when explicitly requested.

## How we know it is done

The demo can be reproduced from current production code without carrying old
product patches in a recording workspace. Any remaining fixture or scripted
narrative is isolated, documented, and does not claim to be real application
behavior. The selected desktop and native-phone capture stays synchronized,
opens on the product's multi-model value, introduces collaboration later, and
represents the phone as a first-class companion surface. The final recording
and preview are inspected before selection, and neither is published merely as
a side effect of making or revising the pipeline.