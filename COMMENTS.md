# cobdfamily comment standard

Short tutorial for what to comment, what not to, and
how to phrase it. Codifies the style already used
across brian / dispatch / ringo so future edits stay
consistent.

## The rule of thumb

Comments answer **why**. Code answers **what**.

Before you write a comment, ask: would a competent
reader skimming this file in six months know this
fact from the identifier names + the surrounding
code? If yes, skip the comment. If no, write it.

## When to write a comment

**Always.** These cases are not optional:

1. **Public function / method / class.** Module-
   level docstring + per-function docstring. State
   the purpose, the contract a caller depends on,
   and any non-obvious failure mode.

   ```python
   async def channel_record(...) -> None:
       """POST /channels/{id}/record. terminate_on must
       be one of {none, any, *, #}; arbitrary digits
       400. v0.25 _ari_terminate_on maps TwiML's
       finishOnKey -> the ARI enum."""
   ```

2. **Magic constants.** Numbers, regex, byte
   sequences, timeouts. Explain derivation.

   ```python
   _BATCH_CAP = 500  # ~one IVR's worth; far more
                     # is a smell. Pinned by E2E.
   ```

3. **Workarounds for external quirks.** Name the
   upstream (asterisk, Twilio, ARI, browser),
   what it does wrong, and where it surfaced.

   ```python
   # Asterisk returns 500 "Allocation failed" instead
   # of [] when the recording spool dir is empty.
   # Absorb that specific shape; everything else
   # bubbles as AriError. Caught by v0.24 E2E.
   ```

4. **State machine transitions / event ordering.**
   Anything where "this must come before that" or
   "this branch fires once per session."

   ```python
   # aor + auth must PUT before endpoint -- asterisk
   # validates references at endpoint-creation time.
   ```

5. **Why this *isn't* a more obvious shape.** If
   you considered + rejected an obvious design,
   say so. Saves the next reader the same
   investigation.

   ```python
   # We use sed targeting @@TOKEN@@ rather than
   # envsubst because envsubst would replace every
   # $VAR-shaped string, including literal "$VAR"
   # fragments in URIs and dialplan macros.
   ```

## When NOT to write a comment

1. **What the next line does.** If `for u in users:`
   is preceded by `# iterate users`, delete it.

2. **Restating identifier names.** `# Counter for
   requests` above `request_counter = 0` adds noise.

3. **TODOs without an owner or trigger.** `# TODO:
   make this faster` rots. Either fix it now, file
   an issue, or include a concrete condition that
   would trigger the work.

4. **Echoes of the changelog.** The CHANGELOG holds
   release-level history. Code comments only repeat
   it when the *current* code shape depends on a
   prior decision the reader needs (the "v0.24
   absorbs the asterisk 500" comment qualifies; "in
   v0.4 we added /v1/cache/warm" doesn't).

## Style

- **First person plural ("we") for design choices.**
  "We use sed because envsubst would..." reads as
  the team's voice, not a single author's note.

- **Imperative + present tense for shape.** "PUT
  the auth first" not "The auth was PUT first."

- **Wrap at ~60 chars** inside docstrings; ~70 for
  inline `#` comments. Long lines lose readability
  in side-by-side diffs.

- **Reference releases by version** (`v0.24`) not
  date or commit sha. SHAs rot; versions are
  CHANGELOG-anchored.

- **Name the upstream quirk.** "Asterisk does X" >
  "the server does X." If it ever changes, the
  next reader knows where to file the bug.

- **Pair every "pinned by" or "caught by" comment
  with a test or E2E reference.** Floating "pinned
  by test" without saying which test means the
  comment can't be verified.

## Touching a file = auditing its comments

Every edit pass must scan the file for stale
comments:

- Version mentions (`v0.X`) that no longer apply
  because behavior changed.
- "TODO" / "FIXME" / "for now" that have been "for
  now" for two releases.
- References to functions / fields / endpoints
  that were renamed or removed.
- "Pre-vX.Y" historical notes that have been
  current-behavior for >1 minor version (promote
  to current-tense or delete).

Fix or delete in the same commit. Don't leave a
trail.

## Docstring shape (Python)

```python
"""One-line summary, imperative, ends with period.

Optional longer paragraph explaining caller-facing
behavior and any non-obvious failure mode. State
the contract callers depend on -- return shape,
side effects, what raises and when. No types
(annotations carry that load).

Reference releases, RFCs, upstream bugs, or
companion tests where they sharpen the why.
"""
```

We don't use a parameter / return field grammar
(numpy / Google) because type annotations carry the
shape and our prose handles intent.

## Module-level docstring shape

Module docstrings name the file's job + its
surface. The file is the unit of operator attention.

```python
"""brian FastAPI app.

  GET    /                         liveness
  GET    /v1/health                rolled up
  ...

Optional bearer-token auth on /v1/* via
BRIAN_API_TOKENS; liveness GET / stays open.
"""
```

If the module has a discoverable surface (HTTP
routes, ARI verbs, CLI subcommands), list it. The
docstring becomes the file's table of contents.

## TL;DR

- Write WHY. Skip WHAT.
- Comment magic constants, workarounds, ordering,
  rejected-alternatives, public surface.
- Audit comments every time you touch a file.
- Reference versions, tests, and upstream quirks
  by name.
- Don't apologize ("kind of a hack") or
  philosophize ("interesting design choice").
  State the fact and move on.
