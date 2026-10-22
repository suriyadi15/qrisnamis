export type QRISErrorCode =
  | 'INVALID_FORMAT'
  | 'INVALID_CRC'
  | 'INVALID_AMOUNT'
  | 'INVALID_FEE'
  | 'REFERENCE_TOO_LONG'
  | 'MISSING_TAG'
  | 'QR_NOT_FOUND'
  | 'NOT_QRIS'

export class QRISError extends Error {
  readonly code: QRISErrorCode

  constructor(code: QRISErrorCode, message: string) {
    super(message)
    this.name = 'QRISError'
    this.code = code
  }
}
