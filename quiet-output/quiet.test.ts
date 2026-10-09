import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

test('an untracked tool call draws as one condensed line', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'quiet-output',
      surface,
      component: 'ToolUse',
      props: {
        tool_use_id: `toolu_call_${surface}`,
        tool: 'Bash',
        input: { command: 'ls -la', description: 'List files' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output: { stdout: 'raw-listing-output', stderr: '' },
      },
      requestId: `toolu_call_${surface}`,
    })

    expect(
      await ui.find({ type: 'Text', text: /Bash — List files/ }),
    ).toBeDefined()
    expect(await ui.find({ text: /raw-listing-output/ })).toBeUndefined()
  }
})

test('a tool result draws nothing while condensed', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'quiet-output',
      surface,
      component: 'ToolResult',
      props: {
        tool_use_id: `toolu_result_${surface}`,
        tool: 'Bash',
        output: { stdout: 'noisy output', stderr: '' },
        isErrored: false,
      },
      requestId: `toolu_result_${surface}`,
    })

    expect(await ui.find({ text: /noisy output/ })).toBeUndefined()
  }
})

test('a run of calls folds into one rollup on its last row', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))

  await $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'ls', description: 'List files' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'c2', command: 'pwd', description: 'Print directory' })

  const props = (id: string, what: string) => ({
    tool_use_id: id,
    tool: 'Bash',
    input: { command: 'x', description: what },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output: { stdout: '', stderr: '' },
  })

  const first = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'ToolUse',
    props: props('c1', 'List files'),
    requestId: 'c1',
  })
  expect(await first.find({ text: /tools used/ })).toBeUndefined()
  expect(await first.find({ text: /List files/ })).toBeUndefined()

  const last = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'ToolUse',
    props: props('c2', 'Print directory'),
    requestId: 'c2',
  })
  expect(await last.find({ text: /2 tools used/ })).toBeDefined()
})

test('assistant text starts a new rollup group', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  on('classic.MessageDisplay', () => ({}))

  await $.tool.call({ tool: 'Bash', tool_use_id: 'd1', command: 'ls' })
  await $.classic.MessageDisplay({
    turn_id: 'turn',
    message_id: 'message',
    index: 0,
    final: true,
    delta: 'Found it — now checking the config.\n',
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'd2', command: 'pwd' })

  const props = (id: string) => ({
    tool_use_id: id,
    tool: 'Bash',
    input: { command: 'x' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output: { stdout: '', stderr: '' },
  })

  const before = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'ToolUse',
    props: props('d1'),
    requestId: 'd1',
  })
  expect(await before.find({ text: /1 tool used/ })).toBeDefined()

  const after = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'ToolUse',
    props: props('d2'),
    requestId: 'd2',
  })
  expect(await after.find({ text: /1 tool used/ })).toBeDefined()
})

test('the band button flips condensed mode immediately', async $ => {
  const band = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { bodyColumns: 80 },
  })

  expect(await band.find({ text: /condensed — show full output/ })).toBeDefined()

  await band.press({ key: 'toggle' })
  expect(await band.find({ text: /full output — condense/ })).toBeDefined()

  await band.press({ key: 'toggle' })
  expect(await band.find({ text: /condensed — show full output/ })).toBeDefined()
})

test('bare /quiet toggles and names the resulting state', async $ => {
  const first = await $.command.run({ command: 'quiet', args: '', ...RUN })
  expect(first.text).toContain('Quiet mode OFF')

  const second = await $.command.run({ command: 'quiet', args: '', ...RUN })
  expect(second.text).toContain('Quiet mode ON')

  const usage = await $.command.run({ command: 'quiet', args: 'bogus', ...RUN })
  expect(usage.text).toContain('Usage')
})

test('/quiet off restores the engine’s full drawing; /quiet on condenses again', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))
  on('ui.render', { component: 'ToolResult' }, ($engine, e) => {
    const { Text } = $engine.ui.resolve(e)

    return Text({ children: ['engine-drawn result'] })
  })

  await $.tool.call({ tool: 'Bash', tool_use_id: 'f1', command: 'ls' })

  const expanded = await $.command.run({ command: 'quiet', args: 'off', ...RUN })
  expect(expanded.text).toContain('Quiet mode OFF')

  const resultProps = {
    tool_use_id: 'f1',
    tool: 'Bash',
    output: { stdout: 'noisy output', stderr: '' },
    isErrored: false,
  }
  const full = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'ToolResult',
    props: resultProps,
    requestId: 'f1',
  })
  expect(await full.find({ text: /engine-drawn result/ })).toBeDefined()

  const quieted = await $.command.run({ command: 'quiet', args: 'on', ...RUN })
  expect(quieted.text).toContain('Quiet mode ON')

  const hidden = await $.ui.mount({
    plugin: 'quiet-output',
    surface: 'terminal',
    component: 'ToolResult',
    props: resultProps,
    requestId: 'f1-again',
  })
  expect(await hidden.find({ text: /engine-drawn result/ })).toBeUndefined()
})
