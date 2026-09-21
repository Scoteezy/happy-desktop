# App Store screenshot compositions

Five iPhone-first product stories, each combining a real app capture with a
short, legible headline. This is an output of the integration harness, not a
fixture mode in the production app. Nothing here uploads to App Store Connect.

## Story and copy

| Order | Headline                     | Supporting line                       | Real screen                                            |
| ----- | ---------------------------- | ------------------------------------- | ------------------------------------------------------ |
| 1     | Your models. / One place.    | Claude, GPT, and more.                | Native model picker open over a useful conversation    |
| 2     | Every agent. / Within reach. | Follow your work across projects.     | Populated native session list                          |
| 3     | From desk / to anywhere.     | The same conversation, on your phone. | Phone conversation; actual desktop companion behind it |
| 4     | Build / together.            | You, your team, and your agents.      | Conversation with recognizable human contributions     |
| 5     | Open source. / By design.    | Explore the code. Make it yours.      | Real native file/diff view                             |

Frame 1 explains model choice, not multimodal input. Do not say AI inference is
free. Do not invent ratings, GitHub stars, testimonials, or unsupported features.
The collaboration frame must prove supported current behavior; a fictional
screenplay is permissible sample content, not evidence of real team login.
Record any identity fixture in the capture manifest and never disguise a
desktop-only capability as an iPhone capability.

## Visual system

Export portrait **1320 × 2868**, sRGB RGB PNG, no transparency. Cream, deep
green, restrained orange, generous whitespace, two-line benefit headline. Real
dark-mode iPhone screens dominate the composition. No baked playback controls,
debug chrome, notifications, credentials, keyboards obscuring the selling point,
or fake UI cards. The desktop is secondary in the cross-device frame. Keep
headlines readable in the generated 220px-wide thumbnail contact sheet.

The renderer uses an explicit bundled font and the licensed Apple device frame
already credited in `scripts/demo/demos/core/assets/device/CREDITS.txt`. Capture
the screen at its natural aspect ratio; never stretch it to fit a bezel.

## Capture and regenerate

1. Start `happy-mobile-gym` from current mobile main with its explicit run root.
   It supplies only isolated debug startup/auth; create sample history through
   the real local server/Agent APIs, then complete ordinary encrypted pairing.
2. Use a dedicated Simulator, not the developer's active device. Set 9:41,
   full battery, dark mode through Simulator controls. Navigate the actual app
   using accessibility/touch controls. Do not patch its model picker or labels.
3. Save lossless raw screenshots under one ignored capture directory. Keep
   source revision, simulator, capture times, scene purpose, and any scripted
   content/identity boundary in `captures.json`. Capture desktop from the isolated
   current desktop renderer, never the user's installed Electron host.
4. Run the offline composer (requires reviewed browser execution on macOS):

    ```sh
    node scripts/app-store/compose.mjs --captures <directory>/captures.json --out .context/app-store/v1
    ```

    Use a new output directory each time; existing exports and raw captures are
    never overwritten.

5. Inspect every full-size PNG and `contact-sheet.png`; check real UI, reading
   order, crop, artifacts, text overflow, no alpha, and thumbnail legibility.
   The capture manifest and `composition.json` retain source hashes and actual
   screen/headline geometry. The source assets remain unchanged.
6. Review copy/visuals with the owner. Upload only with explicit approval and
   confirm the shown features are present in the submitted App Store build.

`captures.json` is explicit, never a filename-discovery heuristic:

```json
{
    "version": 1,
    "font": "/absolute/path/to/BricolageGrotesque-Bold.ttf",
    "supportFont": "/absolute/path/to/IBMPlexSans-Regular.ttf",
    "provenance": {
        "mobileCommit": "commit hash",
        "desktopCommit": "commit hash",
        "mobileDirty": true,
        "desktopDirty": true,
        "simulator": "dedicated simulator UUID",
        "capturedAt": "ISO timestamp",
        "fixtures": ["Sample conversation and deterministic inference"]
    },
    "screens": {
        "models": "models.png",
        "sessions": "sessions.png",
        "continuity": "conversation.png",
        "desktop": "desktop.png",
        "multiplayer": "multiplayer.png",
        "source": "diff.png"
    }
}
```

Paths in `screens` are relative to the manifest. The font path is explicit so
the renderer never silently substitutes a host font. This metadata contains no
auth, server master secret, or production account data.

For the model-picker shot, disable the isolated Agent's synthetic `gym` provider
through its normal config API after startup; real catalog providers still route
to the screenplay gateway. Keep permissions on Auto. Capture two useful turns
so the native bottom-aligned conversation is populated; do not move messages
with screenshot CSS. The continuity pair must show the same session and turns.

`seed-multiplayer.mjs <mobile repository> <mobile gym run root>` supplies the
fictional Alex/Maya/Jamie conversation through normal encrypted APIs. Navigate
to the returned session ID in the current run, not an ID from another run's
database. This demonstrates the native participant-message renderer, **not**
authenticated multi-account sharing, invite flows, or Agent-integrated team
transport. Those require a separate end-to-end verification before publishing
that card. The producer does not impersonate a running CLI version.

For the source card, put a short, real public source file into the isolated
registered fixture project, then open the native session's **Changes** screen.
The initial set uses the mobile repository's `sources/utils/sessionListTimestamp.ts`
unchanged. Its normal Git watcher and encrypted file RPC supply the diff; no app
view is drawn or patched. Record the copied file in the fixture disclosure.
Never use a file-view screenshot that exposes a person's absolute host path.

## Research basis

- [Apple product page](https://developer.apple.com/app-store/product-page/):
  first one to three screenshots communicate the essence in search results.
- [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/):
  supported dimensions, one to ten images, JPEG/PNG, no transparency.
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):
  2.3.3 permits explanatory text/image overlays but requires actual app usage;
  2.3.7 advises against prices in screenshots; 2.3.10 restricts other mobile
  platform/marketplace promotion. A Mac companion does not replace the iOS UI.
- X design discussions informed short headlines and real UI, not numeric
  conversion guarantees. Anecdotal uplift percentages are not product evidence.

App Store first. Android dimensions/assets and any store publication are separate
work; do not copy Apple-device art into a Play Store submission.

The iPhone set does not cover iPad submission requirements. Happy currently
supports iPad, so capture a separate 13-inch iPad set before store submission.
Confirm computer/provider account requirements in the listing, and verify all
pictured features against the exact submitted binary. No upload is automated.
