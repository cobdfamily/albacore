// @cobd/sandcastle entry point.
//
// Skeleton -- real launcher logic lands in Phase D
// of the monorepo migration. Future shape:
//
//   const sc = await Sandcastle.start();
//   const root = await sc.tree.getRoot();
//
// `start()` picks the right *fin binary for the
// host OS, spawns it, hooks stdio, sends the first
// JSON-RPC request after the welcome notification.
// All raw AX names from the wire are normalized
// through @cobd/currentmap before reaching the
// caller.

export const version = "0.0.0";
