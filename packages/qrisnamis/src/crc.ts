/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) sesuai EMVCo, hasil 4 digit hex kapital. */
export function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc <<= 1
      if (crc & 0x10000) crc ^= 0x1021
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}
