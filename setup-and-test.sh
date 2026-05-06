#!/bin/bash
# Setup script for Bluetooth Chat app
# This script helps you set up and test the app

set -e

echo "=============================================="
echo "Bluetooth Chat - Setup Script"
echo "=============================================="

# Check if we're in the right directory
if [ ! -d "bluetooth-chat" ]; then
    echo "Error: bluetooth-chat directory not found!"
    echo "Please run this script from /home/guilherme/Projects/bluetooth-app"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo ""
echo "Step 1: Checking prerequisites..."
echo "----------------------------------------------"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js installed: $NODE_VERSION"
else
    echo "✗ Node.js not found. Please install Node.js ≥18"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    echo "✓ npm installed: $NPM_VERSION"
else
    echo "✗ npm not found"
    exit 1
fi

# Check Python3
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version)
    echo "✓ Python installed: $PYTHON_VERSION"
else
    echo "✗ Python3 not found"
    exit 1
fi

# Check Bluetooth
if command_exists hciconfig; then
    if hciconfig -a | grep -q "UP RUNNING"; then
        echo "✓ Bluetooth is UP and RUNNING"
    else
        echo "⚠ Bluetooth is not running. Try: sudo hciconfig hci0 up"
    fi
else
    echo "⚠ hciconfig not found. Bluetooth tools may not be installed."
fi

echo ""
echo "Step 2: Setting up Linux BLE simulator..."
echo "----------------------------------------------"

# Check if venv exists
if [ ! -d "ble-venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv ble-venv
fi

# Install Python dependencies
echo "Installing Python dependencies (bleak, bless)..."
source ble-venv/bin/activate
pip install bleak bless >/dev/null 2>&1
echo "✓ Python dependencies installed"

echo ""
echo "Step 3: Installing EAS CLI (for cloud builds)..."
echo "----------------------------------------------"

if ! command_exists eas; then
    echo "Installing EAS CLI globally..."
    npm install -g eas-cli
    echo "✓ EAS CLI installed"
else
    EAS_VERSION=$(eas --version)
    echo "✓ EAS CLI already installed: $EAS_VERSION"
fi

echo ""
echo "Step 4: Testing the Linux BLE simulator..."
echo "----------------------------------------------"
echo "Starting BLE simulator for 3 seconds to verify it works..."
cd /home/guilherme/Projects/bluetooth-app
timeout 3 bash -c 'source ble-venv/bin/activate && python3 linux-ble-simulator.py' 2>&1 | head -20 || true
echo ""
echo "✓ BLE simulator test completed"

echo ""
echo "=============================================="
echo "Setup Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start the Linux BLE simulator (in a new terminal):"
echo "   cd /home/guilherme/Projects/bluetooth-app"
echo "   source ble-venv/bin/activate"
echo "   python3 linux-ble-simulator.py"
echo ""
echo "2. Set up EAS (for cloud builds, no Android Studio needed):"
echo "   cd bluetooth-chat"
echo "   eas login"
echo "   eas build:configure"
echo ""
echo "3. Build the Android dev client (cloud build):"
echo "   eas build --platform android --profile development"
echo "   (This will give you a download link for the APK)"
echo ""
echo "4. Install the APK on your Android phone:"
echo "   - Download the APK from the EAS build page"
echo "   - Enable 'Install from unknown sources' on your phone"
echo "   - Install the APK"
echo ""
echo "5. Start the Expo dev server:"
echo "   cd bluetooth-chat"
echo "   npx expo start"
echo ""
echo "6. Connect your phone:"
echo "   - Open the dev client app on your phone"
echo "   - Enter the URL shown in the Expo console (e.g., http://192.168.1.100:8081)"
echo ""
echo "7. Test the app:"
echo "   - Enter your name in the app"
echo "   - Tap 'Scan for Devices'"
echo "   - Look for 'Linux-BLE' and connect"
echo "   - Start chatting!"
echo ""
echo "=============================================="
