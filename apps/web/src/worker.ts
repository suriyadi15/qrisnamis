import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { QRISError, parseQRIS, toDynamicQRIS, validateQRIS } from 'qrisnamis'
import { encode, renderSVG } from 'uqr'
import { decodeQRISImage } from './decode'
import { renderPNG } from './png'

const EXAMPLE_QRIS =
  '00020101021126640012ID.DUMMY.WWW01189360000000000000010215ID12345678901230303UMI51440014ID.CO.QRIS.WWW0215ID00000000000000303UMI5204581253033605802ID5909TOKO TEST6007JAKARTA61051234562070703A016304BE67'
const MAX_UPLOAD = 1024 * 1024
const LEGAL_PATH = '/legal'

// ---------- schema ----------
const FeeSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('prompt') }),
    z.object({ type: z.literal('fixed'), value: z.union([z.number(), z.string()]) }),
    z.object({ type: z.literal('percent'), value: z.union([z.number(), z.string()]) }),
  ])
  .openapi('Fee', { example: { type: 'fixed', value: 500 } })

const DynamicBody = z
  .object({
    qris: z.string().min(1).openapi({ description: 'Payload QRIS statis (teks hasil decode QR)', example: EXAMPLE_QRIS }),
    amount: z.union([z.number(), z.string()]).openapi({ description: 'Nominal rupiah (maks 2 desimal)', example: 15000 }),
    fee: FeeSchema.optional(),
    referenceId: z.string().max(25).optional().openapi({ description: 'Bill number (tag 62.03), maks 25 karakter', example: 'INV-0001' }),
    strict: z.boolean().optional().openapi({ description: 'Tolak CRC input yang salah (default true)' }),
  })
  .openapi('DynamicRequest')

const ParseBody = z
  .object({ qris: z.string().min(1).openapi({ example: EXAMPLE_QRIS }) })
  .openapi('ParseRequest')

const ErrorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string(), issues: z.array(z.unknown()).optional() }) })
  .openapi('Error')

const QrFormat = z.enum(['svg', 'png']).default('svg')
const QrQuery = z.object({
  qris: z.string().min(1).openapi({ description: 'Payload QRIS statis', example: EXAMPLE_QRIS }),
  amount: z.string().openapi({ description: 'Nominal rupiah', example: '15000' }),
  referenceId: z.string().max(25).optional(),
  feeType: z.enum(['prompt', 'fixed', 'percent']).optional(),
  feeValue: z.string().optional(),
  format: QrFormat,
  size: z.coerce.number().int().min(1).max(40).default(8).openapi({ description: 'Piksel per modul (PNG) / skala (SVG)' }),
  margin: z.coerce.number().int().min(0).max(16).default(4),
})

// ---------- app ----------
const app = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request tidak valid',
            issues: result.error.issues,
          },
        },
        400,
      )
    }
  },
})

app.use('/api/*', cors({ origin: '*', exposeHeaders: ['X-Disclaimer'] }))
app.use('/api/*', async (c, next) => {
  await next()
  c.res.headers.set('X-Disclaimer', `Gunakan hanya QRIS milik Anda; lihat ${new URL(LEGAL_PATH, c.req.url).href}`)
})

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

app.onError((err, c) => {
  if (err instanceof QRISError || err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, 400)
  }
  console.error(err)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' } }, 500)
})

const errorResponses = {
  400: { description: 'Input tidak valid', content: { 'application/json': { schema: ErrorSchema } } },
} as const

function dynamicFromParts(p: {
  qris: string
  amount: number | string
  fee?: z.infer<typeof FeeSchema>
  referenceId?: string
  strict?: boolean
}) {
  return toDynamicQRIS(p.qris, {
    amount: p.amount,
    fee: p.fee,
    referenceId: p.referenceId,
    strict: p.strict,
  })
}

// POST /api/dynamic
app.openapi(
  createRoute({
    method: 'post',
    path: '/api/dynamic',
    tags: ['QRIS'],
    summary: 'Ubah QRIS statis menjadi dinamis',
    request: { body: { required: true, content: { 'application/json': { schema: DynamicBody } } } },
    responses: {
      200: {
        description: 'Payload QRIS dinamis',
        content: {
          'application/json': {
            schema: z.object({ payload: z.string(), merchant: z.record(z.string(), z.string().optional()) }).openapi('DynamicResponse'),
          },
        },
      },
      ...errorResponses,
    },
  }),
  (c) => {
    const body = c.req.valid('json')
    const payload = dynamicFromParts(body)
    return c.json({ payload, merchant: parseQRIS(payload).merchant }, 200)
  },
)

// POST /api/parse
app.openapi(
  createRoute({
    method: 'post',
    path: '/api/parse',
    tags: ['QRIS'],
    summary: 'Parse & validasi payload QRIS',
    request: { body: { required: true, content: { 'application/json': { schema: ParseBody } } } },
    responses: {
      200: {
        description: 'Hasil parse',
        content: {
          'application/json': {
            schema: z
              .object({ valid: z.boolean(), errors: z.array(z.string()), info: z.unknown().nullable() })
              .openapi('ParseResponse'),
          },
        },
      },
      ...errorResponses,
    },
  }),
  (c) => {
    const { qris } = c.req.valid('json')
    const { valid, errors } = validateQRIS(qris)
    let info: unknown = null
    try {
      info = parseQRIS(qris)
    } catch {
      /* sudah tercatat di errors */
    }
    return c.json({ valid, errors, info }, 200)
  },
)

// GET /api/qr
async function renderQr(payload: string, format: 'svg' | 'png', size: number, margin: number) {
  const matrix = encode(payload, { ecc: 'M', border: 0 }).data
  if (format === 'png') {
    const png = await renderPNG(matrix, size, margin)
    return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  }
  const svg = renderSVG(payload, { ecc: 'M', border: margin, pixelSize: size })
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' } })
}

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/qr',
    tags: ['QRIS'],
    summary: 'Gambar QR dinamis (SVG/PNG)',
    description: 'Cocok untuk `<img src="...">`. Mengembalikan gambar langsung.',
    request: { query: QrQuery },
    responses: {
      200: {
        description: 'Gambar QR',
        content: {
          'image/svg+xml': { schema: z.string().openapi({ format: 'binary' }) },
          'image/png': { schema: z.string().openapi({ format: 'binary' }) },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const q = c.req.valid('query')
    let fee: z.infer<typeof FeeSchema> | undefined
    if (q.feeType === 'prompt') fee = { type: 'prompt' }
    else if (q.feeType) {
      if (!q.feeValue) throw new QRISError('INVALID_FEE', 'feeValue wajib untuk fee fixed/percent')
      fee = { type: q.feeType, value: q.feeValue }
    }
    const payload = dynamicFromParts({ qris: q.qris, amount: q.amount, fee, referenceId: q.referenceId })
    return (await renderQr(payload, q.format, q.size, q.margin)) as never
  },
)

// POST /api/decode (multipart)
app.openapi(
  createRoute({
    method: 'post',
    path: '/api/decode',
    tags: ['QRIS'],
    summary: 'Baca QRIS statis dari foto/gambar',
    description:
      'Upload gambar (PNG/JPEG, maks 1 MB) berisi QR; mengembalikan teks payload QRIS beserta info merchant. ' +
      'Untuk membuat QRIS dinamis, kirim payload ke `/api/dynamic`. ' +
      'Untuk gambar besar, lebih baik decode di browser (lihat generator di landing).',
    request: {
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: z
              .object({ file: z.any().openapi({ type: 'string', format: 'binary', description: 'Gambar QR' }) })
              .openapi('DecodeRequest'),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Hasil decode',
        content: {
          'application/json': {
            schema: z
              .object({
                payload: z.string(),
                valid: z.boolean(),
                errors: z.array(z.string()),
                merchant: z.record(z.string(), z.string().optional()),
              })
              .openapi('DecodeResponse'),
          },
        },
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const file = (await c.req.parseBody())['file']
    if (!(file instanceof File)) {
      throw new ApiError('VALIDATION_ERROR', 'Field "file" wajib berupa file gambar')
    }
    if (file.size > MAX_UPLOAD) {
      throw new ApiError('FILE_TOO_LARGE', 'Ukuran gambar maksimal 1 MB')
    }
    const { payload, valid, errors, info } = await decodeQRISImage(new Uint8Array(await file.arrayBuffer()))
    return c.json({ payload, valid, errors, merchant: info.merchant }, 200)
  },
)

// ---------- meta ----------
app.doc31('/api/openapi.json', (c) => ({
  openapi: '3.1.0',
  info: {
    title: 'qrisnamis API',
    version: '0.1.0',
    description:
      'Ubah QRIS statis menjadi dinamis. Stateless — payload tidak disimpan. ' +
      `Dengan memakai API ini Anda menyetujui syarat penggunaan di ${new URL(LEGAL_PATH, c.req.url).href}. ` +
      'Gunakan hanya QRIS milik Anda sendiri atau yang Anda berwenang gunakan.',
    license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  },
  servers: [{ url: new URL(c.req.url).origin }],
}))

app.get('/api/docs', Scalar({ url: '/api/openapi.json', pageTitle: 'qrisnamis API Playground' }))

app.get('/api', (c) =>
  c.json({
    name: 'qrisnamis',
    version: '0.1.0',
    docs: new URL('/api/docs', c.req.url).href,
    openapi: new URL('/api/openapi.json', c.req.url).href,
    terms: new URL(LEGAL_PATH, c.req.url).href,
  }),
)

app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } }, 404))

// Selain /api/* dilayani oleh static assets (landing).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
