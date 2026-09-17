# Core demo — readable beats, one window, decisive phone ending

This script supersedes `BRIEF.md` for the current revision. Write and verify the
recording against these criteria before publishing to `/tmp/happy-one/`.

## Current follow-up — v21 (take `v21-r2`)

- Add a real non-admin bot named `Release Coordinator` beside Chief of Staff
  on desktop and in the phone list. Use the exact user-selected DiceBear
  Adventurer Neutral avatar, seed `Celia`, with attribution in the asset folder.
  Use the upstream encrypted bot-avatar sync, not a phone-only image mapping.
- Keep v20's finished-review ending and focused-phone positioning below.
- Put `Free and open source` closely under the Happy Harness heading in the
  existing download-caption style without moving the movie down.
- Put secondary Windows/Linux links beneath the Homebrew command, with their
  logos at the text's cap height. Detect the desktop OS for the primary badge;
  Windows does not show Homebrew. All desktop download links resolve directly
  to production installers, using the latest stable release with a verified
  production fallback if the public release lookup is unavailable.

The v21-r2 capture passes with 3,867 frames at 60fps (64.45s). Both actual
messages remain Auto. Phone focus is 34.783333–49.566667s; Astra finishes at
52.1s before Deployed at 59.283333s. The selected avatar was visually verified
on the real phone list. Exact cues and bot identity are retained with the take.

## Previous follow-up — v20 (take `v20-r1`)

- App Store and Google Play share one centered row below the macOS installation
  controls. At 480px and narrower, retain the requested vertical stack.
- Keep the parked phone placement unchanged. On focus, enlarge by the existing
  1.18 scale and shift left only enough to keep its right bezel inside the
  viewport, with at least the parked desktop-to-phone gap as its right margin.
  It may overlap the desktop. Wide viewports that already satisfy this margin
  need no translation. The desktop and macOS download remain exactly centered.
- Astra finishes its real review during the shipping beat, before Deployed.
  Assert the child is idle and the final UI has no Working in subagents status;
  do not hide a still-running agent cosmetically. A concise review report may
  arrive naturally. This supersedes the older off-camera completion rule.

The capture passed with 3,877 frames at 60fps (64.616667s). Phone focus starts
at 34.95s and ends at 50.166667s. Astra actually becomes idle at 52.433s;
Deployed arrives at 59.433s. The final UI assertion confirms there is no
Working in subagents status. Exact times are in `artifacts/v20-r1/cues.json`.

## Previous revision — v19 (take `v19-r3`)

This revision supersedes the v18 record below.

- Auto remains enabled throughout desktop and phone. Never open the phone's
  permission menu or switch the session to Full access for filming.
- The real automatic naming request receives both `Add voice waveform` as
  the chat title and `voice-waveform` as the workspace slug. Wait for the
  ordinary naming service to apply it; do not rename manually or overlay text.
- Steve's greeting is `Hi, Steve 👋 Pushing to main. Waiting for CI to deploy.`
  The emoji is static inline text beside his name. No wave sticker.
- Shipping returns to the previously authorized offline screenplay: the Bash
  process uses explicitly documented Git/CI fixtures. The simulated push
  restores only the prepared waveform file to its exact baseline and the real
  Git watcher clears the counters. No Git history, remote, deployment, or
  permission decision is changed by the simulated shipping command.
- Native mobile: an idle online send appears immediately as a normal message,
  without a temporary Sending/Queued banner or dimmed bubble. A message truly
  queued behind a working parent retains its queue indicator. Errors and
  offline state remain visible; transport receipt state is not fabricated.
- Keep the desktop video centered, and put the macOS download on that exact
  centerline. The decorative phone yields space, including clipping up to 70%
  off the right edge. Its video slightly overlaps beneath the bezel to prevent
  a subpixel seam during transitions. Narrow screens stack the store badges.
- Preserve the rebased marketing copy-command update; use a researched compact
  overlapping-square copy glyph. Native video controls and paired seeking stay.

| Beat            | Viewer sees                                                  | Minimum settled reading time         |
| --------------- | ------------------------------------------------------------ | ------------------------------------ |
| Opening/model   | Full static window, actual Fable picker and hover path       | Preserve v18 picker pacing           |
| Prompt/thinking | Request sends, Thinking, automatic workspace naming          | At least 2.5s Thinking               |
| Work            | Reads, edit +3/−1, Astra spawn, concise completion           | 1.6s edit; 2.8s spawn; 3s completion |
| Phone           | Unread session, open concise native diff, Auto unchanged     | 2.2s home; 4s diff                   |
| Send            | Native keyboard types ship it; normal optimistic bubble      | Brisk typing; no permission detour   |
| Ending          | Static inline greeting; staged Git/CI; real cleared counters | 3.6s completed result                |

The full capture and its assertions passed. Both submitted messages carry
`permissionMode: auto`. The Git read model reports zero changes after the
offline fixture, with HEAD and the fixture origin still at their baseline.

### Measured viewer timeline — 63.833s / 3,830 frames at 60fps

| Interval       | What the viewer sees / connects                                |
| -------------- | -------------------------------------------------------------- |
| 0–4.067s       | Full stable window and the model control                       |
| 4.067–8.733s   | Actual model menu, deliberate hover path, Fable selected       |
| 8.733–15.533s  | The waveform/Astra request typed and submitted                 |
| 15.533–20.283s | Thinking; workspace automatically becomes voice-waveform       |
| 20.283–26.333s | Real reads and Edit; sidebar +3/−1                             |
| 26.333–34.817s | Astra spawn, short completion, settled reading hold            |
| 34.817–39s     | Phone forward, unread session, enter and reveal diff           |
| 39–44.767s     | Concise native diff, Auto unchanged, no permission menu        |
| 44.767–47.283s | Native keyboard types ship it and sends                        |
| 47.283–49.1s   | Normal sent message; return to the session list                |
| 49.1–53.583s   | Steve on desktop, static inline greeting, Bash; counters clear |
| 53.583–58.9s   | Offline CI watch continues in the visible running command      |
| 58.9–63.833s   | Completed result, confetti, final product hold                 |

The exact source is `artifacts/v19-r3/cues.json`. The phone and desktop share
one continuous real-time clock; export and browser inspection are recorded in
`REVIEW.md` after verification.

## Previous revision — v18 (take `v18-r3`)

The user's revision of the v17 script. Everything below this section is the
v17 record and stays for history; where the two disagree, this section wins.

- No camera moves. The whole recording is one static window, 780×664 CSS px
  (1950×1660 at 2.5×): the sidebar at the product's minimum width (220 px) and
  a 560 px main pane. Nothing is zoomed, letterboxed, or cropped.
- First turn: pick Fable in the real menu, type the prompt, send. Thinking, two
  file reads, the real Edit (+3 −1 in the sidebar), the real Astra sub-agent
  spawn, then one short completion. No Steve steering, no Grok, no
  "Message from …" rows: Astra's review is held until after the take.
- Phone beat: the session is unread on the real phone list; open it, show the
  syntax-highlighted diff, choose Full access in the phone's own permission
  menu on camera, type "ship it" on the native keyboard, Send, go back home.
- Ship beat: the desktop replies "Hi Steve, pushing to main. Waiting for CI to
  deploy." with a wave sticker, then one real Bash command commits, pushes
  `HEAD:main` into the gym's own bare origin, and watches the deploy run through
  the offline `gh` fixture. The sidebar counters clear through the real Git
  watcher. "Deployed. The waveform is live." lands with the standard confetti.
  The screenplay only claims a deploy when the daemon reports success.
- Website: native video controls on the desktop movie (muted by default), the
  phone follows the desktop clock, one layout at every width, no captions or
  custom controls, the phone drawn full size to the right, downloads directly
  below the figure.

### Measured viewer-experience timeline — v18-r3 (69.9 s, 4,194 frames)

| Time   | Event                                                 |
| ------ | ----------------------------------------------------- |
| 0.0 s  | Settled window on the fresh workspace, Astra selected |
| 4.1 s  | Model menu opens; pointer passes Astra and Opus       |
| 8.7 s  | Fable 5.1 chosen                                      |
| 15.5 s | Prompt sent; Thinking visible                         |
| 20.3 s | First file read visible                               |
| 23.5 s | Real Edit lands; sidebar shows +3 −1                  |
| 26.4 s | "Spawned GPT-6 Astra sub-agent"; footer shows 1 Agent |
| 31.6 s | Completion text; "Completed in 15s"                   |
| 35.0 s | Phone forward: session unread on the real list        |
| 38.7 s | Session open; 39.2 s diff visible                     |
| 45.3 s | Permission menu; 48.3 s Full access chosen            |
| 50.7 s | Native keyboard typing "ship it"; 53.3 s Send         |
| 55.1 s | Phone back home; Steve's message on the desktop       |
| 55.9 s | Greeting and wave                                     |
| 57.2 s | Bash row running the real ship command                |
| 59.7 s | Sidebar counters clear (real Git watcher)             |
| 65.0 s | "Deployed. The waveform is live."; confetti           |
| 69.9 s | End hold after "Completed in 12s"                     |

## Rollback points and scope

- Desktop recorder/screenplay checkpoint: `abcf40d2` (local only, rebased onto
  Desktop main `8f3820f6`). Earlier checkpoints remain in Git history.
- Native phone preparation checkpoint: `5e0c75db` (local only).
- Published website/video rollback: `9f32a1d`, with v16 media retained.
- Keep the precise upright Black Titanium frame. Retain the unused 3D variant.
- Do not build the laptop-closing / cinematic 3D transition in this pass.
- Never modify or restart the actual Electron host. Use isolated recording
  processes and the separate native phone workspace.
- If inline delegation needs a product change, implement its explicit provider/
  model presentation as a separate commit from demo/script changes. Do not fake
  its model identity by parsing a task title or adding a recording-only overlay.

## Desktop video script

The model choice is a principal product moment. All footage is real-time 1×.
No accelerated picker section, hard cuts between choices, moving camera during
model selection, right-hand activity panel, or desktop diff viewer.

### Pacing principles

- One new idea at a time. Readiness is not permission to rush to the next action.
  After each visible state arrives, hold it long enough to understand it.
- Submission, thinking, Steve's intervention, delegation, and completion are
  separate beats. Do not let them read as one continuous stream of arrivals.
- Show real thinking/activity presentation for at least 2.5 seconds before the
  first answer block. Hold the first answer block for at least 2 seconds before
  Steve's completed message; hold his message for at least 3.5 seconds before
  spawning Grok. Hold the actual inline spawn for at least 2.5 seconds.
- Deliver short, complete prose blocks instead of a constant trickle of tokens.
  Wait between blocks when there is another point to absorb. Keep actual tool
  execution, linked state, native keyboard input, and transport real.
- The final completion is one compact block with two short paragraphs (about
  27 words), followed by “Ready to ship.” Both the waveform/review outcome and
  Grok's link must remain visible together during the settled hold.
- Keep the approved picker pace and fixed measured center crop. Do not add
  movement to fill a pause. Prefer a still pointer and stable content.
- Review actual encoded playback critically, including the transitions between
  beats. A collection of attractive screenshots is not proof of good pacing.

| Beat | Visible action                                                                                                                                                                                                                             | Intended pacing / narration guide (not subtitles)                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Start with the full desktop layout in an already prepared workspace. Show the sidebar and overall app context; no workspace creation or manual naming. Right panel is already closed. Then enter the precisely measured center-panel crop. | Brief settled opening, then one deliberate zoom. Do not say “This is Happy.”                                                                                      |
| 2    | Hold on the current Astra choice. Open the actual model menu. Move the real pointer naturally toward Fable, passing relevant alternatives and triggering their hover states, then select Fable 5.1.                                        | A purposeful choice, not a slow tour. About 6–8 seconds including a readable Fable hover; never speed up this section. Switch models inside the same session.     |
| 3    | Confirm Fable selection, then type the short voice-waveform request and Astra review request. Submit once. The framing and interface do not move.                                                                                          | Readable deliberate typing; no camera or decorative marker animation.                                                                                             |
| 4    | Submission visibly enters thinking, then Fable begins actual file work. After a distinct settled beat, Steve sends his completed steering message asking for Grok research. No Steve draft.                                                | Separate thinking, work, and Steve's message with readable pauses. Keep the collaborative point visible in the same transcript.                                   |
| 5    | The transcript shows the actual typed delegation, including Grok 4.6 (and provider if needed), e.g. “Spawning Grok 4.6 sub-agent.” No side panel or child-chat navigation.                                                                 | Hold the inline spawn state long enough to read; continue real work normally.                                                                                     |
| 6    | A small realistic speaker-detection/voice-state logic edit happens, without opening its diff on desktop. Fable/Astra and research complete; the result and real research link settle in the center transcript.                             | Viewers do not see the actual diff yet. No phone emphasis before the entire response settles.                                                                     |
| 7    | After a settled completion hold, perform one restrained pullback to the desktop composition. Bring the upright phone forward, slightly right of center.                                                                                    | Away from your keyboard? Pick up the same session on your phone.                                                                                                  |
| 8    | Phone begins on its real session list with the completed session’s actual unread indicator visible. Tap that agent, then show its concise syntax-highlighted logic diff for the first time.                                                | The changed logic must fit without horizontal scrolling. Avoid a long JSX block.                                                                                  |
| 9    | Tap the phone composer. Show the native software keyboard, type “ship it” briskly, and send through the actual linked session.                                                                                                             | Aim for about 1–2 seconds of typing, with actual native input and no unnecessary pause before Send.                                                               |
| 10   | Show the staged shipping result “Pushed to main. New version is being deployed.” The owned fixture's real change set clears through normal Git synchronization. Return home, then park the phone.                                          | Push/deploy is explicitly a screenplay fixture, as authorized by the user. No real push/deploy or fabricated permission-review approval. Hold the settled result. |

### Viewer-experience timeline

These are target windows for the next take, not an instruction to accelerate
footage to hit a runtime. The final evidence must add actual start/end times
beside them. There are no hard scene cuts: the two measured camera moves and
the late phone emphasis are the only framing transitions.

| Target time | Duration | Viewer sees / reads                                                                                        | What the viewer should connect                                                | Content and pacing budget                                                                                                                                        |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:02   | 2s       | The full app: project sidebar, prepared workspace, empty conversation and composer.                        | “This is my working environment, not an isolated chatbot.”                    | No narration introducing Happy. No workspace creation, right panel, or unrelated banner. Hold before moving.                                                     |
| 0:02–0:03   | 1s       | One smooth move into the precisely measured center panel.                                                  | “This is where the work happens.”                                             | One transition only; the following selection and conversation stay locked here.                                                                                  |
| 0:03–0:10   | 7s       | Actual model menu; purposeful pointer path with hover feedback; Fable 5.1 selected above Opus.             | “I choose the model for this conversation.”                                   | Preserve the approved picker pace. A readable Fable hover, not a tour of every option. First supporting caption below the video: multi-model work.               |
| 0:10–0:17   | 7s       | The short waveform request plus Astra review request is typed and submitted.                               | “One task can use more than one model.”                                       | One prompt, about 17 words; no other message arrives while the viewer reads it.                                                                                  |
| 0:17–0:20   | 3s       | Submitted prompt and genuine thinking/activity state.                                                      | “The agent has started; it is working on my request.”                         | Do not immediately fill the transcript. Keep thinking visible for at least 2.5s after it actually appears.                                                       |
| 0:20–0:23   | 3s       | One short answer block: reuse the voice bars; then the first real file read.                               | “It is working in the actual code.”                                           | One sentence, approximately 12–16 words. Whole-block arrival, then at least 2s of settled reading.                                                               |
| 0:23–0:27   | 4s       | Steve's completed steering message asks for Grok research, while the parent is still working.              | “A teammate can steer the same live conversation.”                            | One collaborator message, about 16 words; no draft. At least 3.5s before the next new idea.                                                                      |
| 0:27–0:31   | 4s       | A brief acknowledgement and the actual inline Grok 4.6 sub-agent spawn.                                    | “The request becomes a real specialist working alongside the original agent.” | No side panel. Keep acknowledgement short; hold the real spawn row at least 2.5s.                                                                                |
| 0:31–0:36   | 5s       | A small Edit row, then Astra's inline review; no desktop diff.                                             | “The code work continues while research/review happens.”                      | Tool events separated by a pause; no token flood or extra explanatory paragraph. The phone remains parked on home.                                               |
| 0:36–0:42   | 6s       | Concise completed waveform/review result, then completed Grok finding and one real X link.                 | “Both branches finished and came back to the same conversation.”              | At most two short prose blocks, roughly 40 words total. Separate their arrival; hold all results settled at least 3s. No unexplained still-running research.     |
| 0:42–0:44   | 2s       | One restrained pullback to the full app; the upright phone becomes prominent beyond the window edge.       | “The same work is available away from the keyboard.”                          | No new desktop message competing with the transition. Second supporting caption below: end-to-end encrypted mobile client.                                       |
| 0:44–0:47   | 3s       | Real phone session list, real project avatars, actual unread result badge.                                 | “My completed session is waiting for me.”                                     | Keep home visible before entering. No What's New, unrelated bot list, or extra phone tour.                                                                       |
| 0:47–0:51   | 4s       | Tap the session, then reveal its concise syntax-highlighted logic diff.                                    | “I can inspect the actual change on my phone.”                                | One necessary scroll at most; stop as soon as the useful diff fits. Never swipe it farther upward for decoration.                                                |
| 0:51–0:55   | 4s       | The short +/− logic diff stays still.                                                                      | “I can understand and approve this change here.”                              | No horizontal scroll; enough context to read the connected/speaking condition. Desktop stays quiet.                                                              |
| 0:55–0:58   | 3s       | Native keyboard opens; “ship it” is typed briskly and sent.                                                | “I can act, not just watch.”                                                  | Approximately 1–2s of actual typing. Avoid a long pre-Send pause.                                                                                                |
| 0:58–1:03   | 5s       | Staged shipping completion; actual change counters clear; “Pushed to main. New version is being deployed.” | “The action completes the workflow.”                                          | One concise result. Push/deploy is staged. Restore only the owned fixture edit to its baseline and wait for the real Git watcher and phone to show zero changes. |
| 1:03–1:07   | 4s       | Settled success, phone returns to its parked right-hand position, final hold.                              | “I can carry this work between desktop and phone.”                            | No new concept, black card, extra subtitle, or closing flourish. End on the product.                                                                             |

The target is approximately 67 seconds, with breathing room rather than a hard
ceiling. If native navigation or tool work takes longer, shift later windows
instead of shortening the meaningful reading holds. Record actual timing and
visible word counts after the take; check whether each takeaway landed before
the next one appeared. A hold begins when its content is visible and stable,
not when an API request was sent.

Preserve a single shared desktop/phone clock and export both at 60 fps with
direct numbered-frame timing. Do not speed up the picker or erase real loading
states to manufacture the target runtime.

## Framing and model-picker acceptance

- Measure the real center-panel DOM rectangle after layout/fonts settle. Derive
  the crop, scale, and aspect ratio from that rectangle; do not guess offsets or
  stretch it into 16:9. Keep the whole intended conversation/composer and picker
  visible. Record the measured rectangle and transformation with the evidence.
- Begin zoomed out to establish the full app layout, then enter the crop once.
  The crop is fixed through model choice, typing, steering, delegation, and the
  completed response. Only the ending desktop/phone handoff moves after that.
- The movie contains no desktop wallpaper, rounded inner window, or shadow. The
  website owns one macOS-style window frame with decorative traffic lights.
  The phone is a sibling outside its clipping boundary and visibly protrudes
  beyond the right and bottom edges, including during its focused ending.
- Use an intentionally narrower prepared layout that keeps the main content
  legible; the picker must not be clipped by either source or export boundaries.
- Match the models actually enabled/used on this machine, using a read-only
  inspection of its current selections. No duplicate Claude account in the demo.
  Fable 5.1 appears above Opus. Do not change real account connections or global
  model preferences merely to dress the recording.
- Real pointer paths take their time, enter actual hit targets, and produce real
  hover states. No teleporting among model choices or editorial cursor overlay
  that disagrees with the browser's pointer. Move naturally in the direction of
  the intended choice; do not linger on every option or make a theatrical tour.

## Phone and change acceptance

- Continue the real encrypted desktop/native link and real session data. Keep
  actual project avatars and the single Chief of Staff bot.
- The phone remains secondary/parked while desktop work happens. Its focused
  sequence begins only after the parent response and delegates have finished.
- Keep the phone on the session list until the ending handoff; tap into the
  session there. The earlier idea of opening it mid-generation is superseded.
- Preserve and verify the real unread status on the session list before entry;
  do not paint an unread badge into the recording.
- Dismiss “What's New” through the normal native read action off camera. It must
  not distract from the actual session list in the recorded take.
- Prefer changing a small real logical portion of the waveform/speaker detection
  code so the native diff naturally fits. The user permits a presentation-adjusted
  diff, but any such fixture must be disclosed in the recording evidence; never
  replace transport or claim an injected phone response is live sync.
- No horizontal diff swipe. Show meaningful additions/removals, syntax coloring,
  and enough context to understand the small change at phone width.
- Stop scrolling as soon as the concise diff is visible. Do not add a second
  upward swipe or pull already visible content away from its useful position.
- Native keyboard is present for “ship it”; the actual send and resulting durable
  message are verified. Push/deployment narration is a declared screenplay,
  explicitly permitted by the user. Restore only the owned fixture edit to its
  baseline, then verify the authoritative Git API and phone counters clear.
  Never inject a permission approval or push a production repository for the shot.
- The attempted local shipping tool in rehearsal v17-r4 reached a permission
  reviewer that also used the scripted inference endpoint. It did not produce a
  valid verdict before the take timed out. Do not supply a fake approval or retry
  that tool: the filmed ending now uses only the permitted presentation fixture.
- After the success hold, return normally to the session list before parking the
  phone. Verify the completed session's change counts are gone. Do not leave an
  idle keyboard covering the final product frame.

## Mobile website: focused playback with a static fallback

- Try the actual synchronized video in a taller center-focused mobile viewport.
  Verify the important picker, message, and phone states at 320, 390, and 430 CSS
  px. Do not publish a crop that cuts away the point being demonstrated.
- Use matched 30 fps mobile derivatives. Reduced-motion/save-data visitors get
  the real static composition with no automatic movie request and an explicit
  playback opt-in. Retain a full-size screenshot link and useful text alternative.
- Main screenshot is the narrow, center-focused state with the model picker
  open, visible sidebar context, and an Edit/file +/- cue. Capture this as an
  honest separate still from the real prepared app after the edit; do not splice
  contradictory states together without disclosure.
- An upright phone showing the real session list peeks from the right. It is
  deliberately partially off-canvas, not a complete second tiny screen.
- Crop intentionally rather than shrinking an entire desktop until unreadable.
  Check 320, 390, and 430 CSS px and 200% zoom for document overflow, clipping of
  essential text, and sensible layout. Decorative peeking may be clipped.
- Provide a concise readable text alternative describing the selected model,
  delegated work, edit, and cross-device continuation. Screenshot text is not the
  only way to understand the feature. Use useful alt text without duplication.
- No subtitles over the footage and no full-screen title cards. Show only a
  couple of concise supporting captions below the desktop video at relevant
  moments: multi-model work and the end-to-end encrypted mobile client. Do not
  narrate every action. Keep a readable accessible text alternative on mobile.
- Playback remains keyboard operable, with visible focus, useful labels,
  off-screen/hidden pause, reduced-motion handling, and usable controls at zoom.
- Keep Credits in the footer beside the existing navigation links.

## Verification and publication

- Inspect the actual encoded picker hover frames, center-panel geometry, spawn
  row, completed response, phone diff, keyboard typing, Send, and ending.
- Compare real mobile screenshots and accessibility semantics in Chromium,
  Firefox, and WebKit. Check keyboard navigation and motion preferences manually;
  do not add test suites without a separate request.
- Keep inference timing/text and Steve’s identity explicitly documented as
  screenplay fixtures. File work, delegation, native sync, and phone send remain
  real. Retain evidence of exact timestamps and states.
- Use Fable 5.1 High once for focused copy/story review and Antigravity for
  obvious visual/flow problems only if the scoped external sharing is explicitly
  authorized and Auto review permits it. Prior sharing was denied; do not bypass
  or silently retry. Local inspection is not their sign-off.
- Obtain the newly requested Grok 4.6 Extra High review of the actual video;
  address actionable pacing, readability, or framing findings before publication.
- Build/typecheck affected packages, then commit the website, fetch and rebase
  onto current `origin/main`, push normally to remote main, and verify Pages plus
  actual deployed desktop/mobile presentation. Preserve newer remote work.

## Measured viewer-experience timeline — v17-r6

Final take: **67.967 seconds, 4,078 frames at 60 fps**. The intervals below use
the final `cues.json`, not approximate rehearsal timestamps. All footage remains
1×; there are no hard cuts. Durations are rounded to milliseconds.

| Actual interval | Duration | Visible scene / content budget                                                       | Connection before the next scene                                        |
| --------------- | -------: | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 0.000–1.617     |   1.617s | Whole prepared desktop, project sidebar, empty conversation.                         | Establish the complete working environment.                             |
| 1.617–2.733     |   1.116s | One measured zoom to the center panel.                                               | Direct attention to the work without losing app context.                |
| 2.733–10.000    |   7.267s | Astra choice, actual picker at 5.333s, purposeful hover path, Fable selected.        | Choose a model within this same session.                                |
| 10.000–16.783   |   6.783s | One 16-word waveform/Astra-review request, typed and submitted.                      | One task can involve multiple models.                                   |
| 16.783–21.067   |   4.284s | Submitted prompt and actual Thinking state; no answer yet.                           | The agent has started working.                                          |
| 21.067–24.500   |   3.433s | One complete 10-word response; first actual Read arrives at 23.450s.                 | The agent is working in the code before the teammate intervenes.        |
| 24.500–29.317   |   4.817s | Steve's completed 15-word request; then a short acknowledgement and the real spawn.  | A teammate can steer the work already underway.                         |
| 29.317–32.783   |   3.466s | Fully rendered `Spawned Grok 4.6 sub-agent` row; no side panel.                      | The request becomes a real delegated task.                              |
| 32.783–41.017   |   8.234s | Real Edit +3/−1, Astra review, then a 27-word combined completion and research link. | Code, review, and research return to one conversation. No desktop diff. |
| 41.017–44.033   |   3.016s | All results settled, delegate replies, “Ready to ship.”                              | Both branches really finished before attention moves away.              |
| 44.033–45.483   |   1.450s | One pullback to the full desktop.                                                    | This work can continue away from the keyboard.                          |
| 45.483–49.217   |   3.734s | Upright phone grows in place; real home list and unread result.                      | The completed session is waiting on the phone.                          |
| 49.217–49.683   |   0.466s | Open session and reveal the concise native diff.                                     | Enter the same session, not a separate mockup.                          |
| 49.683–55.550   |   5.867s | Colored speaking-state predicate, stationary, no horizontal scroll.                  | Read and understand the change before approving it.                     |
| 55.550–58.033   |   2.483s | Native keyboard, “ship it,” real Send; actual key touches total 1.781s.              | Act from the phone, not merely observe.                                 |
| 58.033–60.967   |   2.934s | Actual sent message and working state; real Git counters clear.                      | The action is being handled.                                            |
| 60.967–65.450   |   4.483s | Eight-word staged shipping result, readable hold, normal return home.                | The workflow completes; the keyboard does not cover the final shot.     |
| 65.450–67.967   |   2.517s | Phone parks on the session list; final product hold.                                 | End on the connected desktop and phone.                                 |

The first response stands alone for 2.383s before Read. Steve gets a deliberate
3.5s hold before the next inference step, and the fully typed Grok row gets a
2.8s director hold. The center rectangle is unchanged for all 2,478 locked
frames. The final source has zero caption overlays and zero speed changes.

The phone uses real encrypted synchronization, native touches, unread/read
state, and Git counts. The final push/deployment sentence is explicitly staged;
no repository was pushed or deployed for that shot. The local Git tracker fix
publishes the genuinely clean fixture snapshot to the phone. The archive and
Git fixes are recording-build changes, not claims of a released Agent update.

The portrait mobile crop was rejected after visual inspection because it cut
real prose. The website uses the actual narrow still plus partially peeking
phone by default, with explicit uncropped 30fps playback and a readable HTML
summary/full-size image link. Both 30fps files contain exactly 2,039 frames;
their endpoint is identical to the 60fps masters, without padding or retiming.

See `REVIEW.md` for encoded inspection, browser results, publication status,
root causes, and reviewer limitations.

## Previous completion record (v16; superseded acceptance above)

Fill in measured geometry, final cue times, source boundaries, review outcomes,
artifact paths, and deployed commit only after the corresponding work is verified.

Final recording: `artifacts/v16-r14`, 3,801 frames at 60 fps / 63.350s. All
actual desktop/native flow checks passed, including the unread state, concise
diff, native key taps, real send, and acknowledgement. The 2100×1660 separate
still visibly retains sidebar, edit counts, and Fable picker. The desktop crop
is exactly 2340×1440 and remains fixed from 2.733s through 40.200s.

The archive metadata loop is fixed and regression-verified locally. Its remote
Agent push awaits fresh authorization; this take uses the isolated fixed
development binary. See `REVIEW.md` for final cue times, verification,
export quantization, and publication/review boundaries. Website deployment and
external reviewer sign-off are not implied by completion of the recording.
