# Windows releases and signing

The shared `build-windows.yml` workflow produces Windows x64 NSIS installers for
Happy and Happy Nightly, their blockmaps, and `latest.yml` / `nightly.yml` for
Electron's updater. Both distributions use `scripts/desktopFlavors.mjs` so their
application identities, updater caches, and channels agree. It runs typechecks and the
application tests, installs the actual `.exe` on a disposable hosted Windows
runner, then launches that installed `Happy.exe` through Playwright and verifies
the welcome screen. The screenshot is uploaded with the run.

To validate a branch without publishing a release:

```sh
gh workflow run desktop-validate.yml --ref <branch> -f platform=windows
```

Download `happy-desktop-windows-installer-standard-unsigned` or
`happy-desktop-windows-installer-local-web-unsigned` from the completed run and run its
`.exe`. The Agent is downloaded separately by Desktop; public
onboarding requires a Happy Agent release containing its Windows x64 archive.

The existing manual `desktop-release.yml` workflow still publishes from `main`
after validating the release version and notes. It now waits for this Windows
build and includes its installer and updater files beside the signed macOS
artifacts. The release additionally exercises Desktop's real GitHub release
lookup, checksum-verified Agent installation, saved binary selection, daemon
startup, and authenticated named-pipe health with a fresh Happy home. Publish
the Windows Agent before dispatching the Desktop release. Apple signing and
notarization remain unchanged.

## Azure Artifact Signing

Signing is enabled only when the repository variable `WINDOWS_SIGNING_ENABLED`
is `true` and the workflow runs from `main`. Other branches produce explicitly
unsigned validation artifacts. Once enabled, a missing setting, failed signature,
or unexpected publisher fails the build; there is no unsigned fallback.

Configure these GitHub Actions repository variables:

| Variable                    | Value                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`           | Application/client ID for the GitHub signing identity                 |
| `AZURE_TENANT_ID`           | Azure tenant ID                                                       |
| `AZURE_SUBSCRIPTION_ID`     | Subscription containing the signing account                           |
| `WINDOWS_SIGNING_ENDPOINT`  | Regional signing endpoint, e.g. `https://wus2.codesigning.azure.net/` |
| `WINDOWS_SIGNING_ACCOUNT`   | Artifact Signing account name                                         |
| `WINDOWS_SIGNING_PROFILE`   | Approved Public Trust certificate profile name                        |
| `WINDOWS_SIGNING_PUBLISHER` | Exact certificate common name or full subject, as approved by Azure   |
| `WINDOWS_SIGNING_ENABLED`   | Set to `true` only after provisioning is complete                     |

The Azure application needs a federated credential with issuer
`https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`,
and subject `repo:slopus/happy-desktop:ref:refs/heads/main`. Assign it **Artifact
Signing Certificate Profile Signer**, scoped to the certificate profile. No
client secret, PFX, or private key is stored in GitHub. Human identity verification
uses a separate **Artifact Signing Identity Verifier** role.

Electron Builder signs the application, native files, uninstaller, and NSIS
installer before generating the blockmap and updater manifest. CI verifies the
timestamped signatures and publisher on the installer and installed native files,
the updater's publisher pin, and the final installer's SHA-512 and size. Signed
artifact names end in `-signed`.

Validate both flavors on `main` before publishing the first signed release. A
certificate renewal under the same publisher can use the existing updater pin.
Changing the publisher later needs an updater migration: ship a bridge accepting
both identities first and account for users who skip that bridge release.

Unsigned installers can trigger SmartScreen warnings or be blocked by Smart App
Control or organizational policy. Signing establishes a verified publisher; it
does not guarantee immediate SmartScreen reputation. Happy's sandbox setup still
has its own one-time Windows administrator approval.
