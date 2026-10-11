# Android app

A thin Android shell around the shadowing reader in [`../docs`](../docs). The web page is packaged into the APK and served offline from `https://appassets.androidplatform.net/`. Nothing is fetched from the network.

Android's WebView exposes `speechSynthesis` but never produces sound. To fix that, `app/src/main/assets/android-bridge.js` replaces it with an implementation backed by the phone's text-to-speech engine (`TtsBridge.java`). That implementation includes the word-boundary events used for highlighting. The bridge also maps the screen wake lock and system-bar insets.

## Build

    cd android
    ./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk

Building needs JDK 17+ and the Android SDK; Android Studio sets up both. Every push that touches `android/` or `docs/` also builds the APK in GitHub Actions. Download it from the run's **Artifacts**.

`app/debug.keystore` is a shared debug key. APKs built on any machine install over each other without losing reading progress. Don't use it for a store release.

## On the phone

Reading aloud uses the system text-to-speech engine. If no English voice shows up, tap **系统语音** in the app's settings, or go to Settings → 文字转语音. Pick an engine that speaks English (e.g. Google 文字转语音) and download the English (US) voice.
