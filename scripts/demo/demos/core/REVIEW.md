# Core demo — local review

## Stable-center revision — final take v16-r14

The final local [desktop video](./artifacts/v16-r14/core.mp4),
[native phone screen](./artifacts/v16-r14/phone-screen.mp4), and
[transparent Black Titanium bezel](./artifacts/v16-r14/phone-bezel.webm)
share 3,801 frames at 60 fps: 63.350 seconds. Desktop is 2340×1440;
phone is 1206×2622; the precise bezel canvas is 1406×2822. Native capture
trim is 0.000125042 seconds, and its source covers the entire take.

The center crop remains identical for all 2,248 frames from 2.733s through
40.200s. There are zero overlaid caption frames and zero speed changes.
Actual encoded desktop and phone key frames were inspected: full-layout
opening, readable Fable hover, Steve steering, typed Grok spawn, completed
research link, real unread badge, narrow colored diff, native keyboard,
typed message, and acknowledgement. The separately captured mobile still
now keeps `Edit waveformActive.ts +3 −1` above the real model menu, with
project sidebar and Fable above Opus visible. A real upward wheel gesture
disengages follow-tail before framing; the still has a geometry assertion.

| Cue                                   |         Seconds |
| ------------------------------------- | --------------: |
| Picker open / Fable selected          |  5.317 / 10.000 |
| Work starts / Steve steers            | 16.783 / 19.533 |
| Grok spawned / response settled       | 23.867 / 37.033 |
| Phone foreground / session opened     | 41.633 / 44.833 |
| Phone diff visible / keyboard visible | 47.017 / 52.883 |
| Phone message sent / phone parked     | 58.767 / 60.833 |

The phone uses actual native key taps through the existing, serialized XCTest
driver. Its listening process is checked against the simulator UDID before
touches; ambiguous touches are never retried. Eight touches, including Shift,
took 2.767 seconds. Exact `ship it` text and the durable acknowledgement are
verified. The recorder now owns the entire native automation process group,
including XCTest's host restart process; final cleanup left no native driver
or listener. This fixes a separate failed-take collision, not the archive bug.

The website v16 export copies the unchanged 60 fps masters. Matched lighter
files are 1560×960 and 804×1748, each 1,901 frames at 30 fps / 63.366667s.
That explicit 1/60s final-frame quantization is necessary for an odd native
frame count; neither master nor the common event timeline is retimed.
All ten website assets passed measured dimensions/clock and SHA-256 copy
verification. The bezel's decoded alpha is zero outside the frame and 255 on
the screen; its actual encoded diff frame was inspected.

Final website typecheck/build pass. Chromium, Firefox, and WebKit passed paired
playback controls, pointer seeking, keyboard End → Replay for both quality
pairs, off-screen pause, and reduced motion. The final seek-step fix removes
the 0.05s increment that made the 30fps endpoint unreachable. All three engines
at 320/390/430px and 200% text passed the mobile no-movie-request, full-size
keyboard link, and reflow checks; a scoped wrapping fix preserves the header
link at enlarged text. Actual final desktop/mobile screenshots were viewed.

Chromium's five-second sample added zero dropped frames. WebKit's counters
reported drops even for one plain video: 81 versus 85 on the page; a plain pair
reported 89/90. Plain 30fps produced 149 frame callbacks in five seconds.
This does not establish page-specific playback overhead or universally perfect
60fps presentation. Do not misreport the browser checks as zero drops everywhere.

## Archive fix and publication boundary

The current script is `SCRIPT.md`. Recorder base checkpoint `fdf2690f` is rebased onto
Desktop main `8f3820f65b55d8869022fafe823d98e896d87b10`; it remains local.
The current real center rectangle is CSS `(288,88,936,576)`, mapped to crop
`(790,290,2340,1440)` in the captured scene. Output is exactly 2340×1440 at 60 fps,
without stretching. The narrowed separate still uses an 840×664 viewport at
2.5× device scale (2100×1660). Its actual model picker, project sidebar, and
`Edit waveformActive.ts +3 -1` row were visually inspected and are not clipped.

The explicit sub-agent model contract and product presentation are published:

- Client `0.0.66-preview.2`, workflow `34966773558`; stable npm latest remains
  `0.0.65`.
- Desktop renderer `0.0.85-preview.3`, workflow `34969546290`, source `8f3820f6`;
  verified on the Nightly renderer URL. No native Electron release or host edit.
- Agent `0.4.69-preview.4`, workflow `34969855394`, source `7585e70c`;
  all platform/signing/release jobs passed. GitHub latest stable remains
  `v0.4.68`. The isolated recorder's downloaded Darwin arm64 binary passed its
  SHA-256 check, codesign verification, and version check.

Rehearsal `artifacts/v16-r10` visibly contains the real typed
`Spawned Grok 4.6 sub-agent` row after Steve's steering message. It is not a
final deliverable: the phone's actual unread-state assertion failed after the
desktop response completed, so the recorder refused to encode it as a final take.

Diagnosis established a real Agent archive feedback loop. `HappySessionClient`
recomputes `lifecycleStateSince: Date.now()` while archiving, so its own echoed
metadata update continually changes the next payload and prevents `settle()`
from completing. Archived rehearsals reached tens of thousands of metadata
versions (one reached 46,032), overwhelming native JavaScript. The same native
process recovered after the isolated publisher stopped, without debugger
pause/resume, relaunch, or navigation; queries then took 2–5 ms. A separate
native Header Unistyles warning was fixed and verified, but was not the cause
of this remaining flood. No native synchronization workaround was added.

The user explicitly approved the scoped Happy Agent regression test. Fresh
Auto review allowed it; the unchanged test reproduced four metadata writes
on the old code, then passed after caching one archive-transition timestamp.
Local Agent commit `6b16118e` is rebased onto `3fe0b685`. All 2,650 runnable
module tests, build/type checks, and 55 release-script tests passed; six module
tests are platform-skipped. Independent code review found no actionable issue.
No native synchronization workaround, schema, or API specification change was
needed.

Auto review refused pushing that fix to remote Agent main. The exact action
is awaiting fresh human authorization in `if2s2ngcxbzzicw0j0oflqad`; it has not
been retried or routed around. Recording instead uses the isolated local binary
`0.4.69-local.archive.6b16118e`, with no host installation or restart. Antigravity/
Fable external sharing remains pending in `jpl5niwo2i2osl7y19juhkop`; no external
review is claimed.

Website changes include a separate static mobile lifetime, captions below the
desktop video, cue-only phone focus, and lazy buffering that reaches `canplay`.
The v16 assets now come from the final take, not provisional rehearsals.
Website work was rebased onto `a70cbd6`, preserving newer download and ratings
changes. The earlier `d5b2ca7` v15 media remain available as a rollback.

The final website update was normally pushed to remote main as
`9f32a1d01639ffbf124a68948d0844585477803b`. Pages workflow `35036548049`
passed its tests, build, and deployment. The temporary destination remains
https://happy.engineering/tmp/happy-one/. This website publication does not
publish the separately approval-blocked Agent archive fix or change the host.
Live-page verification also passed in Chromium, Firefox, and WebKit: actual
v16 playback, exact crop/dimensions, pointer seek, Replay, late phone cue,
off-screen pause, and reduced motion. All nine live mobile width/browser cases
loaded no videos, had no overflow or page errors, and opened the full-resolution
still with visible keyboard focus. Published desktop keyboard and mobile focus
screenshots were visually inspected.

## Upright flat frame and original-detail 60 fps website

The upright flat iPhone and footer credits shipped first as website `1e417f2`
(Pages `34890487646` succeeded), after preserving remote `d990451`'s mobile
feature-reveal changes during rebase. `HappyOnePhone3D.tsx`, the scene renderer,
and its model remain as an unused alternative; the active page imports none of
them and requests no 3D assets. Credits now sit beside Docs, Privacy, and Terms.

The separate quality pass shipped as `d5b2ca7778ff35cfb8da76c5149aa5e2252bf57d`
(Pages `34891633037` succeeded). Its 2560×1440 desktop was recomposed from the
original 3060×1660 captures in their 3200×1800 scene. The closest 347 frames
were widened slightly to a minimum 2560×1440 crop, avoiding upscaling. Website
phone playback uses the unchanged native 1206×2622 export. Both files have
4,674 frames at 60 fps / 77.900 seconds. No re-record or native host change was
needed; original masters and the unused 3D assets remain intact.

Found a cadence issue in the old composition export: ffprobe established that
its JPEG concat input used a 1/25 time base, producing repeated 40ms timestamps
before the output frame-rate conversion. The new desktop encode reads the
numbered captured/composed frames directly at 60 Hz. It does not interpolate
or manufacture intermediate motion. Caption timing, interaction sounds, native
phone timing, and the full synchronized take's duration are unchanged.

Media Capabilities chooses the high-quality pair before either source loads,
only when both are reported supported, smooth, and power-efficient. Unsupported
or data-saving environments retain the existing 30 fps pair; the source does
not switch mid-playback. Runtime inspection covered normal and forced fallback
selection in Chromium, Firefox, and WebKit. All sampled playback intervals
reported zero dropped frames. Chromium delivered about 59 presented-frame
callbacks/sec at high quality; Firefox callback delivery stayed around 24/sec
in this automation environment despite 60 decoded frames/sec and zero reported
drops, so those callbacks do not establish 60 visible updates/sec there. Headed
WebKit delivered about 54 callbacks/sec versus about 30 for the standard pair.
The videos remained synchronized. Actual desktop text crops, phone home/diff,
and desktop/mobile footer placement were inspected. Website typecheck/build
and diff checks passed; no tests were added. Desktop/phone source was not pushed.

## Website zoom flicker correction

Reproduced the reported zoom jitter in headed hardware Chromium. The original
width transition repeatedly resized the WebGL drawing buffer in ResizeObserver,
after the frame's draw. A single zoom produced 100 canvas-attribute mutation
batches, including 66 transparent center-pixel reads. Intermediate screenshots
showed the phone disappearing, despite smooth animation-frame timing.

The fix keeps the phone's layout/canvas at expanded size and animates only its
CSS transform. Genuine layout resizes are queued and applied immediately before
the same frame's draw; initial presentation waits for the first measured size.
The identical zoom diagnostic then reported no canvas mutations, no resize-induced
blank states, and no frame gaps over 25ms. Intermediate screenshots retained the
phone. Real playback entrance/exit also produced no canvas resizes; a subsequent
window resize produced an opaque center-pixel read in its resize observer batch.

Hardware Chromium, four-core Firefox fallback, and mobile WebKit playback were
inspected. The videos remained aligned, reduced motion paused them, and mobile
retained its existing caption-safe reveal with no WebGL assets or overflow.
Website typecheck/build and diff checks passed. Only the three scoped website
files were committed, rebased onto remote main, and pushed as `fa556a4`.
Native footage, desktop recorder changes, and the Electron host were untouched.
Pages workflow `34888278115` succeeded. The same diagnostic against the published
page reported zero canvas mutations, no resize-induced blank states, and a
maximum animation-frame gap of 9.4ms; its mid-zoom screenshot retained the phone.

## Precise black device and responsive website revision

The [new black-frame export](./artifacts/v13/phone-bezel-iphone16pro-black.webm)
uses the original native screen under Apple's iPhone 16 Pro Black Titanium
frame, sourced through James Jingyi's Device Mockups collection. Its exact
screen opening is 102,100,1206,2622 in a 1406×2822 canvas. The 60 fps VP9-alpha
file contains 4,674 frames / 77.900 seconds; decoded alpha is 0 outside and 255
on the screen. The encoded diff frame was visually inspected. Original footage,
timing, native masters, and the earlier bezel export remain unchanged.

The website revision uses this precise frame by default and an actual CC-BY
iPhone 16 Pro model by tranminhluan on capable desktops. It preserves the sourced
body, button, camera, and antenna geometry and adapts its atlas to neutral black.
Public artwork credits record author, sources, license, and modifications. The
16 Pro is deliberately identified correctly: 17 Pro has no black finish.

The caption-free desktop web derivative retains the v13 77.900-second clock,
camera moves, interaction sounds, and 30 fps encode. Responsive HTML captions
use the original narration cues. Mobile now uses a centered portrait phone
moment, 16px captions, and complete phone exit before desktop review.

Actual normal-speed playback was inspected at entrance, chat/diff arrival,
panned diff, and desktop return. Headed hardware Chromium used the real WebGL
model; native WebKit mobile played both recordings in sync without requesting
Three.js or the model. Firefox layouts at 360px and 430px had no horizontal
overflow. A four-core desktop also requested no 3D assets. Deliberate context
loss returned to the precise flat frame without stopping either video; reduced
motion paused the pair. Final website typecheck/build and diff checks passed.
No tests were written, and the policy-blocked external reviews were not retried.

Website commit `861b5fa5e751ee6bb732bee5e05e0f1c09881a52` was rebased onto
remote main and pushed normally. Pages workflow `34859011794` passed its existing
tests, build, and deployment. Actual published playback was then watched again
at the diff and desktop-return cues. Hardware Chromium loaded the real model;
390px WebKit loaded no 3D assets, kept 16px captions, and hid the phone on exit.
Both had no page errors or horizontal overflow. At the 44-second observation,
the two video clocks differed by about 42ms on desktop and 4ms on mobile.

## Published synchronized take — v13

[Desktop](./artifacts/v13/core.mp4),
[native phone screen](./artifacts/v13/phone-screen.mp4), and
[transparent bezel](./artifacts/v13/phone-bezel.webm) each contain exactly
4,674 frames at 60 fps: 77.900 seconds. The bezel's decoded alpha is 0 outside
the device and 255 on its screen. Native phone capture covers the full take;
its trim offset is 0.000179 seconds. No phone frames or sync data were fabricated.

Phone home has six real durable sessions with actual project artwork: three
Happy sessions, travel-vibes, bra1nDump, and the only bot, Chief of Staff. The
phone's actual model/effort selection is Fable 5.1 / Extra High. Local native
accessibility reads keep the recording driver warm during the desktop opening.

Phone focus begins at 30.717s, chat is open at 34.300s, and the actual inline
diff arrives between 36.5s and 37.0s. The horizontal swipe settles by 43.317s;
focus returns to desktop at 48.200s. No session-info or separate Changes view
is opened on the phone. Desktop file review begins at 60.550s and retains both
sidebars through Unified / No wrap → Wrap → close file tab → chat.

Inspected the native home, diff arrival, panned syntax highlighting, desktop
subtitle beats, completed research link, and ending. Merged one 13-frame subtitle
into the following narration beat during composition; capture timing is unchanged.
The full desktop black-frame scan found no black interval. Phone typecheck and
targeted recorder formatting/lint/syntax checks passed; no tests were written.

The user explicitly selected this take for publication. Website commit
`ead7329` was rebased onto current remote main and pushed to `slopus.github.io`.
GitHub Pages workflow `34853964365` passed its existing tests, build, and deploy.
The demo is live at https://happy.engineering/tmp/happy-one/ with the lightweight
CSS 3D phone. Matched website derivatives use 30 fps, with the phone at 804×1748;
the native 60 fps masters above remain intact. Real browser inspection covered
Chromium, Firefox, and WebKit, including seeking and reduced-motion behavior;
paired off-screen pause/resume was checked in Chromium. Deployed WebKit replay
returns both videos to zero and restarts them together. Over a five-second
sample WebKit reported 41 dropped frames with one plain desktop video, 41/43
with two plain videos, and 44/44 on the deployed page. These similar counts do
not establish an added problem caused by the phone treatment; no follow-up
code change or deployment was warranted by this check.

Recording boundaries remain explicit: inference text/timing and Steve's desktop
identity are screenplay fixtures; native tools, edits, and encrypted phone sync
are real. The research post was verified outside the recording. Antigravity and
Fable review did not run because of the policy denial documented below. This is
not a claim of their sign-off. No production Electron host was changed or restarted,
and neither the desktop nor phone source workspace was pushed.

## Synchronized desktop and phone — v11

The revised [desktop video](./artifacts/v11/core.mp4) and
[native phone screen](./artifacts/v11/phone-screen.mp4) contain exactly 4,876
frames each: 81.266667 seconds at 60 fps. The
[transparent bezel treatment](./artifacts/v11/phone-bezel.webm) uses the same
screen source and also contains 4,876 frames at 60 fps. Its decoded alpha is
transparent outside the device and opaque on the screen; the rounded frame and
hardware buttons were inspected in the encoded result.
[Focus cues](./artifacts/v11/phone-timing.json) and
[voiceover subtitles](./artifacts/v11/core.srt) accompany the exports.

Locally inspected the rendered desktop opening and ending, all subtitle beats,
the phone's working session list, active conversation, real +14/−6 update, and
syntax-highlighted file diff. A natural horizontal swipe brings the changed
logic into view. The desktop keeps both sidebars open through Unified / No wrap,
clicks Wrap, and closes only the file tab back to chat. The completed research
finding visibly links to a verified OpenAI Developers post. The full desktop
black-frame scan found no black interval.

The phone is a dedicated iPhone 17 Pro Simulator running the real Happy app,
paired through its encrypted integration to the same isolated demo daemon.
No mobile messages, sessions, diffs, or transport responses are injected.
Both captures run concurrently at continuous 1×. Simulator's changed-frame
recording covers the full exported timeline; no frozen tail is manufactured.
The screen export's last frame remains on the diff, with no off-camera reset.

Phone focus starts at 30.717s, the session is open by 38.450s, the panned diff
is visible by 49.367s, and focus returns to desktop at 59.917s. Desktop file
review begins at 63.933s. All cues use the same zero-based playback clock.

The inference screenplay and fictional Steve identity remain the same explicit
recording boundary as before. Actual phone synchronization is not evidence of
live vendor inference or real multi-user authentication. The tweet was verified
outside the take; the Grok response is scripted.

Targeted formatting, script lint (zero warnings/errors), Node syntax checks,
and `git diff --check` passed. The real desktop renderer and native mobile app
ran for the capture; no tests were written or test suites run. The supporting
Happy environment lives in its separate `core-demo-phone-recording` workspace.
No production Electron host, deployment, release, commit, or push was performed.

Independent Antigravity/Fable review remains blocked as described below; this
local inspection does not claim their sign-off.

## Earlier desktop-only take — v09

Previously reviewed [v09 video](./artifacts/v09/core.mp4),
[subtitles](./artifacts/v09/core.srt), and
[native evidence](./artifacts/v09/core.evidence.json).
Generated takes are gitignored; no video has been selected for committing or publishing.

The file is 53.183 seconds, 1920×1080, 60 fps, H.264/AAC, 3,733,215 bytes.
It was recorded against desktop `4e05ac78` and the isolated stable daemon
`0.4.68`. Narration is subtitles for later human recording; audio contains
interaction sounds, not generated speech.

## Local inspection

Inspected the rendered opening, model selection, typing and marker, Steve's
message, running delegates, work-speed transition, and final diff, including
the encoded ending. The wider composer framing keeps the complete request
visible. The final Split view uses the full content width and wraps long lines.
The first frame is the product with no open menu. No workspace creation,
manual naming, Steve draft, title card, decorative sticker, or black transition
is filmed. FFmpeg's full-video black-frame scan reported no black interval.

Native history establishes the causal order below. Times are elapsed since
the implementation request was submitted, not edited-video timestamps:

| Event                                                      | Seconds |
| ---------------------------------------------------------- | ------: |
| Fable's first completed Read                               |   1.259 |
| Steve's completed message submitted with `delivery: steer` |   3.168 |
| Grok sub-agent created                                     |  10.774 |
| File edited, +14/−6                                        |  16.602 |
| Astra review sub-agent created                             |  24.133 |

The daemon reported healthy and ready; both children settled. Inference and
Steve's identity are fixtures, not proof of live vendor research or real team
authentication. The native tools, steering, file edit, counts, and diff are real.

Repository formatting check and `pnpm format` passed, script lint reported zero
warnings/errors, Node syntax checks passed, and `git diff --check` was clean.
No tests were added or test suites run. Production files and the real Electron
host/daemon were not changed or restarted.

## Outstanding independent review

Antigravity (`agy`, Gemini 3.1 Pro High) and native Fable 5.1 High review commands
were submitted once against v07. Both were refused by Auto review because
sending local documents and imagery to those services violates the workspace's
data-sharing policy. Neither reviewer ran; no alternate route was attempted.
The requested independent sign-off is therefore still blocked. The local cut
is available to inspect, but this is not a claim that all acceptance conditions
or the requested “flawless” sign-off have been met.
