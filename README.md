<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/slopus/happy-desktop/main/.github/logotype-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/slopus/happy-desktop/main/.github/logotype-light.png">
  <img src="https://raw.githubusercontent.com/slopus/happy-desktop/main/.github/logotype-dark.png" width="400" height="106" alt="Happy">
</picture>

<h1>Any Model. Your Team.<br><em>Happy Harness.</em></h1>

<p>Free and open source</p>

[🌐 **Website**](https://happy.engineering/) • [📚 **Documentation**](https://happy.engineering/desktop/docs/) • [💬 **Discord**](https://discord.gg/fX9WBAhyfD)

</div>

https://github.com/user-attachments/assets/d193098c-4c60-440b-b91e-274a76d923d5

<p align="center">
<a href="https://github.com/slopus/happy-desktop/releases/latest"><b>⬇️&nbsp;&nbsp;Download for macOS</b></a> (Apple Silicon and Intel)
</p>

```sh
brew install --cask slopus/tap/happy
```

<p align="center">
<a href="https://github.com/slopus/happy-desktop/releases/latest">Windows</a> • <a href="https://github.com/slopus/happy-desktop/releases/latest">Linux</a> • <a href="https://github.com/slopus/happy-desktop/releases">All Releases</a>
</p>

<p align="center">
<a href="https://apps.apple.com/us/app/happy-claude-code-client/id6748571505"><img width="135" height="39" alt="Download on the App Store" src="https://github.com/user-attachments/assets/45e31a11-cf6b-40a2-a083-6dc8d1f01291" /></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://play.google.com/store/apps/details?id=com.ex3ndr.happy"><img width="135" height="39" alt="Get it on Google Play" src="https://github.com/user-attachments/assets/acbba639-858f-4c74-85c7-92a4096efbf5" /></a>
</p>

## What you get with Happy

1. **Multi-provider within one session.** Astra, Fable, and Grok in the same
   session. Switch models in the middle of a task or delegate to subagents.
2. **Natively multiplayer.** Invite a colleague or a friend into the session.
   You both watch the same agent work, and either of you can steer it.
3. **Reuse current subscriptions.** Sign in with the Claude, Codex, and Grok
   plans you already pay for. Happy adds a harness, not another bill.
4. **Open source MIT.** It runs on your own hardware and your projects stay
   ordinary folders. Read the code, fork it, ship your own build.
5. **End-to-end encrypted mobile app.** Left your desk? The same sessions are
   already on your phone, and what moves between your devices is encrypted.

## Love your terminal? Keep it.

The OG Happy experience (for those who have been around :D)

Start Claude Code or Codex in your terminal. Resume that session or start a new
one from your phone. No Desktop app required.

```sh
# Not using Happy Desktop?
# Install the CLI here:
npm install -g happy

# Start Claude Code
happy claude

# Or start Codex
happy codex
```

Using Desktop? Onboarding handles this setup for you.

## Already using Happy?

Your existing account and sessions still work. Connect Desktop from
**Settings → Mobile Access**.

## Download Happy.

Free and open source. Every download is on the
[latest release](https://github.com/slopus/happy-desktop/releases/latest); pick
the standard `Happy-<version>-…` file, not `Happy-Nightly-…`.

- **macOS** (Apple Silicon and Intel): download Happy from the latest release,
  or use Homebrew:

    ```sh
    brew install --cask slopus/tap/happy
    ```

    Then open **Happy** from Applications or Spotlight. The `happy` command in
    your terminal is the original Happy CLI, not the desktop app. Upgrade with
    `brew upgrade --cask slopus/tap/happy` (the app also updates itself).

- **Windows** (x64): download the installer (`Happy-<version>-x64.exe`) from
  the latest release.

    > If Windows SmartScreen says "Windows protected your PC", click **More info → Run anyway**. The installer is signed; SmartScreen warns about new releases until they build up reputation.

- **Linux** (x64 and arm64): download the AppImage
  (`Happy-<version>-x64.AppImage` or `Happy-<version>-arm64.AppImage`) from the
  latest release and make it executable with `chmod +x`, or
  `brew install --cask slopus/tap/happy` and launch with `happy-desktop`. Needs
  a graphical session and FUSE. Linux doesn't auto-update; upgrade Homebrew
  installs with `brew upgrade --cask slopus/tap/happy`.

- **iPhone and Android**: [App Store](https://apps.apple.com/us/app/happy-claude-code-client/id6748571505)
  and [Google Play](https://play.google.com/store/apps/details?id=com.ex3ndr.happy).

## How Happy fits together

| Repository                                                                            | What it is                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [slopus/happy](https://github.com/slopus/happy)                                       | The Happy mobile app (iOS, Android, web), the original Happy CLI, and the relay server |
| **[slopus/happy-desktop](https://github.com/slopus/happy-desktop)** ← this repository | **The Happy desktop app for macOS, Windows, and Linux**                                |
| [slopus/happy-agent](https://github.com/slopus/happy-agent)                           | Happy Agent, the open-source agent runtime the desktop app runs on                     |
| [slopus/slopus.github.io](https://github.com/slopus/slopus.github.io)                 | The website and docs at happy.engineering                                              |

## Documentation & Contributing

- **[Documentation](https://happy.engineering/desktop/docs/)** - Learn how to use Happy effectively
- **[Development Guide](https://github.com/slopus/happy-desktop/blob/main/DEVELOPMENT.md)** - Repository setup, browser mode, profiling, and validation
- **[Happy Agent](https://github.com/slopus/happy-agent)** - The open-source agent runtime inside the desktop app
- **[Original Happy CLI](https://github.com/slopus/happy)** - The `happy` terminal CLI, now in maintenance mode ([legacy docs](https://happy.engineering/docs/))
- **[Discord](https://discord.gg/fX9WBAhyfD)** - Ask questions and share what you build

## Workspace service browsing

Happy opens web content and rendered HTML in its built-in browser instead of
bouncing to an external one. Workspace service browsing keeps Chromium on your
machine and sends only a selected service's traffic through its owning Happy
Agent connection. Ask the agent to start a remote server with `service_start`,
then open `http://localhost:PORT` in that remote workspace. In local
workspaces, ordinary localhost URLs stay direct and do not require the service
API or a registered service. An exact sandboxed service, local or remote, can
be opened as `http://service-SERVICE_ID.localhost`; the browser switches to a
private, workspace-specific origin. Ordinary internet traffic stays direct.
This does not expose ordinary shell listeners or create a public sharing link.
The first service release requires the updated Nightly native host and Agent
preview, and the service host must support strict Linux sandboxing and
delegated resource controllers. Cross-origin pages and redirects cannot
silently gain access to a private service. Private pages currently use plain
HTTP under `.happy.invalid`; secure-context-only browser features are not
enabled. A dev server with a Host allowlist must allow this private suffix (for
Vite, `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.happy.invalid`).

## License

MIT License - see [LICENSE](https://github.com/slopus/happy-desktop/blob/main/LICENSE) for details.
