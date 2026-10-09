export type QuietCall = {
  id: string
  tool: string
  what: string
  group: number
  state: 'run' | 'ok' | 'err'
}

declare module 'claude-code' {
  interface PluginState {
    'quiet-output': {
      isCondensed: boolean
      calls: QuietCall[]
    }
  }
}
