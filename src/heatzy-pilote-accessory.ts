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
    setInterval(() => this.syncStateWithHeatzy(), 10_000);
  }

  addSwitch(mode: keyof typeof CONTROL_MODES) {
    this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}: adding switch for mode ${mode}.`);
    const service = this.accessory.getServiceById(this.platform.Service.Switch, mode) ||
      this.accessory.addService(this.platform.Service.Switch, `Heatzy Pilote ${this.device.dev_alias} ${DISPLAY_MODES[mode]}`, mode);

    const configuredName = `${this.accessory.context.includeAliases ? `${this.device.dev_alias} ` : ''}${DISPLAY_MODES[mode]}`;
    service.setCharacteristic(this.platform.Characteristic.ConfiguredName, configuredName);
    service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.getSwitchValue(mode))
      .onSet(value => this.setSwitchValue(mode, value as boolean));

    this.servicesByMode.set(mode, service);
  }

  private getSwitchValue(mode: keyof typeof CONTROL_MODES) {
    const value = this.cachedStateByMode.get(mode)!;
    this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}): get handler called for mode ${mode} (value: ${value}).`);
    return value;
  }

  private async setSwitchValue(mode: keyof typeof CONTROL_MODES, value: boolean) {
    this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}): set handler called for mode ${mode} (value: ${value}).`);

    // Prevent user from turning off all switches
    if (!value) {
      this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}): all switches are off, restoring previous value.`);
      setTimeout(() => {
        this.servicesByMode.get(mode)!.getCharacteristic(this.platform.Characteristic.On).updateValue(true);
      }, 1_000);
      return;
    }

    this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}): setting mode to ${mode} via Heatzy API.`);
    await this.platform.heatzyClient.setDeviceMode(this.device.did, mode);

    this.cachedStateByMode.set(mode, value);
    this.enabledModes
      .filter((m) => m !== mode)
      .forEach((m) => this.cachedStateByMode.set(m, false));
  }

  private async syncStateWithHeatzy() {
    this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}): syncing state with Heatzy API.`);
    const state = await this.platform.heatzyClient.getDevdataByDeviceId(this.device.did);

    if (this.cachedStateByMode.get(state)) {
      return;
    }

    this.log.debug(`Heatzy Pilote Accessory (${this.device.dev_alias}): state changed asynchronously. Updating cache. New state: ${state}.`);
    this.cachedStateByMode.set(state, true);
    this.servicesByMode.get(state)!.getCharacteristic(this.platform.Characteristic.On).updateValue(true);
    this.enabledModes
      .filter((m) => m !== state)
      .forEach((m) => {
        this.cachedStateByMode.set(m, false);
        this.servicesByMode.get(m)!.getCharacteristic(this.platform.Characteristic.On).updateValue(false);
      });
  }
}

const DISPLAY_MODES: Record<keyof typeof CONTROL_MODES, string> = {
  COMFORT: 'Confort',
  ECO: 'Eco',
  ANTIFROST: 'Hors-gel',
  OFF: 'Off',
};
