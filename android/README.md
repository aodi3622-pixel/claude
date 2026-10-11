# Android app

A thin Android shell around the shadowing reader in [`../docs`](../docs). The web page and its American-English recordings (`docs/audio/`, see [`../tools/audio`](../tools/audio)) are packaged into the APK. They're served offline from `https://appassets.androidplatform.net/`, and nothing is fetched from the network. Playback doesn't depend on the phone's text-to-speech engine.

`app/src/main/assets/android-bridge.js` is injected into the page. It maps the screen wake lock to keep-screen-on, and feeds the system-bar insets to the page's `--safe-t`/`--safe-b`.

## Build

    cd android
    ./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk

Building needs JDK 17+ and the Android SDK; Android Studio sets up both. Every push that touches `android/` or `docs/` also builds the APK in GitHub Actions. Download it from the run's **Artifacts**.

`app/debug.keystore` is a shared debug key. APKs built on any machine install over each other without losing reading progress. Don't use it for a store release.
