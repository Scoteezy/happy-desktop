# Chat surface

## Where we are going

The chat is where people spend most of their time with an agent. Its first job
is stability: the transcript holds still unless the person moves it. Reading,
typing, sending, and watching an agent work must never make content jump,
slide, shrink, or settle on its own.

A good chat with an AI follows a few principles:

- **The reader owns the scroll position.** Nothing programmatically scrolls the
  chat in the opposite direction of the person, under any condition. The only
  movement the app may start on its own is following the bottom while the
  person is already at the bottom.
- **Typing never moves the transcript.** Typing, deleting to empty, pasting, and
  growing or shrinking a multiline draft change only the composer.
- **Sending is boring.** A sent message lands at the natural bottom, just above
  the composer, with the earlier conversation still visible above it. No
  pin-to-top, no reserved blank area, no animation. Sending while scrolled up
  into history keeps the reader where they are.
- **Space that exists stays put.** If blank space is ever needed to keep content
  still, it keeps its size while any part of it is visible and is removed in one
  step only once it is fully offscreen. It never shrinks or animates.
- **Order is truthful and readable.** Messages appear in the order they
  happened, never reorder or briefly disappear, and a message sent while the
  agent is still working is visibly distinct from the reply that continues
  after it.
- **One text column.** Prose, tool rows, questions, and every other card share
  the transcript's left edge, width, and type rhythm. Nothing looks pasted in.
- **Performance is not traded away.** Scrolling and streaming stay at frame rate
  on long conversations. Stability is achieved without per-scroll work.

## How we get there

First, remove behavior that fights the reader: the pin-to-top send and its
shrinking tail reserve are gone, and the transcript follows only a reader who is
at the bottom.

Then make every geometry change preserve what the reader sees: composer
resizing, window and pane resizing, browser zoom, late-loading images and code
blocks, expanding tool rows, docked questions, and model-switch rows.

Then make ordering and alignment correct: atomic acceptance of sent messages,
stable ordering, a clear marker for messages sent mid-turn, and one shared text
column for every kind of row.

## How we know it is done

- Instrumented stress runs in Chromium, Firefox, and WebKit try to break it:
  realistic typing and editing, sending from the bottom and from history,
  steering mid-turn, rapid sends, momentum scrolling while streaming, browser
  zoom from 50% to 200%, window and pane resizing, fractional display scales,
  and very short, very long, and empty conversations. They find no programmatic
  scroll against the person and no visible row moving 1px or more without a
  gesture.
- After any send, the sent message is fully visible above the composer with no
  large blank area.
- Question cards and every other row align with assistant prose within half a
  pixel at every width.
- Scrolling and streaming a conversation of several hundred turns keep frame
  times within the display's frame budget with no long tasks, measured before
  and after each change.
