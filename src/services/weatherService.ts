export interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  city: string;
  highTemp: number;
  lowTemp: number;
}

const WMO_CODE_MAP: Record<number, string> = {
  0: 'Clear Sky',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing Rime Fog',
  51: 'Light Drizzle',
  53: 'Moderate Drizzle',
  55: 'Dense Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  71: 'Slight Snow',
  73: 'Moderate Snow',
  75: 'Heavy Snow',
  80: 'Rain Showers',
  81: 'Heavy Showers',
  82: 'Violent Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ Hail',
};

class WeatherService {
  private cachedWeather: WeatherData = {
    temp: 24,
    condition: 'Partly Cloudy',
    humidity: 55,
    city: 'Local',
    highTemp: 28,
    lowTemp: 19,
  };
  private lastFetched = 0;
  private isFetching = false;

  public async getWeather(): Promise<WeatherData> {
    const now = Date.now();
    // Cache for 15 minutes
    if (now - this.lastFetched < 15 * 60 * 1000 && this.lastFetched > 0) {
      return this.cachedWeather;
    }

    if (this.isFetching) return this.cachedWeather;
    this.isFetching = true;

    try {
      // 1. Get approximate coordinates & city from IP (fast, zero permission prompt)
      let lat = 12.9716;
      let lon = 77.5946;
      let city = 'Local Weather';

      try {
        const ipRes = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          if (ipData.latitude && ipData.longitude) {
            lat = ipData.latitude;
            lon = ipData.longitude;
            city = ipData.city || ipData.region || 'Local';
          }
        }
      } catch {
        // Fallback coordinates default
      }

      // 2. Fetch live weather from Open-Meteo (free, public API, no key required)
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
      const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const current = data.current;
        const daily = data.daily;

        const wmo = Number(current?.weather_code ?? 0);
        const condition = WMO_CODE_MAP[wmo] || 'Partly Cloudy';
        const temp = Math.round(current?.temperature_2m ?? 24);
        const humidity = Math.round(current?.relative_humidity_2m ?? 50);
        const highTemp = Math.round(daily?.temperature_2m_max?.[0] ?? temp + 4);
        const lowTemp = Math.round(daily?.temperature_2m_min?.[0] ?? temp - 4);

        this.cachedWeather = {
          temp,
          condition,
          humidity,
          city,
          highTemp,
          lowTemp,
        };
        this.lastFetched = now;
      }
    } catch (err) {
      console.warn('[WeatherService] Weather fetch warning:', err);
    } finally {
      this.isFetching = false;
    }

    return this.cachedWeather;
  }
}

export const weatherService = new WeatherService();
