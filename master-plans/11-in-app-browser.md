# In-app browser

## Where we are going

The workspace browser is a real browser the person can sign in with. Its tabs
run locally in the desktop app; their traffic leaves through the agent's
network, so sites see the agent's address, and HTTPS stays opaque to the agent.
Signing in just works, Google and X/Twitter included: the browser names itself
honestly instead of pretending to be Chrome.

Happy never stores passwords. There is no vault, no bulk import, and no copied
sessions. Clicking a login field, or the key in the browser's toolbar, opens a
native picker of the logins the person already saved in their browsers. Each
login is labelled by its browser and profile. Logins for this exact site come
first, then logins for related sites of the same domain, labelled as related.
Only the chosen login is decrypted, at that moment, and it is filled only on an
exact HTTPS origin in the top frame. This works while the source browser is
running. A short note where the person picks logins says that Happy stores no
passwords.

Happy's own process loads no third-party native code to read a login: the
Chromium-family browsers need only the operating system's own Keychain. Firefox
and Zen, whose logins only Mozilla's library can decrypt, and 1Password, whose
SDK loads 1Password's library, come through an isolated helper process instead.
Once they do, the main app turns library validation back on. With 1Password
connected, a newly typed password may then be offered for saving there; until
then Happy offers to save nothing.

No password or browser secret ever reaches an agent. If agents are given tools
to drive the browser, those tools never trigger a fill and never read a password
field.

## How we get there

First, protection. Installed builds encrypt the browser's cookies at rest and
refuse any debugger attaching to the app. This is a host-process change, so it
goes through the double confirmation `AGENTS.md` requires.

Then sign-in. The browser sends an honest user agent, and Google and X/Twitter
sign-in are checked in it.

Then the picker for Chromium-family browsers: every profile of Chrome (every
channel), Chromium, Edge, Brave, Arc, Dia, Comet, Helium, Vivaldi, Opera and
Opera GX, Thorium, Sidekick, and Aside, read on demand, with only the chosen
login decrypted. On Windows the same browsers except Chrome, whose app-bound
encryption admits no other reader.

Later, an isolated helper process that loads third-party libraries on Happy's
behalf: Firefox and Zen through it, then 1Password, then saving new passwords
to 1Password. The main app re-enables library validation at the same time.
Safari's passwords cannot be read by another app. Linux is not supported.

## How we know it is done

- Google and X/Twitter sign-in work in the workspace browser.
- On macOS, with Chrome running and several profiles, the picker lists the
  site's logins from each profile, labelled by browser and profile, exact
  matches before labelled related sites, and fills the one picked.
- Happy writes no password to disk, keeps none after a fill, and returns none
  through any bridge or agent tool.
- Happy's main process loads no third-party native library.
- Installed builds encrypt the browser's cookies at rest and refuse debuggers.
- On Windows, the supported browsers work the same way.
- Later: Firefox, Zen, and 1Password logins come through the isolated helper,
  a new password is offered only to a connected 1Password, and library
  validation is on in the main app.
