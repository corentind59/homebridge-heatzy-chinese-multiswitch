import type { HeatzyChineseMultiswitchPlatform } from './platform.js';
import type { Logging, PlatformAccessory, Service } from 'homebridge';
import { CONTROL_MODES, HeatzyBinding } from './heatzy-client.js';

export interface HeatzyPiloteAccessoryConfig {
  device: HeatzyBinding;
  includeAliases: boolean;
  heatzySyncInterval: number;
}

export class HeatzyPiloteAccessory {
  private readonly enabledModes: Array<keyof typeof CONTROL_MODES>;
  private servicesByMode = new Map<keyof typeof CONTROL_MODES, Service>();

  constructor(
    private readonly platform: HeatzyChineseMultiswitchPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly log: Logging,
    private readonly config: HeatzyPiloteAccessoryConfig,
  ) {
    this.enabledModes = [
      'COMFORT',
      'ECO',
      ...(this.platform.config.enableFrostProtection ? ['ANTIFROST' as const] : []),
      ...(this.platform.config.enableOff ? ['OFF' as const] : []),
    ];
    for (const mode of this.enabledModes) {
      this.addSwitch(mode);
    }

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Heatzy')
      .setCharacteristic(this.platform.Characteristic.Model, 'Heatzy Pilote V1')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.config.device.did);

    this.syncStateWithHeatzy();
    setInterval(() => this.syncStateWithHeatzy(), this.config.heatzySyncInterval * 60_000);
  }

  addSwitch(mode: keyof typeof CONTROL_MODES) {
    this.log.debug(`Heatzy Pilote Accessory (${this.config.device.dev_alias}: adding switch for mode ${mode}.`);
    const service = this.accessory.getServiceById(this.platform.Service.Switch, mode) ||
      this.accessory.addService(this.platform.Service.Switch, `Heatzy Pilote ${this.config.device.dev_alias} ${DISPLAY_MODES[mode]}`, mode);

    const configuredName = `${this.config.includeAliases ? `${this.config.device.dev_alias} ` : ''}${DISPLAY_MODES[mode]}`;
    service.setCharacteristic(this.platform.Characteristic.ConfiguredName, configuredName);
    service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(value => this.setSwitchValue(mode, value as boolean));

    this.servicesByMode.set(mode, service);
  }

  private async setSwitchValue(mode: keyof typeof CONTROL_MODES, value: boolean) {
    this.log.debug(`Heatzy Pilote Accessory (${this.config.device.dev_alias}): set handler called for mode ${mode} (value: ${value}).`);

    // Prevent user from turning off all switches
    if (!value) {
      this.log.debug(`Heatzy Pilote Accessory (${this.config.device.dev_alias}): all switches are off, restoring previous value.`);
      setTimeout(() => {
        this.servicesByMode.get(mode)!.getCharacteristic(this.platform.Characteristic.On).updateValue(true);
      }, 1_000);
      return;
    }

    this.log.debug(`Heatzy Pilote Accessory (${this.config.device.dev_alias}): setting mode to ${mode} via Heatzy API.`);
    await this.platform.heatzyClient.setDeviceMode(this.config.device.did, mode);
    this.setCurrentMode(mode);
  }

  private async syncStateWithHeatzy() {
    this.log.debug(`Heatzy Pilote Accessory (${this.config.device.dev_alias}): syncing state with Heatzy API.`);
    const state = await this.platform.heatzyClient.getDevdataByDeviceId(this.config.device.did);

    if (this.servicesByMode.get(state)!.getCharacteristic(this.platform.Characteristic.On).value) {
      return;
    }

    this.log.debug(`Heatzy Pilote Accessory (${this.config.device.dev_alias}): state changed asynchronously. Updating cache. New state: ${state}.`);
    this.setCurrentMode(state);
  }

  private setCurrentMode(mode: keyof typeof CONTROL_MODES) {
    this.servicesByMode.get(mode)!.getCharacteristic(this.platform.Characteristic.On).updateValue(true);
    this.enabledModes
      .filter((m) => m !== mode)
      .forEach((m) => this.servicesByMode.get(m)!.getCharacteristic(this.platform.Characteristic.On).updateValue(false));
  }
}

const DISPLAY_MODES: Record<keyof typeof CONTROL_MODES, string> = {
  COMFORT: 'Confort',
  ECO: 'Eco',
  ANTIFROST: 'Hors-gel',
  OFF: 'Off',
};
