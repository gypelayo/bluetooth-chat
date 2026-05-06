# Bluetooth Chat App

A React Native mobile app for direct phone-to-phone BLE messaging and built-in games (Rock Paper Scissors). Works completely offline without internet.

## Features

- **Direct BLE Communication**: Phone-to-phone messaging via Bluetooth Low Energy (no server/relay needed)
- **Dual Mode**: Works as both Central (scans/connects) and Peripheral (advertises/responds)
- **Built-in Games**: Rock Paper Scissors game that works over the same BLE connection
- **Offline First**: Works without internet - all communication is peer-to-peer via BLE
- **Dark Mode**: Automatically adapts to system theme

## Requirements

- React Native 0.76.x
- Android 6.0+ (API 23+) with Bluetooth 4.0+ (BLE support)
- Two Android devices for phone-to-phone testing

## Installation

### Option 1: Pre-built APK

Install the APK directly on your Android phone:
```
android/app/build/outputs/apk/release/app-release.apk
```

### Option 2: Build from Source

```bash
# Install dependencies
cd BluetoothChat
npm install

# Build debug APK
cd android
./gradlew assembleDebug

# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

### Option 3: Development Mode

```bash
# Start Metro bundler
npm start

# Run on connected device (requires Metro)
npm run android
```

For live reload, connect to Metro:
1. Shake device → Dev Settings
2. Debug server host & port: `YOUR_PC_IP:8081`

## Usage

### Starting the App

1. Open the app on your Android phone
2. Grant Bluetooth permissions when prompted
3. The app will start advertising and scanning automatically

### Connecting Two Phones

1. **Phone A**: Open app → Appears in device list on Phone B
2. **Phone B**: Open app → Tap on Phone A's name to connect
3. Once connected, you can send messages

### Sending Messages

1. Type a message in the text input
2. Tap **Send** or press Enter
3. Message appears in the chat

### Playing Rock Paper Scissors

1. Tap the **🎮** button in the chat header
2. **To invite**: Tap "Start Game" → Wait for opponent to accept
3. **To accept**: Tap "Accept" on the game invitation
4. Both players pick Rock (✊), Paper (✋), or Scissors (✌️)
5. Results are shown simultaneously to both players

## Technical Details

### BLE Protocol

- **Service UUID**: `12345678-1234-1234-1234-1234567890ab`
- **Message Characteristic UUID**: `abcdefab-1234-1234-1234-abcdefabcdef`
- **Name Characteristic UUID**: `fedcba98-1234-1234-1234-abcdefabcdef`

### Message Flow

- **Central → Peripheral**: Uses `writeCharacteristicWithResponseForService`
- **Peripheral → Central**: Uses polling (Android blocks notifications for third-party apps) - Central polls every 2 seconds

### Game Protocol

Game messages are prefixed with `!game:` to differentiate from chat:
- `!game:invite:rps` - Game invitation
- `!game:accept:rps` - Accept invitation
- `!game:rps:<0|1|2>` - Move (0=rock, 1=paper, 2=scissors)
- `!game:result:win|lose|draw` - Game result

The Central device is the source of truth - calculates results and sends to both players.

## Architecture

- `react-native-ble-plx` - Central role (scan/connect/write)
- Custom native module (`BlePeripheralModule`) - Peripheral role (advertise/notify)
- React Context for BLE state management

## License

MIT
