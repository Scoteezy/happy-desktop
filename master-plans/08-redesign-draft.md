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

Also let's add a search icon next to the left side bar close / open toggle.

When collapsed — the + Make Stuff button should move to the right of both the
side bar toggle and the search — which both visually need to stay exactly in
place.

```
Collapsed:  ● ● ●   [=] [⌕] [+]         SPACE - shrink -             │ tabs…
```

In collapsed the spacing needs to be shrunk.

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

Projects / bots sections? Why? I want more around tasks — sections grouped more
around tasks, with more realistic content.

Also wondering if the icons / images even make sense in the side bar — they are
kinda distracting. Icons maybe are ok? To research: how the icons for Muse stuff
are generated. I want to say it's either a cheap image model that generates the
same style of icons OR they have a huge library of pre-generated icons and they
use a decisions API or similar or just a cheap model to classify which icon to
use. Maybe even combinations of things?

I don't like that the folding ribbon takes over the icon side.

## Principles

- Less is more.
- 1 primary way to do something.
- People will not be clicking much in the UI to reconfigure it — it needs to
  work almost out of the box. Example — when creating new 'stuff' — it can
  morph into stuff. Like I can say create new list with movies I have
  downloaded — it should create me an artefact.
- Some stuff is naturally temporary / other stuff becomes more permanent — like
  bots (release coordinators (shared with team too), analytics watchers
  (possibly get pinged by the release coordinator to watch for specific new
  metrics / regressions etc), growth opportunity seekers, QA testers (a lot of
  these things, esp. scheduled / low priority things — like QA — need to get
  allocated budget depending on utilization of team resources too)) / other
  stuff is more like a task you complete in a couple of hours / yet other stuff
  is more like a milestone.

## New stuff

When creating new stuff — we should probably spin off a separate agent to find
related stuff / maybe this happens when gathering context actually — which
project to connect, what related / conflicting work may already be in the
works.

But I really like this idea of a single 'new' -> morph into whatever idea. Stem
cell like.

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

## Happy as the gatekeeper

I think the subagent (the one sorting / placing / prioritizing new stuff) needs
to be a single one — in Happy — the main agent — as a subagent.

- So Happy becomes kind of a god chat for CORE things you want 'single
  threaded' essentially.
- And it essentially is the gatekeeper of the side bar.

So we have the 'baby sitters' idea — some of them hidden, or we can make it
more explicit — just not show these in the side bar.

## Icons

Generated icons (soft clay style) — honestly I like the current set the most.

## Sidebar diff

We probably want some sort of diff way to show what's moving where between two
different versions of the sidebar (e.g. after the sidebar manager tidies it
up). You can probably see that in the sidebar manager, and later maybe in the
spaces switcher.

## Activity floaty

Activity button stays. The floaty is expanded by default. It should probably
also show the changed lines, with a quick jump to the changes on the right-hand
side.

## [after] The sitter

For now we don't really need the sitter in this iteration. In the future we do
anticipate the sitter creating summaries, titles, pinging for attention (the
main agent that figures out what to notify about / what not?).

## Teammates in the sidebar

Back to my space — I don't love that it's in the header. It should stay in the
side bar. Honestly — let's not have a separate side bar: we can just expand
what's likely relevant for us from what Steve is working on when we click their
name. Agents / smart search will be able to discover the rest. The goal is to
show less than more — show the most important stuff only.

## [later] Search

Search also needs to be redesigned, later.
