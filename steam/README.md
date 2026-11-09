# ONIKS on Steam

The game ships as `dist/ONIKS/`, built from this repo. Nothing is built by hand, and day-to-day work doesn't
change: code in `game/` and `reference/`, play with `run_game.bat` or `run_app.bat`. The shipped copy is made
from the working tree whenever you want one.

```
dist/ONIKS/
  ONIKS.exe            the Rust app (Tauri 2 over WebView2), shipped build: no dev tools, no browser keys
  FONTS-OFL.txt        the font license (it must travel with the fonts)
  resources/           game/ + the shared kit and films from reference/, ~14 MB
    version.json       version, git commit, build date
```

## Every release

1. Bump `version` in `app/tauri.conf.json` and `app/Cargo.toml`.
2. Build and check the release:
   `python tools/build_release.py --zip`
   - It builds the exe, copies the game, then runs that copy from a temp folder outside the repo.
   - It opens the menu, a Sandbox match, the lab and every menu film.
   - It fails on a missing file, a page error or any network request.
   - `--zip` also writes `dist/ONIKS-<version>-win64.zip`, so you can try it on another PC first.
3. Upload to a test branch:
   `python tools/steam_upload.py --user <steam login> --live beta`
   - SteamCMD asks for your password and your Steam Guard code itself; the script never sees them.
4. Install the `beta` branch in your Steam client and play it.
5. In Steamworks > SteamPipe > Builds, set the build live on `default`.

`python tools/steam_upload.py --dry-run` writes the SteamPipe scripts into `steam/build/` without logging in.

## One-time setup

1. **Join Steamworks.** Sign up at https://partner.steamgames.com, pay the Steam Direct fee (US$100 per game) and fill
   in the bank, tax and identity forms. Valve then creates the app and gives it an **App ID**.
2. **Make a depot.** In Steamworks > your app > SteamPipe > Depots there is one by default, usually the App ID + 1:
   - Give it OS Windows and architecture 64-bit.
   - Put both numbers in `steam/config.json`; they are not secret.
3. **Add the launch option.** Under Installation > General, set:
   - executable `ONIKS.exe`
   - OS Windows
   - CPU 64-bit
4. **Store page.** Valve needs these before release:
   - Art: capsule images, at least 5 screenshots, a trailer. The film renders are made for this:
     `tools/render_film.py`.
   - Text and data: the description, system requirements and the content survey.
   - Then a "Coming soon" page for at least two weeks, and Valve's review of the build and the store page.
5. **Cloud saves (optional).** Settings and campaign progress live in the WebView's storage:
   - Location: `%LOCALAPPDATA%\com.oniks.game\EBWebView\`.
   - Steam Auto-Cloud can sync that folder (Steamworks > Application > Steam Cloud).
   - Better later: move saves to files written by the Rust side.

## System requirements (for the store page)

- **OS:** Windows 10 or 11, 64-bit.
- **WebView2 runtime:** it is already installed on Windows 11 and on an up-to-date Windows 10, so nothing extra
  needs to be shipped.
- **Graphics:** a DirectX 11 GPU with WebGL2.
- **WebGPU:** optional. The default hit model, `blast/fast` (Rust/WebAssembly), runs without it.
- **Measured here:** RX 9070 XT at 1600 x 900 runs at 120-240 fps through four stacked missile hits. The game's auto
  quality (`game/perfguard.js`) thins effects on slower machines.

## Known gaps before a store release

- **The repo is public** (github.com/Teoretarded/ONIKS). Anyone can run the game from source for free. Make it
  private before selling (GitHub > Settings > General > Danger Zone > Change visibility).
- **Steam Overlay.** It does not draw over a WebView2 window, a known limit of webview games. Shift+Tab
  does nothing in game.
- **Steamworks API.** Not wired in: no achievements, stats, rich presence or overlay hooks. Add it on the Rust side
  with the `steamworks` crate when wanted, plus a `steam_appid.txt` next to the exe for local runs.
- **Code signing.** The exe is unsigned. Steam installs it fine, but a zip handed out directly will meet SmartScreen.
- **Mac and Linux.** Tauri can build both, but only Windows is set up and tested.
