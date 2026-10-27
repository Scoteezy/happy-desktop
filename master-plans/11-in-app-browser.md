# In-app browser

## Where we are going

The workspace browser is a real browser the person can sign in with. Its tabs
run locally in the desktop app; their traffic leaves through the agent's
network, so sites see the agent's address, and HTTPS stays opaque to the agent.
Signing in just works, Google and X/Twitter included: the browser names itself
honestly instead of pretending to be Chrome.

Happy never stores passwords. There is no vault, no bulk import, and no copied
sessions. Clicking a login field, or the key in the browser's toolbar, opens a
native picker of the logins the person already saved: every profile of each
Chromium-family browser (Chrome, Edge, Brave, Arc, and the like), Firefox, and
1Password when they connected it. Each login is
labelled by its source and profile. Logins for this exact site come first, then
logins for related sites of the same domain, labelled as related. Only the
chosen login is decrypted, at that moment, and it is filled only on an exact
HTTPS origin in the top frame. This works while the source browser is running.
Firefox's and 1Password's libraries load into Happy only from their system-wide
install, after their publisher's code signature is verified.

A newly typed password is offered for saving only into 1Password, when it is
connected. Otherwise Happy offers nothing. A short note where the person picks
logins says that Happy stores no passwords.

No password or browser secret ever reaches an agent. If agents are given tools
to drive the browser, those tools never trigger a fill and never read a password
field.

## How we get there

First, protection. Installed builds encrypt the browser's cookies at rest and
refuse any debugger attaching to the app. This is a host-process change, so it
goes through the double confirmation `AGENTS.md` requires.

Then sign-in. The browser sends an honest user agent, and Google and X/Twitter
sign-in are checked in it.

Then the picker on macOS: every Chromium-family profile, Firefox, and 1Password,
read on demand, with only the chosen login decrypted. Then saving to 1Password.

Last, Windows: Chromium browsers other than Chrome, whose app-bound encryption
admits no other reader, and Firefox. Safari's passwords cannot be read by
another app. Linux is not supported.

## How we know it is done

- Google and X/Twitter sign-in work in the workspace browser.
- On macOS, with Chrome running and several profiles, the picker lists the
  site's logins from each profile, labelled by source and profile, exact
  matches before labelled related sites, and fills the one picked.
- Happy writes no password to disk, keeps none after a fill, and returns none
  through any bridge or agent tool.
- A new password is offered only to a connected 1Password.
- Installed builds encrypt the browser's cookies at rest and refuse debuggers.
- On Windows, the supported browsers work the same way.
