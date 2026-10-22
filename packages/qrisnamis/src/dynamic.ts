import { crc16 } from './crc'
import { QRISError } from './errors'
import { checkCRC } from './parse'
import { buildTLV, parseTLV, type TLVEntry } from './tlv'

export type Fee =
  | { type: 'prompt' }
  | { type: 'fixed'; value: number | string }
  | { type: 'percent'; value: number | string }

export interface DynamicOptions {
  /** Nominal dalam rupiah; maksimal 2 desimal, > 0, maksimal 13 karakter */
  amount: number | string
  /** Biaya layanan / tip (tag 55–57) */
  fee?: Fee
  /** Bill number (tag 62.03), maksimal 25 karakter */
  referenceId?: string
  /** Tolak payload dengan CRC salah. Default true. */
  strict?: boolean
}

const DECIMAL = /^\d+(\.\d{1,2})?$/

/** Normalisasi angka menjadi string EMVCo (tanpa desimal bila bulat). */
function formatNumber(
  raw: number | string,
  max: number,
  code: 'INVALID_AMOUNT' | 'INVALID_FEE',
  label: string,
): string {
  const s = typeof raw === 'number' ? (Number.isFinite(raw) ? String(raw) : '') : raw.trim()
  if (!DECIMAL.test(s) || !(parseFloat(s) > 0)) {
    throw new QRISError(code, `${label} harus angka positif dengan maksimal 2 desimal`)
  }
  const normalized = s.includes('.') ? s.replace(/\.?0+$/, '') : s
  const out = normalized.replace(/^0+(?=\d)/, '')
  if (out.length > max) {
    throw new QRISError(code, `${label} maksimal ${max} karakter`)
  }
  return out
}

const byTag = (a: TLVEntry, b: TLVEntry) => parseInt(a.tag, 10) - parseInt(b.tag, 10)

/** Ubah QRIS statis menjadi dinamis dengan nominal (tag 54) tertanam. */
export function toDynamicQRIS(staticPayload: string, opts: DynamicOptions): string {
  const { amount, fee, referenceId, strict = true } = opts
  const input = staticPayload.trim()

  if (referenceId !== undefined && referenceId.length > 25) {
    throw new QRISError('REFERENCE_TOO_LONG', 'referenceId maksimal 25 karakter')
  }
  const amountStr = formatNumber(amount, 13, 'INVALID_AMOUNT', 'amount')

  const entries = parseTLV(input)
  if (strict && !checkCRC(input).valid) {
    throw new QRISError('INVALID_CRC', 'CRC payload QRIS tidak valid')
  }
  if (!entries.some((e) => e.tag === '01')) {
    throw new QRISError('MISSING_TAG', 'Tag 01 (Point of Initiation) tidak ada')
  }

  // Point of Initiation: statis (11) -> dinamis (12)
  const base = entries
    .filter((e) => !['54', '55', '56', '57', '62', '63'].includes(e.tag))
    .map((e) => (e.tag === '01' ? { ...e, value: '12' } : e))

  base.push({ tag: '54', value: amountStr })

  if (fee) {
    if (fee.type === 'prompt') {
      base.push({ tag: '55', value: '01' })
    } else if (fee.type === 'fixed') {
      base.push({ tag: '55', value: '02' })
      base.push({ tag: '56', value: formatNumber(fee.value, 13, 'INVALID_FEE', 'fee') })
    } else if (fee.type === 'percent') {
      const pct = formatNumber(fee.value, 5, 'INVALID_FEE', 'fee')
      if (parseFloat(pct) > 100) throw new QRISError('INVALID_FEE', 'fee persen maksimal 100')
      base.push({ tag: '55', value: '03' })
      base.push({ tag: '57', value: pct })
    } else {
      throw new QRISError('INVALID_FEE', 'tipe fee tidak dikenal')
    }
  }

  const children62: TLVEntry[] = entries.find((e) => e.tag === '62')?.children?.map((c) => ({ ...c })) ?? []
  if (referenceId) {
    const i = children62.findIndex((c) => c.tag === '03')
    if (i !== -1) children62[i]!.value = referenceId
    else children62.push({ tag: '03', value: referenceId })
    children62.sort(byTag)
  }
  if (children62.length > 0) base.push({ tag: '62', value: '', children: children62 })

  base.sort(byTag)

  const body = base.map(buildTLV).join('')
  return `${body}6304${crc16(body + '6304')}`
}
