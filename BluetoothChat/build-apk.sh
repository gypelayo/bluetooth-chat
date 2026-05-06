#!/bin/bash
# Build Android APK for testing (no Android Studio needed)
# Requires: Android SDK command-line tools

set -e

echo "=============================================="
echo "Building Bluetooth Chat APK"
echo "=============================================="

# Check if Android SDK exists
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo "Warning: ANDROID_HOME or ANDROID_SDK_ROOT not set"
    echo "Looking for Android SDK..."
    
    # Common locations
    for path in "$HOME/Android/Sdk" "$HOME/android-sdk" "/opt/android-sdk"; do
        if [ -d "$path" ]; then
            export ANDROID_HOME="$path"
            echo "Found Android SDK at: $ANDROID_HOME"
            break
        fi
    done
fi

cd /home/guilherme/Projects/bluetooth-app/BluetoothChat/android

echo ""
echo "Step 1: Building debug APK..."
./gradlew assembleDebug

echo ""
echo "Step 2: Build complete!"
echo "APK location: /home/guilherme/Projects/bluetooth-app/BluetoothChat/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To install on phone:"
echo "1. Download the APK to your phone (via web or adb)"
echo "2. Enable 'Install from unknown sources' in phone settings"
echo "3. Install the APK"
echo ""
echo "To connect to Metro bundler (for live reload):"
echo "1. Start Metro: cd /home/guilherme/Projects/bluetooth-app/BluetoothChat && npx react-native start"
echo "2. On phone, shake device → Dev Settings → Debug server host"
echo "3. Enter: $(hostname -I | awk '{print $1}'):8081"
echo "=============================================="
