# qrisnamis

[![npm version](https://img.shields.io/npm/v/qrisnamis?logo=npm&color=cb3837)](https://www.npmjs.com/package/qrisnamis)
[![npm downloads](https://img.shields.io/npm/dm/qrisnamis?logo=npm&color=cb3837)](https://www.npmjs.com/package/qrisnamis)
[![bundle size](https://img.shields.io/bundlephobia/minzip/qrisnamis?label=minzipped)](https://bundlephobia.com/package/qrisnamis)
[![types](https://img.shields.io/npm/types/qrisnamis?logo=typescript&logoColor=white)](https://www.npmjs.com/package/qrisnamis)
[![CI](https://img.shields.io/github/actions/workflow/status/suriyadi15/qrisnamis/ci.yml?branch=main&label=CI&logo=github)](https://github.com/suriyadi15/qrisnamis/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/qrisnamis)](https://github.com/suriyadi15/qrisnamis/blob/main/LICENSE)
[![demo](https://img.shields.io/badge/demo-qrisnamis.pages.dev-f38020?logo=cloudflare&logoColor=white)](https://qrisnamis.pages.dev)

Ubah **QRIS statis** menjadi **QRIS dinamis** (nominal, biaya layanan, nomor referensi), baca isi QRIS, dan baca QRIS dari gambar. TypeScript, inti library tanpa dependency, jalan di Node, Bun, browser, dan Cloudflare Workers.

> ⚠️ **Disclaimer:** proyek independen, tidak berafiliasi dengan Bank Indonesia, ASPI, atau penyedia pembayaran mana pun. Gunakan hanya QRIS milik Anda atau yang Anda berwenang gunakan. Disediakan apa adanya tanpa jaminan; pengembang tidak bertanggung jawab atas penggunaan. Lihat file `DISCLAIMER.md` di paket ini.

## Alur kerja

Ada tiga langkah, dan masing-masing punya fungsinya sendiri:

```
gambar QRIS statis            qris-statis.png
        │
        │  decodeQRISImage    (qrisnamis/image)
        ▼
string statis                 "000201…6304BE67"
        │
        │  toDynamicQRIS      (qrisnamis)
        ▼
string dinamis                "000201…6304DCDF"
        │
        │  qrcode / uqr       (library QR lain)
        ▼
gambar QRIS dinamis           qris-dinamis.png
```

1. **Gambar → string.** QR di gambar hanyalah teks. `decodeQRISImage` membacanya. Langkah ini opsional bila Anda sudah punya teksnya.
2. **String statis → string dinamis.** `toDynamicQRIS` menanamkan nominal (dan opsional biaya serta referensi), lalu menghitung ulang CRC.
3. **String dinamis → gambar.** `qrisnamis` hanya menghasilkan string. Menggambarnya menjadi QR dilakukan library QR biasa seperti `qrcode` atau `uqr`.

## Instalasi

```bash
npm i qrisnamis            # inti: langkah 2 (juga parse & validasi)
npm i zxing-wasm           # langkah 1: baca QRIS dari gambar (qrisnamis/image)
npm i qrcode               # langkah 3 di Node (di browser/Workers pakai: npm i uqr)
```

Pakai `bun add` atau `pnpm add` bila Anda mau. Hanya `qrisnamis` yang wajib; sisanya sesuai langkah yang Anda pakai.

## Tutorial 1: alur lengkap di Node

Siapkan folder dengan file `qris-statis.png` (foto/screenshot QRIS statis Anda), lalu simpan kode berikut sebagai `contoh.mjs` dan jalankan `node contoh.mjs`.

```js
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import QRCode from 'qrcode'
import { QRISError, parseQRIS, toDynamicQRIS } from 'qrisnamis'
import { configureDecoder, decodeQRISImage } from 'qrisnamis/image'

// Pakai file wasm lokal supaya tidak perlu internet
const require = createRequire(import.meta.url)
configureDecoder({
  wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')),
})

try {
  // 1. Gambar QRIS statis → string payload
  const statis = await decodeQRISImage(readFileSync('qris-statis.png'))
  console.log('Merchant  :', statis.info.merchant.name)
  console.log('Valid     :', statis.valid)
  console.log('Statis    :', statis.payload)

  // 2. String statis → string dinamis (nominal Rp25.000)
  const dinamis = toDynamicQRIS(statis.payload, { amount: 25000, referenceId: 'INV-0001' })
  console.log('Dinamis   :', dinamis)
  console.log('Nominal   :', parseQRIS(dinamis).amount)

  // 3. String dinamis → gambar QRIS
  await QRCode.toFile('qris-dinamis.png', dinamis, { errorCorrectionLevel: 'M', margin: 4, width: 600 })
  console.log('Tersimpan : qris-dinamis.png')
} catch (e) {
  if (e instanceof QRISError) console.error(`Gagal (${e.code}): ${e.message}`)
  else throw e
}
```

Contoh output (dengan QRIS dummy):

```
Merchant  : TOKO TEST
Valid     : true
Statis    : 00020101021126640012ID.DUMMY.WWW0118936000000000000001…6304BE67
Dinamis   : 00020101021226640012ID.DUMMY.WWW0118936000000000000001…0703A016304DCDF
Nominal   : 25000
Tersimpan : qris-dinamis.png
```

Perhatikan perbedaan string statis dan dinamis: `010211` menjadi `010212` (statis → dinamis), muncul `540525000` (tag 54 = nominal), muncul `0308INV-0001` (referensi), dan 4 karakter CRC di ujung berubah. Buka `qris-dinamis.png` dengan aplikasi pembaca QR: nominalnya sudah terisi.

Penjelasan singkat:

- **`configureDecoder`** hanya menentukan dari mana file wasm pembaca QR dimuat. Tanpa ini wasm diunduh dari CDN jsDelivr, jadi perlu internet.
- **`decodeQRISImage`** melempar `QRISError` dengan kode `QR_NOT_FOUND` bila gambar tidak berisi QR, atau `NOT_QRIS` bila QR-nya bukan QRIS.
- **`valid`** bernilai `false` bila struktur atau CRC QRIS rusak. `toDynamicQRIS` akan menolak payload seperti itu (`INVALID_CRC`).
- Langkah 3 sepenuhnya memakai library `qrcode`; `errorCorrectionLevel: 'M'` dan `margin: 4` membuat QR mudah dipindai.

## Tutorial 2: alur lengkap di browser (Vite)

Cocok untuk halaman di mana pengguna mengunggah QRIS statis, mengisi nominal, lalu melihat dan mengunduh QR dinamis. Semua berjalan di browser; tidak ada yang dikirim ke server. Pasang `npm i qrisnamis zxing-wasm uqr`.

`index.html`:

```html
<input id="file" type="file" accept="image/*" />
<input id="amount" placeholder="Nominal, mis. 25000" inputmode="decimal" />
<p id="info"></p>
<div id="qr" style="width: 300px"></div>
<button id="download" disabled>Download PNG</button>
<script type="module" src="/main.ts"></script>
```

`main.ts`:

```ts
import { QRISError, toDynamicQRIS } from 'qrisnamis'
import { configureDecoder, decodeQRISImage } from 'qrisnamis/image'
import { encode, renderSVG } from 'uqr'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

configureDecoder({ wasmUrl }) // wasm ikut di-bundle Vite

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T
let statis = ''
let dinamis = ''

// 1. Gambar → string statis
$('file').addEventListener('change', async () => {
  try {
    const { payload, info } = await decodeQRISImage($('file').files![0]!)
    statis = payload
    $('info').textContent = `${info.merchant.name} · ${info.merchant.city}`
    render()
  } catch (e) {
    $('info').textContent = e instanceof QRISError ? e.message : 'Gagal membaca gambar'
  }
})

// 2 + 3. String statis + nominal → string dinamis → gambar
$('amount').addEventListener('input', render)

function render() {
  if (!statis || !$('amount').value) return
  try {
    dinamis = toDynamicQRIS(statis, { amount: $('amount').value })
    $('qr').innerHTML = renderSVG(dinamis, { ecc: 'M', border: 4 })
    $<HTMLButtonElement>('download').disabled = false
  } catch (e) {
    $('info').textContent = e instanceof QRISError ? e.message : String(e)
  }
}

// Download PNG: gambar matriks QR ke canvas
$('download').addEventListener('click', () => {
  const matrix = encode(dinamis, { ecc: 'M', border: 0 }).data
  const scale = 10, margin = 4, size = (matrix.length + margin * 2) * scale
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, size, size)
  g.fillStyle = '#000'
  matrix.forEach((row, y) =>
    row.forEach((on, x) => on && g.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale)),
  )
  canvas.toBlob((blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob!)
    a.download = 'qris-dinamis.png'
    a.click()
  })
})
```

Generator di situs ini memakai logika yang sama.

## Tutorial 3: sudah punya string statis (server)

Biasanya payload statis dibaca sekali dari gambar lalu **disimpan sebagai konfigurasi**, mis. env `QRIS_STATIC_PAYLOAD` (jangan di repositori publik). Setelah itu server hanya menjalankan langkah 2 dan 3 untuk tiap pesanan.

### Express → gambar PNG

```ts
import express from 'express'
import QRCode from 'qrcode'
import { QRISError, toDynamicQRIS } from 'qrisnamis'

const app = express()

// GET /orders/INV-1/qris.png?amount=25000
app.get('/orders/:id/qris.png', async (req, res) => {
  try {
    const dinamis = toDynamicQRIS(process.env.QRIS_STATIC_PAYLOAD!, {
      amount: String(req.query.amount),
      referenceId: req.params.id,
    })
    const png = await QRCode.toBuffer(dinamis, { errorCorrectionLevel: 'M', margin: 4, width: 600 })
    res.type('png').send(png)
  } catch (e) {
    if (e instanceof QRISError) return res.status(400).json({ code: e.code, message: e.message })
    throw e
  }
})
```

Di halaman: `<img src="/orders/INV-1/qris.png?amount=25000">`.

### Next.js (Route Handler) → data URL

```ts
// app/api/qris/route.ts
import QRCode from 'qrcode'
import { QRISError, toDynamicQRIS } from 'qrisnamis'

export async function POST(req: Request) {
  const { amount, orderId } = await req.json()
  try {
    const dinamis = toDynamicQRIS(process.env.QRIS_STATIC_PAYLOAD!, { amount, referenceId: orderId })
    const image = await QRCode.toDataURL(dinamis, { errorCorrectionLevel: 'M', margin: 4 })
    return Response.json({ payload: dinamis, image }) // image siap dipakai di <img src>
  } catch (e) {
    if (e instanceof QRISError) return Response.json({ code: e.code, message: e.message }, { status: 400 })
    throw e
  }
}
```

### Cloudflare Workers / Hono → gambar SVG

`qrcode` butuh Node, jadi di Workers pakai `uqr` (murni JavaScript).

```ts
import { Hono } from 'hono'
import { QRISError, toDynamicQRIS } from 'qrisnamis'
import { renderSVG } from 'uqr'

const app = new Hono<{ Bindings: { QRIS_STATIC_PAYLOAD: string } }>()

app.get('/qris.svg', (c) => {
  try {
    const dinamis = toDynamicQRIS(c.env.QRIS_STATIC_PAYLOAD, { amount: c.req.query('amount')! })
    return c.body(renderSVG(dinamis, { ecc: 'M', border: 4 }), 200, { 'Content-Type': 'image/svg+xml' })
  } catch (e) {
    if (e instanceof QRISError) return c.json({ code: e.code, message: e.message }, 400)
    throw e
  }
})

export default app
```

### Membaca gambar di Cloudflare Workers

Bila Anda perlu langkah 1 di Workers, sediakan wasm lewat `wasmModule`:

```ts
import { configureDecoder, decodeQRISImage } from 'qrisnamis/image'
import wasmModule from 'zxing-wasm/reader/zxing_reader.wasm'

configureDecoder({ wasmModule })

export default {
  async fetch(req: Request) {
    const file = (await req.formData()).get('file') as File
    const { payload } = await decodeQRISImage(new Uint8Array(await file.arrayBuffer()))
    return Response.json({ payload })
  },
}
```

Batas CPU Workers paket gratis kecil; untuk gambar besar, decode di browser lebih aman.

## Tutorial 4: tanpa library, lewat API HTTP

Ketiga langkah juga tersedia sebagai API. Ganti `HOST` dengan domain situs ini (playground interaktif ada di `/api/docs`).

```bash
HOST=https://HOST

# 1. Gambar → string statis
STATIS=$(curl -s -F file=@qris-statis.png $HOST/api/decode | jq -r .payload)

# 2. String statis → string dinamis
DINAMIS=$(curl -s $HOST/api/dynamic -H 'content-type: application/json' \
  -d "{\"qris\":\"$STATIS\",\"amount\":25000,\"referenceId\":\"INV-0001\"}" | jq -r .payload)
echo "$DINAMIS"

# 3. Gambar QRIS dinamis (endpoint ini menerima string STATIS + nominal, lalu membuat dinamisnya sendiri)
curl -s -G $HOST/api/qr --data-urlencode "qris=$STATIS" \
  --data-urlencode "amount=25000" --data-urlencode "referenceId=INV-0001" \
  -d format=png -o qris-dinamis.png
```

Endpoint `/api/qr` juga bisa dipakai langsung di `<img src="…">` (SVG/PNG). Karena payload dikirim lewat URL, gunakan hanya bila nyaman; atau kirim `POST /api/dynamic` lalu gambarkan sendiri.

## Referensi API

### `toDynamicQRIS(payload, options): string`

```ts
toDynamicQRIS(staticQris, {
  amount: 15000,                          // wajib
  fee: { type: 'fixed', value: 500 },     // opsional
  referenceId: 'INV-0001',                // opsional
  strict: true,                           // opsional, default true
})
```

| Opsi | Tipe | Keterangan |
| --- | --- | --- |
| `amount` | `number \| string` | Wajib. Lebih dari 0, maksimal 2 desimal, maksimal 13 karakter. `'1500.00'` dinormalisasi menjadi `1500`, `'1500.50'` menjadi `1500.5`. Notasi ilmiah (`1e5`) ditolak. |
| `fee` | `Fee` | `{ type: 'fixed', value }` → tag 55=`02` + 56. `{ type: 'percent', value }` → tag 55=`03` + 57 (maks 100, maks 5 karakter). `{ type: 'prompt' }` → tag 55=`01` (pembayar mengisi sendiri). Tag 55–57 lama dibuang lebih dulu. |
| `referenceId` | `string` | Disimpan di tag 62.03. Maksimal 25 karakter. Nilai lama di 62.03 diganti; sub-tag 62 lainnya dipertahankan. |
| `strict` | `boolean` | Default `true`: payload dengan CRC salah ditolak (`INVALID_CRC`). Isi `false` untuk menerima payload yang CRC-nya rusak lalu menghitung ulang. |

Fungsi ini murni dan idempoten: memanggilnya pada payload yang sudah dinamis dengan `amount` baru menggantikan nominal lama.

### `parseQRIS(payload): QRISInfo`

```ts
const info = parseQRIS(payload)
info.isDynamic            // true bila tag 01 = "12"
info.merchant             // { name, city, postalCode, categoryCode, currency, country, nmid }
info.amount               // string | undefined (tag 54)
info.fee                  // { type: 'prompt' } | { type: 'fixed', value } | { type: 'percent', value } | undefined
info.referenceId          // tag 62.03
info.accounts             // template akun merchant (tag 26–51): { tag, globalId, entries }
info.crc                  // { value, expected, valid }
info.entries              // seluruh TLV (dengan children untuk tag bersarang)
```

Melempar `QRISError('INVALID_FORMAT')` bila TLV rusak atau terpotong. `nmid` diambil dari tag 51 sub 02.

### `validateQRIS(payload): { valid, errors }`

Tidak melempar error; mengembalikan daftar masalah: format TLV, tag wajib (`00 01 52 53 58 59 60 63`), keberadaan template akun merchant, dan CRC.

```ts
const { valid, errors } = validateQRIS(input)
if (!valid) console.log(errors) // ['CRC tidak valid']
```

### Utilitas tingkat rendah

```ts
import { checkCRC, crc16, parseTLV, buildTLV } from 'qrisnamis'

crc16('123456789')            // '29B1'  (CRC-16/CCITT-FALSE)
checkCRC(payload)             // { value, expected, valid }
const entries = parseTLV(payload)
entries.map(buildTLV).join('') // kembali ke string
```

### `qrisnamis/image` — baca QRIS dari gambar

Subpath opsional; membutuhkan `zxing-wasm`. Import utama `qrisnamis` tidak memuatnya.

```ts
import { decodeQRISImage, configureDecoder } from 'qrisnamis/image'

const { payload, info, valid, errors } = await decodeQRISImage(fileOrBytes)
```

`decodeQRISImage(input, { tryHarder? })` menerima `Blob`, `File`, `ArrayBuffer`, `Uint8Array`, atau `ImageData` (PNG/JPEG/dll). Hasil: `payload` (teks QRIS), `info` (hasil `parseQRIS`), `valid` dan `errors` (hasil `validateQRIS`). Melempar `QRISError`:

- `QR_NOT_FOUND` — tidak ada QR yang terbaca di gambar.
- `NOT_QRIS` — ada QR, tetapi isinya bukan payload QRIS.

`configureDecoder(config)` menentukan dari mana binary wasm dimuat. **Opsional**: tanpa ini zxing-wasm mengambilnya dari CDN jsDelivr (butuh internet). Panggil sekali sebelum `decodeQRISImage`.

| Runtime | Konfigurasi |
| --- | --- |
| Browser + Vite | `configureDecoder({ wasmUrl })` dengan `import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'` |
| Cloudflare Workers | `configureDecoder({ wasmModule })` dengan `import wasmModule from 'zxing-wasm/reader/zxing_reader.wasm'` |
| Node / Bun (offline) | `configureDecoder({ wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) })` |

### `QRISError`

Semua kesalahan input dilempar sebagai `QRISError` dengan properti `code`:

| `code` | Penyebab | Solusi |
| --- | --- | --- |
| `INVALID_FORMAT` | TLV rusak, terpotong, atau payload kosong | Pastikan string utuh hasil decode QR |
| `INVALID_CRC` | CRC payload statis tidak cocok (mode `strict`) | Periksa payload, atau `strict: false` |
| `INVALID_AMOUNT` | Nominal ≤ 0, > 2 desimal, > 13 karakter, atau bukan angka | Perbaiki nilai `amount` |
| `INVALID_FEE` | Nilai fee tidak valid, persen > 100, atau tipe tidak dikenal | Perbaiki `fee` |
| `REFERENCE_TOO_LONG` | `referenceId` lebih dari 25 karakter | Persingkat referensi |
| `MISSING_TAG` | Tag wajib (mis. 01) tidak ada | Gunakan payload QRIS yang lengkap |
| `QR_NOT_FOUND` | (image) tidak ada QR pada gambar | Gunakan gambar yang lebih jelas/besar |
| `NOT_QRIS` | (image) QR bukan payload QRIS | Pastikan gambar adalah QRIS |

```ts
import { QRISError, toDynamicQRIS } from 'qrisnamis'

try {
  toDynamicQRIS(staticQris, { amount: -5 })
} catch (e) {
  if (e instanceof QRISError) console.log(e.code, e.message) // INVALID_AMOUNT ...
}
```

## Tips menampilkan QR

- Gunakan error correction **M** atau lebih tinggi.
- Sisakan margin (quiet zone) minimal **4 modul** di sekeliling QR.
- Jangan perkecil terlalu jauh; saat dicetak, sisi QR sebaiknya minimal ±3 cm.
- Gambar dengan latar putih dan modul hitam. Jangan dibalik (invert).

## Konsep singkat

QRIS mengikuti standar EMVCo: payload adalah rangkaian **TLV** (Tag, Length, Value) yang diakhiri CRC-16. QRIS statis tidak memuat nominal, sehingga pembayar mengetik sendiri. `toDynamicQRIS` mengubah:

| Tag | Perubahan |
| --- | --- |
| `01` | Point of Initiation `11` (statis) → `12` (dinamis) |
| `54` | Diisi nominal |
| `55` / `56` / `57` | Opsional: biaya layanan (tetap / persen / minta pembayar) |
| `62.03` | Opsional: bill number / referensi |
| `63` | CRC dihitung ulang |

Tag lain (merchant, kategori, nama, kota, dll.) dibiarkan apa adanya.

## FAQ

**Dari mana payload statis saya?** Dari gambar QRIS statis toko Anda: `decodeQRISImage` (Tutorial 1), atau scan dengan aplikasi pembaca QR. Hasilnya teks diawali `000201`. Simpan sebagai konfigurasi/secret, bukan di repositori publik.

**Apakah pembayaran otomatis terverifikasi?** Tidak. Library ini hanya membuat payload. Verifikasi pembayaran selalu lewat aplikasi/mutasi merchant resmi atau notifikasi dari penyedia Anda.

**Apakah semua acquirer menerima QR dinamis hasil modifikasi ini?** Tidak ada jaminan. Sebagian penyedia dapat tidak mendukung atau melarangnya. Pastikan sesuai ketentuan penyedia Anda dan regulasi yang berlaku.

**Bagaimana jika QRIS sudah dinamis?** `toDynamicQRIS` tetap bekerja dan mengganti nominal, fee, serta referensi.

**Mengapa library tidak menggambar QR sendiri?** Supaya tetap kecil dan tanpa dependency. Gambar QR adalah urusan library khusus (`qrcode`, `uqr`, dll.), dan hasilnya string payload yang sama.

## Traktir

qrisnamis gratis dan open source. Kalau bermanfaat, traktir kopi lewat [Trakteer](https://trakteer.id/suriyadi15/tip) atau [GitHub Sponsors](https://github.com/sponsors/suriyadi15).

## Lisensi

MIT. Baca juga `DISCLAIMER.md`.
