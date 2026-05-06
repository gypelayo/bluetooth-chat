#!/usr/bin/env python3
"""
Bluetooth LE Simulator for Linux
Acts as a BLE GATT peripheral that:
  - Receives messages written by the Android/phone app
  - Sends messages back via BLE notifications

Requires: pip install bless
Run:      python3 linux-ble-simulator.py

UUIDs (must match App.tsx):
  Service  : 12345678-1234-1234-1234-1234567890ab
  Messages : abcdefab-1234-1234-1234-abcdefabcdef  (WRITE + NOTIFY)
"""

import asyncio
import sys
import logging
import threading
import queue

from bless import (
    BlessServer,
    BlessGATTCharacteristic,
    GATTCharacteristicProperties,
    GATTAttributePermissions,
)

# ── UUIDs ─────────────────────────────────────────────────────────────────────
SERVICE_UUID      = "12345678-1234-1234-1234-1234567890ab"
MESSAGE_CHAR_UUID = "abcdefab-1234-1234-1234-abcdefabcdef"

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.WARNING)   # quiet during normal use
logger = logging.getLogger(__name__)

# ── Global server reference (set once server is started) ─────────────────────
gatt_server: BlessServer | None = None

# ── GATT callbacks ────────────────────────────────────────────────────────────
def read_request(characteristic: BlessGATTCharacteristic, **kwargs) -> bytearray:
    return characteristic.value or bytearray()

def write_request(characteristic: BlessGATTCharacteristic, value: bytearray, **kwargs):
    """Called when the Android app writes a message to us."""
    try:
        text = bytes(value).decode("utf-8").strip()
        if text:
            print(f"\n📱 [PHONE]: {text}", flush=True)
            print("You: ", end="", flush=True)
        characteristic.value = value
    except Exception as e:
        logger.error(f"write_request error: {e}")

# ── Main ──────────────────────────────────────────────────────────────────────
async def run_server():
    global gatt_server

    print("=" * 60)
    print("  Bluetooth LE Simulator  —  Linux GATT Server")
    print("=" * 60)
    print(f"  Service UUID : {SERVICE_UUID}")
    print(f"  Message UUID : {MESSAGE_CHAR_UUID}")
    print("=" * 60)
    print()
    print("  1. Open Bluetooth Chat app on your phone")
    print("  2. Tap 'Scan for Devices'")
    print("  3. Tap 'Linux-BLE' to connect")
    print("  4. Type messages in the app  →  they appear here")
    print("  5. Type here + Enter          →  sent to the app")
    print()
    print("  Ctrl+C to exit")
    print("=" * 60)

    loop = asyncio.get_event_loop()

    # Create server
    server = BlessServer(name="Linux-BLE", loop=loop)
    server.read_request_func  = read_request
    server.write_request_func = write_request
    gatt_server = server

    # Register service
    await server.add_new_service(SERVICE_UUID)

    # Register message characteristic: WRITE + NOTIFY + READ
    char_flags = (
        GATTCharacteristicProperties.read
        | GATTCharacteristicProperties.write
        | GATTCharacteristicProperties.write_without_response
        | GATTCharacteristicProperties.notify
    )
    permissions = (
        GATTAttributePermissions.readable
        | GATTAttributePermissions.writeable
    )
    await server.add_new_characteristic(
        SERVICE_UUID,
        MESSAGE_CHAR_UUID,
        char_flags,
        bytearray(b"ready"),
        permissions,
    )

    # Start advertising
    await server.start()
    print("\n✅  Server started — advertising as 'Linux-BLE'\n")
    print("You: ", end="", flush=True)

    # ── Stdin reader thread ────────────────────────────────────────────────
    input_q: queue.Queue[str] = queue.Queue()

    def stdin_reader():
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                input_q.put(line.rstrip("\n"))
            except Exception:
                break

    t = threading.Thread(target=stdin_reader, daemon=True)
    t.start()

    # ── Main event loop ────────────────────────────────────────────────────
    try:
        while True:
            # Check for user input (non-blocking)
            try:
                text = input_q.get_nowait()
            except queue.Empty:
                await asyncio.sleep(0.1)
                continue

            if not text.strip():
                print("You: ", end="", flush=True)
                continue

            # Send notification to connected Android device
            try:
                char = server.get_characteristic(MESSAGE_CHAR_UUID)
                if char is not None:
                    char.value = bytearray(text.encode("utf-8"))
                    server.update_value(SERVICE_UUID, MESSAGE_CHAR_UUID)
                    print(f"💻 [YOU → PHONE]: {text}", flush=True)
                else:
                    print("[!] Characteristic not found", flush=True)
            except Exception as e:
                print(f"[!] Send error: {e}", flush=True)

            print("You: ", end="", flush=True)

    except KeyboardInterrupt:
        print("\n\nShutting down…")
    finally:
        await server.stop()
        print("Server stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        print("\nExited.")
