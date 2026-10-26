# Browser Import

## Where we are going

The workspace browser should already be signed in where the person wants it to
be. They bring sessions over from the browsers they already use, and Happy fills
their saved passwords. They choose exactly what comes over, and nothing else
does.

This is a solved problem, and we follow the browsers that solved it rather than
inventing our own. Competitors that import (T3 Code, Superset, Orca) take every
cookie and import no passwords; Brave removed cookie import because it brought
everything over, trackers included. A whitelist and a password vault are what
set us apart.

Secrets are stored the way Chrome, VS Code, and Bitwarden store them: one random
key held by the operating system — the Keychain on macOS, its equivalent on
Windows — through Electron `safeStorage`, and everything else encrypted with that
key. Nothing secret sits on disk in plaintext.

## How we get there

First, encryption at rest. Today the workspace browser's cookies are stored on
disk unencrypted. Turn on Electron's cookie encryption before importing anyone's
sessions. The person has agreed to this; it is a host-process change, so it
still goes through the double confirmation `AGENTS.md` requires when it is made.

Then cookie import on macOS. Happy reads the source browser's profile and lists
its sites, grouped by domain, without decrypting anything and without a Keychain
prompt. The person ticks the sites they want. Only then does Happy ask the
Keychain once for that browser's key and decrypt only the chosen sites. The
choice is made at each import; there is no saved list to re-sync. Cookies go into
the built-in browser: every profile it has opened on this Mac, with no destination
to choose. Only secure cookies are imported. Happy's own domains and Google's
device-bound sign-in are never imported. Chromium-family browsers first, then
Firefox, then Safari, which needs Full Disk Access.

Then passwords. Saved passwords are imported the same way, chosen per site,
from the same source browsers; Safari's are imported from its own CSV export,
because no other app can read them. They live in one vault on this Mac, shared
by every network, kept in the desktop process and never sent to an agent.
Autofill fills only on an exact match of scheme, host, and port over HTTPS, only
in the top frame, never in a cross-origin frame, and only after the person
chooses the login in a picker Happy draws outside the page. Offering to save a
new password is Happy's UI too.

Last, Windows. Its Chromium-family browsers are read the same way with the
system's protection. Chrome's app-bound encryption blocks outside readers, so
Chrome cookies cannot be imported there; its passwords come from a CSV export,
and Happy says so plainly instead of importing nothing silently.

Browser traffic leaves through the agent's network, so sites see the agent's
address, not the person's. HTTPS stays opaque to the agent. If agents are ever
given tools to drive the browser, those tools never trigger a fill and never read
a password field.

## How we know it is done

- The workspace browser's cookies and the password vault are encrypted at rest
  with a key held by the operating system.
- A person can import from Chrome, Arc, Brave, Edge, Firefox, and Safari on
  macOS, choosing the sites first; nothing they did not choose is imported, and
  there is no Keychain prompt before they choose.
- Imported sessions land in the built-in browser without choosing a destination,
  and work there.
- Imported and newly saved passwords live in one vault and fill only on an exact
  HTTPS origin in the top frame, after the person picks a login in Happy's UI.
- No password and no imported secret ever reaches an agent.
- On Windows, supported browsers import the same way, and Chrome's unsupported
  case is explained rather than silently empty.
