# OSG Remote (Android)

Companion app for the **Phone Remote** page at `/remote` on Orange Sound Guild.

## Get the APK
1. Push this repository to GitHub. The workflow `.github/workflows/build-apk.yml` runs on every change in `android/` (or press **Run workflow** under the Actions tab).
2. Download `osg-remote.apk` from **Releases → OSG Remote (latest)** (or from the run's Artifacts).
3. Open the file on your phone and allow "Install unknown apps".

## Set up on the phone
1. On the site: **Phone Remote → Add phone** shows a pairing code (valid 1 hour).
2. In the app type the code and press **Pair this phone**.
3. Turn on **OSG Remote** in Accessibility settings. If Android says "Restricted setting", open App info → ⋮ → **Allow restricted settings**.
4. Allow "display over other apps" and "don't limit battery use" so apps can open and the phone keeps listening at home.

## How it works
- Pairing: the phone sends the code to `/api/public/remote/pair` and receives a secret token (stored on the phone; the server keeps only its hash).
- A single accessibility service polls `/api/public/remote/poll` — every ~0.7 s while the remote page is open, ~2.5 s otherwise.
- Commands: tap, long press, swipe, back, home, recents, wake, screenshot, open app, open web page, type text.
- The screen picture is only sent while the Phone Remote page is open. Screens that block screenshots (banking apps, etc.) stay blank.

Requires Android 11 or newer. Cannot unlock a PIN/pattern lock screen.

To point the app at another address (e.g. a preview URL) change the **Server** field before pairing.
