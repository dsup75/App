// Bluetooth LE helpers for the Gadgets hub (Android app). Only reads data the device actually sends.
// Standard formats decoded here: Weight Scale (0x181D / 0x2A9D), Body Composition (0x181B / 0x2A9C),
// Battery (0x180F), Device Information (0x180A), Heart Rate (0x180D / 0x2A37).
import { Capacitor } from '@capacitor/core';
import { BleClient, numberToUUID, dataViewToHexString, type BleService, type ScanResult } from '@capacitor-community/bluetooth-le';

export const bleSupported = () => Capacitor.getPlatform() === 'android';

export const UUID = {
  weightService: numberToUUID(0x181d),
  weightMeasurement: numberToUUID(0x2a9d),
  bodyService: numberToUUID(0x181b),
  bodyMeasurement: numberToUUID(0x2a9c),
  battery: numberToUUID(0x180f),
  batteryLevel: numberToUUID(0x2a19),
  deviceInfo: numberToUUID(0x180a),
  manufacturer: numberToUUID(0x2a29),
  model: numberToUUID(0x2a24),
  firmware: numberToUUID(0x2a26),
  heartRate: numberToUUID(0x180d),
  heartRateMeasurement: numberToUUID(0x2a37),
  moyoungService: numberToUUID(0xfeea), // Da Fit (MOYOUNG) watches — private protocol
  moyoungSteps: numberToUUID(0xfee1),
};

let ready = false;
export async function bleInit(): Promise<string | null> {
  if (!bleSupported()) return 'Bluetooth works in the Android app only.';
  try {
    if (!ready) {
      await BleClient.initialize();
      ready = true;
    }
    if (!(await BleClient.isEnabled())) {
      try {
        await BleClient.requestEnable();
      } catch {
        return 'Turn on Bluetooth first.';
      }
    }
    return null;
  } catch (e) {
    return (e as Error).message || 'Bluetooth permission was not given.';
  }
}

export interface FoundDevice {
  deviceId: string; // on Android this is the MAC address
  name: string;
  rssi: number | null;
  uuids: string[];
  manufacturerHex: string | null;
  serviceDataHex: string | null;
  lastSeen: number;
}

export async function scan(seconds: number, onFound: (d: FoundDevice) => void): Promise<string | null> {
  const err = await bleInit();
  if (err) return err;
  try {
    await BleClient.requestLEScan({ allowDuplicates: true }, (r: ScanResult) => {
      const md = r.manufacturerData ? Object.entries(r.manufacturerData).map(([k, v]) => `${k}:${dataViewToHexString(v)}`).join(' ') : null;
      const sd = r.serviceData ? Object.entries(r.serviceData).map(([k, v]) => `${k.slice(4, 8)}:${dataViewToHexString(v)}`).join(' ') : null;
      onFound({
        deviceId: r.device.deviceId,
        name: r.localName || r.device.name || 'Unknown device',
        rssi: r.rssi ?? null,
        uuids: r.uuids ?? [],
        manufacturerHex: md || null,
        serviceDataHex: sd || null,
        lastSeen: Date.now(),
      });
    });
    await new Promise((res) => setTimeout(res, seconds * 1000));
    await BleClient.stopLEScan().catch(() => {});
    return null;
  } catch (e) {
    await BleClient.stopLEScan().catch(() => {});
    return (e as Error).message || 'Scan failed.';
  }
}

export async function stopScan() {
  if (bleSupported()) await BleClient.stopLEScan().catch(() => {});
}

export async function bondedDevices(): Promise<{ deviceId: string; name: string }[]> {
  const err = await bleInit();
  if (err) return [];
  try {
    return (await BleClient.getBondedDevices()).map((d) => ({ deviceId: d.deviceId, name: d.name || d.deviceId }));
  } catch {
    return [];
  }
}

export const openBluetoothSettings = () => (bleSupported() ? BleClient.openBluetoothSettings().catch(() => {}) : Promise.resolve());

export async function connect(deviceId: string, onDisconnect?: () => void): Promise<BleService[]> {
  const err = await bleInit();
  if (err) throw new Error(err);
  await BleClient.connect(deviceId, () => onDisconnect?.(), { timeout: 15000 });
  return BleClient.getServices(deviceId);
}

export async function disconnect(deviceId: string) {
  if (bleSupported()) await BleClient.disconnect(deviceId).catch(() => {});
}

const has = (services: BleService[], svc: string, ch?: string) => {
  const s = services.find((x) => x.uuid.toLowerCase() === svc);
  return !!s && (!ch || s.characteristics.some((c) => c.uuid.toLowerCase() === ch));
};

export async function readText(deviceId: string, services: BleService[], svc: string, ch: string): Promise<string | null> {
  if (!has(services, svc, ch)) return null;
  try {
    const v = await BleClient.read(deviceId, svc, ch);
    return new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).replace(/\0+$/, '').trim() || null;
  } catch {
    return null;
  }
}

export async function readBattery(deviceId: string, services: BleService[]): Promise<number | null> {
  if (!has(services, UUID.battery, UUID.batteryLevel)) return null;
  try {
    const v = await BleClient.read(deviceId, UUID.battery, UUID.batteryLevel);
    const n = v.getUint8(0);
    return n <= 100 ? n : null;
  } catch {
    return null;
  }
}

export async function readRaw(deviceId: string, svc: string, ch: string): Promise<string | null> {
  try {
    return dataViewToHexString(await BleClient.read(deviceId, svc, ch));
  } catch {
    return null;
  }
}

/* ---------- Standard scale formats ---------- */
export interface ScaleReading {
  weightKg: number | null;
  bmi: number | null;
  bodyFatPct: number | null;
  muscleKg: number | null;
  waterKg: number | null;
  bmrKcal: number | null;
  timestamp: string | null;
}

function readTimestamp(v: DataView, o: number): string | null {
  try {
    const y = v.getUint16(o, true);
    if (!y) return null;
    const d = new Date(y, v.getUint8(o + 2) - 1, v.getUint8(o + 3), v.getUint8(o + 4), v.getUint8(o + 5), v.getUint8(o + 6));
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/** Weight Measurement (0x2A9D) */
export function parseWeight(v: DataView): ScaleReading | null {
  if (v.byteLength < 3) return null;
  const flags = v.getUint8(0);
  const imperial = (flags & 1) === 1;
  let o = 1;
  const raw = v.getUint16(o, true);
  o += 2;
  if (raw === 0xffff) return null; // "measurement unsuccessful"
  const weightKg = imperial ? raw * 0.01 * 0.45359237 : raw * 0.005;
  let timestamp: string | null = null;
  if (flags & 2) {
    timestamp = readTimestamp(v, o);
    o += 7;
  }
  if (flags & 4) o += 1; // user id
  let bmi: number | null = null;
  if (flags & 8 && v.byteLength >= o + 2) bmi = v.getUint16(o, true) * 0.1;
  return { weightKg: Math.round(weightKg * 100) / 100, bmi: bmi ? Math.round(bmi * 10) / 10 : null, bodyFatPct: null, muscleKg: null, waterKg: null, bmrKcal: null, timestamp };
}

/** Body Composition Measurement (0x2A9C) */
export function parseBodyComposition(v: DataView): ScaleReading | null {
  if (v.byteLength < 4) return null;
  const flags = v.getUint16(0, true);
  const imperial = (flags & 1) === 1;
  const mass = (n: number) => (imperial ? n * 0.01 * 0.45359237 : n * 0.005);
  let o = 2;
  const fat = v.getUint16(o, true) * 0.1;
  o += 2;
  let timestamp: string | null = null;
  let bmr: number | null = null;
  let muscle: number | null = null;
  let water: number | null = null;
  let weight: number | null = null;
  const take = () => {
    const n = v.getUint16(o, true);
    o += 2;
    return n;
  };
  try {
    if (flags & 0x2) {
      timestamp = readTimestamp(v, o);
      o += 7;
    }
    if (flags & 0x4) o += 1; // user id
    if (flags & 0x8) bmr = Math.round(take() / 4.184); // kJ -> kcal
    if (flags & 0x10) take(); // muscle percentage
    if (flags & 0x20) muscle = mass(take());
    if (flags & 0x40) take(); // fat free mass
    if (flags & 0x80) take(); // soft lean mass
    if (flags & 0x100) water = mass(take());
    if (flags & 0x200) take(); // impedance
    if (flags & 0x400) weight = mass(take());
  } catch {
    /* short packet: keep what we have */
  }
  const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  return {
    weightKg: r2(weight),
    bmi: null,
    bodyFatPct: fat > 0 && fat < 80 ? Math.round(fat * 10) / 10 : null,
    muscleKg: r2(muscle),
    waterKg: r2(water),
    bmrKcal: bmr,
    timestamp,
  };
}

export const scaleIsStandard = (services: BleService[]) => has(services, UUID.weightService, UUID.weightMeasurement) || has(services, UUID.bodyService, UUID.bodyMeasurement);

/** Listens to a standard scale until a stable reading arrives (or timeout). */
export async function readStandardScale(deviceId: string, services: BleService[], timeoutMs = 60000): Promise<ScaleReading | null> {
  let result: ScaleReading | null = null;
  const merge = (r: ScaleReading | null) => {
    if (!r) return;
    result = {
      weightKg: r.weightKg ?? result?.weightKg ?? null,
      bmi: r.bmi ?? result?.bmi ?? null,
      bodyFatPct: r.bodyFatPct ?? result?.bodyFatPct ?? null,
      muscleKg: r.muscleKg ?? result?.muscleKg ?? null,
      waterKg: r.waterKg ?? result?.waterKg ?? null,
      bmrKcal: r.bmrKcal ?? result?.bmrKcal ?? null,
      timestamp: r.timestamp ?? result?.timestamp ?? null,
    };
  };
  const subs: [string, string][] = [];
  if (has(services, UUID.weightService, UUID.weightMeasurement)) {
    await BleClient.startNotifications(deviceId, UUID.weightService, UUID.weightMeasurement, (v) => merge(parseWeight(v)));
    subs.push([UUID.weightService, UUID.weightMeasurement]);
  }
  if (has(services, UUID.bodyService, UUID.bodyMeasurement)) {
    await BleClient.startNotifications(deviceId, UUID.bodyService, UUID.bodyMeasurement, (v) => merge(parseBodyComposition(v)));
    subs.push([UUID.bodyService, UUID.bodyMeasurement]);
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 500));
    const got = result as ScaleReading | null;
    // wait 3 more seconds after the first weight for body-composition packets
    if (got?.weightKg && Date.now() - start > 3000) break;
  }
  for (const [s, c] of subs) await BleClient.stopNotifications(deviceId, s, c).catch(() => {});
  return result;
}

/** Short human list of services for the "device details" view. */
export function describeServices(services: BleService[]): string[] {
  const known: Record<string, string> = {
    '1800': 'Generic Access', '1801': 'Generic Attribute', '180a': 'Device Information', '180f': 'Battery', '180d': 'Heart Rate',
    '181d': 'Weight Scale (standard)', '181b': 'Body Composition (standard)', 'feea': 'Da Fit / MOYOUNG (private)', 'fee7': 'Private (FEE7)',
    'ffe0': 'Private serial (FFE0)', 'fff0': 'Private serial (FFF0)', 'ffb0': 'Private (FFB0)',
  };
  return services.map((s) => {
    const short = s.uuid.toLowerCase().startsWith('0000') ? s.uuid.slice(4, 8).toLowerCase() : s.uuid.toLowerCase();
    const chars = s.characteristics.map((c) => {
      const p = c.properties;
      const flags = [p.read && 'R', (p.write || p.writeWithoutResponse) && 'W', p.notify && 'N', p.indicate && 'I'].filter(Boolean).join('');
      return `${c.uuid.toLowerCase().startsWith('0000') ? c.uuid.slice(4, 8) : c.uuid}(${flags})`;
    });
    return `${known[short] ?? short}: ${chars.join(', ')}`;
  });
}
