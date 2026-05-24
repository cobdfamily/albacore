# @cobd/bluetide

Node-only spawn layer for the *fin AX servers.
Picks the right binary per platform, launches it
as a child process, and hands its stdio streams to
`@cobd/sandcastle` for the protocol work.

Sandcastle stays browser-safe so it can also be
loaded into Electron renderers via IPC bridges --
all the Node-specific things (`child_process`,
`fs`, `path`) live here instead.

```ts
import { Bluetide } from "@cobd/bluetide";

const sc = await Bluetide.start();          // spawn + connect
const root = await sc.tree.getRoot();
await sc.stop();                            // kills child
```

Binary resolution:

1. `FIN_SERVER_PATH` env var.
2. Per-platform default under `bluefin/swift/.build/debug/`.

Override either via `Bluetide.start({ binaryPath })`
or the `spawn` callback for tests.

## License

AGPL-3.0 -- see `LICENSE` at the monorepo root.
