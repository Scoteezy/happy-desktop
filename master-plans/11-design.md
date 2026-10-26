# Design

## Where we are going

One rule for the whole app, because it keeps being broken.

**Content in a frame sits the same distance from every edge.** In any card,
banner, box, or other frame, the content sits as far from the frame's left
edge as from its top, and as far from its right and bottom edges too. In the
user's words: "the shit in the card needs to be the same distance from the
left and the top", and it goes in the design plan "for the entire app because
you keep making the same mistake."

The distance is measured to what the reader sees, the ink of the text or icon
or the edge of a button, not to an invisible line box.

## How we know it is done

- In every framed element, the gap from the frame's edge to its visible content
  is equal on the left, top, right, and bottom, measured on the rendered pixels.
