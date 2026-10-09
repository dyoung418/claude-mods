import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { QuietCall } from '../types'

const condensed = atom(
  { plugin: 'quiet-output', key: 'isCondensed' } as const,
  true,
)
const calls = atom({ plugin: 'quiet-output', key: 'calls' } as const, [])

const shorten = (text: string, max = 64): string => {
  const line = text.split('\n')[0] ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const summarize = (tool: string, input: unknown): string => {
  const fields = (input ?? {}) as Record<string, unknown>
  const field = (key: string): string | undefined =>
    typeof fields[key] === 'string' ? (fields[key] as string) : undefined
  const path = field('file_path') ?? field('path') ?? field('notebook_path')

  switch (tool) {
    case 'Bash':
      return field('description') ?? field('command') ?? ''
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return path === undefined ? '' : (path.split('/').pop() ?? path)
    case 'Grep':
    case 'Glob':
      return field('pattern') ?? ''
    case 'Agent':
    case 'Task':
      return field('description') ?? ''
    case 'WebFetch':
      return field('url') ?? ''
    case 'WebSearch':
      return field('query') ?? ''
    case 'Skill':
      return field('skill') ?? ''
    default:
      return ''
  }
}

const rollup = (
  $: EngineInterface,
  e: RenderInput<'ToolUse' | 'ToolGroup'>,
  members: readonly QuietCall[],
) => {
  const { Box, Text } = $.ui.resolve(e)
  const running = members.filter(m => m.state === 'run').length
  const failed = members.filter(m => m.state === 'err').length
  const noun = members.length === 1 ? 'tool used' : 'tools used'
  const head = [
    `${running > 0 ? '…' : failed > 0 ? '✗' : '✓'} ${members.length} ${noun}`,
    running > 0 ? `(${running} running)` : '',
    failed > 0 ? `(${failed} failed)` : '',
  ]
    .filter(part => part !== '')
    .join(' ')

  return (
    <Box>
      {failed > 0 && running === 0 ? (
        <Text color="red">{head}</Text>
      ) : (
        <Text dimColor>{head}</Text>
      )}
    </Box>
  )
}

export const register: Register = on => {
  let group = 0
  let pendingBreak = true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quiet',
      description:
        'Toggle condensed tool output ("N tools used" rollups); "/quiet on" or "/quiet off" forces it',
      argumentHint: '[on|off]',
    })

    const known = await read($, calls)
    group = known.reduce((top, c) => Math.max(top, c.group), 0)
    pendingBreak = true

    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    pendingBreak = true

    return next(e)
  })

  on('classic.MessageDisplay', ($, e, next) => {
    if (e.delta.trim() !== '') {
      pendingBreak = true
    }

    return next(e)
  })

  on('command.run', { command: 'quiet' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return {
        text: 'Usage: /quiet (toggle), /quiet on (condense), /quiet off (full output).',
      }
    }

    const isOn = await update($, condensed, value =>
      arg === '' ? !value : arg === 'on',
    )

    return {
      text: isOn
        ? 'Quiet mode ON — tool activity folds into "N tools used" rollups. /quiet off (or the band toggle) brings full detail back.'
        : 'Quiet mode OFF — tool calls and results are shown in full. /quiet on condenses them again.',
    }
  })

  on('tool.call', async ($, e, next) => {
    if (typeof e.agentId === 'string' || typeof e.tool_use_id !== 'string') {
      return next(e)
    }

    if (pendingBreak) {
      group += 1
      pendingBreak = false
    }

    const mine: QuietCall = {
      id: e.tool_use_id,
      tool: e.tool,
      what: shorten(summarize(e.tool, e)),
      group,
      state: 'run',
    }
    await update($, calls, list => [...list, mine].slice(-400))

    const ran = await next(e)
    const answer = ran as { deny?: string; isError?: boolean }
    const failed = answer.deny !== undefined || answer.isError === true
    await update($, calls, list =>
      list.map(c =>
        c.id === mine.id ? { ...c, state: failed ? 'err' : 'ok' } : c,
      ),
    )

    return ran
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, condensed))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, calls)
    const entry = list.find(c => c.id === e.props.tool_use_id)

    if (entry === undefined) {
      const { tool, input, isRunning, isErrored, isInterrupted } = e.props
      const mark = isRunning
        ? '…'
        : isInterrupted
          ? '⊘'
          : isErrored
            ? '✗'
            : '✓'
      const what = shorten(summarize(tool, input))
      const line = what === '' ? `${mark} ${tool}` : `${mark} ${tool} — ${what}`

      return (
        <Box>
          {isErrored ? (
            <Text color="red">{line}</Text>
          ) : (
            <Text dimColor>{line}</Text>
          )}
        </Box>
      )
    }

    const members = list.filter(c => c.group === entry.group)
    const last = members[members.length - 1]

    if (last === undefined || last.id !== entry.id) {
      return <Box />
    }

    return rollup($, e, members)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const isOn = await read($, condensed)

    return (
      <Box>
        <Button
          plain
          key="toggle"
          onPress={() => update($, condensed, value => !value)}
        >
          <Text dimColor>
            {isOn
              ? 'tools: condensed — show full output (ctrl+x tab, enter)'
              : 'tools: full output — condense (ctrl+x tab, enter)'}
          </Text>
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, condensed)) || e.props.isExpanded) {
      return next(e)
    }

    const list = await read($, calls)
    const ids = new Set(
      e.props.calls
        .map(c => c.tool_use_id)
        .filter((id): id is string => typeof id === 'string'),
    )
    const known = list.filter(c => ids.has(c.id))

    if (known.length === 0) {
      return next(e)
    }

    const ending = [...new Set(known.map(c => c.group))].filter(g => {
      const members = list.filter(c => c.group === g)
      const last = members[members.length - 1]

      return last !== undefined && ids.has(last.id)
    })
    const { Box } = $.ui.resolve(e)

    if (ending.length === 0) {
      return <Box />
    }

    return (
      <Box flexDirection="column">
        {ending.map(g =>
          rollup(
            $,
            e,
            list.filter(c => c.group === g),
          ),
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, condensed))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const error =
      e.props.isErrored && typeof e.props.output === 'string'
        ? shorten(e.props.output)
        : ''

    if (error === '') {
      return <Box />
    }

    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    )
  })
}
