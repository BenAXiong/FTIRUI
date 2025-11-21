const textEncoder = new TextEncoder();

const createCrcTable = () => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
};

const CRC_TABLE = createCrcTable();

const crc32 = (input) => {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i += 1) {
    const index = (crc ^ input[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC_TABLE[index];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const ensureUint8Array = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer);
  if (typeof value === 'string') return textEncoder.encode(value);
  throw new TypeError('zipBuilder: unsupported data type');
};

const encodeDosDateTime = (dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date();
  let year = date.getFullYear();
  if (year < 1980) year = 1980;
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
};

const concatArrays = (chunks) => {
  const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    buffer.set(chunk, offset);
    offset += chunk.length;
  });
  return buffer;
};

export function createZipBuilder() {
  const files = [];

  const addFileInternal = (name, data, { date } = {}) => {
    const payload = ensureUint8Array(data);
    const { dosDate, dosTime } = encodeDosDateTime(date);
    files.push({
      name,
      nameBytes: textEncoder.encode(name),
      data: payload,
      crc32: crc32(payload),
      date: dosDate,
      time: dosTime
    });
  };

  const buildLocalHeader = (file) => {
    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // UTF-8 flag
    view.setUint16(8, 0, true); // store
    view.setUint16(10, file.time, true);
    view.setUint16(12, file.date, true);
    view.setUint32(14, file.crc32, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, file.nameBytes.length, true);
    view.setUint16(28, 0, true); // extra length
    return concatArrays([new Uint8Array(header), file.nameBytes, file.data]);
  };

  const buildCentralHeader = (file, offset) => {
    const header = new ArrayBuffer(46);
    const view = new DataView(header);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, file.time, true);
    view.setUint16(14, file.date, true);
    view.setUint32(16, file.crc32, true);
    view.setUint32(20, file.data.length, true);
    view.setUint32(24, file.data.length, true);
    view.setUint16(28, file.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return concatArrays([new Uint8Array(header), file.nameBytes]);
  };

  const buildEndRecord = (entryCount, centralSize, centralOffset) => {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true); // no comment
    return new Uint8Array(buffer);
  };

  return {
    addFile(name, data, options) {
      addFileInternal(name, data, options);
      return this;
    },
    addTextFile(name, text, options) {
      addFileInternal(name, textEncoder.encode(text), options);
      return this;
    },
    toBlob({ type = 'application/zip' } = {}) {
      if (!files.length) {
        return new Blob([], { type });
      }
      const localChunks = [];
      const centralChunks = [];
      let offset = 0;
      files.forEach((file) => {
        const localHeader = buildLocalHeader(file);
        localChunks.push(localHeader);
        const centralHeader = buildCentralHeader(file, offset);
        centralChunks.push(centralHeader);
        offset += localHeader.length;
      });
      const centralSize = centralChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const endRecord = buildEndRecord(files.length, centralSize, offset);
      return new Blob([...localChunks, ...centralChunks, endRecord], { type });
    }
  };
}
