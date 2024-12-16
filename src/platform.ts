import {
  API,
  Categories,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { HeatzyPiloteAccessory } from './heatzy-pilote-accessory.js';
import { HeatzyClient } from './heatzy-client.js';

export class HeatzyChineseMultiswitchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly cachedAccessories: Map<string, PlatformAccessory> = new Map();
  public readonly heatzyClient: HeatzyClient;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.heatzyClient = new HeatzyClient({
      username: this.config.heatzyUsername,
      password: this.config.heatzyPassword,
    });

    this.log.debug('Initializing platform: ', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Discovering devices from configured Heatzy account...');
      // run the method to discover / register your devices as accessories
      this.syncDevicesFromHeatzy();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private async syncDevicesFromHeatzy() {
    const { devices } = await this.heatzyClient.getAllBindings();
    const discoveredAccessoryUUIDs = new Set<string>();

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.did);
      discoveredAccessoryUUIDs.add(uuid);
      const cachedAccessory = this.cachedAccessories.get(uuid);

      if (cachedAccessory) {
        // Restore previously configured accessory
        this.log.debug(`Restoring previously configured accessory: ${device.dev_alias} (ID: ${device.did})`);
        new HeatzyPiloteAccessory(this, cachedAccessory, device);
      } else {
        // Configure new accessory
        this.log.debug(`Configuring new accessory: ${device.dev_alias} (ID: ${device.did})`);

        const newAccessory = new this.api.platformAccessory(`Heatzy Pilote ${device.dev_alias}`, uuid, Categories.SWITCH);

        new HeatzyPiloteAccessory(this, newAccessory, device);
        this.cachedAccessories.set(uuid, newAccessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory]);
      }

      for (const [uuid, accessory] of this.cachedAccessories) {
        if (!discoveredAccessoryUUIDs.has(uuid)) {
          this.log.debug('Removing existing accessory from cache:', accessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }
}
