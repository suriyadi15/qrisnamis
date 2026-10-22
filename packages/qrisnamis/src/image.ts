// Decode QRIS dari gambar. Subpath opsional `qrisnamis/image`; membutuhkan
// peer dependency `zxing-wasm` sehingga import utama tetap zero-dependency.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { QRISError } from './errors'
import { parseQRIS, validateQRIS, type QRISInfo } from './parse'

export type ImageInput = Blob | ArrayBuffer | Uint8Array | ImageData

export interface DecoderConfig {
  /** Cloudflare Workers: hasil `import wasm from 'zxing-wasm/reader/zxing_reader.wasm'` */
  wasmModule?: WebAssembly.Module
  /** Node/Bun offline: isi file `zxing_reader.wasm` */
  wasmBinary?: ArrayBuffer | Uint8Array
  /** Browser/bundler: URL ke `zxing_reader.wasm` (mis. Vite `?url`) */
  wasmUrl?: string
}

export interface DecodedQRIS {
  /** Teks payload QRIS hasil decode */
  payload: string
  info: QRISInfo
  /** true bila struktur dan CRC valid */
  valid: boolean
  errors: string[]
}

/**
 * Atur dari mana binary wasm zxing dimuat. Opsional: tanpa ini zxing-wasm
 * mengambil wasm dari CDN jsDelivr. Panggil sekali sebelum `decodeQRISImage`.
 */
export function configureDecoder(config: DecoderConfig): void {
  const { wasmModule, wasmBinary, wasmUrl } = config
  if (wasmModule) {
    prepareZXingModule({
      overrides: {
        instantiateWasm(
          imports: WebAssembly.Imports,
          done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
        ) {
          WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule))
          return {}
        },
      },
    })
  } else if (wasmBinary) {
    const bin = wasmBinary instanceof Uint8Array ? wasmBinary : new Uint8Array(wasmBinary)
    prepareZXingModule({ overrides: { wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer } })
  } else if (wasmUrl) {
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    })
  }
}

/**
 * Baca QR dari gambar (PNG/JPEG/dll) dan parse sebagai QRIS.
 * @throws QRISError `QR_NOT_FOUND` bila tidak ada QR, `NOT_QRIS` bila isinya bukan payload QRIS.
 */
export async function decodeQRISImage(
  input: ImageInput,
  opts: { tryHarder?: boolean } = {},
): Promise<DecodedQRIS> {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input
  const results = await readBarcodes(data, {
    formats: ['QRCode'],
    tryHarder: opts.tryHarder ?? true,
    maxNumberOfSymbols: 4,
  })
  const texts = results.filter((r) => r.isValid).map((r) => r.text)
  if (!texts.length) throw new QRISError('QR_NOT_FOUND', 'QR tidak terbaca pada gambar')

  for (const payload of texts) {
    if (!payload.startsWith('000201')) continue
    let info: QRISInfo
    try {
      info = parseQRIS(payload)
    } catch {
      continue
    }
    const { valid, errors } = validateQRIS(payload)
    return { payload, info, valid, errors }
  }
  throw new QRISError('NOT_QRIS', 'QR terbaca, tetapi isinya bukan payload QRIS')
}
