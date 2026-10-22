import { describe, expect, test } from 'bun:test'
import {
  QRISError,
  crc16,
  parseQRIS,
  parseTLV,
  buildTLV,
  toDynamicQRIS,
  validateQRIS,
} from '../src'
import { STATIC_QRIS } from './fixture'

// Implementasi referensi (tenta-product-new/src/server/qris.ts), tanpa validasi.
function referenceDynamic(staticQris: string, amount: number, referenceId?: string) {
  const entries = parseTLV(staticQris)
  const poi = entries.find((e) => e.tag === '01')
  if (poi) poi.value = '12'
  const ch = entries.find((e) => e.tag === '62')?.children
  const c62 = ch ? [...ch] : []
  if (referenceId) {
    const i = c62.findIndex((c) => c.tag === '03')
    if (i !== -1) c62[i]!.value = referenceId
    else c62.push({ tag: '03', value: referenceId })
    c62.sort((a, b) => +a.tag - +b.tag)
  }
  const base = entries.filter((e) => !['54', '62', '63'].includes(e.tag))
  base.push({ tag: '54', value: String(amount) })
  if (c62.length) base.push({ tag: '62', value: '', children: c62 })
  base.sort((a, b) => +a.tag - +b.tag)
  const body = base.map(buildTLV).join('')
  return `${body}6304${crc16(body + '6304')}`
}

describe('crc16', () => {
  test('vektor CRC-16/CCITT-FALSE', () => expect(crc16('123456789')).toBe('29B1'))
})

describe('tlv', () => {
  test('round-trip', () => {
    const rebuilt = parseTLV(STATIC_QRIS).map(buildTLV).join('')
    expect(rebuilt).toBe(STATIC_QRIS)
  })
  test('terpotong -> INVALID_FORMAT', () => {
    expect(() => parseTLV('000399')).toThrow(QRISError)
    expect(() => parseTLV('0002')).toThrow(QRISError)
  })
})

describe('parseQRIS / validateQRIS', () => {
  test('fixture valid & statis', () => {
    const info = parseQRIS(STATIC_QRIS)
    expect(info.isDynamic).toBe(false)
    expect(info.crc.valid).toBe(true)
    expect(info.merchant.name).toBe('TOKO TEST')
    expect(info.merchant.nmid).toBe('ID0000000000000')
    expect(validateQRIS(STATIC_QRIS)).toEqual({ valid: true, errors: [] })
  })
  test('CRC salah terdeteksi', () => {
    const bad = STATIC_QRIS.slice(0, -4) + '0000'
    expect(validateQRIS(bad).valid).toBe(false)
  })
  test('sampah ditolak', () => {
    expect(validateQRIS('hello').valid).toBe(false)
    expect(validateQRIS('').valid).toBe(false)
  })
})

describe('toDynamicQRIS', () => {
  test('identik dengan implementasi referensi', () => {
    for (const [amount, ref] of [[10000, undefined], [25500, 'INV-001']] as const) {
      expect(toDynamicQRIS(STATIC_QRIS, { amount, referenceId: ref })).toBe(
        referenceDynamic(STATIC_QRIS, amount, ref),
      )
    }
  })
  test('hasil dinamis, nominal & CRC benar', () => {
    const out = toDynamicQRIS(STATIC_QRIS, { amount: 12500, referenceId: 'ORD1' })
    const info = parseQRIS(out)
    expect(info.isDynamic).toBe(true)
    expect(info.amount).toBe('12500')
    expect(info.referenceId).toBe('ORD1')
    expect(info.crc.valid).toBe(true)
  })
  test('amount desimal & string dinormalisasi', () => {
    expect(parseQRIS(toDynamicQRIS(STATIC_QRIS, { amount: '1500.50' })).amount).toBe('1500.5')
    expect(parseQRIS(toDynamicQRIS(STATIC_QRIS, { amount: '1500.00' })).amount).toBe('1500')
  })
  test.each([0, -1, NaN, Infinity, '1e5', '1.234', 'abc', 12345678901234])(
    'amount tidak valid: %p',
    (amount) => {
      expect(() => toDynamicQRIS(STATIC_QRIS, { amount })).toThrow(/amount/)
    },
  )
  test('fee fixed / percent / prompt', () => {
    const fixed = parseQRIS(toDynamicQRIS(STATIC_QRIS, { amount: 1000, fee: { type: 'fixed', value: 500 } }))
    expect(fixed.fee).toEqual({ type: 'fixed', value: '500' })
    const pct = parseQRIS(toDynamicQRIS(STATIC_QRIS, { amount: 1000, fee: { type: 'percent', value: 2.5 } }))
    expect(pct.fee).toEqual({ type: 'percent', value: '2.5' })
    const prompt = parseQRIS(toDynamicQRIS(STATIC_QRIS, { amount: 1000, fee: { type: 'prompt' } }))
    expect(prompt.fee).toEqual({ type: 'prompt' })
    expect(pct.crc.valid && fixed.crc.valid && prompt.crc.valid).toBe(true)
  })
  test('fee tidak valid', () => {
    expect(() => toDynamicQRIS(STATIC_QRIS, { amount: 1, fee: { type: 'percent', value: 101 } })).toThrow(QRISError)
    expect(() => toDynamicQRIS(STATIC_QRIS, { amount: 1, fee: { type: 'fixed', value: 0 } })).toThrow(QRISError)
  })
  test('referenceId > 25 karakter', () => {
    expect(() => toDynamicQRIS(STATIC_QRIS, { amount: 1, referenceId: 'x'.repeat(26) })).toThrow(
      expect.objectContaining({ code: 'REFERENCE_TOO_LONG' }),
    )
  })
  test('strict menolak CRC salah, non-strict menerima', () => {
    const bad = STATIC_QRIS.slice(0, -4) + '0000'
    expect(() => toDynamicQRIS(bad, { amount: 1000 })).toThrow(
      expect.objectContaining({ code: 'INVALID_CRC' }),
    )
    expect(parseQRIS(toDynamicQRIS(bad, { amount: 1000, strict: false })).crc.valid).toBe(true)
  })
  test('input statis tidak dimutasi dan idempoten', () => {
    const a = toDynamicQRIS(STATIC_QRIS, { amount: 1000 })
    const b = toDynamicQRIS(a, { amount: 1000 })
    expect(b).toBe(a)
  })
})
