# Build Routine Flow for Android with Android Studio

This guide builds the native Android app on a Windows computer from the GitHub source. The app is an Expo project; the native Android project is generated locally before Android Studio can build it.

## App identity and hosting

- The standalone app uses Android package ID `com.kumarkisna.routineflow`.
- It is separate from the Median app and will need a separate Google Play listing.
- The new app has separate on-device storage. Export a backup from the Median app before switching, then restore it in the standalone app if needed.
- Routine Flow stores its data on the device. The installed app does not need Replit hosting for its normal use. The build process does need an internet connection to download project dependencies and Android SDK components.

## 1. Install the tools

Install:

1. [GitHub Desktop](https://desktop.github.com/) to clone the repository.
2. [Node.js 24](https://nodejs.org/).
3. [Android Studio](https://developer.android.com/studio).
4. Git for Windows (Git Bash). GitHub Desktop normally installs Git for Windows too.

During Android Studio's first-run setup, install the recommended Android SDK, platform tools, and build tools. Configure Gradle to use **JDK 17**. Android Studio's bundled JDK may be newer; do not assume it is the right JDK for this native build.

## 2. Clone the project

In GitHub Desktop, sign in to the GitHub account that can access the repository and clone `kumarkisna/routineFlow` to your computer.

## 3. Install project dependencies and generate Android files

Open **Git Bash** in the cloned repository's top-level folder (the folder containing `pnpm-workspace.yaml`). Use Git Bash rather than PowerShell for dependency installation: this workspace's install check uses `sh`, which Git Bash provides.

On Windows, create a `.npmrc` file in the repository root containing:

```ini
node-linker=hoisted
```

This keeps native dependency paths shorter for CMake/Ninja. The file belongs beside `pnpm-workspace.yaml`, not inside `artifacts\routine-flow`.

Check the tools first:

```bash
node --version
```

Node should report `v24.x`, matching the workspace's Node 24 setup. Then activate the workspace's pnpm version and install from the repository root:

```bash
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm --version
pnpm install --frozen-lockfile
cd artifacts/routine-flow
pnpm exec expo prebuild --platform android
```

`pnpm --version` should report `10.26.1`. If Corepack is unavailable, open PowerShell and install that version with `npm install --global pnpm@10.26.1`, then reopen Git Bash and continue.

The last command creates the native Android project at:

```text
artifacts\routine-flow\android
```

The existing `artifacts\routine-flow\static-build\android` directory is preview output, not the native project. Open the newly generated `android` directory instead.

The hoisted install can place Expo under the app's `node_modules` while Metro's configuration is under the repository's root `node_modules`. To let Node resolve Expo from both locations, set this Windows user environment variable after installing dependencies:

```powershell
setx NODE_PATH "C:\rf\artifacts\routine-flow\node_modules;C:\rf\node_modules"
```

Adjust `C:\rf` if you cloned the repository elsewhere. Close and reopen Android Studio after setting this variable so Gradle and its bundling subprocesses inherit it. If you already have a Gradle daemon running, stop it or restart Windows before retrying a bundle that still reports `Cannot find module 'expo/package.json'`.

## 4. Open and build an APK

1. Start Android Studio and choose **File → Open**.
2. Select `artifacts\routine-flow\android`.
3. Wait for Gradle sync to finish. Accept prompts to install missing Android SDK components or licenses.
4. Open **File → Settings → Build, Execution, Deployment → Build Tools → Gradle** and set **Gradle JVM criteria → Version** to **17**. Click **OK**. Gradle's JVM version is separate from the Gradle wrapper version; keep the project's wrapper at its configured version.
5. To create a test/debug APK, choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**, or run `:app:assembleDebug`.
6. To create an APK that includes the JavaScript bundle and can open without Metro, run `:app:assembleRelease`.
7. In Android Studio's Gradle tool window, use the **Execute Gradle Task** button (the small square/play icon near the top) and enter the exact task, such as `:app:assembleRelease`. The task tree may not show a `build` group; this button works even when the group is absent. Do not run `bundleDebug` when you need an installable APK.
8. Wait for **BUILD SUCCESSFUL** in Build Output. If the build fails, use the first meaningful error in the output rather than later summary lines.

The debug APK is usually saved here:

```text
artifacts\routine-flow\android\app\build\outputs\apk\debug\app-debug.apk
```

The standalone release APK is usually saved here:

```text
artifacts\routine-flow\android\app\build\outputs\apk\release\app-release.apk
```

Copy the **release APK** to the Android phone and open it to install. Sending it through WhatsApp as a document/file is also fine. An `.aab` file is an Android App Bundle and cannot be installed by tapping it; use an APK for direct installation. Android 12 and Samsung tablets do not need special project changes for this app.

The debug APK is for development and normally needs Metro running on the computer. If it remains on the splash screen when installed by itself, build and install the release APK instead. If testing the debug APK on a USB-connected phone, enable Developer options and USB debugging, accept the phone's authorization prompt, and run Metro from `artifacts\routine-flow`:

```powershell
pnpm exec expo start --localhost
```

In a second PowerShell window, locate ADB and forward Metro's port (the default SDK location is shown):

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb reverse tcp:8081 tcp:8081
```

The `devices` output must list the phone with status `device` before `reverse` will work. If the phone is missing, use a data-capable USB cable, unlock the phone, enable USB debugging, and accept the authorization prompt. Alternatively, create an emulator with **Tools → Device Manager**.

## 5. Create a Play Store release

For Google Play, use **Build → Generate Signed Bundle / APK**:

- Choose **Android App Bundle** for Play Store submission.
- Choose **APK** for a signed file that can be installed directly.
- Create a new signing key for this separate app. Keep the key and its password in a secure backup; never commit them to GitHub.
- Create a new Play Console listing for `com.kumarkisna.routineflow`. This package ID cannot update the Median listing.

## Notes

- The first native build can take several minutes while Gradle downloads dependencies.
- Re-running Expo prebuild can regenerate native project files. Avoid making manual Android changes before the first build; if you later customize native files, keep a backup or commit those changes.
- The debug APK is suitable for testing. Test the installed app with the phone offline to confirm routine use does not depend on Replit hosting.

## Troubleshooting

- **`sh` is not recognized**, or the install check fails before pnpm installs anything: run `pnpm install --frozen-lockfile` from Git Bash at the repository root, not PowerShell and not the app folder.
- **`pnpm` or `corepack` is not recognized**: install Node.js 24, close and reopen Git Bash, then check `node --version`. If Corepack is still unavailable, install pnpm `10.26.1` globally as described above.
- **`ERR_PNPM_OUTDATED_LOCKFILE`**: confirm pnpm is exactly `10.26.1` and retry `pnpm install --frozen-lockfile` from the repository root.
- **Gradle sync reports a missing SDK or license**: open Android Studio's SDK Manager, install the SDK version named in the error, and accept its license.
- **Gradle reports a Java/JDK error**: set the Gradle JDK to JDK 17, sync again, and retry.
- **`:react-native-worklets:configureCMakeDebug` fails with `WARNING: A restricted method in java.lang.System has been called`**: set Android Studio's **Gradle JDK** to JDK 17, not a newer bundled JDK. Sync and rebuild. If you build from a terminal instead of Android Studio, make `JAVA_HOME` point to that same JDK 17.
- **Ninja reports `manifest 'build.ninja' still dirty after 100 tries`**: check that the repository is in a short path such as `C:\rf`, and that the root `.npmrc` contains `node-linker=hoisted`. Reinstall dependencies from the repository root with `pnpm install --frozen-lockfile`. If Android sync still points into the old `.pnpm` virtual-store path, close Android Studio, back up `android\gradle\wrapper\gradle-wrapper.properties` and `android\gradle\gradle-daemon-jvm.properties`, then run `pnpm exec expo prebuild --platform android` from `artifacts\routine-flow`. Reopen the generated `android` folder and confirm the wrapper version and Java 17 criteria afterward; prebuild can rewrite native files.
- **pnpm warns it could not create `node.exe` bins for `@types/node` on Windows**: these warnings were non-blocking when `pnpm install --frozen-lockfile` completed successfully. Continue unless the install exits with an error or a required package is missing.
- **Release bundling fails with `Cannot find module 'expo/package.json'`**: confirm the root `.npmrc` uses `node-linker=hoisted`, set the Windows user `NODE_PATH` as described in Section 3, then fully restart Android Studio and retry `:app:assembleRelease`. The `NODE_ENV environment variable is required` line can appear as a warning; the missing Expo module is the blocking error.
- **`JAVA_HOME is not set` in PowerShell**: Android Studio's Gradle JVM setting does not configure PowerShell. Build from Android Studio's Gradle task runner, or set `JAVA_HOME` in that terminal to the installed JDK 17 before running `gradlew.bat`.
- **Only a debug APK or `app-debug.aab` exists**: run `:app:assembleRelease` for a standalone APK. `bundleDebug` creates an `.aab`, which is not directly installable by tapping it.
- **Gradle cannot download `gradle-9.3.1-bin.zip` and reports `Connect timed out`**: this happens before the app is compiled. Open `https://services.gradle.org/distributions/gradle-9.3.1-bin.zip` in your laptop browser. If it does not download, retry on a stable network that permits HTTPS downloads. If the browser works but Android Studio still times out, check **File → Settings → Appearance & Behavior → System Settings → HTTP Proxy** and make it match your network (use **No proxy** only if your network does not require one). Check that your firewall allows Android Studio/Gradle outbound HTTPS; do not disable the firewall. Retry Gradle sync afterward. Do not change the Gradle version to fix a connection timeout.
- **Build fails**: in Android Studio, open **Build → Build Output** and inspect the first red error. Later errors are often consequences of that first one.

If the build still fails, save or screenshot the first error and the lines immediately above it. Those identify whether the problem is Node/pnpm, Expo prebuild, Android SDK, Java, or Gradle.
