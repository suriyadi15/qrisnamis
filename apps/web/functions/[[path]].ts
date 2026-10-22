import app from '../src/worker'

export const onRequest: PagesFunction<Env> = (ctx) =>
  app.fetch(ctx.request, ctx.env, {
    waitUntil: (p) => ctx.waitUntil(p),
    passThroughOnException: () => ctx.passThroughOnException(),
    props: ctx.data,
  })
