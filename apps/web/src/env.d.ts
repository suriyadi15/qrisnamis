declare module '*.wasm' {
  const mod: WebAssembly.Module
  export default mod
}

interface Env {
  ASSETS: Fetcher
}
