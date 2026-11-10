// Helper to convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

// Helper to convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Boosts saturation and lightness to guarantee high-contrast, luminous readability
 * on dark backgrounds and TN TFT screens at any viewing angle.
 */
export function boostVibrance(r: number, g: number, b: number): [number, number, number] {
  let [h, s, l] = rgbToHsl(r, g, b);

  // If artwork is almost pure grayscale/monochrome, default to vivid emerald
  if (s < 0.15) {
    return [16, 185, 129]; // #10b981
  }

  // Boost saturation for high-pop UI visibility
  if (s < 0.65) {
    s = 0.85;
  }

  // Ensure lightness is in the optimal 68% - 78% range for black backgrounds & TN viewing angles
  if (l < 0.65) {
    l = 0.72;
  } else if (l > 0.85) {
    l = 0.78;
  }

  return hslToRgb(h, s, l);
}

/**
 * Extracts the dominant vibrant color from an image URL using a small offscreen canvas.
 * Returns #RRGGBB hex string for seamless frontend & ESP32 firmware compatibility.
 */
export async function extractDominantColor(imgUrl: string): Promise<string> {
  if (!imgUrl) return '#10b981';

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('#10b981');

        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;

        let r = 0, g = 0, b = 0, totalWeight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const red = data[i];
          const green = data[i + 1];
          const blue = data[i + 2];
          const lum = 0.299 * red + 0.587 * green + 0.114 * blue;

          // Filter out extreme blacks (<15) and extreme whites (>245)
          if (lum > 15 && lum < 245) {
            const maxC = Math.max(red, green, blue);
            const minC = Math.min(red, green, blue);
            const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
            // Heavily prioritize colorful pixels over muddy dark backgrounds
            const weight = 1.0 + sat * 4.0;
            r += red * weight;
            g += green * weight;
            b += blue * weight;
            totalWeight += weight;
          }
        }

        if (totalWeight > 0) {
          const avgR = r / totalWeight;
          const avgG = g / totalWeight;
          const avgB = b / totalWeight;
          const [boostedR, boostedG, boostedB] = boostVibrance(avgR, avgG, avgB);

          const toHex = (c: number) => {
            const h = Math.max(0, Math.min(255, Math.round(c))).toString(16);
            return h.length === 1 ? '0' + h : h;
          };
          const hex = `#${toHex(boostedR)}${toHex(boostedG)}${toHex(boostedB)}`;
          resolve(hex);
        } else {
          resolve('#10b981');
        }
      } catch {
        resolve('#10b981');
      }
    };

    img.onerror = () => {
      resolve('#10b981');
    };

    img.src = imgUrl;
  });
}

/**
 * Resizes the album artwork to a 32x32 16-bit RGB565 raw buffer encoded as Base64.
 * 32x32 = 1024 pixels = 2048 bytes (tiny, fast over WebSocket and SPI).
 */
export async function generateThumbnailRGB565Base64(imgUrl: string, size = 32): Promise<string | null> {
  if (!imgUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Big-endian RGB565 byte array: 2 bytes per pixel
        const bytes = new Uint8Array(size * size * 2);
        let byteIdx = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // 16-bit RGB565
          const rgb565 = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);

          // Big-endian: High byte then low byte
          bytes[byteIdx++] = (rgb565 >> 8) & 0xFF;
          bytes[byteIdx++] = rgb565 & 0xFF;
        }

        // Convert to binary string for btoa
        let binary = '';
        const len = bytes.length;
        for (let j = 0; j < len; j++) {
          binary += String.fromCharCode(bytes[j]);
        }

        resolve(btoa(binary));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = imgUrl;
  });
}
