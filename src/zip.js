import { deflateRawSync, inflateRawSync } from 'node:zlib';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 0xffff - 22); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Not a supported ZIP/JAR: end-of-central-directory record was not found.');
}

export function readZip(buffer) {
  const end = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported yet. Use a normal Minecraft JAR or project directory.');
  }
  const entries = new Map();
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Malformed ZIP central directory.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (flags & 1) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Malformed local ZIP entry: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP compression method ${method} in ${name}`);
    if (data.length !== uncompressedSize) throw new Error(`ZIP size check failed for ${name}`);
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function u16(value) { const out = Buffer.alloc(2); out.writeUInt16LE(value); return out; }
function u32(value) { const out = Buffer.alloc(4); out.writeUInt32LE(value >>> 0); return out; }

export function writeZip(entries) {
  const localRecords = [];
  const directoryRecords = [];
  let offset = 0;
  for (const [name, raw] of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(raw);
    const compressed = deflateRawSync(data, { level: 6 });
    const method = compressed.length < data.length ? 8 : 0;
    const payload = method === 8 ? compressed : data;
    const checksum = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0), u32(checksum),
      u32(payload.length), u32(data.length), u16(filename.length), u16(0), filename, payload,
    ]);
    localRecords.push(local);
    const directory = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0), u32(checksum),
      u32(payload.length), u32(data.length), u16(filename.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), filename,
    ]);
    directoryRecords.push(directory);
    offset += local.length;
  }
  const directory = Buffer.concat(directoryRecords);
  const locals = Buffer.concat(localRecords);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.size), u16(entries.size),
    u32(directory.length), u32(locals.length), u16(0),
  ]);
  return Buffer.concat([locals, directory, end]);
}
