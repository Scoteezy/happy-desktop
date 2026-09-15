# Core — landing-page demo

Happy's core product demo: start work, collaborate in the same conversation,
bring in other models, inspect the change. This is not a narrowly named
“multi-model” feature video. Desktop and the connected phone are filmed together;
human voiceover is recorded later from the subtitle script.

## Opening and set dressing

- Open directly inside an existing empty workspace under `happy`. Other
  projects and prior workspaces are visible. Do not film workspace creation or
  manually name the workspace; leave task-driven naming to the product.
- Use the original project identities: `happy`, `happy-desktop`, `travel-vibes`,
  and `bra1nDump`. Keep the Chief of Staff's existing icon.
- Phone home shows six real durable sessions: travel-vibes, bra1nDump, one
  Chief of Staff bot, and three Happy sessions. Use real project artwork and
  the Chief's real picture. Its composer reads Fable 5.1 / Extra High.
- No generated video, poster, dinosaur, robot animation, decorative stickers,
  or generated narration. No model-chip pulse or flash.
- No black-screen intro, full-screen text card, or text before the product.
  Voiceover appears as subtitles over the desktop footage. Keep both sidebars
  open; end back on chat after closing the file tab, never on black.

## The two people

You send one short implementation request:

> Add a waveform to the voice agent that animates when speaking. Review control flow with Astra.

After Fable begins working, Steve interjects in that same conversation:

> Find a recent GPT-duplex product demo that blew up on X with a Grok sub-agent.

Steve's message replaces the research paragraph previously included in your
opening prompt. It arrives from the second participant, not from your composer.
Do not show Steve's draft or draft synchronization. Submit only his finished
message with native steering after your request is sent and Fable is working.
Highlight Steve's name and “Grok sub-agent” in the transcript. The sub-agent
must start after his message. Do not open a separate delegated conversation.

## Composition and exact subtitles

| Beat | On screen / action                                                                               | Subtitle = human voiceover                          |
| ---- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1    | Already in an empty workspace under `happy`, with original icons and prior work visible.         | This is Happy.                                      |
| 2    | Zoom into composer. Hold on Astra, open model picker, select Fable 5.1. No pulse.                | I’m switching from Astra to Fable for this UI task. |
| 3    | Type the waveform request quickly at normal playback speed.                                      | Add a waveform that animates when speaking.         |
| 4    | Type the review sentence with a marker highlight as it lands.                                    | Review control flow with Astra.                     |
| 5    | Hold, clear marker, Enter. Pull back; Fable reads the voice files.                               | No subtitle.                                        |
| 6    | Steve's finished message steers the active run. Highlight his name; never show his draft.        | Steve jumps in while Fable is working.              |
| 7    | Hold his message readable; highlight “Grok sub-agent”.                                           | He asks for a Grok sub-agent to research X.         |
| 8    | Open Activity beside the same conversation. Grok's running task is visible. No child chat opens. | Fable starts the Grok sub-agent.                    |
| 9    | Phone enters focus on its real working session list.                                             | Take the same session with you.                     |
| 10   | Tap the session roughly two seconds before the edit arrives.                                     | Fable makes the change…                             |
| 11   | Native file edit and real +/- counts update on both devices; the inline phone diff appears.      | Continue the same subtitle.                         |
| 12   | Swipe the inline diff horizontally; hold on the highlighted logic. No session-info navigation.   | The diff arrives here, too.                         |
| 13   | Phone leaves focus, then Astra's review starts.                                                  | …then brings in Astra to review it.                 |
| 14   | Children finish; highlight the completed research link on desktop.                               | Grok found OpenAI’s live voice demo.                |
| 15   | Files → Changes → changed file. Both sidebars remain open.                                       | Done. Let’s look at the changes.                    |
| 16   | Unified diff with No wrap selected.                                                              | Here’s the diff.                                    |
| 17   | Click Wrap, hold briefly, close only the changed-file tab, return to chat.                       | That’s a wrap.                                      |
| 18   | Clear subtitle and pointer; hold on chat.                                                        | No subtitle.                                        |

Typing is fast keystrokes, not time-lapsed footage. Markers are recording
overlays and never become message formatting. Subtitles should stay short
enough to read without covering the action. Target under about 90 seconds.
The synchronized take stays at continuous 1× throughout. Desktop-only takes
may still use the explicit 4× work badge; never compress only one device's clock.

## Product truth and recording boundaries

The isolated demo uses the existing screenplay recorder. Inference text and
timing are scripted; this is not evidence of live vendor inference, real X
research, or a real colleague joining a team. The filesystem, workspace
creation, delegation tools, file reads, edit, Git counts, and diff viewer run
through the real daemon and app.
This take requires `--inference screenplay`: its editorial gates are screenplay
events, not part of live or replay inference.

Steve is a fictional participant supplied by a recording-only protocol fixture:
one explicit message ID receives his explicit local user ID in both events and
history, with a matching user lookup. His message is really submitted to the
isolated daemon while Fable is working. No actual teammate account is used or
invited, and production authorization is not changed.

The richer inline delegation component is not connected end-to-end in the
current release: its required parent-tool link is absent, and the activity
projection drops the model ID. The earlier inline/nested-search transcript was
incorrect. Use the existing Activity panel with explicit task names “Grok ·
Research X” and “Astra · Review control flow”. Do
not fabricate a new product surface or navigate into a child conversation.

Do not invent a viral post, supporting URL, API availability, benchmark result,
or verification output. The screenplay's completed finding links to the verified
OpenAI Developers post at https://x.com/OpenAIDevs/status/2098099269551149398.
That public post was checked outside the take; the scripted child is not live X
inference. Do not add unverified engagement counts.

## Source and acceptance

- Original voice-component snapshots live as `.tsx.txt` files in `assets/`
  so repository formatting cannot rewrite the imported source; only the private
  `happy` checkout is edited. The real user repository is never edited.
- Original project icons live alongside those snapshots. `travel-vibes.png`
  is rasterized from its original SVG, not generated artwork.
- Demo-local source patches remove the unwanted empty-state animations from
  the disposable app mirror. They do not change or restart Electron's host.
- Use current desktop main and the latest stable isolated Happy Agent.
- Save the MP4, subtitle SRT, and recording evidence together. Keep takes
  gitignored until explicitly selecting an artifact for source control.
- Inspect the rendered footage, fix visible defects, and review the result
  with Antigravity (`agy`) and native Fable 5.1 High. Use Fable once for focused
  copy/narration feedback; do not hand the whole implementation to it.
- Confirm ordering: Fable working → Steve message → Grok → live phone session →
  edit and inline phone diff → desktop focus → Astra → completed research link → desktop Unified / No wrap
  → Wrap → close file tab → chat.
- The user explicitly authorized integrating this pair and pushing
  `slopus.github.io` to publish `/tmp/happy-one`. No other page, native app
  release, desktop push, or Electron host restart is authorized by that request.

The current client can register a new checkout's Git watch before initialization
completes and does not renew it until its next two-minute interval. Preparation
therefore includes a fresh catalog bootstrap after checkout readiness, entirely
before filming. This is not a manual refresh control in the demo.

Both requested external CLI reviews were attempted on the first complete cut,
but Auto review denied them because sending local documents and footage to those
services violates this workspace's data-sharing policy. Do not claim those
reviews ran, and do not retry through another route. Local visual inspection and
native recording evidence remain available.

## Synchronized phone deliverables

Use the separate Happy workspace `core-demo-phone-recording` and its isolated
local server/account. Pair its development app to this demo daemon through the
real encrypted Happy integration and accept the connection on the dedicated
Simulator. Do not inject mobile sessions, messages, file changes, or RPC replies.
Steve's desktop-only fictional author label is not copied into mobile data.

Record the iPhone 17 Pro screen concurrently at native 1206×2622 resolution.
Maestro supplies ordinary taps, a horizontal swipe, and accessibility inspection.
Return to the session list only after the desktop recording stops, outside the
exported interval, so Simulator flushes its idle tail. Validate source duration
before exporting; never silently shorten the screen-only video.

Deliver `core.mp4`, subtitle-free `phone-screen.mp4`, and transparent
`phone-bezel.webm`, all at 60 fps on one continuous timeline starting at zero.
The bezel uses Apple's installed Simulator device chrome and native screen mask,
not an illustration. `phone-timing.json` supplies the website's focus cues and
screen rectangle; `phone-capture.json` retains clock and native-state evidence.
The website owns positioning, entry/exit animation, hover, and any 3D rendering.
Use a lightweight CSS 3D treatment on the temporary page, with the actual
screen video and static bezel. Keep both clocks synchronized, pause off-screen
and in hidden tabs, respect reduced motion, and avoid a WebGL render loop.
