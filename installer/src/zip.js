// @ts-check
/**
 * Reads one file out of a zip, enough to get a solution's version from its solution.xml.
 */
import { inflateRawSync } from 'node:zlib';

/**
 * @param {Uint8Array} zip
 * @param {string} name  The entry's path inside the zip, e.g. solution.xml.
 * @returns {Buffer | undefined}
 */
export function readZipEntry(zip, name) {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file.');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('The zip\'s directory is damaged.');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const entry = buf.toString('utf8', at + 46, at + 46 + nameLen);
    if (entry.replace(/\\/g, '/').toLowerCase() === name.toLowerCase()) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`${name} uses a compression method this reader doesn't know (${method}).`);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

/**
 * A solution zip's unique name and version, from its solution.xml.
 * @param {Uint8Array} zip
 */
export function solutionInfo(zip) {
  const xml = readZipEntry(zip, 'solution.xml')?.toString('utf8').replace(/^\uFEFF/, '');
  if (!xml) throw new Error('The zip has no solution.xml, so it isn\'t a solution.');
  const uniqueName = /<UniqueName>([^<]+)<\/UniqueName>/.exec(xml)?.[1];
  const version = /<Version>([^<]+)<\/Version>/.exec(xml)?.[1];
  const managed = /<Managed>1<\/Managed>/.test(xml);
  if (!uniqueName || !version) throw new Error('The solution.xml has no unique name or version.');
  return { uniqueName, version, managed };
}

/**
 * Compares dotted versions: negative when a is older than b.
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
