const BASE_URL = 'https://euapi.gizwits.com/app';
const HEATZY_APP_ID = 'c70a66ff039d41b4a220e198b0fcc8b3';

export interface HeatzyClientOptions {
  username: string;
  password: string;
}

export class HeatzyClient {
  private auth: null | {
    token: string;
    expiration: number;
  } = null;

  constructor(private readonly options: HeatzyClientOptions) {
  }

  async getAllBindings() {
    await this.refreshLogin();
    const response = await fetch(`${BASE_URL}/bindings`, {
      headers: {
        'X-Gizwits-Application-Id': HEATZY_APP_ID,
        'X-Gizwits-User-Token': this.auth?.token ?? '',
      },
    });
    if (response.ok) {
      return await response.json() as { devices: HeatzyBinding[] };
    } else {
      throw new Error('Heatzy Client: could not retrieve bindings.');
    }
  }

  async getDevdataByDeviceId(deviceId: string) {
    await this.refreshLogin();
    const response = await fetch(`${BASE_URL}/devdata/${deviceId}/latest`, {
      headers: {
        'X-Gizwits-Application-Id': HEATZY_APP_ID,
        'X-Gizwits-User-Token': this.auth?.token ?? '',
      },
    });
    if (response.ok) {
      const rawData = await response.json() as HeatzyDeviceState;
      return this.mapChineseToEnglishMode(rawData.attr.mode);
    } else {
      throw new Error(`Heatzy Client: could not retrieve devdata for binding with ID: ${deviceId}.`);
    }
  }

  async setDeviceMode(did: string, mode: keyof typeof CONTROL_MODES) {
    await this.refreshLogin();
    const response = await fetch(`${BASE_URL}/control/${did}`, {
      method: 'POST',
      headers: {
        'X-Gizwits-Application-Id': HEATZY_APP_ID,
        'X-Gizwits-User-Token': this.auth?.token ?? '',
      },
      body: JSON.stringify({
        raw: CONTROL_MODES[mode],
      }),
    });
    if (!response.ok) {
      throw new Error(`Heatzy Client: could not retrieve devdata for binding with ID: ${did}.`);
    }
  }

  private async refreshLogin() {
    if (!this.auth || this.auth.expiration < Date.now()) {
      await this.login();
    }
  }

  private async login() {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      body: JSON.stringify({
        username: this.options.username,
        password: this.options.password,
        lang: 'en',
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Gizwits-Application-Id': HEATZY_APP_ID,
      },
    });
    if (response.ok) {
      const { token, expires_at } = await response.json() as { token: string; expires_at: number };
      this.auth = {
        token,
        expiration: expires_at * 1000,
      };
    } else {
      throw new Error('Heatzy Client: login attempt failed.');
    }
  }

  private mapChineseToEnglishMode(mode: HeatzyDeviceChineseMode): keyof typeof CONTROL_MODES {
    switch (mode) {
    case '舒适':
      return 'COMFORT';
    case '经济':
      return 'ECO';
    case '解冻':
      return 'ANTIFROST';
    case '停止':
      return 'OFF';
    }
  }
}

export interface HeatzyBinding {
  /* device ID */
  did: string;
  /* Name as displayed in the Heatzy app */
  dev_alias: string;
}

export interface HeatzyDeviceState {
  attr: {
    mode: HeatzyDeviceChineseMode;
  };
}

type HeatzyDeviceChineseMode =
  '舒适' /* Confort */ |
  '经济' /* Eco */ |
  '解冻' /* Hors-gel */ |
  '停止'; /* OFF */

export const CONTROL_MODES = {
  COMFORT: [1, 1, 0],
  ECO: [1, 1, 1],
  ANTIFROST: [1, 1, 2],
  OFF: [1, 1, 3],
} as const;
