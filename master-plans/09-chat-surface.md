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
- **The draft never hides the conversation.** A draft that grows carries the
  transcript up with it in the same frame, so the newest lines stay in view; a
  docked question does the same. A draft that shrinks, or empties on send,
  leaves space behind that holds still. Typing on one line moves nothing.
- **Sending gives the reply room.** A send from the bottom lifts the sent
  message once, in the commit that adds it, until its top edge sits 40% down
  the viewport: the turn before it stays in view and the reply has the rest.
  The space under it is added in that same frame. No animation, no pin to the
  top edge. A send made while the agent is still working, or while scrolled up
  into history, moves nothing.
- **Returning to a chat is invisible.** A chat opened again is where it was
  left: following the bottom if the reader was following it, holding the same
  row if they had scrolled up, with whatever arrived meanwhile already in
  place. It appears at that point in its first frame and does not move after.
  A chat out of sight does no work to stay placed; it is placed once, in the
  commit that shows it, and not shown until its content is current.
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
at the bottom. A send lifts once, to 40%, into space that never shrinks while
it is visible.

Then make every geometry change preserve what the reader sees: composer
resizing, window and pane resizing, browser zoom, late-loading images and code
blocks, expanding tool rows, docked questions, and model-switch rows.

Then make switching between chats invisible: a kept chat waits, out of sight,
until it is read back, and is shown in the same commit that draws it current,
so the reader never sees it as it was left and then watches it catch up.

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
- After a send from the bottom, the sent message's top edge is 40% down the
  viewport in the frame that first shows it, the turn before it is visible
  above, and nothing moves until the reply fills the space below and the
  transcript follows the bottom again.
- The live status line's loader, clock, separator, and phase share one
  baseline.
- Switching away from a chat that keeps streaming and back to it shows it, in
  its first painted frame, at the bottom if the reader was following and at
  the same row if they were not, and no visible row moves in the frames after.
- Question cards and every other row align with assistant prose within half a
  pixel at every width.
- Scrolling and streaming a conversation of several hundred turns keep frame
  times within the display's frame budget with no long tasks, measured before
  and after each change.
