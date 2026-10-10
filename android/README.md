# RESPAWN Android screen broadcaster

This is a native Android companion publisher for true Android game-screen video capture. The React site remains the public stream directory/viewer and LiveKit room chat. Android's `MediaProjection` permission prompt is required; this app does not capture the screen until the user approves it. Native broadcaster chat uses the same `respawn-live-chat` LiveKit data-message topic as the website. This first version does not publish microphone audio.

## Requirements

- Android Studio with JDK 17 and Android SDK 35 installed.
- Android 8.0/API 26 or newer device; Android 14+ displays the system screen-sharing chip/notification while capture is active. Allow notifications so the ongoing capture indicator can be shown.
- Existing RESPAWN Supabase project with the live-stream migrations applied, the `livekit-token` Edge Function deployed, and its LiveKit secrets configured.

## Configure

1. Copy `local.properties.example` to `local.properties` in this directory.
2. Set `SUPABASE_URL` and the public publishable/anon key for the same project used by the website. Never use the Supabase service-role key or LiveKit API secret in this Android app.
3. Open the `android/` directory in Android Studio, sync Gradle, connect a physical Android device, and run the `app` configuration. This repository currently does not include a Gradle wrapper; Android Studio can sync the Kotlin Gradle project, or you can install Gradle locally and run `gradle :app:assembleDebug`.
4. Sign into RESPAWN with the account that will host. Select a game, tap **Go Live — capture screen**, approve Android's screen-capture prompt, and choose the screen/app if prompted. Then switch to the game; Android keeps capture running and displays its system sharing notification. Return to RESPAWN Live or tap its notification and press **Stop stream** when finished.

The Android app calls the existing authenticated `livekit-token` Edge Function with no `Origin` header. That function must be deployed with the latest native-origin allowance. The issued token is host-only and tied to the authenticated user's existing live-stream row. Website spectators join the same LiveKit room.

## Important Android behavior

Android requires explicit user approval for every screen-capture session and may stop capture if the OS revokes the projection, the user taps Android's stop control, or the app is force-stopped. A native app is required to capture another app's/game screen; a normal mobile browser cannot do this when `getDisplayMedia` is unavailable.
