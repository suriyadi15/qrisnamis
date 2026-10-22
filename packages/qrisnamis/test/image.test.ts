import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { QRISError } from '../src'
import { configureDecoder, decodeQRISImage } from '../src/image'
import { STATIC_QRIS } from './fixture'

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))

beforeAll(() => {
  const wasm = createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm')
  configureDecoder({ wasmBinary: readFileSync(wasm) })
})

describe('decodeQRISImage', () => {
  test('Uint8Array → payload & info', async () => {
    const r = await decodeQRISImage(new Uint8Array(fx('static-qris.png')))
    expect(r.payload).toBe(STATIC_QRIS)
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.info.merchant.name).toBe('TOKO TEST')
  })
  test('Blob dan ArrayBuffer', async () => {
    const buf = fx('static-qris.png')
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    expect((await decodeQRISImage(new Blob([buf]))).payload).toBe(STATIC_QRIS)
    expect((await decodeQRISImage(ab)).payload).toBe(STATIC_QRIS)
  })
  test('QR bukan QRIS → NOT_QRIS', async () => {
    await expect(decodeQRISImage(fx('not-qris.png'))).rejects.toMatchObject({ code: 'NOT_QRIS' })
  })
  test('gambar tanpa QR → QR_NOT_FOUND', async () => {
    const err = await decodeQRISImage(fx('blank.png')).catch((e) => e)
    expect(err).toBeInstanceOf(QRISError)
    expect(err.code).toBe('QR_NOT_FOUND')
  })
})
