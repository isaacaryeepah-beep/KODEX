const {
  BLE_SERVICE_UUID,
  RSSI_THRESHOLDS,
  SCAN_DURATION_MS,
  BLE_STATE,
} = require("./constants");
const { BROADCAST_PREFIX } = require("./constants");
const { decodeBroadcastPayload } = require("./broadcastFormat");

class BleScanner {
  constructor(bleManager, options = {}) {
    this.bleManager = bleManager;
    this.isScanning = false;
    this.rssiThreshold = options.rssiThreshold || RSSI_THRESHOLDS.DEFAULT;
    this.scanDuration = options.scanDuration || SCAN_DURATION_MS;
    this.onDeviceFound = options.onDeviceFound || null;
    this.onScanError = options.onScanError || null;
    this.onScanComplete = options.onScanComplete || null;
    this.discoveredDevices = new Map();
    this.scanTimeout = null;
    this.stateSubscription = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.stateSubscription = this.bleManager.onStateChange((state) => {
        if (state === BLE_STATE.POWERED_ON) {
          this.stateSubscription?.remove();
          resolve();
        } else if (state === BLE_STATE.UNSUPPORTED) {
          this.stateSubscription?.remove();
          reject(new Error("BLE is not supported on this device"));
        } else if (state === BLE_STATE.UNAUTHORIZED) {
          this.stateSubscription?.remove();
          reject(new Error("BLE permissions not granted"));
        }
      }, true);
    });
  }

  setRssiThreshold(threshold) {
    if (typeof threshold !== "number" || threshold > 0 || threshold < -120) {
      throw new Error("RSSI threshold must be a negative number between -120 and 0");
    }
    this.rssiThreshold = threshold;
  }

  validateRssi(rssi) {
    if (rssi === null || rssi === undefined) {
      return { valid: false, reason: "No RSSI value available" };
    }

    const isWithinRange = rssi >= this.rssiThreshold;

    let proximity = "unknown";
    if (rssi >= RSSI_THRESHOLDS.IMMEDIATE) {
      proximity = "immediate";
    } else if (rssi >= RSSI_THRESHOLDS.NEAR) {
      proximity = "near";
    } else if (rssi >= RSSI_THRESHOLDS.MEDIUM) {
      proximity = "medium";
    } else if (rssi >= RSSI_THRESHOLDS.FAR) {
      proximity = "far";
    } else {
      proximity = "out_of_range";
    }

    return {
      valid: isWithinRange,
      rssi,
      threshold: this.rssiThreshold,
      proximity,
      reason: isWithinRange
        ? `Device within range (${proximity})`
        : `Device too far: RSSI ${rssi} below threshold ${this.rssiThreshold}`,
    };
  }

  async startScan(options = {}) {
    if (this.isScanning) {
      return { success: false, error: "Scan already in progress" };
    }

    this.discoveredDevices.clear();
    this.isScanning = true;

    const scanOptions = {
      allowDuplicates: options.allowDuplicates || false,
      scanMode: options.scanMode || 2,
    };

    const duration = options.duration || this.scanDuration;

    try {
      this.bleManager.startDeviceScan(
        [BLE_SERVICE_UUID],
        scanOptions,
        (error, device) => {
          if (error) {
            this.isScanning = false;
            if (this.onScanError) this.onScanError(error);
            return;
          }

          if (!device) return;

          this._processDiscoveredDevice(device);
        }
      );

      if (duration > 0) {
        this.scanTimeout = setTimeout(() => {
          this.stopScan();
        }, duration);
      }

      return {
        success: true,
        message: "Scan started",
        duration,
        rssiThreshold: this.rssiThreshold,
      };
    } catch (error) {
      this.isScanning = false;
      throw new Error(`Failed to start BLE scan: ${error.message}`);
    }
  }

  _processDiscoveredDevice(device) {
    const localName = device.localName || device.name || "";

    if (!localName.startsWith(BROADCAST_PREFIX + "_")) {
      return;
    }

    const rssiResult = this.validateRssi(device.rssi);

    const deviceInfo = {
      id: device.id,
      name: localName,
      rssi: device.rssi,
      rssiValidation: rssiResult,
      manufacturerData: device.manufacturerData,
      serviceUUIDs: device.serviceUUIDs,
      timestamp: Date.now(),
    };

    if (device.manufacturerData) {
      const decoded = decodeBroadcastPayload(device.manufacturerData);
      deviceInfo.broadcastPayload = decoded;
    }

    const existingDevice = this.discoveredDevices.get(device.id);
    if (existingDevice) {
      deviceInfo.rssiHistory = [...(existingDevice.rssiHistory || []), device.rssi].slice(-10);
      deviceInfo.averageRssi = deviceInfo.rssiHistory.reduce((a, b) => a + b, 0) / deviceInfo.rssiHistory.length;
    } else {
      deviceInfo.rssiHistory = [device.rssi];
      deviceInfo.averageRssi = device.rssi;
    }

    this.discoveredDevices.set(device.id, deviceInfo);

    if (rssiResult.valid && this.onDeviceFound) {
      this.onDeviceFound(deviceInfo);
    }
  }

  async stopScan() {
    if (!this.isScanning) {
      return { success: true, message: "No scan in progress" };
    }

    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    try {
      await this.bleManager.stopDeviceScan();
      this.isScanning = false;

      const results = this.getDiscoveredDevices();

      if (this.onScanComplete) {
        this.onScanComplete(results);
      }

      return {
        success: true,
        message: "Scan stopped",
        devicesFound: results.length,
      };
    } catch (error) {
      this.isScanning = false;
      throw new Error(`Failed to stop BLE scan: ${error.message}`);
    }
  }

  getDiscoveredDevices() {
    return Array.from(this.discoveredDevices.values());
  }

  getValidDevices() {
    return this.getDiscoveredDevices().filter(
      (device) => device.rssiValidation && device.rssiValidation.valid
    );
  }

  getStatus() {
    return {
      isScanning: this.isScanning,
      rssiThreshold: this.rssiThreshold,
      discoveredCount: this.discoveredDevices.size,
      validCount: this.getValidDevices().length,
    };
  }

  destroy() {
    if (this.isScanning) {
      this.bleManager.stopDeviceScan();
    }
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
    }
    this.stateSubscription?.remove();
    this.isScanning = false;
    this.discoveredDevices.clear();
  }
}

module.exports = BleScanner;
