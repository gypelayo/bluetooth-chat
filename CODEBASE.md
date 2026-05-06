# BluetoothChat — LLM Codebase Documentation

> Comprehensive reference for AI-assisted development. Last updated: 2026-05-06.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Two Sub-Projects: BluetoothChat vs bluetooth-chat](#3-two-sub-projects-bluetoothchat-vs-bluetooth-chat)
4. [BLE Protocol Design](#4-ble-protocol-design)
5. [BluetoothChat — Primary App (React Native CLI)](#5-bluetoothchat--primary-app-react-native-cli)
   - [App.tsx — Full Walkthrough](#51-apptsx--full-walkthrough)
   - [State Model](#52-state-model)
   - [BLE Roles (Central + Peripheral)](#53-ble-roles-central--peripheral)
   - [Message Flow](#54-message-flow)
   - [Persistence](#55-persistence)
   - [Android Configuration](#56-android-configuration)
   - [iOS Configuration](#57-ios-configuration)
   - [Build Tooling](#58-build-tooling)
6. [bluetooth-chat — Secondary App (Expo)](#6-bluetooth-chat--secondary-app-expo)
   - [App.tsx Differences from Primary](#61-apptsx-differences-from-primary)
   - [Expo / EAS Configuration](#62-expo--eas-configuration)
7. [Linux BLE Simulator](#7-linux-ble-simulator)
8. [Shell Scripts](#8-shell-scripts)
9. [Dependencies Deep-Dive](#9-dependencies-deep-dive)
10. [Testing](#10-testing)
11. [Known Issues & Limitations](#11-known-issues--limitations)
12. [Key Constants & Configuration Values](#12-key-constants--configuration-values)
13. [Common Tasks for AI Agents](#13-common-tasks-for-ai-agents)

---

## 1. Project Overview

**BluetoothChat** is a mobile application for peer-to-peer chat over Bluetooth Low Energy (BLE). Two phones (or a phone and a Linux computer) discover each other, establish a GATT connection, and exchange text messages encoded as UTF-8 byte arrays carried in BLE characteristic write/notify operations.

**Platform targets:**
- Android (primary, all development done here)
- iOS (scaffolded, not deeply tested)

**Technology stack:**
- React Native (TypeScript)
- `react-native-ble-plx` — BLE Central (scanner + GATT client)
- `react-native-ble-peripheral` — BLE Peripheral (GATT server / advertiser) *(BluetoothChat only)*
- `@react-native-async-storage/async-storage` — local message persistence
- Python 3 + `bless` — Linux GATT server for testing

---

## 2. Repository Layout

```
bluetooth-app/                        ← workspace root
├── BluetoothChat/                    ← PRIMARY: React Native CLI app (main app)
│   ├── App.tsx                       ← single-file application logic
│   ├── index.js                      ← RN entry point (AppRegistry)
│   ├── package.json
│   ├── tsconfig.json
│   ├── babel.config.js
│   ├── metro.config.js
│   ├── jest.config.js
│   ├── build-apk.sh                  ← convenience wrapper around ./gradlew assembleDebug
│   ├── __tests__/App.test.tsx        ← smoke test (renders without crash)
│   ├── android/                      ← Android native project
│   │   ├── app/
│   │   │   ├── src/main/
│   │   │   │   ├── AndroidManifest.xml
│   │   │   │   └── java/com/bluetoothchat/
│   │   │   │       ├── MainActivity.kt
│   │   │   │       └── MainApplication.kt
│   │   │   └── build.gradle          ← app-level Gradle
│   │   ├── build.gradle              ← project-level Gradle
│   │   └── gradle.properties         ← RN arch / Hermes / SDK versions
│   └── ios/                          ← iOS native project (CocoaPods)
│       ├── BluetoothChat/
│       │   ├── AppDelegate.swift
│       │   └── Info.plist
│       └── Podfile
│
├── bluetooth-chat/                   ← SECONDARY: Expo managed-workflow app
│   ├── App.tsx                       ← simplified App (central only, no peripheral)
│   ├── index.ts                      ← Expo entry (registerRootComponent)
│   ├── app.json                      ← Expo config (icons, package name, permissions)
│   ├── eas.json                      ← EAS Build profiles
│   ├── package.json
│   └── tsconfig.json
│
├── linux-ble-simulator.py            ← Python BLE GATT server for testing
├── ble-venv/                         ← Python venv (bless, bleak)
├── setup-and-test.sh                 ← env checker + venv installer + EAS installer
├── install-sdk.sh                    ← downloads Android SDK to ~/Android/
├── setup-sdk.sh                      ← cleaner version of install-sdk.sh (also installs NDK)
└── CODEBASE.md                       ← (this file)
```

---

## 3. Two Sub-Projects: BluetoothChat vs bluetooth-chat

| Aspect | `BluetoothChat/` | `bluetooth-chat/` |
|---|---|---|
| Framework | React Native CLI | Expo (managed + dev-client) |
| RN version | 0.85.3 | 0.81.5 |
| Entry | `AppRegistry.registerComponent` | `registerRootComponent` (Expo) |
| BLE libraries | `react-native-ble-plx` only | `react-native-ble-plx` only |
| Role | Central (scan + GATT connect/write/notify) | Central only |
| Persistence | AsyncStorage v1.24 | AsyncStorage v2 |
| Build | `./gradlew assembleDebug` or `build-apk.sh` | EAS Build (cloud) |
| `isOwn` field on messages | ✅ | ❌ (uses `sender === myName`) |
| BLE state tracking | ✅ (`onStateChange`) | ❌ |
| RSSI display | ✅ | ❌ |

> **`react-native-ble-lite` was removed** from `BluetoothChat/` — it is an Expo module
> (`expo-modules-core`) and cannot be auto-linked in a bare React Native CLI project.
> Scanning is done entirely through `react-native-ble-plx` which also handles GATT.

**Which one to work on:** The `BluetoothChat/` project is the primary, more feature-complete version. `bluetooth-chat/` is an earlier/simpler Expo prototype.

---

## 4. BLE Protocol Design

### GATT Profile (shared by both apps and the Linux simulator)

```
Service UUID:               12345678-1234-1234-1234-1234567890ab
  Characteristic: Messages  abcdefab-1234-1234-1234-abcdefabcdef
    Properties: READ | WRITE | NOTIFY
    Permissions: READ | WRITE
  Characteristic: Name      fedcba98-1234-1234-1234-abcdefabcdef   (BluetoothChat only)
    Properties: READ
    Permissions: READ
```

### Wire encoding

Messages are raw UTF-8 text. When transferred over BLE:
- **Central → Peripheral (write):** `Buffer.from(text).toString('base64')` is passed to `writeCharacteristicWithResponseForService()`. The library handles base64→bytes internally before putting it on the wire.
- **Peripheral → Central (notify):** The central receives `characteristic.value` as a base64 string and decodes with `Buffer.from(value, 'base64').toString('utf-8')`.

### Topology

```
Phone A (acts as BOTH)         Phone B (acts as BOTH)
┌─────────────────────┐        ┌─────────────────────┐
│  Central (scanner)  │──────▶ │ Peripheral (server) │
│  Peripheral (server)│◀────── │  Central (scanner)  │
└─────────────────────┘        └─────────────────────┘
```

One phone connects to the other's GATT server via a central→peripheral relationship. Because each device is also a peripheral, the other can connect back (though in practice one GATT connection is established and used bidirectionally via write + notify).

---

## 5. BluetoothChat — Primary App (React Native CLI)

### 5.1 App.tsx — Full Walkthrough

**File:** `BluetoothChat/App.tsx` (~340 lines)

Single-component React Native app. No navigation library; the app toggles between two "screens" based on the `connectedDevice` state value.

#### Module-level singletons

```typescript
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const MESSAGE_CHAR_UUID = 'abcdefab-1234-1234-1234-abcdefabcdef';
const NAME_CHAR_UUID = 'fedcba98-1234-1234-1234-abcdefabcdef';

const bleManager = new BleManager();   // react-native-ble-plx global instance
```

`BleManager` is instantiated once at module scope (not inside the component). It is destroyed in the `useEffect` cleanup: `bleManager.destroy()`.

#### Types

```typescript
type Message = {
  id: string;        // Date.now().toString()
  text: string;
  sender: string;    // display name of the sender
  timestamp: number; // Unix ms
  isOwn: boolean;    // true for messages sent by this device
};
```

### 5.2 State Model

| State variable | Type | Initial | Purpose |
|---|---|---|---|
| `devices` | `Device[]` | `[]` | Discovered BLE peripherals not yet connected |
| `connectedDevice` | `Device \| null` | `null` | Active GATT connection; drives screen switch |
| `messages` | `Message[]` | `[]` | Full message history for current session |
| `inputText` | `string` | `''` | Controlled input field value |
| `scanning` | `boolean` | `false` | True while BLE scan is active |
| `advertising` | `boolean` | `false` | True when peripheral is advertising |
| `myName` | `string` | `'User'` | Local user display name |

### 5.3 BLE Roles (Central + Peripheral)

#### Central role — `react-native-ble-plx`

**Scanning:**
```typescript
bleManager.startDeviceScan([SERVICE_UUID], null, callback)
// Filters for devices advertising SERVICE_UUID
// Auto-stops after 10 seconds via setTimeout
```

**Connecting + service discovery:**
```typescript
const connected = await device.connect();
await connected.discoverAllServicesAndCharacteristics();
setConnectedDevice(connected);
```

**Monitoring (receive messages from the remote peripheral):**
```typescript
connected.monitorCharacteristicForService(
  SERVICE_UUID,
  MESSAGE_CHAR_UUID,
  (error, characteristic) => {
    const text = Buffer.from(characteristic.value, 'base64').toString('utf-8');
    // ...add to messages state
  }
);
```

**Sending messages (write to remote peripheral):**
```typescript
const base64Value = Buffer.from(inputText).toString('base64');
await connectedDevice.writeCharacteristicWithResponseForService(
  SERVICE_UUID, MESSAGE_CHAR_UUID, base64Value
);
```

#### Peripheral role — `react-native-ble-peripheral`

**Setup (called once on mount via `setupPeripheral()`):**
```typescript
await BLEPeripheral.addService(SERVICE_UUID, true);          // primary service
await BLEPeripheral.addCharacteristicToService(
  SERVICE_UUID, NAME_CHAR_UUID,
  1,          // PROPERTY_READ
  1           // PERMISSION_READ
);
await BLEPeripheral.addCharacteristicToService(
  SERVICE_UUID, MESSAGE_CHAR_UUID,
  0x08 | 0x02,  // PROPERTY_WRITE | PROPERTY_NOTIFY
  0x02 | 0x04   // PERMISSION_WRITE | PERMISSION_READ
);
await BLEPeripheral.setName(myName);
await BLEPeripheral.start();
```

**Receiving writes from a remote central (`setupMessageListener()`):**
```typescript
BLEPeripheral.onWriteReceived((event) => {
  if (event.characteristicUUID === MESSAGE_CHAR_UUID) {
    const text = event.value || event.data || '';
    // ...add incoming message to state
  }
});
```

**Name change** restarts advertising:
```typescript
BLEPeripheral.stop();
setTimeout(() => setupPeripheral(), 100);
```

### 5.4 Message Flow

```
OUTGOING (this device → remote):
  User types → sendMessage()
    → writeCharacteristicWithResponseForService (central writes to remote GATT)
    → Appends Message{isOwn:true} to local state
    → Saves to AsyncStorage

INCOMING via central monitor (remote notifies):
  monitorCharacteristicForService callback fires
    → Decode base64 → UTF-8
    → Appends Message{isOwn:false, sender: device.name} to state
    → Saves to AsyncStorage

INCOMING via peripheral write (remote central writes to our GATT server):
  BLEPeripheral.onWriteReceived fires
    → event.value or event.data (raw text)
    → Appends Message{isOwn:false, sender: event.deviceName} to state
    → Saves to AsyncStorage
```

### 5.5 Persistence

`@react-native-async-storage/async-storage` stores the message array under the key `'messages'`.

- **Load:** Called in `useEffect` on mount via `loadMessages()`.
- **Save:** Every `setMessages` call is paired with `saveMessages(updated)`.
- Messages are **not** cleared between sessions by default (only cleared on `disconnect()`).

### 5.6 Android Configuration

**`android/app/src/main/AndroidManifest.xml`**

Permissions declared:
```xml
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

The app marks itself as **requiring BLE hardware** (`android:required="true"`), so it won't appear in the Play Store for non-BLE devices.

**Runtime permission request** (Android 12+):
```typescript
PermissionsAndroid.requestMultiple([
  BLUETOOTH_SCAN,
  BLUETOOTH_CONNECT,
  BLUETOOTH_ADVERTISE,
  ACCESS_FINE_LOCATION,
])
```

**`android/gradle.properties`**

| Property | Value |
|---|---|
| `newArchEnabled` | `true` (New Architecture / TurboModules) |
| `hermesEnabled` | `true` (Hermes JS engine) |
| `edgeToEdgeEnabled` | `false` |
| `reactNativeArchitectures` | `armeabi-v7a,arm64-v8a,x86,x86_64` |
| `org.gradle.jvmargs` | `-Xmx2048m -XX:MaxMetaspaceSize=512m` |

**`android/build.gradle` — SDK versions**

| Variable | Value |
|---|---|
| `buildToolsVersion` | `36.0.0` |
| `minSdkVersion` | `24` (Android 7.0) |
| `compileSdkVersion` | `36` |
| `targetSdkVersion` | `36` |
| `ndkVersion` | `27.1.12297006` |
| `kotlinVersion` | `2.1.20` |

**`android/app/build.gradle`**

- Application ID: `com.bluetoothchat`
- Uses `autolinkLibrariesWithApp()` for automatic native module linking.
- Signing: debug keystore at `app/debug.keystore` (password: `android`).
- Proguard: disabled for release (`enableProguardInReleaseBuilds = false`).

**`android/app/src/main/java/com/bluetoothchat/`**

- `MainActivity.kt` — extends `ReactActivity`, registers component `"BluetoothChat"`, enables Fabric renderer.
- `MainApplication.kt` — extends `Application`, implements `ReactApplication`, initializes `ReactHost` using `PackageList` auto-linking.

### 5.7 iOS Configuration

**`ios/BluetoothChat/Info.plist`**

- `NSLocationWhenInUseUsageDescription` — empty string (should be filled before App Store submission).
- No `NSBluetoothAlwaysUsageDescription` key is present — **must be added** before iOS submission.
- Portrait-only on iPhone; all orientations on iPad.
- App Transport Security: local networking allowed, arbitrary loads disallowed.

**`ios/Podfile`**

Standard React Native CocoaPods setup using `use_native_modules!` and `use_react_native!`. No custom pods added manually.

**⚠️ iOS BLE note:** Neither `NSBluetoothAlwaysUsageDescription` nor `NSBluetoothPeripheralUsageDescription` is present in `Info.plist`. The app will crash on iOS if Bluetooth APIs are called without these keys.

### 5.8 Build Tooling

| File | Purpose |
|---|---|
| `babel.config.js` | Uses `@react-native/babel-preset` |
| `metro.config.js` | Default Metro config, no customizations |
| `jest.config.js` | Uses `@react-native/jest-preset` |
| `tsconfig.json` | Extends `@react-native/typescript-config`, adds `jest` types |
| `.prettierrc.js` | Prettier formatting (standard RN defaults) |
| `.eslintrc.js` | ESLint with `@react-native/eslint-config` |
| `build-apk.sh` | Runs `./gradlew assembleDebug`; auto-detects `ANDROID_HOME` |

**APK output path:**
```
BluetoothChat/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 6. bluetooth-chat — Secondary App (Expo)

### 6.1 App.tsx Differences from Primary

This is a simpler, **central-only** version. Key differences:

| Feature | BluetoothChat | bluetooth-chat |
|---|---|---|
| Peripheral / advertising | ✅ `react-native-ble-peripheral` | ❌ |
| `isOwn` field | ✅ | ❌ (inferred at render time: `item.sender === myName`) |
| Status indicators | Advertising + scanning status bar | None |
| RSSI display | ✅ | ❌ |
| Name change re-advertise | ✅ | N/A |
| Device filter | Unnamed devices hidden | Named devices only (`device.name` must be truthy) |
| Monitor start | Inside `connectToDevice` | Separate `startListening(device)` function |

The `Message` type omits `isOwn`:
```typescript
type Message = {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
};
```

Cleanup in `useEffect` only destroys the `bleManager` (no peripheral to stop).

### 6.2 Expo / EAS Configuration

**`app.json`**
```json
{
  "expo": {
    "name": "bluetooth-chat",
    "slug": "bluetooth-chat",
    "android": {
      "package": "com.gypelayo.bluetoothchat",
      "permissions": ["BLUETOOTH", "BLUETOOTH_ADMIN", "BLUETOOTH_CONNECT"]
    },
    "plugins": ["react-native-ble-plx"],
    "extra": { "eas": { "projectId": "b31b31f9-af20-455e-a275-90bdb50e8b1b" } }
  }
}
```

⚠️ The `app.json` permissions list is **incomplete** — missing `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, and `ACCESS_FINE_LOCATION` which are required on Android 12+.

**`eas.json` build profiles:**

| Profile | Type | Output |
|---|---|---|
| `development` | dev-client, internal distribution | `.apk` |
| `preview` | internal distribution | `.apk` |
| `production` | store distribution | `.aab` (App Bundle) |

**Running:**
```bash
cd bluetooth-chat
npx expo start         # start Expo dev server
eas build --platform android --profile development   # cloud build
```

---

## 7. Linux BLE Simulator

**File:** `linux-ble-simulator.py`

A Python 3 script that acts as a BLE GATT server on Linux, allowing testing the Android app without a second phone.

### Requirements
```bash
python3 -m venv ble-venv
source ble-venv/bin/activate
pip install bless bleak
```
Also requires `bluetoothd` running and a working BLE adapter (`hciconfig hci0 up`).

### Architecture

Uses the `bless` library:
```python
server = BlessServer(name="Linux-BLE", loop=loop)
server.read_request_func = read_request
server.write_request_func = write_request
await server.add_new_service(SERVICE_UUID)
await server.add_new_characteristic(SERVICE_UUID, MESSAGE_CHAR_UUID, ...)
await server.start()
```

### GATT profile (Python side)

The Python server exposes only the **message characteristic** (no name characteristic). Properties: `read | write | notify`.

### Bidirectional messaging

- **Android → Linux (write):** The `write_request` callback decodes the value as UTF-8 and prints `[ANDROID APP]: <message>`.
- **Linux → Android (notify):** User types in the terminal; the script sets `char.value` and calls `server.update_value(SERVICE_UUID, MESSAGE_CHAR_UUID)`, which sends a BLE notification to connected devices.

### Input threading model

Uses a daemon `threading.Thread` to read `sys.stdin` without blocking the asyncio event loop. Lines are passed via a `queue.Queue` with a 0.5s `get(timeout=...)` to keep the loop responsive.

---

## 8. Shell Scripts

### `setup-and-test.sh`

**Purpose:** Developer environment checker and bootstrapper.

**What it does:**
1. Checks `node`, `npm`, `python3`, `hciconfig` presence.
2. Creates `ble-venv/` and installs `bleak` + `bless`.
3. Installs `eas-cli` globally if not present.
4. Does a 3-second smoke test of the BLE simulator.
5. Prints next-step instructions for EAS build workflow.

**Run from:** `/home/guilherme/Projects/bluetooth-app/`

### `install-sdk.sh` and `setup-sdk.sh`

**Purpose:** Install Android SDK to `~/Android/` (no root/sudo needed).

**Both scripts:**
1. Download `commandlinetools-linux-11076708_latest.zip` from Google.
2. Extract to `~/Android/cmdline-tools/latest/`.
3. Accept SDK licenses.
4. Install: `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`.

**`setup-sdk.sh` additionally installs:** `ndk;27.1.12297006`

**After running:**
```bash
echo "sdk.dir=/home/guilherme/Android" > \
  /home/guilherme/Projects/bluetooth-app/BluetoothChat/android/local.properties
```

### `BluetoothChat/build-apk.sh`

**Purpose:** Build the debug APK.

```bash
cd /home/guilherme/Projects/bluetooth-app/BluetoothChat/android
./gradlew assembleDebug
```

Auto-detects `ANDROID_HOME` from common locations (`~/Android/Sdk`, `~/android-sdk`, `/opt/android-sdk`).

---

## 9. Dependencies Deep-Dive

### BluetoothChat (`BluetoothChat/package.json`)

| Package | Version | Role |
|---|---|---|
| `react-native` | `0.85.3` | Core framework |
| `react` | `19.2.3` | React |
| `react-native-ble-plx` | (via `react-native-ble-lite ^1.1.0`*) | BLE Central |
| `react-native-ble-peripheral` | (in App.tsx import, not in package.json**) | BLE Peripheral |
| `@react-native-async-storage/async-storage` | `^3.0.2` | Message persistence |
| `buffer` | `^6.0.3` | Base64 ↔ UTF-8 encoding in JS |
| `react-native-get-random-values` | `^2.0.0` | Crypto random (needed by some BLE libs) |
| `react-native-safe-area-context` | `^5.5.2` | Safe area insets |

> **\* Discrepancy:** `App.tsx` imports `from 'react-native-ble-plx'` but `package.json` lists `react-native-ble-lite`. This is a known inconsistency — either the dependency name needs updating in `package.json`, or the import in `App.tsx` needs to change to `react-native-ble-lite`.

> **\*\* Discrepancy:** `App.tsx` imports `BLEPeripheral from 'react-native-ble-peripheral'` but this package is **not listed** in `package.json`. It needs to be added: `npm install react-native-ble-peripheral`.

### bluetooth-chat (`bluetooth-chat/package.json`)

| Package | Version | Role |
|---|---|---|
| `expo` | `~54.0.33` | Expo SDK |
| `expo-dev-client` | `~6.0.21` | Dev client for custom native modules |
| `react-native-ble-plx` | `^3.5.1` | BLE Central |
| `@react-native-async-storage/async-storage` | `^2.2.0` | Persistence |
| `buffer` | `^6.0.3` | Base64 encoding |
| `react-native-get-random-values` | `~1.11.0` | Crypto random |

---

## 10. Testing

### Unit / Integration Tests

**File:** `BluetoothChat/__tests__/App.test.tsx`

```typescript
test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
```

A single smoke test that verifies `<App />` renders without throwing. All BLE libraries need to be mocked for this to pass (the `@react-native/jest-preset` handles some of this via auto-mocking).

Run tests:
```bash
cd BluetoothChat
npm test
```

### Manual Testing Workflow (Phone + Linux)

1. **Start the Linux simulator:**
   ```bash
   source ble-venv/bin/activate
   python3 linux-ble-simulator.py
   ```

2. **Build and install the app:**
   ```bash
   cd BluetoothChat/android && ./gradlew assembleDebug
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Start Metro (for JS hot reload):**
   ```bash
   cd BluetoothChat && npx react-native start
   ```

4. **On phone:** Open app → enter name → Scan → tap "Linux-BLE" → connect → send messages.

5. **Verify:** Messages from phone appear in Linux terminal as `[ANDROID APP]: <text>`. Messages typed in the Linux terminal appear on the phone.

### Manual Testing Workflow (Phone + Phone)

Both phones must have the app installed. Both will advertise and scan simultaneously. The first device to discover the other taps it to connect. After connection, both can send messages to each other.

---

## 11. Known Issues & Limitations

### Dependency Inconsistencies

1. **`react-native-ble-peripheral` missing from `package.json`** — `App.tsx` imports it but it's not listed as a dependency. Install it:
   ```bash
   cd BluetoothChat
   npm install react-native-ble-peripheral
   ```

2. **`react-native-ble-plx` vs `react-native-ble-lite`** — `package.json` lists `react-native-ble-lite` but `App.tsx` imports from `react-native-ble-plx`. Needs to be aligned.

### iOS Gaps

- `NSBluetoothAlwaysUsageDescription` not in `Info.plist` → will crash on iOS when Bluetooth is accessed.
- `react-native-ble-peripheral` iOS support varies; must verify library compatibility.

### Protocol Limitations

- **One-to-one only:** The app connects to a single device at a time.
- **No message queue:** If the connection drops mid-send, the message is lost.
- **No encryption:** Messages are transmitted as plaintext over BLE.
- **No message delivery confirmation:** The sender doesn't know if the remote device processed the message.
- **Session history only:** `disconnect()` clears the in-memory messages (but they persist in AsyncStorage and reload on next launch).

### Android-specific

- `ACCESS_FINE_LOCATION` is required for BLE scanning on Android ≤11. On Android 12+, `BLUETOOTH_SCAN` with `neverForLocation` flag could replace it, but the app doesn't set that flag.
- `bluetooth-chat/app.json` is missing `BLUETOOTH_SCAN` and `BLUETOOTH_ADVERTISE` permissions.

---

## 12. Key Constants & Configuration Values

```
# BLE UUIDs (must match across all devices including Linux simulator)
SERVICE_UUID      = "12345678-1234-1234-1234-1234567890ab"
MESSAGE_CHAR_UUID = "abcdefab-1234-1234-1234-abcdefabcdef"
NAME_CHAR_UUID    = "fedcba98-1234-1234-1234-abcdefabcdef"  # (BluetoothChat only)

# BLE Scan timeout
10_000 ms (10 seconds)

# Android package name (BluetoothChat CLI)
com.bluetoothchat

# Android package name (bluetooth-chat Expo)
com.gypelayo.bluetoothchat

# Expo project ID
b31b31f9-af20-455e-a275-90bdb50e8b1b

# Android min SDK
24 (Android 7.0 Nougat)

# Android target/compile SDK
36

# AsyncStorage key for messages
"messages"

# Linux BLE device name
"Linux-BLE"

# Android debug keystore password
"android" (alias: "androiddebugkey", key password: "android")

# Metro default port
8081

# Android SDK install path (local setup scripts)
/home/guilherme/Android/
```

---

## 13. Common Tasks for AI Agents

### Add a new BLE characteristic

1. In `App.tsx`, define a new UUID constant.
2. In `setupPeripheral()`, call `BLEPeripheral.addCharacteristicToService(SERVICE_UUID, NEW_UUID, properties, permissions)`.
3. Add a new `monitorCharacteristicForService` call in `connectToDevice()` to listen on the central side.
4. Mirror the characteristic in `linux-ble-simulator.py` with a matching UUID.

### Add navigation between screens

Currently, the app uses a single `if (connectedDevice)` branch in `App.tsx`. To add proper navigation:
1. Install `@react-navigation/native` and `@react-navigation/stack`.
2. Extract `DeviceListScreen` and `ChatScreen` components.
3. Pass `connectedDevice`, `messages`, `sendMessage`, and `disconnect` via route params or context.

### Fix the missing `react-native-ble-peripheral` dependency

```bash
cd BluetoothChat
npm install react-native-ble-peripheral
# Then for Android, the autolinking will pick it up. For iOS, run:
cd ios && pod install
```

### Fix the `react-native-ble-plx` vs `react-native-ble-lite` mismatch

Option A — keep `react-native-ble-plx`:
```bash
cd BluetoothChat
npm uninstall react-native-ble-lite
npm install react-native-ble-plx
```

Option B — update imports to match `react-native-ble-lite`:
```typescript
// In App.tsx, change:
import { BleManager, Device } from 'react-native-ble-plx';
// to:
import { BleManager, Device } from 'react-native-ble-lite';
```

### Add iOS Bluetooth permissions

In `BluetoothChat/ios/BluetoothChat/Info.plist`, add inside the root `<dict>`:
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app uses Bluetooth to communicate with nearby devices.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>This app uses Bluetooth to communicate with nearby devices.</string>
```

### Build the APK from scratch (no Android Studio)

```bash
# 1. Install SDK (once)
cd /home/guilherme/Projects/bluetooth-app
bash setup-sdk.sh

# 2. Set SDK path
echo "sdk.dir=/home/guilherme/Android" > BluetoothChat/android/local.properties

# 3. Install JS dependencies
cd BluetoothChat && npm install

# 4. Build
cd android && ./gradlew assembleDebug

# 5. Output
# BluetoothChat/android/app/build/outputs/apk/debug/app-debug.apk
```

### Run the Linux BLE simulator

```bash
cd /home/guilherme/Projects/bluetooth-app
source ble-venv/bin/activate
python3 linux-ble-simulator.py
# Requires: Bluetooth adapter active (sudo hciconfig hci0 up)
# Exposes: Linux-BLE device on SERVICE_UUID
```

### Run tests

```bash
cd BluetoothChat
npm test
# Runs __tests__/App.test.tsx via Jest with @react-native/jest-preset
```
