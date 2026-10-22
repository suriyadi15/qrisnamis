import { crc16 } from './crc'
import { QRISError } from './errors'
import { parseTLV, type TLVEntry } from './tlv'

export interface QRISAccount {
  tag: string
  globalId?: string
  entries: TLVEntry[]
}

export interface QRISInfo {
  entries: TLVEntry[]
  /** true bila Point of Initiation = 12 */
  isDynamic: boolean
  merchant: {
    name?: string
    city?: string
    postalCode?: string
    categoryCode?: string
    currency?: string
    country?: string
    /** National Merchant ID (tag 51, sub 02) */
    nmid?: string
  }
  accounts: QRISAccount[]
  amount?: string
  fee?: { type: 'prompt' } | { type: 'fixed'; value: string } | { type: 'percent'; value: string }
  referenceId?: string
  crc: { value: string; expected: string; valid: boolean }
}

const get = (entries: TLVEntry[], tag: string) =>
  entries.find((e) => e.tag === tag)?.value

/** Periksa CRC (4 hex terakhir) terhadap isi payload. */
export function checkCRC(payload: string) {
  const idx = payload.length - 8
  if (idx < 0 || payload.slice(idx, idx + 4) !== '6304') {
    return { value: '', expected: '', valid: false }
  }
  const value = payload.slice(-4).toUpperCase()
  const expected = crc16(payload.slice(0, -4))
  return { value, expected, valid: value === expected }
}

export function parseQRIS(payload: string): QRISInfo {
  const input = payload.trim()
  if (!input) throw new QRISError('INVALID_FORMAT', 'Payload QRIS kosong')
  const entries = parseTLV(input)

  const accounts: QRISAccount[] = entries
    .filter((e) => e.children && +e.tag >= 26 && +e.tag <= 51)
    .map((e) => ({
      tag: e.tag,
      globalId: get(e.children!, '00'),
      entries: e.children!,
    }))

  const tag51 = entries.find((e) => e.tag === '51')
  const additional = entries.find((e) => e.tag === '62')?.children

  const feeIndicator = get(entries, '55')
  let fee: QRISInfo['fee']
  if (feeIndicator === '01') fee = { type: 'prompt' }
  else if (feeIndicator === '02') fee = { type: 'fixed', value: get(entries, '56') ?? '' }
  else if (feeIndicator === '03') fee = { type: 'percent', value: get(entries, '57') ?? '' }

  return {
    entries,
    isDynamic: get(entries, '01') === '12',
    merchant: {
      name: get(entries, '59'),
      city: get(entries, '60'),
      postalCode: get(entries, '61'),
      categoryCode: get(entries, '52'),
      currency: get(entries, '53'),
      country: get(entries, '58'),
      nmid: tag51?.children ? get(tag51.children, '02') : undefined,
    },
    accounts,
    amount: get(entries, '54'),
    fee,
    referenceId: additional ? get(additional, '03') : undefined,
    crc: checkCRC(input),
  }
}

const REQUIRED_TAGS = ['00', '01', '52', '53', '58', '59', '60', '63']

export function validateQRIS(payload: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  let info: QRISInfo
  try {
    info = parseQRIS(payload)
  } catch (e) {
    return { valid: false, errors: [(e as Error).message] }
  }
  for (const tag of REQUIRED_TAGS) {
    if (!info.entries.some((e) => e.tag === tag)) errors.push(`Tag wajib ${tag} tidak ada`)
  }
  if (!info.accounts.length) errors.push('Tidak ada template akun merchant (tag 26–51)')
  if (!info.crc.valid) errors.push('CRC tidak valid')
  return { valid: errors.length === 0, errors }
}
