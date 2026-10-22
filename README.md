# qrisnamis

[![npm version](https://img.shields.io/npm/v/qrisnamis?logo=npm&color=cb3837)](https://www.npmjs.com/package/qrisnamis)
[![npm downloads](https://img.shields.io/npm/dm/qrisnamis?logo=npm&color=cb3837)](https://www.npmjs.com/package/qrisnamis)
[![bundle size](https://img.shields.io/bundlephobia/minzip/qrisnamis?label=minzipped)](https://bundlephobia.com/package/qrisnamis)
[![types](https://img.shields.io/npm/types/qrisnamis?logo=typescript&logoColor=white)](https://www.npmjs.com/package/qrisnamis)
[![CI](https://img.shields.io/github/actions/workflow/status/suriyadi15/qrisnamis/ci.yml?branch=main&label=CI&logo=github)](https://github.com/suriyadi15/qrisnamis/actions/workflows/ci.yml)
[![Deploy](https://img.shields.io/github/actions/workflow/status/suriyadi15/qrisnamis/deploy.yml?branch=main&label=deploy&logo=cloudflare&logoColor=white)](https://github.com/suriyadi15/qrisnamis/actions/workflows/deploy.yml)
[![license](https://img.shields.io/github/license/suriyadi15/qrisnamis)](./LICENSE)
[![stars](https://img.shields.io/github/stars/suriyadi15/qrisnamis?style=flat&logo=github)](https://github.com/suriyadi15/qrisnamis)
[![demo](https://img.shields.io/badge/demo-qrisnamis.pages.dev-f38020?logo=cloudflare&logoColor=white)](https://qrisnamis.pages.dev)

Library TypeScript, API gratis (Cloudflare Pages), dan generator web untuk mengubah **QRIS statis → dinamis**.

> ⚠️ **Disclaimer:** proyek independen, tidak berafiliasi dengan Bank Indonesia/ASPI/penyedia pembayaran mana pun. Gunakan hanya QRIS milik Anda atau yang Anda berwenang gunakan. Tanpa jaminan; pengembang tidak bertanggung jawab atas penggunaan. Lihat [DISCLAIMER.md](./DISCLAIMER.md).

```
packages/qrisnamis   library npm (zero dependency)
apps/web             satu proyek Cloudflare Pages: API (Hono + OpenAPI) + landing (Astro)
```

## Pengembangan

```bash
bun install
bun run test          # test library
bun run build:lib     # build library (dist ESM + CJS + d.ts)
bun run dev           # build landing + wrangler pages dev di :8788
bun run deploy        # build landing + wrangler pages deploy
```

## Library

Dokumentasi lengkap: [packages/qrisnamis/README.md](./packages/qrisnamis/README.md) (juga tampil di `/docs` pada situs). Ringkas:

```ts
import { toDynamicQRIS, parseQRIS } from 'qrisnamis'
import { decodeQRISImage } from 'qrisnamis/image' // opsional, butuh zxing-wasm

const { payload } = await decodeQRISImage(file)
const dynamic = toDynamicQRIS(payload, { amount: 15000 })
```

## API

Playground interaktif di `/api/docs`, spesifikasi OpenAPI di `/api/openapi.json`.

- `POST /api/dynamic` — `{ qris, amount, fee?, referenceId? }` → `{ payload, merchant }`
- `POST /api/parse` — `{ qris }` → validasi + info
- `GET /api/qr?qris=…&amount=…&format=svg|png` — gambar QR
- `POST /api/decode` — multipart `file` (gambar ≤ 1 MB) → `{ payload, valid, errors, merchant }`. Hanya decode; untuk membuat dinamis lanjutkan ke `/api/dynamic`.

Catatan: batas CPU Workers gratis ±10 ms; `/api/decode` pada gambar besar bisa melewatinya. Generator di landing men-decode di browser dan tidak terkena batas ini.

## Rilis

- **npm:** push tag `v*` → workflow `release.yml` (butuh secret `NPM_TOKEN`).
- **Situs + API (Pages, https://qrisnamis.pages.dev):** push ke `main` → `deploy.yml` (butuh secret `CLOUDFLARE_API_TOKEN` dengan izin Cloudflare Pages: Edit, dan `CLOUDFLARE_ACCOUNT_ID`).

## Lisensi

MIT. Baca juga [DISCLAIMER.md](./DISCLAIMER.md).
