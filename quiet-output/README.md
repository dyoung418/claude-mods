# quiet-output

A Claude Code mod that condenses the transcript: each run of tool calls folds
into a single dim `✓ N tools used` line (split wherever Claude posts a text
update, like the mobile interface), and tool results are hidden. Claude's own
text updates and questions are untouched.

## Install

From a terminal Claude Code session:

```
/plugin install quiet-output --marketplace ~/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope.

## Use

- `/quiet` — toggle condensed mode (the message names the state you landed in)
- `/quiet on` / `/quiet off` — force it
- **Band toggle** — a dim line above the prompt; press `ctrl+x tab` then
  `enter` to flip between condensed and full output instantly, even while a
  task is running (typed slash commands queue behind the running turn)
- `ctrl+o` — Claude Code's own transcript view, always available

While a batch is running the rollup reads `… N tools used (k running)`;
failures show `(k failed)` in red. Rows from before the mod loaded fall back
to one compact line per call.

## Develop

```
claude plugin validate ~/claude-mods/quiet-output
claude plugin test ~/claude-mods/quiet-output
```

The plugin is installed from this folder itself (a folder marketplace with a
relative source), so edits here take effect with `/reload-plugins`.
