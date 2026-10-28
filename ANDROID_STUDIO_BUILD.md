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
2. [Node.js LTS](https://nodejs.org/).
3. [Android Studio](https://developer.android.com/studio).

During Android Studio's first-run setup, install the recommended Android SDK, platform tools, and build tools. Use Android Studio's bundled Java unless Gradle reports a Java-version problem.

## 2. Clone the project

In GitHub Desktop, sign in to the GitHub account that can access the repository and clone `kumarkisna/routineFlow` to your computer.

## 3. Install project dependencies and generate Android files

Open PowerShell in the cloned repository's top-level folder (the folder containing `pnpm-workspace.yaml`) and run:

```powershell
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install
cd artifacts\routine-flow
pnpm exec expo prebuild --platform android
```

If `corepack` is unavailable, install pnpm version `10.26.1` using the official pnpm installation instructions, then continue with `pnpm install`.

The last command creates the native Android project at:

```text
artifacts\routine-flow\android
```

The existing `artifacts\routine-flow\static-build\android` directory is preview output, not the native project. Open the newly generated `android` directory instead.

## 4. Open and build a debug APK

1. Start Android Studio and choose **File → Open**.
2. Select `artifacts\routine-flow\android`.
3. Wait for Gradle sync to finish. Accept prompts to install missing Android SDK components or licenses.
4. To build an APK, choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. Android Studio displays the build result and an option to locate the APK.

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
