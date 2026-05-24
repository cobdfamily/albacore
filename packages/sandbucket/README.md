# @cobd/sandbucket

Typed `Element` and `App` wrappers on top of
`@cobd/sandcastle`. Sandcastle gives you raw
handles; sandbucket gives you objects you can
walk, query, and act on without remembering the
wire protocol.

```ts
import { Sandbucket } from "@cobd/sandbucket";

const bucket = await Sandbucket.start();
const focused = await bucket.focused();
if (focused) {
    console.log(await focused.role());
    for (const child of await focused.children()) {
        // each child is itself an Element
    }
}
await bucket.stop();
```

## Layer in the stack

```
@cobd/core      <-- depends on
@cobd/manila    <-- depends on
@cobd/net       <-- depends on (TBD)
                       |
                       v
                @cobd/sandbucket  (typed wrappers,
                                   navigation helpers)
                       |
                       v
                @cobd/sandcastle  (transport +
                                   normalization)
                       |
                       v
                bluefin / blackfin / skipjack
                (platform AX servers)
```

Sandcastle stays narrow. Sandbucket is where
navigation logic and per-node helpers accumulate.

## License

AGPL-3.0 -- see `LICENSE` at the monorepo root.
