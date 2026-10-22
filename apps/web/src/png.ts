// Encoder PNG 1-bit grayscale minimal (tanpa dependency) untuk matriks QR.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * @param matrix  true = modul gelap
 * @param scale   piksel per modul
 * @param margin  modul kosong di sekeliling
 */
export async function renderPNG(matrix: boolean[][], scale: number, margin: number): Promise<Uint8Array> {
  const n = matrix.length
  const size = (n + margin * 2) * scale
  const rowBytes = Math.ceil(size / 8)
  const raw = new Uint8Array((rowBytes + 1) * size).fill(0xff) // 1 = putih
  for (let y = 0; y < size; y++) {
    const my = Math.floor(y / scale) - margin
    const base = y * (rowBytes + 1)
    raw[base] = 0 // filter: none
    if (my < 0 || my >= n) continue
    const row = matrix[my]!
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - margin
      if (mx >= 0 && mx < n && row[mx]) raw[base + 1 + (x >> 3)]! &= ~(0x80 >> (x & 7))
    }
  }

  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, size)
  v.setUint32(4, size)
  ihdr[8] = 1 // bit depth
  ihdr[9] = 0 // grayscale

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
