// Hook bootstrap. Loaded by index.html in any
// browser-capable shell. Imports @cobd/core (and
// transitively @cobd/sandbucket + @cobd/sandcastle)
// safely now that the Node-only spawn code lives in
// @cobd/bluetide; the browser bundle no longer pulls
// in child_process or fs.
//
// The host (manila's main process for Electron,
// some other glue for a pure-web shell) is
// responsible for constructing a Sandcastle via
// an IPC bridge and handing it to Sandbucket.wrap.
// Until that wiring lands, this is a no-op import
// that proves the bundle compiles end-to-end.

import { Reader } from "@cobd/core";

console.log("@cobd/hook: ready", { hasReader: typeof Reader === "function" });
