#!/bin/bash
# Install Android SDK to user directory (no sudo required)
# Run this script

set -e

SDK_ROOT=/home/guilherme/Android
CMDLINE_TOOLS=$SDK_ROOT/cmdline-tools/latest

echo "Installing Android SDK to $SDK_ROOT..."

# Create directories
mkdir -p $CMDLINE_TOOLS

# Download command-line tools if not present
if [ ! -f /tmp/commandlinetools-linux.zip ]; then
    echo "Downloading Android command-line tools..."
    wget -q "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -O /tmp/commandlinetools-linux.zip
fi

# Extract
echo "Extracting..."
unzip -q /tmp/commandlinetools-linux.zip -d /tmp/cmdline-temp
mv /tmp/cmdline-temp/*/* $CMDLINE_TOOLS/
rm -rf /tmp/cmdline-temp

# Accept licenses and install SDK components
echo "Accepting licenses..."
yes | $CMDLINE_TOOLS/bin/sdkmanager --licenses

echo "Installing platform-tools..."
$CMDLINE_TOOLS/bin/sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

# Set permissions
chmod -R 755 $SDK_ROOT

echo ""
echo "SDK installed successfully!"
echo "SDK location: $SDK_ROOT"
echo ""
echo "Now run:"
echo "  cd /home/guilherme/Projects/bluetooth-app/BluetoothChat/android"
echo "  echo 'sdk.dir=$SDK_ROOT' > local.properties"
echo "  ./gradlew assembleDebug"
