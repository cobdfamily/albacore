// Hook bootstrap. Loaded by index.html in any
// browser-capable shell. Today this is a placeholder
// that just announces itself; real wiring lands in
// Phase E.
//
// Why not import @cobd/core here?  Core depends on
// @cobd/sandbucket which depends on @cobd/sandcastle,
// which legitimately imports Node builtins
// (child_process / fs) to spawn the *fin AX binary.
// That spawn never runs in a browser -- manila's
// main process owns it and forwards results via
// IPC. To keep that work isolated until the spawn /
// browser-safe split lands in @cobd/sandcastle, hook
// stays import-free for now. Manila's renderer will
// import @cobd/core through its own bundling
// pipeline.

console.log("@cobd/hook: ready");
