# Core demo — stable center-panel revision

This script supersedes `BRIEF.md` for the current revision. Write and verify the
recording against these criteria before publishing to `/tmp/happy-one/`.

## Rollback points and scope

- Desktop recorder/screenplay checkpoint: `ca0436fa` (local only, rebased onto
  Desktop main `8f3820f6`). Earlier checkpoints remain in Git history.
- Native phone preparation checkpoint: `7d206eb5` (local only).
- Published website/video rollback: `d5b2ca7`, with v15 media retained.
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

| Beat | Visible action                                                                                                                                                                                                                             | Intended pacing / narration guide (not subtitles)                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Start with the full desktop layout in an already prepared workspace. Show the sidebar and overall app context; no workspace creation or manual naming. Right panel is already closed. Then enter the precisely measured center-panel crop. | Brief settled opening, then one deliberate zoom. Do not say “This is Happy.”                                                                                  |
| 2    | Hold on the current Astra choice. Open the actual model menu. Move the real pointer naturally toward Fable, passing relevant alternatives and triggering their hover states, then select Fable 5.1.                                        | A purposeful choice, not a slow tour. About 6–8 seconds including a readable Fable hover; never speed up this section. Switch models inside the same session. |
| 3    | Confirm Fable selection, then type the short voice-waveform request and Astra review request. Submit once. The framing and interface do not move.                                                                                          | Readable deliberate typing; no camera or decorative marker animation.                                                                                         |
| 4    | Fable begins actual file work. Steve sends his completed steering message asking for Grok research. No Steve draft.                                                                                                                        | Give the finished message time to read; keep the collaborative point visible in the same transcript.                                                          |
| 5    | The transcript shows the actual typed delegation, including Grok 4.6 (and provider if needed), e.g. “Spawning Grok 4.6 sub-agent.” No side panel or child-chat navigation.                                                                 | Hold the inline spawn state long enough to read; continue real work normally.                                                                                 |
| 6    | A small realistic speaker-detection/voice-state logic edit happens, without opening its diff on desktop. Fable/Astra and research complete; the result and real research link settle in the center transcript.                             | Viewers do not see the actual diff yet. No phone emphasis before the entire response settles.                                                                 |
| 7    | After a settled completion hold, perform one restrained pullback to the desktop composition. Bring the upright phone forward, slightly right of center.                                                                                    | Away from your keyboard? Pick up the same session on your phone.                                                                                              |
| 8    | Phone begins on its real session list with the completed session’s actual unread indicator visible. Tap that agent, then show its concise syntax-highlighted logic diff for the first time.                                                | The changed logic must fit without horizontal scrolling. Avoid a long JSX block.                                                                              |
| 9    | Tap the phone composer. Show the native software keyboard, type “ship it”, and send through the actual linked session.                                                                                                                     | Keep the typing and Send action visible. The message really reaches the same session; do not perform an actual Git push from this demo message.               |
| 10   | Brief settled acknowledgement. Return the phone to its parked position on the right; hold that final frame.                                                                                                                                | That’s a wrap. No black outro and no added closing animation.                                                                                                 |

Timing is driven by actual UI readiness and readable holds, not by fitting the
old take's timestamps. Preserve a single shared desktop/phone clock and export
both at 60 fps with direct numbered-frame timing.

## Framing and model-picker acceptance

- Measure the real center-panel DOM rectangle after layout/fonts settle. Derive
  the crop, scale, and aspect ratio from that rectangle; do not guess offsets or
  stretch it into 16:9. Keep the whole intended conversation/composer and picker
  visible. Record the measured rectangle and transformation with the evidence.
- Begin zoomed out to establish the full app layout, then enter the crop once.
  The crop is fixed through model choice, typing, steering, delegation, and the
  completed response. Only the ending desktop/phone handoff moves after that.
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
- Prefer changing a small real logical portion of the waveform/speaker detection
  code so the native diff naturally fits. The user permits a presentation-adjusted
  diff, but any such fixture must be disclosed in the recording evidence; never
  replace transport or claim an injected phone response is live sync.
- No horizontal diff swipe. Show meaningful additions/removals, syntax coloring,
  and enough context to understand the small change at phone width.
- Native keyboard is present for “ship it”; the actual send and resulting durable
  message are verified. Script a harmless acknowledgement, not a real deployment.

## Mobile website: static composition, not video

- On narrow/mobile viewports, render a static image composition, not either
  playing video. No video source request, playback control, or motion sequence.
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
- Desktop playback remains keyboard operable, with visible focus, useful labels,
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
- Build/typecheck affected packages, then commit the website, fetch and rebase
  onto current `origin/main`, push normally to remote main, and verify Pages plus
  actual deployed desktop/mobile presentation. Preserve newer remote work.

## Completion record

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
