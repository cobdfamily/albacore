# @cobd/hook

The small browser host page that loads `@cobd/core`.
Electron (`@cobd/manila`) points its renderer at the
built `hook` bundle; any other browser-capable
runtime can do the same.

Hook exists so `@cobd/core` can stay pure-library:
core has no DOM bootstrap, no script tag, no
window wiring. Hook owns those.

## Status

Skeleton -- a stub `index.html` and a placeholder
`main.ts`. Real build pipeline (esbuild bundling
core + transformations) lands in Phase C.

## License

AGPL-3.0 -- see `LICENSE` at the monorepo root.
