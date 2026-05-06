/**
 * BluetoothChat — App.tsx
 *
 * Uses:
 *   • react-native-ble-plx — Central role (scan + GATT connect/write/notify)
 *   • Native BlePeripheralModule — Peripheral role (advertise + GATT server)
 *
 * Features:
 *   - Central mode: Scan for devices, connect, chat
 *   - Peripheral mode: Advertise as server, receive connections, chat
 *   - Mode toggle to switch between central/peripheral
 *
 * Protocol:
 *   Service UUID      : 12345678-1234-1234-1234-1234567890ab
 *   Message Char UUID : abcdefab-1234-1234-1234-abcdefabcdef
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  ActivityIndicator,
  KeyboardAvoidingView,
  useColorScheme,
} from 'react-native';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';
import { NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';

// ─── UUIDs ────────────────────────────────────────────────────────────────────
const SERVICE_UUID      = '12345678-1234-1234-1234-1234567890ab';
const MESSAGE_CHAR_UUID = 'abcdefab-1234-1234-1234-abcdefabcdef';
const STORAGE_KEY       = 'bt_messages_v3';

// ─── BLE managers ───────────────────────────────────────────────────────────────
const bleManager = new BleManager();
const { BlePeripheral } = NativeModules;
const blePeripheralEmitter = BlePeripheral ? new NativeEventEmitter(BlePeripheral) : null;

// ─── Types ────────────────────────────────────────────────────────────────────
type Message = {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isOwn: boolean;
};

type DiscoveredPeer = {
  deviceId: string;
  rssi: number;
  name?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const encodeMsg = (text: string): string =>
  Buffer.from(text, 'utf8').toString('base64');

const decodeMsg = (b64: string): string =>
  Buffer.from(b64, 'base64').toString('utf8');

// ─── Component ────────────────────────────────────────────────────────────────
export default function App() {
  const [myName, setMyName]               = useState('User');
  const [nameInput, setNameInput]         = useState('User');

  // Mode: 'central' = scan/connect, 'peripheral' = advertise
  const [mode, setMode]                   = useState<'central' | 'peripheral'>('central');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const s = getStyles(isDark);
  
  const [devices, setDevices]             = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [peripheralConnected, setPeripheralConnected] = useState(false);
  const [peripheralDeviceName, setPeripheralDeviceName] = useState<string>('');
  
  const [messages, setMessages]           = useState<Message[]>([]);
  const [inputText, setInputText]        = useState('');

  const [scanning, setScanning]           = useState(false);
  const [advertising, setAdvertising]    = useState(false);
  const [bleReady, setBleReady]         = useState(false);
  const [status, setStatus]              = useState('Initialising…');

  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef  = useRef<FlatList<Message>>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastReadRef = useRef<string>(''); // Track last read message to avoid duplicates

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = bleManager.onStateChange(async (state) => {
      if (state === State.PoweredOn) {
        sub.remove();
        setBleReady(true);
        setStatus('Ready — choose a mode below');
        await requestPermissions();
        await loadMessages();
      } else if (state === State.PoweredOff) {
        setStatus('Bluetooth is OFF');
      } else if (state === State.Unauthorized) {
        setStatus('Bluetooth permission denied');
      }
    }, true);

    // Set up peripheral event listeners
    if (blePeripheralEmitter) {
      const connectedSub = blePeripheralEmitter.addListener('onDeviceConnected', (event) => {
        setPeripheralConnected(true);
        setPeripheralDeviceName(event.deviceName || event.deviceId);
        setStatus(`Connected: ${event.deviceName || event.deviceId}`);
      });
      
      const disconnectedSub = blePeripheralEmitter.addListener('onDeviceDisconnected', () => {
        setPeripheralConnected(false);
        setPeripheralDeviceName('');
        setStatus('Client disconnected');
      });
      
      const messageSub = blePeripheralEmitter.addListener('onMessageReceived', (event) => {
        addMessage({
          id:        `${Date.now()}-in-${Math.random()}`,
          text:      event.message,
          sender:    event.deviceName || 'Unknown',
          timestamp: Date.now(),
          isOwn:     false,
        });
      });

      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
        }
        connectedSub.remove();
        disconnectedSub.remove();
        messageSub.remove();
        sub.remove();
        stopScan();
        bleManager.destroy();
        BlePeripheral?.stopAdvertising?.();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Permissions ───────────────────────────────────────────────────────────
  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    } catch (e) {
      console.warn('Permission error:', e);
    }
  };

  // ── Persistence ───────────────────────────────────────────────────────────
  const loadMessages = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  };

  const saveMessages = (msgs: Message[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)).catch(() => {});
  };

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => {
      const next = [...prev, msg];
      saveMessages(next);
      return next;
    });
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  // ── Central: Scanning ─────────────────────────────────────────────────────
  const startScan = () => {
    if (scanning || !bleReady) return;
    setDevices([]);
    setScanning(true);
    setStatus('Scanning…');

    bleManager.startDeviceScan(
      null, // Scan for all devices - we'll find the peripheral by name or manually connect
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.warn('Scan error:', error.message);
          setScanning(false);
          setStatus(`Scan error: ${error.message}`);
          return;
        }
        if (device) {
          setDevices(prev =>
            prev.find(d => d.id === device.id) ? prev : [...prev, device]
          );
        }
      }
    );

    scanTimerRef.current = setTimeout(stopScan, 15000);
  };

  const stopScan = () => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    bleManager.stopDeviceScan();
    setScanning(false);
    setStatus('Ready');
  };

  // ── Central: Connect ─────────────────────────────────────────────────────
  const connectToDevice = async (device: Device) => {
    stopScan();
    setStatus(`Connecting to ${device.name ?? device.id}…`);

    try {
      const connected = await device.connect({ autoConnect: false, timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();

      // Also set up polling for reading messages (since notifications may not work)
      const pollForMessages = async () => {
        if (!connected) return;
        try {
          const chars = await connected.characteristicsForService(SERVICE_UUID);
          const msgChar = chars.find(c => c.uuid === MESSAGE_CHAR_UUID);
          if (msgChar) {
            const read = await msgChar.read();
            if (read.value) {
              const text = decodeMsg(read.value).trim();
              // Only add if new and not empty
              if (text && text !== lastReadRef.current) {
                lastReadRef.current = text;
                addMessage({
                  id:        `${Date.now()}-in-${Math.random()}`,
                  text,
                  sender:    connected.name ?? device.id,
                  timestamp: Date.now(),
                  isOwn:     false,
                });
              }
            }
          }
        } catch (e) {
          // Poll errors are silent - just try again
        }
      };

      // Start polling every 2 seconds
      pollTimerRef.current = setInterval(pollForMessages, 2000);
      // Also try immediately
      pollForMessages();

      // Keep notification monitor too (in case it works)
      connected.monitorCharacteristicForService(
        SERVICE_UUID,
        MESSAGE_CHAR_UUID,
        (err: Error | null, char: Characteristic | null) => {
          if (err && !err.message.includes('cancelled')) {
            console.warn('Monitor error:', err.message);
            return;
          }
          if (char?.value) {
            const text = decodeMsg(char.value).trim();
            if (!text || text === lastReadRef.current) return;
            lastReadRef.current = text;
            addMessage({
              id:        `${Date.now()}-in-${Math.random()}`,
              text,
              sender:    connected.name ?? device.id,
              timestamp: Date.now(),
              isOwn:     false,
            });
          }
        }
      );

      connected.onDisconnected((_err, _dev) => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setConnectedDevice(null);
        setStatus('Disconnected');
      });

      setConnectedDevice(connected);
      setStatus(`Connected to ${connected.name ?? device.id}`);
    } catch (e: any) {
      setStatus('Connection failed');
      Alert.alert('Connection Failed', e?.message ?? String(e));
    }
  };

  // ── Central: Send ───────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !connectedDevice) return;
    setInputText('');
    try {
      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        MESSAGE_CHAR_UUID,
        encodeMsg(text)
      );
      addMessage({
        id:        `${Date.now()}-out-${Math.random()}`,
        text,
        sender:    myName,
        timestamp: Date.now(),
        isOwn:     true,
      });
    } catch (e: any) {
      Alert.alert('Send Failed', e?.message ?? String(e));
    }
  };

  // ── Peripheral: Start Advertising ─────────────────────────────────────────
  const startAdvertising = async () => {
    if (!BlePeripheral) {
      Alert.alert('Error', 'Peripheral module not available');
      return;
    }
    try {
      await BlePeripheral.startAdvertising(myName);
      setAdvertising(true);
      setStatus(`Advertising as "${myName}" — waiting for connection…`);
    } catch (e: any) {
      Alert.alert('Advertising Failed', e?.message ?? String(e));
    }
  };

  const stopAdvertising = async () => {
    if (!BlePeripheral) return;
    try {
      await BlePeripheral.stopAdvertising();
      setAdvertising(false);
      setPeripheralConnected(false);
      setStatus('Stopped advertising');
    } catch (e: any) {
      console.warn('Stop advertising error:', e);
    }
  };

  // ── Peripheral: Send ───────────────────────────────────────────────────
  const sendMessageFromPeripheral = async () => {
    const text = inputText.trim();
    if (!text || !peripheralConnected || !BlePeripheral) return;
    setInputText('');
    try {
      await BlePeripheral.sendNotification(text);
      addMessage({
        id:        `${Date.now()}-out-${Math.random()}`,
        text,
        sender:    myName,
        timestamp: Date.now(),
        isOwn:     true,
      });
    } catch (e: any) {
      Alert.alert('Send Failed', e?.message ?? String(e));
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (connectedDevice) {
      connectedDevice.cancelConnection().catch(() => {});
      setConnectedDevice(null);
    }
    if (peripheralConnected) {
      stopAdvertising();
    }
    setMessages([]);
    setStatus('Ready');
  };

  // ── Apply name ────────────────────────────────────────────────────────────
  const applyName = () => {
    const n = nameInput.trim() || 'User';
    setMyName(n);
    if (mode === 'peripheral' && advertising) {
      stopAdvertising().then(() => startAdvertising());
    }
  };

  // ── Toggle mode ────────────────────────────────────────────────────────────
  const toggleMode = async (newMode: 'central' | 'peripheral') => {
    // Disconnect first
    disconnect();
    setMessages([]);
    
    if (mode === 'peripheral' && advertising) {
      await stopAdvertising();
    }
    if (mode === 'central' && scanning) {
      stopScan();
    }
    
    setMode(newMode);
    setStatus(newMode === 'central' 
      ? 'Switched to Central mode — tap Scan' 
      : 'Switched to Peripheral mode — tap Advertise');
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER — Chat (Central connected OR Peripheral connected)
  // ────────────────────────────────────────────────────────────────────────────
  const isConnected = connectedDevice !== null || peripheralConnected;
  const currentChatName = connectedDevice?.name || peripheralDeviceName;

  if (isConnected) {
    const handleSend = mode === 'central' ? sendMessage : sendMessageFromPeripheral;
    
    return (
      <SafeAreaProvider>
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView
            style={s.flex}
            behavior="padding"
            keyboardVerticalOffset={0}
            enabled
          >
            {/* Header */}
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <View style={s.greenDot} />
                <Text style={s.chatHeaderTitle} numberOfLines={1}>
                  {currentChatName}
                </Text>
              </View>
              <TouchableOpacity style={s.discBtn} onPress={disconnect}>
                <Text style={s.discText}>Disconnect</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={flatListRef}
              style={s.msgList}
              contentContainerStyle={s.msgContent}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={[s.bubble, item.isOwn ? s.bubbleOwn : s.bubblePeer]}>
                  {!item.isOwn && <Text style={s.bubbleSender}>{item.sender}</Text>}
                  <Text style={[s.bubbleText, item.isOwn ? s.textOwn : s.textPeer]}>
                    {item.text}
                  </Text>
                  <Text style={[s.bubbleTime, item.isOwn ? s.timeOwn : s.timePeer]}>
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            />

            {/* Input */}
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Type a message…"
                placeholderTextColor="#aaa"
                returnKeyType="send"
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[s.sendBtn, !inputText.trim() && s.sendDisabled]}
                onPress={handleSend}
                disabled={!inputText.trim()}
              >
                <Text style={s.sendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER — Discovery / Mode Selection
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <View style={s.discContainer}>
          <Text style={s.title}>Bluetooth Chat</Text>

          {/* Status */}
          <View style={s.statusRow}>
            <View style={[s.statusDot, bleReady ? s.dotGreen : s.dotGrey]} />
            <Text style={s.statusText}>{status}</Text>
          </View>

          {/* Mode Toggle */}
          <View style={s.modeToggle}>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'central' && s.modeBtnActive]}
              onPress={() => toggleMode('central')}
            >
              <Text style={[s.modeBtnText, mode === 'central' && s.modeBtnTextActive]}>
                Central (Scan)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'peripheral' && s.modeBtnActive]}
              onPress={() => toggleMode('peripheral')}
            >
              <Text style={[s.modeBtnText, mode === 'peripheral' && s.modeBtnTextActive]}>
                Peripheral (Advertise)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Central: Scan Button */}
          {mode === 'central' && (
            <TouchableOpacity
              style={[s.scanBtn, scanning && s.scanBtnStop]}
              onPress={scanning ? stopScan : startScan}
              disabled={!bleReady}
            >
              {scanning ? (
                <View style={s.scanningRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={[s.scanBtnText, { marginLeft: 8 }]}>Stop Scanning</Text>
                </View>
              ) : (
                <Text style={s.scanBtnText}>
                  {bleReady ? 'Scan for Devices' : 'Waiting for Bluetooth…'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Peripheral: Advertise Button */}
          {mode === 'peripheral' && (
            <TouchableOpacity
              style={[s.scanBtn, advertising && s.scanBtnStop]}
              onPress={advertising ? stopAdvertising : startAdvertising}
              disabled={!bleReady}
            >
              {advertising ? (
                <View style={s.scanningRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={[s.scanBtnText, { marginLeft: 8 }]}>Stop Advertising</Text>
                </View>
              ) : (
                <Text style={s.scanBtnText}>
                  {bleReady ? 'Start Advertising' : 'Waiting for Bluetooth…'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Device list label */}
          <Text style={s.sectionLabel}>
            {mode === 'central' 
              ? (devices.length === 0 ? (scanning ? 'Searching…' : 'No devices found') : `${devices.length} found`)
              : (advertising ? (peripheralConnected ? 'Client connected!' : 'Waiting for client…') : 'Not advertising')
            }
          </Text>

          {/* Device list (Central mode only) */}
          {mode === 'central' && (
            <FlatList
              style={s.deviceList}
              data={devices}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.deviceItem}
                  onPress={() => connectToDevice(item)}
                >
                  <Text style={s.deviceName} numberOfLines={1}>
                    {item.name ?? 'Unknown Device'}
                  </Text>
                  <Text style={s.deviceSub}>
                    {item.id}
                    {item.rssi ? `  ·  ${item.rssi} dBm` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BLUE = '#007AFF';

const getStyles = (isDark: boolean) => StyleSheet.create({
  safe:           { flex: 1, backgroundColor: isDark ? '#000' : '#F2F2F7' },
  flex:           { flex: 1 },

  discContainer:  { flex: 1, padding: 16, paddingTop: 12 },
  title:          { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 12, color: isDark ? '#FFF' : '#000' },

  statusRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderRadius: 10, padding: 10, marginBottom: 12 },
  statusDot:      { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  dotGreen:       { backgroundColor: '#34C759' },
  dotGrey:        { backgroundColor: '#8E8E93' },
  statusText:     { fontSize: 13, color: isDark ? '#8E8E93' : '#666', flex: 1 },

  modeToggle:     { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn:        { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA', alignItems: 'center' },
  modeBtnActive:  { backgroundColor: BLUE },
  modeBtnText:    { fontSize: 14, fontWeight: '600', color: isDark ? '#8E8E93' : '#666' },
  modeBtnTextActive: { color: '#FFF' },

  scanBtn:        { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  scanBtnStop:    { backgroundColor: '#FF3B30' },
  scanBtnText:    { color: '#FFF', fontSize: 16, fontWeight: '700' },
  scanningRow:    { flexDirection: 'row', alignItems: 'center' },

  sectionLabel:   { fontSize: 13, color: isDark ? '#8E8E93' : '#666', marginBottom: 8 },
  deviceList:     { flex: 1 },
  deviceItem:     { backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderRadius: 12, padding: 14, marginBottom: 8 },
  deviceName:     { fontSize: 15, fontWeight: '600', color: isDark ? '#FFF' : '#000' },
  deviceSub:      { fontSize: 12, color: isDark ? '#8E8E93' : '#666', marginTop: 3, fontFamily: 'monospace' },

  chatHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? '#38383A' : '#CCC' },
  chatHeaderLeft:   { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  chatHeaderTitle:  { fontSize: 16, fontWeight: '600', color: isDark ? '#FFF' : '#000', marginLeft: 6, flex: 1 },
  greenDot:         { width: 9, height: 9, borderRadius: 5, backgroundColor: '#34C759' },
  discBtn:          { paddingHorizontal: 8, paddingVertical: 4 },
  discText:         { color: '#FF3B30', fontSize: 15, fontWeight: '500' },

  msgList:        { flex: 1 },
  msgContent:     { padding: 14, paddingBottom: 8 },

  bubble:         { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, marginBottom: 8 },
  bubbleOwn:      { backgroundColor: BLUE, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubblePeer:     { backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleSender:   { fontSize: 11, fontWeight: '600', color: isDark ? '#8E8E93' : '#666', marginBottom: 2 },
  bubbleText:     { fontSize: 15 },
  textOwn:        { color: '#FFF' },
  textPeer:       { color: isDark ? '#FFF' : '#000' },
  bubbleTime:     { fontSize: 10, marginTop: 3 },
  timeOwn:        { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  timePeer:       { color: isDark ? '#8E8E93' : '#666' },

  inputRow:       { flexDirection: 'row', padding: 10, paddingBottom: 10, backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? '#38383A' : '#CCC', gap: 8, alignItems: 'flex-end' },
  input:          { flex: 1, borderWidth: 1, borderColor: isDark ? '#38383A' : '#CCC', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7', fontSize: 15, color: isDark ? '#FFF' : '#000', maxHeight: 100 },
  sendBtn:        { backgroundColor: BLUE, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendDisabled:   { backgroundColor: '#C7C7CC' },
  sendText:       { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
