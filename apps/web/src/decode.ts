import { configureDecoder } from 'qrisnamis/image'
import wasmModule from 'zxing-wasm/reader/zxing_reader.wasm'

configureDecoder({ wasmModule })

export { decodeQRISImage } from 'qrisnamis/image'
