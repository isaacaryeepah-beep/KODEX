const {
  BLE_SERVICE_UUID,
  BLE_CHARACTERISTIC_UUID,
  BLE_STATE,
} = require("./constants");
const { encodeBroadcastPayload } = require("./broadcastFormat");

class BleBroadcaster {
  constructor(bleManager, options = {}) {
    this.bleManager = bleManager;
    this.peripheralModule = options.peripheralModule || null;
    this.isAdvertising = false;
    this.advertisingData = null;
    this.stateSubscription = null;
  }

  async initialize() {
    if (!this.peripheralModule) {
      throw new Error(
        "BLE advertising requires a peripheral module. " +
        "Install react-native-ble-manager or a similar library that supports advertising, " +
        "and pass it as options.peripheralModule."
      );
    }

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

  async startBroadcast({ sessionId, companyId, token, code }) {
    if (!this.peripheralModule) {
      throw new Error("No peripheral module configured for advertising");
    }

    if (this.isAdvertising) {
      await this.stopBroadcast();
    }

    const payload = encodeBroadcastPayload({ sessionId, companyId, token, code });
    const localName = `ATT_${code}`;

    try {
      await this.peripheralModule.startAdvertising({
        serviceUUIDs: [BLE_SERVICE_UUID],
        localName,
        serviceData: {
          uuid: BLE_SERVICE_UUID,
          data: payload,
        },
      });

      this.isAdvertising = true;
      this.advertisingData = { localName, payload, sessionId, companyId, code };

      return {
        success: true,
        serviceUUID: BLE_SERVICE_UUID,
        characteristicUUID: BLE_CHARACTERISTIC_UUID,
        localName,
      };
    } catch (error) {
      this.isAdvertising = false;
      throw new Error(`Failed to start BLE broadcast: ${error.message}`);
    }
  }

  async stopBroadcast() {
    if (!this.isAdvertising) return { success: true, message: "Not broadcasting" };

    try {
      if (this.peripheralModule) {
        await this.peripheralModule.stopAdvertising();
      }
      this.isAdvertising = false;
      this.advertisingData = null;
      return { success: true, message: "Broadcast stopped" };
    } catch (error) {
      throw new Error(`Failed to stop BLE broadcast: ${error.message}`);
    }
  }

  getStatus() {
    return {
      isAdvertising: this.isAdvertising,
      advertisingData: this.advertisingData,
      hasPeripheralModule: !!this.peripheralModule,
    };
  }

  destroy() {
    this.stateSubscription?.remove();
    if (this.isAdvertising && this.peripheralModule) {
      this.peripheralModule.stopAdvertising().catch(() => {});
    }
    this.isAdvertising = false;
    this.advertisingData = null;
  }
}

module.exports = BleBroadcaster;
