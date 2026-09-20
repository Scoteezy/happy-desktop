# First-run onboarding

## Where we are going

First-run setup is one linear sequence: **Setup**, **Subscriptions**,
**Profile**, **Get app**, and **Connect phone**. It has one progress bar, not a
second onboarding flow nested inside the mobile steps. The current step is
clear from its highlighted label; it needs no rounded outline and no separate
“complete / remaining” count.

Completed steps are real navigation. The segment and its label are one button
that returns to that step without undoing later progress. Leaving a revisited
step returns to the live point in the sequence, so going back never forks or
rewinds onboarding.

Every screen keeps its title and subtitle at the same coordinates. Below them
comes flexible space, the step's core content and primary action, more flexible
space, and then auxiliary material such as progress, notes, or the option to
skip mobile setup. “Get help” stays in the bottom-right throughout onboarding
and offers Discord, the two support accounts on X, and the filed GitHub issues.

## Subscriptions

Happy requires at least one usable Claude Code, Codex, or Grok subscription;
there is no way to continue without one. The Subscriptions screen shows each
assistant as **Signed in**, **Not signed in**, **Not installed**, or an explicit
check failure.

An installed assistant that is not authenticated shows its sign-in command in
the same clearly terminal-shaped, one-click-copy treatment used on the Happy
marketing page. A missing assistant links to its official CLI installation
instructions. A valid assistant needs no action.

While this screen is visible, Happy checks again every two seconds without
flickering away the last result. A refresh control sits beside
“Subscriptions” for an immediate check, and the screen advances only after at
least one subscription is valid.

## Mobile and help

The mobile introduction remains. Mobile setup is represented by the two final
steps, **Get app** and **Connect phone**. Every optional exit says **Skip mobile
setup**, and every pairing QR code has **Copy auth link** directly beneath it.

“Get help” offers:

- Ask for help on Discord: <https://discord.gg/fX9WBAhyfD>
- DM `@bra1n_dump` on X
- DM `@Ex3NDR` on X
- Look through filed issues: <https://github.com/slopus/happy/issues>

## How we know it is done

- The five named steps form one stable, linear progress bar, and every
  completed step can be revisited through one combined segment-and-label
  target without losing progress.
- Setup screens retain one shared title, core-content, and auxiliary-content
  geometry as the sequence changes.
- Claude Code, Codex, and Grok each show the correct sign-in command or official
  installation link, and commands are visibly terminal commands that copy in
  one action.
- Subscription status refreshes every two seconds only while visible, can be
  refreshed immediately, and cannot be skipped when none is valid.
- Mobile onboarding remains optional but is no longer nested; its QR screens
  expose the exact authentication link for copying.
- The same bottom-right help menu is available throughout onboarding.