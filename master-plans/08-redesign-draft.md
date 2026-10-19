# Redesign — draft

> **DRAFT ONLY.** This plan is a draft of where the UI could go. The current
> state of the app is not required to match it, and code that disagrees with it
> is not a contradiction to report. Do not treat it as binding until the user
> removes this notice.

## Tabs

Currently tabs are hella poorly laid out.

1. Less whitespace to the left.
2. Same layout of tabs in the main view & secondary (right hand side view).
3. I want different widths for different sized tabs — and full text in the tab
   name — similar to VS Code layout.
4. X close button to the right — should appear on hover — and probably overlay
   the right edge of the title — with some gradient?

Also let's remove artefacts / activity / devices from the tabs — only files
should be opened for workspaces.

The + button is only in the side bar — fixed position — same layout as in the
images I provided.

Reference images (described, as provided by the user):

- A tab: title "Surface Implement…" truncated, with an underline under the
  active tab.
- When side bar collapsed: top right shows `…`, a list icon, a separator, a
  collapse icon, and a count badge `3`.
- When side bar opened, see separator between side content: `…`, list icon,
  separator, tabs ("Side chat", "Open file", active globe "New…" tab), `+`,
  separator, collapse icon, panel toggle.
- A bot popover opened from the list icon: avatar and name ("dot", "Active 1
  week ago"), Call and Slack buttons, desktop notifications toggle, Computers,
  Recent activity, Outputs.

## Left side bar

Left side bar also needs reworking.

```
[not full screen | native traffic light on mac] [close / open side bar] [when side bar collapsed | + button to create new item] [when expanded | spacer] | (separator all the way down) tab name
```

When full screen (or on Windows) — the left teams thing should expand to the
top — and the safe space should be relinquished.

Also safe space for the traffic lights — should be scaled when zoom in / zoom
out is done — we don't want stuff to start colliding with the native buttons
when we are changing zoom.

## Remove the top level header

One of the goals — remove the top level header — as it's either duplicative or
mostly empty.

## Main side bar

Main side bar (when expanded) should be extremely simple:

- **[Start Something | Find Out | New | Make Stuff | Build | Just Do It]** — we
  should rotate randomly between similar phrases each day. And always show
  shortcut CMD + N (CMD + T will do the same).
- **[Your primary bot]** — we should just call it Happy.
- I think we should be able to still support moving whatever we want into the
  'pinned' cross space section up top — if we want to have more things across
  all places we work in.
- **[Space switcher]** — this one allows us to switch between different views —
  depending on what we want to work on — like in Arc. This may be
  overcomplicating the UI again though. But kinda makes sense to me to be able
  to check out spaces of my team mates / shared spaces we can create (for
  example release space, analytics space, growth space). Some things we
  naturally need to synchronise with others — shared spaces are a way to
  'discover' and maintain a shared understanding of these in the team. Notice
  when you switch spaces — your Happy (currently called chief of staff) remains
  in place, so does the Make Stuff button.

  Another question to think about — how to organize spaces?
- **[Section called bots]** — but really sections are loosely defined UI
  elements. The entire side bar will be built from these. Sections will affect
  for example how drag drop works. Hmmm, in some sense a section is just a
  'flat' folder. So it does group stuff, and is a folder at the end of the day —
  just does not indent things underneath.

Notice how bots are in spaces scope.

Artefacts, other surfaces — can also appear in this hierarchy as top level
items — not sure if this is currently possible in folders / tasks / bots — but
the idea is to unify the hierarchy & kinda disconnect it from what is actually
happening under the hood.

## Under the hood primitives

- Session (single agent thread).
- Subagents / subtasks — are just sessions.
- Sessions from other parts of the app (given there is access to them from this
  session) are messaged through the same API, though some sessions may not
  support messaging, only reading for example — some won't.
- Compute == file system + shell + network isolation, depending on the session.
- Projects — known repositories / folders etc. where we make changes.
- Artefacts.
- Calendar — and other 'surfaces'.
