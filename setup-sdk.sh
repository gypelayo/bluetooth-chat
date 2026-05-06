#!/bin/bash
# Clean Android SDK setup - no sudo needed
# Run as: bash setup-sdk.sh

SDK_DIR=/home/guilherme/Android
CMDLINE_TOOLS=$SDK_DIR/cmdline-tools/latest

echo "Setting up Android SDK at $SDK_DIR..."

# Create directory
mkdir -p $CMDLINE_TOOLS

# Download if needed
if [ ! -f /tmp/cmdline-tools.zip ]; then
    echo "Downloading Android command-line tools..."
    wget -q "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -O /tmp/cmdline-tools.zip
fi

# Extract
echo "Extracting..."
unzip -q -o /tmp/cmdline-tools.zip -d /tmp/cmdline-temp
cp -r /tmp/cmdline-temp/*/* $CMDLINE_TOOLS/ 2>/dev/null || cp -r /tmp/cmdline-temp/cmdline-tools/* $CMDLINE_TOOLS/
rm -rf /tmp/cmdline-temp

# Set environment
export ANDROID_HOME=$SDK_DIR
export PATH=$CMDLINE_TOOLS/bin:$PATH

# Accept licenses
echo "Accepting licenses..."
yes | sdkmanager --licenses >/dev/null 2>&1

# Install SDK components
echo "Installing platform-tools, platforms, build-tools..."
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.1.12297006"

# Verify
echo ""
echo "SDK installed successfully!"
echo "Location: $SDK_DIR"
ls -la $SDK_DIR/

echo ""
echo "Now create local.properties:"
echo "  cd /home/guilherme/Projects/bluetooth-app/BluetoothChat/android"
echo "  echo 'sdk.dir=$SDK_DIR' > local.properties"
echo ""
echo "Then build:"
echo "  cd /home/guilherme/Projects/bluetooth-app/BluetoothChat/android"
echo "  ./gradlew assembleDebug"
