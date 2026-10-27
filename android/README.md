# OSG Remote (Android)

Companion app for the **Phone Remote** page at `/remote` on Orange Sound Guild.

## Get the APK
1. Push this repository to GitHub. The workflow `.github/workflows/build-apk.yml` runs on every change in `android/` (or press **Run workflow** under the Actions tab).
2. Download `osg-remote.apk` from **Releases → OSG Remote (latest)** (or from the run's Artifacts).
3. Open the file on your phone and allow "Install unknown apps".

## In-app updates (2.4+)
- The app checks the fixed GitHub release on launch; **Check for updates** checks again.
- **Download update** downloads into the app cache, verifies the release SHA-256 and APK package/version/signing certificate, then opens Android's installer.
- Allow **Install unknown apps** for OSG Remote when asked, return to the app, and press **Install downloaded update**. Android still requires its own Update confirmation.
- GitHub must make the repository/releases publicly readable. No site login or device token is sent to GitHub.
- Install 2.4 manually once. Older builds used freshly generated debug keys; if Android rejects this first upgrade, uninstall the old app, install 2.4, then pair and enable Accessibility again. Uninstalling removes pairing data.

### Signing continuity
The workflow caches its fallback debug keystore before the first updater release and refuses subsequent publication if that cache is missing. GitHub can evict caches, so this fallback is not durable production signing. For reliable long-term releases, back up that same keystore and configure GitHub Actions secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. A different key cannot update existing installations. Never commit a keystore or credentials. The workflow supports these secrets and does not silently fall back when a configured secret is incomplete.

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
