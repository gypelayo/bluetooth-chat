# Testing Bluetooth Chat App

## Overview
This app enables **phone-to-phone BLE messaging** using:
- `react-native-ble-plx` - Connects to peripherals (central mode)
- `react-native-ble-peripheral` - Acts as GATT server (peripheral mode)
- `react-native-ble-lite` - Scans for advertisements

## Quick Test: Phone + Linux Computer

### Step 1: Start Linux BLE Simulator (Terminal 1)
```bash
cd /home/guilherme/Projects/bluetooth-app
source ble-venv/bin/activate
python3 linux-ble-simulator.py
```
Expected output:
```
============================================================
Bluetooth LE Simulator for Linux
============================================================
...
[SERVER STARTED] Advertising as 'Linux-BLE'...
```

### Step 2: Build & Install App on Phone
```bash
cd /home/guilherme/Projects/bluetooth-app/BluetoothChat

# Option A: Build debug APK (requires Android SDK)
./build-apk.sh

# Option B: Use npx react-native run-android (requires connected device)
npx react-native run-android

# Option C: Manual APK build
cd android
./gradlew assembleDebug
# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 3: Install APK on Phone
1. Transfer `app-debug.apk` to your Android phone
2. Enable **Settings → Security → Unknown Sources**
3. Install the APK
4. Grant Bluetooth permissions when prompted

### Step 4: Connect Phone to Metro (for live reload)
```bash
# Terminal 2: Start Metro
cd /home/guilherme/Projects/bluetooth-app/BluetoothChat
npx react-native start
```

On your phone:
1. Shake device (or `adb shell input keyevent 82`)
2. Tap **Dev Settings**
3. Tap **Debug server host & port**
4. Enter: `YOUR_LINUX_IP:8081` (find with `hostname -I`)

### Step 5: Test Messaging
1. Open Bluetooth Chat app on phone
2. Enter your name → Tap **OK**
3. Tap **Scan for Devices**
4. Look for **"Linux-BLE"** in the list
5. Tap **Linux-BLE** to connect
6. Type a message → Tap **Send**
7. Check Linux terminal - message should appear:
   ```
   [ANDROID APP]: Hello from phone!
   ```
8. Type a message in Linux terminal → Press Enter
9. Message should appear on phone

---

## Phone-to-Phone Test

### Requirements
- 2 Android phones with Bluetooth 4.0+ (BLE support)
- Both phones on same Wi-Fi (for initial Metro connection)
- App installed on both phones

### Steps
1. **Phone A**: Open app → Enter name "Alice" → Start scanning
2. **Phone B**: Open app → Enter name "Bob" → Start scanning
3. Both phones will:
   - Advertise themselves (as peripherals)
   - Scan for other devices
4. When "Alice" sees "Bob" (or vice versa), tap to connect
5. Start messaging!

### Troubleshooting
- **Devices not found**: Ensure Bluetooth is ON on both phones
- **Connection fails**: Restart scanning on both devices
- **Messages not received**: Check if devices are still connected
- **App crashes**: Check `adb logcat | grep ReactNative` for errors

---

## File Structure
```
bluetooth-app/
├── linux-ble-simulator.py    # Linux BLE server (tests phone→Linux)
├── ble-venv/                     # Python virtual environment
├── BluetoothChat/                 # React Native app
│   ├── App.tsx                   # Main app component
│   ├── build-apk.sh             # APK build script
│   ├── android/                  # Android native code
│   └── package.json             # Dependencies
└── TESTING.md                    # This file
```

---

## Key UUIDs (must match between devices)
- **Service UUID**: `12345678-1234-1234-1234-1234567890ab`
- **Message Characteristic**: `abcdefab-1234-1234-1234-abcdefabcdef`
- **Name Characteristic**: `fedcba98-1234-1234-1234-abcdefabcdef`

---

## Next Steps
1. Test with Linux simulator first (easier debugging)
2. Once working, test phone-to-phone
3. Add features: message history, offline queue, encryption

---

## Common Issues

### "No devices found"
- Check Bluetooth is enabled: `hciconfig -a` (Linux) or Settings (Android)
- Restart scanning
- Ensure devices are within 10 meters

### "Failed to connect"
- Device may have gone out of range
- Try stopping and restarting advertising/scanning
- Check Android logs: `adb logcat | grep Bluetooth`

### Metro not connecting
- Find Linux IP: `hostname -I`
- On phone: Dev Settings → Debug server host → `IP:8081`
- Disable firewall: `sudo ufw disable` (temporary)
