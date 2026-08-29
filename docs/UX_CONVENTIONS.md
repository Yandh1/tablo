# Tablo UX conventions

## Status and precedence

This document supplements `.codex/PRODUCT.md` with the guided-editor, live draft diagram, camera, layout, animation, and pane-expansion behavior requested after the product specification was written.

When this document and the product specification differ on those subjects, this document is the newer product decision. A current user request can still override both.

## Experience direction

Reading this as a desktop-first developer productivity application for backend and full-stack users, with a precise, calm, tool-like visual language and enough character to avoid generic dashboard styling.

- Design variance: 4/10. The 50/50 workspace is disciplined and functional, with subtle asymmetry inside panels rather than decorative layout tricks.
- Motion intensity: 5/10. Motion explains creation, re-layout, focus, and view changes. Nothing loops for decoration.
- Visual density: 7/10. This is a working surface, but controls are grouped and progressive rather than permanently crowding the canvas.
- Use one neutral family, one accent color, one radius system, and one icon family.
- Use a legible UI sans for controls and a mono family for SQL, identifiers, types, shortcuts, and diagnostic coordinates.
- Avoid AI-purple gradients, broad glassmorphism, outer glows, fake terminal decoration, oversized marketing typography, and decorative status dots.

The referenced `design-taste-frontend` skill explicitly excludes code editors and dense product UI. Apply its anti-slop, accessibility, consistency, state-completeness, and preflight principles here. Do not apply its landing-page image, hero, logo-wall, or marketing-section rules to the workspace.

## Workspace composition

### Desktop

- At 1024 px and wider, the workspace opens at exactly 50% editor and 50% diagram when no saved preference exists.
- The divider supports pointer drag, keyboard increments, and double-click reset to 50/50.
- The standard adjustable range is 25/75 through 75/25.
- Each pane has an expand action with three stable states: editor focus, balanced, and diagram focus. These correspond to 75/25, 50/50, and 25/75.
- Each pane also has a full-workspace action. Full-workspace mode hides the other pane without destroying its editor, parse, selection, layout, or viewport state.
- `Escape` exits full-workspace mode and restores the prior split ratio and focus.
- Pane controls have visible labels in tooltips and accessible names. They are not discoverable only by icon shape.

### Responsive

- From 768 px through 1023 px, use Editor and Diagram tabs. Preserve both mounted states when memory and Monaco behavior permit; otherwise preserve all serializable state before unmounting.
- Below 768 px, use the same tabs and a compact action menu. Viewing, diagnostics, save, snapshot, and export remain reachable. Full mobile authoring is not an MVP quality target.
- Do not compress the desktop split below usable minimum widths.

## Editor modes

### Mode choice

Every project has an explicit authoring mode:

- Guided: structured table blocks generate supported PostgreSQL DDL.
- Manual: Monaco exposes the source as a normal PostgreSQL SQL document.

The mode selector is near the input-format control, not hidden in settings. Its label describes the consequence: `Guided blocks` or `Manual SQL`.

- New empty projects may default to Guided, but the chosen mode is stored per project.
- Pasted SQL and imported source open in Manual unless it can be represented losslessly as guided blocks.
- Never switch modes silently.

### Safe switching

- Guided to Manual is always possible because guided blocks serialize to supported SQL. Show a short confirmation that manual edits may make lossless return unavailable.
- Manual to Guided is allowed only when the entire source can be represented without dropping or rewriting unsupported statements, comments that must be preserved, constraint names, or expressions.
- When lossless conversion is impossible, keep Manual active and list the blocking constructs. Offer to copy or export the current SQL, not a destructive conversion.
- Mode switching does not create a save race. Complete or cancel the current parse/save revision before committing the mode change.

## Guided table blocks

### Protected first block

- Guided mode begins with one pre-created table block. Its structural shell represents `CREATE TABLE <table name> ( <columns> );`.
- The first block cannot be deleted. The user can clear editable values, but the block shell remains.
- `CREATE TABLE`, punctuation, parentheses, commas, and the terminator are structural tokens, not editable placeholder text.
- Table name, column name, data type, nullability, default, key, uniqueness, references, and referential actions are editable fields with programmatic labels.
- Empty fields display examples as placeholders, never as values that would be saved or parsed.

### Adding tables and columns

- A discrete add-table button appears between table blocks and directly below the final block on hover or keyboard focus.
- Hover cannot be the only access path. The add button remains reachable through tab order and is persistently visible on touch/coarse-pointer devices.
- The button label is `Add table`; the visible glyph may be `+`.
- New tables receive stable draft IDs immediately.
- Every table has an always-reachable `Add column` action. Rows support keyboard reordering and a clear delete action.
- Additional empty table blocks may be deleted. If a non-empty block is deleted, provide an undo toast or confirmation based on whether the action has already autosaved.

### Source representation

- Guided blocks are not a second canonical schema language. They are a structured authoring surface that serializes to the supported PostgreSQL subset.
- Keep a versioned `GuidedDraft` model separate from `SchemaIR`.
- Serialization is deterministic. The same guided draft produces byte-stable formatted SQL unless the formatting version changes.
- The generated SQL remains inspectable. A read-only source preview or `View generated SQL` action prevents the guided mode from becoming opaque.

## Diagnostics and correction help

Every diagnostic includes:

- Stable code, severity, exact range, and one-sentence message.
- A short `Why this happened` explanation.
- A short `How to fix it` action using the user's table and column names when safe.
- Related source locations for missing or conflicting references.
- An example only when it adds information beyond the fix sentence.

Diagnostics appear in both the editor and Problems panel. Selecting a problem focuses the exact field or Monaco range. Do not rely on color alone.

Message pattern:

```text
PGSD1203 Foreign key column count does not match
Why this happened: (tenant_id, user_id) references a key with one column.
How to fix it: Reference two unique columns, or remove one local column from the foreign key.
```

- Do not say only `Invalid syntax`, `Unexpected token`, or `Parse failed` when the parser has enough context to be specific.
- Keep the user's invalid draft. A correction must never be implemented by deleting unsupported text automatically.
- Worker or parser failures are operational errors, not syntax errors. Present retry and preserve source.

## Draft projection and canonical state

The request to show a diagram entity as soon as a table exists, even while empty, requires two projections:

1. `DraftDiagramProjection` for provisional guided blocks and safely recognized partial manual declarations.
2. `SchemaIR` projection for validated, exportable structure.

Rules:

- A provisional table node appears as soon as a table shell has a stable draft ID.
- Provisional nodes are visibly marked `Draft` through text and styling, not color alone.
- Empty names display `Untitled table`; empty columns display an instructional empty row rather than fabricated schema content.
- Draft nodes never enable SQL, JSON, SVG, or PNG export as if they were valid schema entities.
- A successful parse atomically reconciles a draft node with its stable canonical table ID and removes the draft marker.
- An invalid edit after a valid parse keeps canonical content visible and marks affected draft changes separately from the last-valid schema.
- Do not place provisional objects inside persisted `SchemaIR`.

## Live name mirroring

- Table and column names mirror into their diagram node while the user types.
- Guided mode mirrors directly from `GuidedDraft`; it does not wait for a full parse.
- Manual mode may mirror from a tolerant lexical projection only when the declaration can be identified without guessing. Otherwise, wait for the parser and keep the last known label.
- The diagram text updates directly. Do not replay a character animation, scramble, or typewriter effect for every keystroke.
- Throttle only the diagram render work, not the input. Aim for the next animation frame for label updates and the normal 200-350 ms debounce for full parsing.
- Preserve text selection, editor focus, and undo history during mirroring.

## Diagram creation and layout motion

### New entity entrance

- A new table node uses one restrained GSAP entrance on its inner visual wrapper: opacity plus a small vertical offset and scale near 0.96 to 1.
- The entrance may have a light overshoot or spring-like ease, but it must settle within roughly 450 ms and never begin at scale 0.
- Do not animate React Flow's node-position transform. React Flow owns `.react-flow__node`; GSAP owns a nested presentation element.
- Reduced motion uses an instant appearance or short opacity-only transition.

### Incremental auto-layout

- Creating a table schedules incremental layout after its draft node exists.
- Place the new table near related tables when references are known, otherwise in the nearest non-overlapping free region.
- Re-layout unpinned nodes to maintain readable spacing and edge routing.
- Never move pinned/manual nodes automatically. If all readable placements require moving them, place the new node safely and offer `Re-layout all`.
- Full re-layout that moves pinned nodes is always explicit and previews or confirms the consequence.
- Keep deterministic ordering so the same schema and pinned state do not jitter between parses.

### Camera behavior

- After a new table is placed, fit the complete diagram bounds into view so the new center is visible.
- If the user is actively dragging, panning, zooming, editing a diagram control, or using a screen-reader virtual cursor, queue the fit until that interaction ends. Do not fight active input.
- Use the React Flow viewport API for pan, zoom, and fit behavior. Do not tween the internal viewport DOM transform with GSAP.
- Keep the camera transition brief, cancellable by new pointer or wheel input, and free of overshoot.
- Preserve the prior viewport long enough to offer `Undo view change` when automatic fitting creates a large jump.
- The user can pan and zoom freely immediately after the fit.

### Center and inspection controls

- `Ctrl+0` on Windows/Linux and `Command+0` on macOS fit the full diagram to view.
- A visible `Fit diagram` control exposes the same behavior.
- `F` may focus the selected table only when focus is outside text inputs and the shortcut is documented.
- Search focuses a node without changing the user's pinned positions.
- Zoom controls, minimap, fit action, and current zoom are keyboard operable and have accessible names.

## Selection and cross-navigation

- Selecting a canonical table highlights its source declaration.
- Selecting a draft node focuses its guided table-name field or partial manual declaration.
- Selecting a column focuses its exact field or source span.
- Selecting an edge focuses the foreign key and exposes ordered column mapping and referential actions as text.
- Editor and diagram selection are synchronized by stable IDs, not display names.
- Focus movement is deliberate. A hover or parse update never steals keyboard focus.

## Status and recovery

Keep parse and save state separate:

- Parse: Idle, Parsing, Valid, Valid with warnings, Invalid, Failed.
- Save: Clean, Dirty, Saving, Saved, Failed, Conflict.

Additional diagram states:

- Draft changes: provisional guided/manual projection is newer than the last-valid IR.
- Showing last valid schema: current source is invalid and canonical diagram content is stale.
- Layout pending: a node exists but incremental layout has not completed.

Use persistent, contextual status for save failure, conflict, stale schema, and worker failure. Reserve transient toasts for successful reversible actions and undo.

## Accessibility and input conventions

- Target WCAG 2.2 AA.
- The splitter, tabs, pane actions, guided fields, Problems list, canvas controls, dialogs, and menus are keyboard operable with visible focus.
- Hover-revealed actions also appear on focus-within and coarse-pointer devices.
- PK, FK, UQ, draft state, diagnostic severity, and selection are never conveyed by color alone.
- Relationships have text details outside the line itself.
- Do not override browser or Monaco shortcuts without a documented product-specific need.
- Use platform-aware shortcut labels.
- Announce table creation, deletion, completed layout, parse errors, save failures, and conflicts through appropriately polite live regions. Do not announce every mirrored character.
- All GSAP and Framer Motion behavior honors reduced motion. Disable camera animation and bounce, but still complete the state change.

## Performance conventions

- Keep editor typing independent from parsing, layout, persistence, and animation.
- Parse and validate in a worker with monotonic revisions. Discard stale results.
- Avoid React state updates for continuous pan, zoom, pointer, or animation values.
- Profile 10, 50, and 100-table fixtures separately for parse, validation, projection, layout, and render time.
- Lazy-load Monaco and other heavy client-only modules.
- Do not re-fit or re-layout for column-name changes, ordinary typing, diagnostics-only changes, or metadata that does not alter node size.
- Coalesce node-size measurement and layout invalidation after column additions or removals.

## Additional acceptance checks

- Guided mode always retains one undeletable empty table shell.
- Add-table is usable with pointer, keyboard, and touch.
- Manual-to-guided conversion never loses source constructs.
- An empty draft table appears in the diagram but is not exportable.
- Table and column labels mirror without waiting for a full valid parse.
- Node entrance does not fight React Flow positioning.
- Creating a table incrementally lays out unpinned nodes and then fits the full diagram.
- Active pan or drag cancels or delays automatic camera movement.
- `Ctrl/Command+0` restores the centered fit view.
- Expanding or maximizing either pane preserves the hidden pane's state and `Escape` restores the prior split.
- Reduced-motion users receive the same information and final states without bounce or animated camera travel.
