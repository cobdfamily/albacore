# @cobd/sandcastle

Per-platform launcher for the `*fin` Bluefin protocol
servers. Picks the right binary for the host OS,
spawns it as a child process, and brokers
line-delimited JSON-RPC over its stdin/stdout.
Normalizes the raw AX names that come back through
`@cobd/currentmap` before handing them to consumers.

## Why a launcher

Each platform has a different AX server binary:

| Platform | Binary       | Repo           |
| -------- | ------------ | -------------- |
| macOS    | bluefin      | bluefin-swift  |
| Linux    | blackfin     | (planned)      |
| Windows  | skipjack     | (planned)      |

Consumers (manila, future web hosts) shouldn't care
which one is running -- they get a uniform Node API.

## Status

Skeleton only. See the implementation plan in
`docs/PLAN.md` once it lands.

## License

AGPL-3.0 -- see `LICENSE` at the monorepo root.
