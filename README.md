# Desktop navigation PR screenshots

Review images for the eight Desktop navigation PRs. This branch contains screenshots only, separate from product branches.

The four overlay images are a matched real-component browser fixture, at 1360 × 860 CSS px and device scale 2: main MenuButton at f7793031a28af326161a26a45cdca8ca1463488c versus final combined components at 65195c50e754533ceab36c2b3e4d8715efe51ca3. They are not full Electron screenshots. Main has no Chats control yet; the before fixture uses its MenuButton in the identical new menu composition and shared shell geometry. The measured crops add guides; clean full images are also included. Menu right-edge delta is 56 CSS px before and 0 after, with a 4 CSS px vertical gap in both.

The other eight images are historical after-state captures from aggregate implementation 36ddfe4f, before latest-main integration. Still images show the captured state; interactions and DOM identity are supported separately by recorded verification and tests.

## File modal whole-window backdrop

The file-modal-window-before/after images are matched real-component browser fixtures at 1360 × 860 and 720 × 640 CSS px, scale 2. Before uses PR #128 at b99212e0e38b18d0c440af66917a3d857ff4c9ec; after uses e03312b2eaadc15230d45e763b86f45c705f47da. Both use the actual UI components and matching product composition. Original FileModal CSS was restored for the before capture; after includes its corrected close-control corner radius. These are not Electron screenshots. The backdrop begins at x=56 before and x=0 after; the connection rail is dimmed and no longer receives clicks through the file modal.
