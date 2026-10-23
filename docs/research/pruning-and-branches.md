# Pruning and "View family branch" (live capture, 2026-10-23)

Source: MyHeritage `get-tree-layout.php` response (`maxProximityLevel=7`,
`maxIndividualsAfterPrune=1000`), read from the site's localStorage cache for
the user's 186-person tree, roots Beka Bub Fekeme (64 cards) and Kesabufukubu
Kamemuku (35 cards). Raw per-card data lives in `.scratch/real/` (gitignored,
personal data); `bun .scratch/real/compare.ts <truth>` diffs our layout.

## Who is shown (root R)

1. R, R's spouses, and all of R's descendants (with their spouses).
2. Every direct ancestor of R, up to the generations limit, each with the
   co-parent of the line. An ancestor's *other* spouses are hidden.
3. Collateral expansion only from **R's parents and grandparents**: all their
   descendants (siblings, aunts/uncles, first cousins, cousins' children, …)
   with spouses. Great-grandparents and higher contribute only themselves:
   their other children (grand-aunts/uncles) are hidden.
4. Spouses' own relatives (in-laws' parents and siblings) are hidden.
5. Cap is 1000 (not 100); this tree never hits it.

## Who gets the pill

A shown person gets "View family branch" **iff at least one of their parents,
siblings, spouses or children is not shown**. Nobody else. For root Beka that
is exactly: Kesabufukubu (her parents/siblings), Bumub Sebav (his siblings),
Mepe Buvumus (2nd wife + other children), Mepapa (other children), Kemevov
(siblings), Bikakom (other children).

Geometry (tree units): pill group at `(card.x + 155, card.y − 20)`, drawn as
two navy `rgb(40,63,102)` rounded rects 20×12 (rx 4) at x=0 and x=30, joined by
a 1px navy line at 50% opacity `M19.5 6.5h11 M25.5 6.5v15.5` (bar plus a stem
down into the card top). Transparent 54×22 hit area at (−2,−2).
`role="button"`, `aria-label="View family branch"`.

## Clicking it

Re-roots the Family view on that person (same as "make root"); the canvas
centres on them. The header gains a breadcrumb: `Beka Bub Fekeme › Kesabufukubu
Kamemuku`, where earlier entries are links that re-root back.
