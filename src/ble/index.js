const BleBroadcaster = require("./broadcaster");
const BleScanner = require("./scanner");
const {
  encodeBroadcastPayload,
  decodeBroadcastPayload,
  createAdvertisementData,
} = require("./broadcastFormat");
const {
  BLE_SERVICE_UUID,
  BLE_CHARACTERISTIC_UUID,
  RSSI_THRESHOLDS,
  BROADCAST_PREFIX,
  BROADCAST_VERSION,
  SCAN_DURATION_MS,
  SCAN_INTERVAL_MS,
  BLE_STATE,
} = require("./constants");

class BleManager {
  constructor(bleManagerInstance) {
    this.bleManagerInstance = bleManagerInstance;
    this.broadcaster = null;
    this.scanner = null;
  }

  createBroadcaster() {
    this.broadcaster = new BleBroadcaster(this.bleManagerInstance);
    return this.broadcaster;
  }

  createScanner(options = {}) {
    this.scanner = new BleScanner(this.bleManagerInstance, options);
    return this.scanner;
  }

  destroy() {
    if (this.broadcaster) {
      this.broadcaster.destroy();
      this.broadcaster = null;
    }
    if (this.scanner) {
      this.scanner.destroy();
      this.scanner = null;
    }
    this.bleManagerInstance?.destroy();
  }
}

module.exports = {
  BleManager,
  BleBroadcaster,
  BleScanner,
  encodeBroadcastPayload,
  decodeBroadcastPayload,
  createAdvertisementData,
  BLE_SERVICE_UUID,
  BLE_CHARACTERISTIC_UUID,
  RSSI_THRESHOLDS,
  BROADCAST_PREFIX,
  BROADCAST_VERSION,
  SCAN_DURATION_MS,
  SCAN_INTERVAL_MS,
  BLE_STATE,
};
