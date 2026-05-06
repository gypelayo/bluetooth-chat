# Testing Bluetooth Chat App

## Overview

This app enables **phone-to-phone BLE messaging** using:
- `react-native-ble-plx` - Central role (scans and connects to peripherals)
- Custom native module (`BlePeripheralModule`) - Peripheral role (advertises and responds)
- Works completely offline via Bluetooth Low Energy

## Phone-to-Phone Testing

### Requirements
- 2 Android phones with Bluetooth 4.0+ (BLE support)
- Android 6.0+ (API 23+) for proper BLE support
- App installed on both phones (APK or development build)

### Steps

1. **Phone A**: Open app → Wait to be discovered
2. **Phone B**: Open app → Tap **Scan for Devices**
3. **Phone B**: Find Phone A's name in the list → Tap to connect
4. Once connected, chat and play games!

### Troubleshooting

- **Devices not found**: Ensure Bluetooth is ON on both phones, and they are within 10 meters
- **Connection fails**: Restart scanning on both devices, ensure no other BLE connections are active
- **Messages not received**: Check if devices are still connected (look for "Connected" status)
- **App crashes**: Check `adb logcat | grep ReactNative` for errors

## Testing Rock Paper Scissors Game

### Game Flow

1. **Inviting Player**:
   - Tap 🎮 button in chat header
   - Tap "Start Game"
   - Status shows "Waiting for opponent to accept..."

2. **Accepting Player**:
   - Sees "Accept/Decline" dialog
   - Taps "Accept"
   - Both players now see game board

3. **Making Moves**:
   - Both players tap Rock (✊), Paper (✋), or Scissors (✌️)
   - Moves can be made in any order
   - Both can see their own move picked

4. **Seeing Results**:
   - Once both players pick, results are shown simultaneously
   - Win/Lose/Draw displayed to both

### Expected Behavior

- ✅ Invite sends correctly
- ✅ Accept dialog appears
- ✅ Both players can pick moves
- ✅ Results shown to both simultaneously
- ✅ Can start new game after results

## Common Issues

### "No devices found"
- Check Bluetooth is enabled in Settings
- Ensure both devices have location permission (required for BLE on Android)
- Restart scanning
- Ensure devices are within 10 meters

### "Failed to connect"
- Device may have gone out of range
- Try stopping and restarting advertising/scanning
- Check Android logs: `adb logcat | grep Bluetooth`

### Messages not appearing
- Check connection status in header
- Try reconnecting (go back and scan again)
- Game messages (`!game:`) don't appear in chat - they're filtered

## Development Testing

### Running with Metro

```bash
cd BluetoothChat
npm start
```

In another terminal:
```bash
npm run android
```

### Connecting to Metro

1. Find your PC's IP: `hostname -I` (Linux) or `ipconfig` (Windows)
2. Shake device → Dev Settings
3. Debug server host & port: `YOUR_IP:8081`

### Building APK

```bash
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Or use the included script:
```bash
./build-apk.sh
```

## File Structure

```
BluetoothChat/
├── App.tsx                      # Main app component
├── android/                     # Android native code
│   └── app/src/main/java/.../
│       └── ble/
│           └── BlePeripheralModule.java  # Custom peripheral module
├── build-apk.sh                # APK build script
├── package.json                # Dependencies
└── README.md                   # Main documentation
```

## Key UUIDs

- **Service UUID**: `12345678-1234-1234-1234-1234567890ab`
- **Message Characteristic**: `abcdefab-1234-1234-1234-abcdefabcdef`
- **Name Characteristic**: `fedcba98-1234-1234-1234-abcdefabcdef`
