import { QRISError } from './errors'

export interface TLVEntry {
  tag: string
  value: string
  children?: TLVEntry[]
}

// Template akun merchant (26–51) dan data tambahan (62) berisi TLV bersarang.
const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(26 + i)),
  '62',
])

/** Parse string TLV. Melempar INVALID_FORMAT bila panjang/tag rusak atau terpotong. */
export function parseTLV(str: string): TLVEntry[] {
  const entries: TLVEntry[] = []
  let i = 0
  while (i < str.length) {
    const tag = str.slice(i, i + 2)
    const lenStr = str.slice(i + 2, i + 4)
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) {
      throw new QRISError('INVALID_FORMAT', `TLV tidak valid pada posisi ${i}`)
    }
    const length = parseInt(lenStr, 10)
    if (i + 4 + length > str.length) {
      throw new QRISError('INVALID_FORMAT', `Nilai tag ${tag} terpotong`)
    }
    const value = str.slice(i + 4, i + 4 + length)
    const entry: TLVEntry = { tag, value }
    if (NESTED_TAGS.has(tag)) {
      try {
        entry.children = parseTLV(value)
      } catch {
        // bukan TLV bersarang yang valid; biarkan sebagai nilai biasa
      }
    }
    entries.push(entry)
    i += 4 + length
  }
  return entries
}

export function buildTLV(entry: TLVEntry): string {
  const value = entry.children
    ? entry.children.map(buildTLV).join('')
    : entry.value
  if (value.length > 99) {
    throw new QRISError('INVALID_FORMAT', `Nilai tag ${entry.tag} lebih dari 99 karakter`)
  }
  return `${entry.tag}${String(value.length).padStart(2, '0')}${value}`
}
