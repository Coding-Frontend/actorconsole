/**
 * Minimal ICO reader. sharp (libvips) cannot decode .ico files, which made the
 * `/favicon.ico` fallback fail for every website. An ICO holds one or more
 * images stored either as PNG or as a headerless BMP (DIB); this picks the
 * largest one and returns PNG bytes or raw RGBA pixels for sharp.
 */
export type DecodedIco =
  | { kind: "png"; bytes: Buffer; width: number; height: number }
  | { kind: "rgba"; pixels: Buffer; width: number; height: number };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isIco(bytes: Buffer) {
  return (
    bytes.length >= 6 &&
    bytes.readUInt16LE(0) === 0 &&
    bytes.readUInt16LE(2) === 1 &&
    bytes.readUInt16LE(4) > 0
  );
}

export function decodeIco(bytes: Buffer): DecodedIco {
  if (!isIco(bytes)) throw new Error("Not an ICO file");
  const count = bytes.readUInt16LE(4);
  if (6 + count * 16 > bytes.length) throw new Error("ICO directory is truncated");

  type Entry = { width: number; height: number; bitCount: number; size: number; offset: number };
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 16;
    const entry = {
      width: bytes[at] || 256,
      height: bytes[at + 1] || 256,
      bitCount: bytes.readUInt16LE(at + 6),
      size: bytes.readUInt32LE(at + 8),
      offset: bytes.readUInt32LE(at + 12),
    };
    if (entry.size > 0 && entry.offset + entry.size <= bytes.length) entries.push(entry);
  }
  entries.sort(
    (left, right) => right.width * right.height - left.width * left.height || right.bitCount - left.bitCount,
  );

  let lastError: unknown = new Error("ICO file has no readable images");
  for (const entry of entries) {
    const data = bytes.subarray(entry.offset, entry.offset + entry.size);
    try {
      if (data.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return {
          kind: "png",
          bytes: Buffer.from(data),
          width: data.length >= 24 ? data.readUInt32BE(16) : entry.width,
          height: data.length >= 24 ? data.readUInt32BE(20) : entry.height,
        };
      }
      return decodeDib(data);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function decodeDib(data: Buffer): DecodedIco {
  if (data.length < 40) throw new Error("ICO bitmap header is truncated");
  const headerSize = data.readUInt32LE(0);
  const width = data.readInt32LE(4);
  // The stored height covers the colour image and the transparency mask.
  const height = Math.abs(data.readInt32LE(8)) / 2;
  const bitCount = data.readUInt16LE(14);
  const compression = data.readUInt32LE(16);
  const colorsUsed = data.readUInt32LE(32);
  if (headerSize < 40 || width <= 0 || width > 256 || !Number.isInteger(height) || height <= 0 || height > 256) {
    throw new Error("ICO bitmap has unsupported dimensions");
  }
  if (compression !== 0 || ![1, 4, 8, 24, 32].includes(bitCount)) {
    throw new Error("ICO bitmap uses an unsupported format");
  }

  const paletteSize = bitCount <= 8 ? (colorsUsed || 2 ** bitCount) : 0;
  const paletteStart = headerSize;
  const pixelStart = paletteStart + paletteSize * 4;
  const stride = Math.floor((bitCount * width + 31) / 32) * 4;
  const maskStride = Math.floor((width + 31) / 32) * 4;
  const maskStart = pixelStart + stride * height;
  if (pixelStart + stride * height > data.length) throw new Error("ICO bitmap is truncated");
  const hasMask = maskStart + maskStride * height <= data.length;

  const pixels = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y += 1) {
    // DIB rows are stored bottom-up.
    const row = pixelStart + (height - 1 - y) * stride;
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      let blue: number;
      let green: number;
      let red: number;
      let alpha = 255;
      if (bitCount === 32 || bitCount === 24) {
        const at = row + x * (bitCount / 8);
        blue = data[at]!;
        green = data[at + 1]!;
        red = data[at + 2]!;
        if (bitCount === 32) {
          alpha = data[at + 3]!;
          if (alpha) anyAlpha = true;
        }
      } else {
        const bitOffset = x * bitCount;
        const byte = data[row + (bitOffset >> 3)]!;
        const shift = 8 - bitCount - (bitOffset & 7);
        const colorIndex = (byte >> shift) & ((1 << bitCount) - 1);
        const at = paletteStart + colorIndex * 4;
        if (colorIndex >= paletteSize || at + 3 > data.length) throw new Error("ICO palette is truncated");
        blue = data[at]!;
        green = data[at + 1]!;
        red = data[at + 2]!;
      }
      pixels[out] = red;
      pixels[out + 1] = green;
      pixels[out + 2] = blue;
      pixels[out + 3] = alpha;
    }
  }

  // Without a usable alpha channel, the 1-bit AND mask marks transparent pixels.
  if (hasMask && !(bitCount === 32 && anyAlpha)) {
    for (let y = 0; y < height; y += 1) {
      const row = maskStart + (height - 1 - y) * maskStride;
      for (let x = 0; x < width; x += 1) {
        const transparent = (data[row + (x >> 3)]! >> (7 - (x & 7))) & 1;
        pixels[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  } else if (bitCount === 32 && !anyAlpha) {
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  }
  return { kind: "rgba", pixels, width, height };
}
