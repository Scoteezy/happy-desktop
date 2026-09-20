# Core demo — human feedback and next-take TODO

This is important human feedback supplied by the product owner, including a
conversation with a viewer. Preserve it as input to the next demo, not as a
claim that the changes have already shipped. The current published recording
and its evidence remain historical facts in `SCRIPT.md` and `REVIEW.md`.

The current task is **documentation only**: no new recording, product patch,
workspace cleanup, analytics installation, or publication is authorized by
this checklist. Pipeline direction belongs in
[`06-demo-video-pipeline.md`](../../../../master-plans/06-demo-video-pipeline.md).

## What the humans told us

- “Can you sell the tool in 1 second?” The opening should immediately show
  model choice and the familiar Claude/desktop-style interface. The owner
  identified the model-picker frame already used in the sharing preview as
  the desired opening freeze frame. Do not make the viewer wait through an
  empty window to understand the product.
- “Don't want to overwhelm with multiplayer potentially right away.” The
  viewer suggested introducing it later: “Oh and it's Multiplayer!” Show
  relatable people with faces and recognizable workflow contributions, not
  only an `S` avatar and a generic “LGTM”. The exact people, copy, and placement
  remain editorial choices; this is not permission to invent endorsements.
- “Mobile is nice to have. It is first class support but not flagship.” The
  owner floated leaving the phone at the side without bringing it into focus.
  Revisit the current enlargement/focus beat in that light; do not mistake the
  older phone-first framing for an immutable requirement.
- The owner reported that the “ship it” message jump is **already fixed on
  mobile main**. The next step is to use current main and re-record, not to
  implement another stable-message-identity fix.
- The owner wants to understand and reduce recording hacks: remove anything
  current product code already fixes, separate genuine product changes, and
  keep necessary recording-only behavior out of the production app.

## Recording and mobile-workspace TODO

- [ ] Use current mobile main for the next take. Confirm the existing message
      identity fix is present, then re-record and visually verify that “ship it”
      stays in place through optimistic submission, acknowledgement, and history
      reconciliation. **Do not write a duplicate fix.**
- [ ] Audit `/Users/kirilldubovitskiy/Happy/Workspaces/happy/core-demo-phone-recording`
      against freshly fetched main, including both committed and uncommitted
      changes. Preserve its work before proposing removal; do not blindly merge
      the recording branch or discard local changes.
- [ ] Explain how the synchronized take works end to end: preparation of the
      private account/server and daemon, real encrypted phone pairing, seeded
      durable sessions/bots, scripted inference, actual UI interaction and native
      keyboard input, message delivery, capture clocks, and export. Identify what
      is real and what is a fixture at each boundary.
- [ ] Classify every local modification as already upstream, a genuine
      product fix, a recording-only fixture/tool, or removable. These are known
      audit targets, **not a completed audit of the latest main**:

    | Target                                                                               | What the audit must resolve                                                                                                                                                                                                        |
    | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `MessageView.tsx`, `sync.ts`, `typesMessage.ts`, `typesMessageMeta.ts`               | Local queue/sending presentation and `parentWorkingAtSubmission` changes are separate from stable message identity. Check current main before retaining or removing them; do not conceal genuine pending work or delivery failure. |
    | `Avatar.tsx`, bundled Chief of Staff image, and bot-username props at its call sites | Prefer the real upstream encrypted avatar transport. Determine whether the hardcoded fallback and recording-driven shape changes can now be removed.                                                                               |
    | `modelModeOptions.ts`                                                                | The owner explicitly accepts `xHigh`; do not ship the demo's `Extra High` label change.                                                                                                                                            |
    | `navigation/Header.tsx`                                                              | The isolated Unistyles header fix was already pushed separately as `3fd0be9e`; avoid carrying a redundant demo patch.                                                                                                              |
    | `environments/coreDemo.mts`                                                          | Keep launcher/setup tooling separate from shipped app behavior. Review fixed development secrets, dev-login inputs, inherited service environment, and private data before any proposal to share this tooling.                     |

- [ ] Remove obsolete patches after the audit. Keep necessary fixture behavior
      in isolated recording tooling/network boundaries or a disposable app copy,
      not unconditional production-source edits. A real product defect belongs
      in a separate product change, not hidden inside a demo branch.
- [ ] Remove the unwanted “Working in sub-agents” beat from the next recording.
      Earlier takes only guaranteed its absence at the ending; the new feedback
      concerns its appearance during playback too. Prefer a naturally finished
      child lifecycle; if recording-only event/network staging is necessary,
      document it explicitly. Do not globally suppress truthful production status
      or claim a still-running child actually completed.
- [ ] Start the visible experience on the model-picker frame, including the
      pre-playback poster. Keep desktop and phone on one synchronized timeline.
- [ ] Revisit the phone-focus sequence and later multiplayer treatment using
      the human feedback above before deciding the next shot list.
- [ ] Inspect the resulting take for message movement, transient status,
      readability, and phone/bezel flicker. Keep permission mode **Auto** throughout;
      do not change or restart the installed Electron host for recording.

## Website and sharing-preview TODO

- [ ] Remove the pointer-click border around the Apple Silicon / Intel
      selector; retain an accessible keyboard-focus treatment.
- [ ] Keep the sharing preview **text on the left | desktop and phone on the
      right**, using the real model-selection frame. Keep the phone peeking at the
      edge and preserve `Any Model.` / `Your Team.` / `Happy Harness` capitalization.
- [ ] Add review credibility after the GitHub statistic, on the same line if
      it remains readable: another separator dot, Apple / Google Play store icons,
      rating, and combined review count. Match icon sizing to the GitHub icon.
      The owner proposed roughly **4.9 and 4.1 thousand reviews** and ultimately
      allowed stars. Verify the underlying store figures and how they are combined
      before publishing; those suggested values are not verified measurements.
- [ ] Regenerate the preview using the website repository's existing agent
      instructions, not a new production screenshot script. Version the image;
      preserve the approved description and remember social sites can cache the
      page even after a new image is deployed.
- [ ] Plan PostHog website analytics for understanding visitor behavior. The
      owner said Search Console alone is not enough. Agree on events and privacy
      requirements before installing anything; do not treat the pasted suggestion
      as permission to enable tracking now.

After implementation is explicitly requested: review the new footage and
preview with the owner, then publish only the selected website/media changes
when asked. A demo publication is not a desktop, mobile, or Agent release.
