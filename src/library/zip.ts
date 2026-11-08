/**
 * ZIP mínimo (método «store», sin compresión) para exportar/importar la
 * biblioteca con audio sin añadir dependencias de runtime.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

export function createZip(entries: readonly ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const locals: BlobPart[] = [];
  const centrals: BlobPart[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800);
    u16(lv, 8, 0);
    u16(lv, 10, 0);
    u16(lv, 12, 0);
    u32(lv, 14, crc);
    u32(lv, 18, entry.data.length);
    u32(lv, 22, entry.data.length);
    u16(lv, 26, name.length);
    u16(lv, 28, 0);
    local.set(name, 30);
    locals.push(local, entry.data.slice());

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u16(cv, 12, 0);
    u16(cv, 14, 0);
    u32(cv, 16, crc);
    u32(cv, 20, entry.data.length);
    u32(cv, 24, entry.data.length);
    u16(cv, 28, name.length);
    u16(cv, 30, 0);
    u16(cv, 32, 0);
    u16(cv, 34, 0);
    u16(cv, 36, 0);
    u32(cv, 38, 0);
    u32(cv, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + (part instanceof Uint8Array ? part.length : 0), 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, offset);
  u16(ev, 20, 0);
  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un ZIP válido.');
  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const result = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Directorio central corrupto.');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (method !== 0) throw new Error(`Entrada comprimida no soportada: ${name}`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Cabecera local corrupta.');
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    result.set(name, bytes.slice(start, start + compressedSize));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}
