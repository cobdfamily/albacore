# @cobd/libskipjack

Windows-specific Element and App classes for the
Albacore screen-reader stack. Companion to the
(planned) **skipjack** server -- the *fin binary
that brokers UI Automation / MSAA.

Stub today: classes compile and match
[`@cobd/libbluefin`](../libbluefin)'s constructor
shape so `@cobd/sandbucket` has somewhere real to
point when a Windows *fin server connects. Method
bodies that touch platform-specific things throw
`"not implemented"` until the wire server lands.

## What needs filling in

Once the skipjack server defines its protocol-level
focus / window primitives, port the corresponding
method bodies from libbluefin:

- `Element.window`
- `Element.focus`
- `App.activeElement`
- `App.setActiveElement`

The cross-platform methods (children, parent,
sibling traversal, computeLabel, sameAs) already
go through sandcastle's normalized layer and need
nothing platform-specific.

## License

AGPL-3.0 -- see `LICENSE` at the monorepo root.
