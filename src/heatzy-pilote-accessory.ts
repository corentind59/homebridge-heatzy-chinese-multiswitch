import type { HeatzyChineseMultiswitchPlatform } from './platform.js';
import type { Logging, PlatformAccessory, Service } from 'homebridge';
import { CONTROL_MODES, HeatzyBinding } from './heatzy-client.js';

export class HeatzyPiloteAccessory {
  private readonly enabledModes: Array<keyof typeof CONTROL_MODES>;
  private servicesByMode = new Map<keyof typeof CONTROL_MODES, Service>();
  private cachedStateByMode = new Map<keyof typeof CONTROL_MODES, boolean>();

  constructor(
    private readonly platform: HeatzyChineseMultiswitchPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: HeatzyBinding,
    private readonly log: Logging,
  ) {
    this.enabledModes = [
      'COMFORT',
      'ECO',
      ...(this.platform.config.enableFrostProtection ? ['ANTIFROST' as const] : []),
      ...(this.platform.config.enableOff ? ['OFF' as const] : []),
    ];
    for (const mode of this.enabledModes) {
      this.cachedStateByMode.set(mode, false);
      this.addSwitch(mode);
    }

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Heatzy')
      .setCharacteristic(this.platform.Characteristic.Model, 'Heatzy Pilote V1')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.did);

    this.syncStateWithHeatzy();
    setInterval(this.syncStateWithHeatzy.bind(this), 60_000);
  }

  addSwitch(mode: keyof typeof CONTROL_MODES) {
    this.log.debug(`Adding switch for Heatzy Pilote ${this.device.dev_alias} for mode ${mode}.`);
    const service = this.accessory.getServiceById(this.platform.Service.Switch, mode) ||
      this.accessory.addService(this.platform.Service.Switch, `Heatzy Pilote ${this.device.dev_alias} ${DISPLAY_MODES[mode]}`, mode);

    service.setCharacteristic(this.platform.Characteristic.ConfiguredName, DISPLAY_MODES[mode]);
    service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.cachedStateByMode.get(mode)!)
      .onSet(value => this.toggleSwitch(mode, value as boolean));

    this.servicesByMode.set(mode, service);
  }

  private async toggleSwitch(mode: keyof typeof CONTROL_MODES, value: boolean) {
    this.log.debug(`Toggling switch for Heatzy Pilote ${this.device.dev_alias} in mode ${mode} with value ${value}...`);
    this.cachedStateByMode.set(mode, value);

    if (!value) {
      setTimeout(() => {
        this.log.debug(`Restoring switch for Heatzy Pilote ${this.device.dev_alias} in mode ${mode}.`);
        this.servicesByMode.get(mode)!.getCharacteristic(this.platform.Characteristic.On).updateValue(true);
      }, 1_000);
      return;
    }

    this.log.debug(`Setting Heatzy Pilote ${this.device.dev_alias} to mode ${mode} via Heatzy API.`);
    await this.platform.heatzyClient.setDeviceMode(this.device.did, mode);
    this.enabledModes
      .filter((m) => m !== mode)
      .forEach((m) => this.servicesByMode.get(m)!.getCharacteristic(this.platform.Characteristic.On).updateValue(false));
  }

  private async syncStateWithHeatzy() {
    this.log.debug(`Syncing state for Heatzy Pilote ${this.device.dev_alias}...`);
    const state = await this.platform.heatzyClient.getDevdataByDeviceId(this.device.did);
    this.log.debug(`Heatzy Pilote ${this.device.dev_alias} is currently in mode ${state}.`);
    for (const mode of this.enabledModes) {
      if (mode === state) {
        this.cachedStateByMode.set(mode, true);
      } else {
        this.cachedStateByMode.set(mode, false);
      }
    }
  }
}

const DISPLAY_MODES: Record<keyof typeof CONTROL_MODES, string> = {
  COMFORT: 'Confort',
  ECO: 'Eco',
  ANTIFROST: 'Hors-gel',
  OFF: 'Off',
};
