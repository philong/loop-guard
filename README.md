# @philongdo/pi-loop-guard

A [pi](https://pi.dev) extension for models that get stuck calling the same tool with the same arguments.

- The 3rd identical call in a row is not run. The model gets this note instead: *"Repeating it will give the same
  result. Try something else."*
- The 4th identical call in a row is not run, and the agent stops so you can step in.
- A different call, a new message from you, or a new session resets the count.
- Calls made by another tool (a codemode script, for example) are not counted.

"Identical" means the same tool name and the same arguments. Key order does not matter.

## Install

```sh
pi install git:github.com/philong/pi-loop-guard
```

## Settings

Set these environment variables before starting pi:

| Variable | Default | Meaning |
|---|---|---|
| `PI_LOOP_GUARD_BLOCK_AT` | `3` | Block the Nth identical call in a row and add a note. `0` = never. |
| `PI_LOOP_GUARD_STOP_AT` | `4` | Block the Nth identical call in a row and stop the agent. `0` = never. |

A command that you expect to repeat, such as polling a status, can trip the guard. Raise the numbers if that happens.

## Test

```sh
npm test
```

It needs Node 23.6 or newer, which runs TypeScript directly.
