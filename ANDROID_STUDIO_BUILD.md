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

During Android Studio's first-run setup, install the recommended Android SDK, platform tools, and build tools. Use Android Studio's bundled Java unless Gradle reports a Java-version problem.

## 2. Clone the project

In GitHub Desktop, sign in to the GitHub account that can access the repository and clone `kumarkisna/routineFlow` to your computer.

## 3. Install project dependencies and generate Android files

Open **Git Bash** in the cloned repository's top-level folder (the folder containing `pnpm-workspace.yaml`). Use Git Bash rather than PowerShell for dependency installation: this workspace's install check uses `sh`, which Git Bash provides.

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

## 4. Open and build a debug APK

1. Start Android Studio and choose **File → Open**.
2. Select `artifacts\routine-flow\android`.
3. Wait for Gradle sync to finish. Accept prompts to install missing Android SDK components or licenses.
4. If Gradle asks for a Java version, open **File → Settings → Build, Execution, Deployment → Build Tools → Gradle** and select Android Studio's embedded JDK.
5. Choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**. If that menu is missing, open the Gradle tool window and run `app → Tasks → build → assembleDebug`.
6. Android Studio displays the build result and an option to locate the APK.

The debug APK is usually saved here:

```text
artifacts\routine-flow\android\app\build\outputs\apk\debug\app-debug.apk
```

Copy the APK to an Android phone and open it to install. Alternatively, enable USB debugging on the phone, connect it to the computer, select the device in Android Studio, and press **Run**.

You can also create an emulator in Android Studio using **Tools → Device Manager**, then run the app on that emulator.

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
- **Gradle reports a Java/JDK error**: set the Gradle JDK to Android Studio's embedded JDK, sync again, and retry.
- **Gradle cannot download `gradle-9.3.1-bin.zip` and reports `Connect timed out`**: this happens before the app is compiled. Open `https://services.gradle.org/distributions/gradle-9.3.1-bin.zip` in your laptop browser. If it does not download, retry on a stable network that permits HTTPS downloads. If the browser works but Android Studio still times out, check **File → Settings → Appearance & Behavior → System Settings → HTTP Proxy** and make it match your network (use **No proxy** only if your network does not require one). Check that your firewall allows Android Studio/Gradle outbound HTTPS; do not disable the firewall. Retry Gradle sync afterward. Do not change the Gradle version to fix a connection timeout.
- **Build fails**: in Android Studio, open **Build → Build Output** and inspect the first red error. Later errors are often consequences of that first one.

If the build still fails, save or screenshot the first error and the lines immediately above it. Those identify whether the problem is Node/pnpm, Expo prebuild, Android SDK, Java, or Gradle.
