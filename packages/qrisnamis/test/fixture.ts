import { buildTLV, crc16, type TLVEntry } from '../src'

// QRIS statis DUMMY untuk test (bukan milik merchant mana pun).
const entries: TLVEntry[] = [
  { tag: '00', value: '01' },
  { tag: '01', value: '11' },
  {
    tag: '26',
    value: '',
    children: [
      { tag: '00', value: 'ID.DUMMY.WWW' },
      { tag: '01', value: '936000000000000001' },
      { tag: '02', value: 'ID1234567890123' },
      { tag: '03', value: 'UMI' },
    ],
  },
  {
    tag: '51',
    value: '',
    children: [
      { tag: '00', value: 'ID.CO.QRIS.WWW' },
      { tag: '02', value: 'ID0000000000000' },
      { tag: '03', value: 'UMI' },
    ],
  },
  { tag: '52', value: '5812' },
  { tag: '53', value: '360' },
  { tag: '58', value: 'ID' },
  { tag: '59', value: 'TOKO TEST' },
  { tag: '60', value: 'JAKARTA' },
  { tag: '61', value: '12345' },
  { tag: '62', value: '', children: [{ tag: '07', value: 'A01' }] },
]
const body = entries.map(buildTLV).join('')
export const STATIC_QRIS = `${body}6304${crc16(body + '6304')}`
