# Native Android App (anti fake-GPS, device binding) — Design

Date: 2026-11-19
Status: **Deferred — long-term roadmap.** The PWA stays the clock-in channel for
now. Decisions below were made with the stakeholder; detailed design and an
implementation plan are written when this project starts.

## Problem

`/absen` runs in the phone's browser, which cannot tell a real position from a
mock-location app. `location-flags.ts` can only flag suspicious fixes (low
accuracy, stale fix, impossible jump) — it never blocks, because a browser has
no way to prove a position is genuine. The "mobile only" gate
(`mobile-detect.ts`) is a user-agent check, which anyone can spoof. Nothing stops
an employee from logging in on a colleague's phone to clock in for them.

## Decisions (agreed 2026-11-19)

| Question | Decision |
|---|---|
| Offline clock-in? | **No.** Clock-in stays online; the server clock stays the source of time. |
| Platform | **Android first.** iPhone users keep the web flow / QR kiosk. |
| Approach | **Capacitor shell** loading the production site, plus a small native Kotlin plugin. Rejected: TWA (no native API access), full native rewrite (weeks of extra work, no security gain over the shell). |
| Distribution | **Direct APK** (link / WA), not Google Play. |
| Web clock-in after launch | **Required app, with a transition period.** HR setting "wajib aplikasi" (global or per branch). During transition, browser GPS clock-ins are accepted but flagged; once enabled, browser GPS clock-ins are rejected. QR-kiosk clock-ins stay allowed from any client (a valid rotating QR already proves presence). |
| Fake GPS detected | **Block** (clear message: turn off the mock-location app). |
| Root / emulator / weak integrity | **Flag only**, for HR review — cheap and custom-ROM phones fail integrity checks legitimately. |
| Device binding | **Yes:** one registered device per employee, HR can reset it. |

## Solution outline

### Shell

Capacitor Android app whose WebView loads the production `/absen` origin. All
existing UI and Server Actions are reused; web deploys update the app's content
without a new APK. A new APK is only needed when the native plugin changes.

### Native plugin (Kotlin)

1. **Native location** — read position from the Android location APIs instead of
   browser geolocation, together with the mock flag (`Location.isMock()` on API
   31+, `isFromMockProvider()` below that).
2. **Environment checks** — root indicators, emulator indicators, developer
   options / mock-location app selected. Reported as flags.
3. **Key attestation + request signing** — because the APK is sideloaded, Play
   Integrity's app-recognition verdict is unavailable; **Android Key
   Attestation** replaces it (free, no Play Store). A key pair is generated in
   the Android Keystore (hardware-backed where available) with a server-issued
   challenge; its certificate chain proves the app's package name and signing
   certificate, bootloader lock state and verified-boot state.

### Device registration (once per employee)

1. App asks the server for a challenge.
2. Plugin creates the attested key with that challenge, sends the certificate
   chain.
3. Server verifies: chain to Google's attestation root, revocation status,
   challenge match, package name, APK signing-cert digest, boot state.
4. Server stores the device public key bound to the employee. A second device
   is refused until HR resets the binding.

### Clock-in / clock-out

1. App requests a fresh one-time nonce.
2. Plugin reads native location, runs environment checks, and signs
   `nonce + lat + long + accuracy + mock flag + env flags + photo hash` with the
   device key.
3. Server Action verifies the signature against the employee's registered key,
   consumes the nonce, then runs the existing `clockIn` / `clockOut` logic.
4. Mock flag set → reject. Root/emulator/weak boot state → accept with new
   location flags. No valid signature + "wajib aplikasi" on → reject GPS
   clock-in (QR path still allowed); off → accept with a "bukan dari aplikasi"
   flag.

### Known limit

On a rooted phone an attacker can hook the plugin and suppress the mock flag.
Attestation still reports the unlocked bootloader / failed verified boot, so
the record gets flagged for HR — that is the accepted trade-off of "flag root,
don't block".

## Data model (sketch)

- `employee_devices` — employee, public key, attestation summary (security
  level, boot state, app signing digest), registered/revoked timestamps.
- `attendance_nonces` — single-use, short TTL.
- New `LocationFlag` values, e.g. `bukan_aplikasi`, `perangkat_root`,
  `emulator`, `integritas_lemah`.
- App setting / branch column for "wajib aplikasi".
- Audit log entries for device registration and HR resets.

## To verify when the project starts

- Current Capacitor version and its remote-URL (`server.url`) guidance.
- Google's current attestation root certificates and revocation-list endpoint.
- Minimum Android version to support (attestation quality varies on old/cheap
  devices — check against employees' actual phones).
- APK signing-key custody (losing it means every employee reinstalls).
- Whether Play distribution is worth revisiting (auto-updates, Play Integrity).
