# @cobd/libbluefin

macOS-specific Element and App classes for the
Albacore screen-reader stack. Companion to the
Swift `bluefin` server in the consolidated
[`bluefin`](https://github.com/cobdfamily/bluefin)
repo -- this package is its TS-side typed wrapper.

Sandbucket picks this lib at runtime when it
connects to a `bluefin-swift` server. Linux gets
`@cobd/libblackfin`, Windows gets
`@cobd/libskipjack` -- both forthcoming.

## What lives here

The bits of `UIElement` and `UIApp` that touch raw
macOS AX attributes / actions and therefore can't
be portably expressed:

- `Element.window` (queries `AXWindow`)
- `Element.focus` (sets `AXFocused`)
- `App.activeElement` / `setActiveElement`
  (touch `AXFocusedUIElement` + `AXRaise`)
- `Element.sameAs` (position / size comparison
  semantics)

Everything else (children, parent, sibling
traversal, computeLabel, normalized getAttribute)
flows through sandcastle's canonical surface and
would work the same on any platform.

## License

AGPL-3.0 -- see `LICENSE` at the monorepo root.
