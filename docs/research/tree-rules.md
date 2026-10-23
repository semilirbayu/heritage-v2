# Family-view behavioural rules (reverse-engineered from MyHeritage client bundle)

Method: `analyze_javascript_application` over the three bundles (REA evidence
`ev_319de8cb28e7b585cb740705f67f563020bee441c9b7052bc644a8d14e03b54e`;
3 files, 156k AST nodes, 0 parse failures), then targeted reads of
`NewTreeBundled.js` (~622 KB, one line; offsets below are char offsets),
`NewTreeLeftPanelBundled.js`, `Dictionary_2_EN_Callout`.
Small identifiers are quoted as evidence; no source is reproduced.

**Headline finding:** the browser bundle is a *renderer* for a
server-computed layout. Inclusion, ordering, coordinates and connector paths
all arrive in one `get-tree-layout.php` response and are drawn verbatim by
`generateDataStructureFromLayoutObject` (~offset 223300). There is no
client-side packing/ordering code. Rules marked SERVER-SIDE below are
evidenced by request parameters + response parsing + screenshots, not by
layout arithmetic (which lives on the server).

Each finding is tagged **CONFIRMED** (seen in code) or **INFERRED**
(screenshots / single data point / server-side behaviour).

---

## 1. Which relatives are included

### 1.1 The layout request (CONFIRMED)

`NewTree.DataAcquisition.getTreeLayout` (~offset 173127) calls
`["","FP","API","FamilyTree","get-tree-layout.php"].join("/")` with:

- `rootID` = current root individual id
- `maxProximityLevel` = generations setting (see 1.2)
- `maxIndividualsAfterPrune = 100` (`this._maxIndividualsAfterPrune=100`, ~offset 156578)
- `shouldFetchCousins = "1"/"0"` (default `this._shouldFetchCousins=!0`)
- plus rev/lang/style/member flags.

Response fields consumed by `generateDataStructureFromLayoutObject`:

- `personCards[]`: `{id, r:{t,b,l,r,f?}, p?, gh?, pf?, addme?, <card fields>}`
- `familyConnectors[]`: `{ID, h, w, c[], s?, l:[{sx,sy,ex,ey,r?,dash?,dot?}], waURL…}`
- `boundingRect{t,b,l,r}`, `familyTreeSize`, `rootIndividualID`

### 1.2 Generations setting (CONFIRMED client plumbing; depth semantics INFERRED)

- `proximitySelectorService.levelsGenerations = {1:"1",2:"2",3:"3",4:"4",7:"5+"}` (~offset 12207).
- Slider 1..5 maps 5 → 7 (`i>=5&&(i=7)`); `getLevelGenerations` falls back to 7.
- Menu title strings: `"Generations around main person"` /
  `"Generations above\/below main person"`, `"Generations to display around main person:"`
  (Dictionary). Tooltip/help: "Use this slider to determine whether to show
  distant family, or only the immedia[te family]".
- There is **one** `maxProximityLevel` sent for both directions — the setting
  applies symmetrically above (ancestors) and below (descendants) the root.
  No separate up/down parameter exists.
- Values observed: `7` = "5+" = effectively uncapped for normal trees.

### 1.3 Cousins toggle (CONFIRMED)

- Menu checkbox `id="cousins"`, label `translator.text("Show branches of cousins")`
  (~offset 14557). (Task brief calls it "Show cousins of main person"; the
  literal client string is "Show branches of cousins".)
- Persisted to hidden input `shouldFetchCousins` `"1"/"0"`, sent with the
  layout request; `saveShouldFetchCousins` saves via toolbar preferences
  (debounced 500 ms).
- INFERRED effect: with cousins on, children of aunts/uncles (and their
  sub-branches) are included; off prunes those branches. Inclusion itself is
  server-side.

### 1.4 Who is in the frame (INFERRED from response model + screenshots)

The client renders whatever the server returns; observed in
the live reference captures at 5+ generations:

- Root + all ancestors up to N generations, **including siblings of
  ancestors** (aunts/uncles) and **their spouses**.
- Root's siblings and their spouses/children (nieces/nephews).
- Spouses of the root and of descendants (each married couple rendered as an
  adjacent pair joined to one connector).
- Children below, recursively to N generations.
- Screenshots show: male on the left, female on the right in every couple;
  single child centred under the parents' midpoint; sibling groups in one row.
- Sibling/child **order** and **spouse side** are server-chosen (client has no
  ordering code for the Family view; `EAddSiblings{MIDDLE,LEFT,RIGHT,NONE}` is
  edit-UI only). Birth-order ordering is INFERRED from screenshots.
- No client-side filtering by relation type in the Family view path.

### 1.5 Pruning, expansion cards, "View family branch" (CONFIRMED)

- Server caps the session at 100 individuals (`_maxIndividualsAfterPrune`).
  Beyond that, subtrees are replaced by markers:
  - `exp` field → `Individual._expansionLevel`; `IndividualsCollection`
    counts `t._expansionLevel && _numberOfExpansionCards++` (~offset 155100).
  - `p` flag on a card → `PersonCard.setIsPruned(true)` ("isPruned").
- `PersonCard.isRidge() = getIsPruned() || isGhost()` (~offset 324172).
  Ridge cards get the branch affordance:
  - SVG: ridge shape, fill `[40,63,102,.5]` (hover `.7`), class `ridgeIcon`,
    `aria-label="View family branch"` (~offset 440139).
  - HTML: `<a class="… ridgeIcon preventCallout">` (~offset 441409).
  - Tooltip: `translator.text("PruningIconTooltipText", name)` =
    `"Click to view<br>the family branch of<br>%1"` (Dictionary).
- Click → `handleRidgeIconClicked` (~offset 441480, CONFIRMED):
  `setRootIndividualID(card.id); requestTreeData(...)` — i.e. **re-roots the
  tree on that person** (server returns the new branch; `"PrunedTreePreloaderMessage":
  "Loading family branch of<br>%1"`). With `openSpiderAfterPruneJump` it also
  opens the add-relative spider after load (edit flow, out of scope).
- `viewHisTree()` (panel action, "View his tree") calls
  `closeCallout + handleRidgeIconClicked()` — same re-root (CONFIRMED,
  ~offset 479245).
- Classic (non-facelift) mode: clicking a ridge card re-roots immediately
  instead of selecting (`this._classic … e.handleRidgeIconClicked(!1)`,
  ~offset 252887).

### 1.6 Ghost (duplicate) cards (CONFIRMED)

- Server may send the same person twice: ghost cards carry `gh` flag and id
  suffix `"ID_N"` (`s.lastIndexOf("_")` split, ~offset 223900).
- Ghosts render the same card plus a badge (`initGhost`, ~offset 444550+ in
  HTML path): red-ish lozenge with `xN` = `getGhostCount()`; click cycles
  duplicates (`showNextGhost`). Fill `#F76458` legacy, gender border colour in
  facelift.
- For our reimplementation: pedigree collapse / intermarriage needs either
  duplicate cards with a "seen elsewhere" affordance, or true graph layout.
  MyHeritage duplicates.

### 1.7 Spouses: ex / multiple / status (mixed)

- `FamilyConnector` has exactly one husband slot + one wife slot
  (`setHusbandCard/setWifeCard`, response `h`/`w`; ~offset 223900 parses each).
  A person with several spouses appears in **several connectors**; each
  couple unit is placed by the server. Client imposes no limit and no
  "primary first" rule (INFERRED from model shape).
- `Family.status` (`c.s`) is stored but never branches layout client-side.
- `ESpouseType{PRIMARY:0,SECONDARY_HUSBAND:1,SECONDARY_WIFE:2}` is declared
  (`NewTree.Data.Enums`, ~offset 123531) but has **no layout use** in the
  bundle (single occurrence) — edit UI only.
- Panel role labels include ex-relations: Dictionary `"Relatives ex
  husband":"Ex-husband:"`, `"Relatives ex wife"`, `"Relatives ex partner"`
  (CONFIRMED strings; assignment is server data).
- No "step-" Dictionary keys exist in the Callout dictionary; no step-relation
  rendering in Family view (only `EFamilyChildRelation{foster,natural,adopted,
  living_with}`, and the client tags every parsed child `NATURAL`,
  ~offset 223826). Half-sibling path codes (`isRelativeHalfSibling`,
  `"a…A"` paths, ~offset 47596) exist **only** in the add-relatives
  DiscoveryCard edit UI, not in Family view.

---

## 2. Layout algorithm

### 2.1 Division of labour (CONFIRMED)

Client (`generateDataStructureFromLayoutObject`):

1. `boundingRect` ← response; `setNumberOfIndividualsInTree(familyTreeSize)`.
2. One `PersonCard` per `personCards[]`; rect copied verbatim
   (`setTop/Bottom/Left/Right(round(r.*))`, `setSizeFactor(r.f)`).
3. One `FamilyConnector` per `familyConnectors[]`; husband/wife/children cards
   linked by id; `addLine(new Arc(D,x,r) | new Line(D,x))` per `l[]` segment;
   `dash`/`dot` flags preserved.
4. `PersonCardsCollection`/`FamilyConnectorsCollection.calculateBuckets()`
   — 500×500 spatial buckets (`_bucketXSize=500`, `_bucketYSize=500`) for
   viewport culling only.

There is **no** client code for generation rows, sibling order, couple
placement, subtree packing or overlap avoidance. For our local GEDCOM port we
must write that engine ourselves (see §5).

### 2.2 Geometry observed (screenshots + spec measurements; server-side origin)

- Generation rows: card tops advance ~188 tree units per generation (measured;
  INFERRED as server constant).
- Card 220×102 confirmed in code: spider animation target
  `{left:cx-110, top:cy-51, width:220, height:102}` (~offset 34289); radius 8
  (`cardBorderRadius:8`), border 2 (`cardBorderThickness:2`), selected overlay
  +3 (`cardSelectionThickness:3`) — `NewTree.Data.Facelift` (~offset 130272).
- Couple gap ≈ 34 units, sibling-unit pitch ≈ 277 (measured; server-side).
- Single child centred under parents' midpoint (screenshot; server geometry).

### 2.3 Connectors (CONFIRMED renderer, server-authored paths)

- `Line.getPath()`: orthogonal `M x y L x y` segments, `Math.round()+.5`
  pixel snapping, `width:1`, colour `connectorColor = GREY_40 #999999`
  (via `getConnectingLineColor`); radar/minimap copy in `#989898`.
- `Arc extends Line` with `_radius`: SVG arc `A r r 0 0 1 x y`. Rounded
  30-unit corners = server sending `r:30` segments (spec measurement;
  consistent with renderer).
- `dash`/`LongDash` and `dot` styles supported per segment (server-flagged).
- Zoom-class fine-tune: Small → width 1.5; Tiny and below handled separately
  (`fineTuneByZoomClass`).

### 2.4 Colours / tokens (CONFIRMED, `NewTree.Data.Colors` ~offset 123075)

`MALE #17b4ce`, `FEMALE #fc8181`, `GREY_20 #cccccc` (unknown-sex border,
avatar ring), `GREY_40 #999999` (connectors), `GREY_60 #595959` (sub text),
`ORANGE #f56932` (expansion cards: `ExpansionCard{background:"#fff5f4",
border:ORANGE, dash:6}` ~offset 137814), black ribbon for deceased
(`initRibbonHTML`, `cardRibbonOfDeath`).

### 2.5 Zoom classes (CONFIRMED)

`zoom2Class()` maps zoom → `NewTreeZoom_{Large,XMedium,Medium,Small,XSmall,
TSmall,TTSmall,Tiny,XTiny}`; each class toggles detail groups
(`fullName/fullDates/photo/…/ridge/balloon/tooltip`, ~offset 237530). At
XSmall and below names collapse to initials; ridge icon stays visible at all
levels. RTL is mirrored (`getIsRTL()` flips offsets, slider ticks, text
alignment).

---

## 3. Interactions

### 3.1 Select = click; panel = click on selected (CONFIRMED)

Card `onclick` (~offset 372973):

```js
getMoveMoreThenThreshhold() || setCurrentSelectedPersonCard(card, center=true, openPanel=useLeftPanel, event)
```

(drag vs click disambiguated by the mover threshold, §3.3).
`setCurrentSelectedPersonCard(card, t=center, i=openPanel, n=event, s=animate)`
(~offset 252887):

- **Different card**: detach old selection, attach new (HTML: move
  `.selected-card` class; SVG: `attachSelection` ring + `feDropShadow`
  std 8, opacity .2 per spec), `showSelection`, then
  `setViewBox(calculateRelativeToScaleStageRect(card), animate=s, …)` —
  animated centering. `t` true from card clicks.
- **Same card**: `openCallout(n)` → facelift with left panel:
  `LeftPanel.setIndividualId(...)` opens the profile panel; without left
  panel: floating extended card; expansion card: `openExpansionCardPanel()`
  (delegates to `treeExpansionService`, edit flow).
- `updateTreeViewSelectorIndividualId`, breadcrumbs updated.

No `dblclick`/`ondblclick` handler exists anywhere in the bundle — double
click is not a gesture (CONFIRMED by absence).

### 3.2 Pan/zoom animation (CONFIRMED)

- `translateBy`: CSS `translate3d(x,y,0)` with `transition: all 0.5s linear`
  when animated (~offset 239752). Selection centering therefore animates ≈
  **0.5 s linear** (spec's "300–400 ms ease" is close but the code says 0.5 s
  linear).
- Zoom-knob drags animate `top` 250 ms (`setKnobPosition … animate(250)`).
- `calculateRelativeToScaleStageRect`: centres the card in the stage rect,
  **offsetting for the open left panel** (`getVisibleWidth()` = 370 when open)
  and RTL (`o = RTL ? -1 : 1`), plus right-side panels/sheets. First load
  (`_firstTimeCentering`) fits with 90/65 px margins when the tree is smaller
  than the viewport.

### 3.3 Drag-to-pan, threshold (CONFIRMED)

- `Mover`: `mousedown` records point + viewBox; `mousemove` beyond **1% of
  viewBox width/height** sets `_moveMoreThenThreshhold`; also true if a move
  ended < 50 ms ago (`getMoveMoreThenThreshhold`, ~offset 312155). Clicks that
  exceed the threshold never reach selection (guard at every click site,
  incl. ridge clicks).
- Pan buttons + **arrow keys pan 30 units** (`addButton("Up",0,-30)` etc.;
  `addKeyboardNavigation(30)`; ignored when a popup/modal is open or focus is
  in an `INPUT`, ~offset 313753).
- `Home` button → facelift `goToHomePerson()`, classic `goHome()` (re-select
  pivot, no re-root).

### 3.4 Wheel zoom (CONFIRMED; NOT cursor-anchored)

- `mousewheel` handler: if `panOnMouseWheel` (facelift setting) pans by
  `(dx/5, -dy/5)`; otherwise `zoomInOut(delta)` (~offset 575727 Zoomer
  `addEvents`). `zoomInOut` steps `Math.round(200*zoom) ± 10`, i.e. **0.05
  zoom units per notch**, clamped to preset extremes, then
  `resizeViewBoxAccordingToZoom` which **keeps the viewBox centre** — zoom is
  centre-anchored, not cursor-anchored (CONFIRMED).
- Desktop zoom object: `_presetScale=[.65,.65,.5,.35,.2,.05,.05]`,
  knob travel 107 px (`_presetPositionsLarge=[0,0,34,62,85,107,107]`, 84 small
  screens). Internal `_zoomLevel` = 200 × logical zoom; init 70
  (logical 0.35; on-screen scale `_zoomLevel/normalizedFactor(100)` = **0.7**,
  matching the measured default). `getZoomLevel()=_zoomLevel/200`,
  `getZoomFactor()=_zoomLevel/100`.
- Limits: floor 0.05 (`Math.max(2*e,.1)` in `setZoomLevel`); desktop ceiling
  0.65; mobile 0.05–0.875 (tablet 0.65). Persisted `#zoomLevel` clamped
  60–90 (~0.30–0.45 logical); displayed label
  `parseInt(100*zoom/0.35)+"%"` — i.e. logical 0.35 renders as "100%".
- `selectCardByCardIDWithoutCallout`: zooms **up** to minimum 0.35 before
  centering if zoomed further out.
- No fit-to-screen / zoom-to-extents function exists in the bundle
  (no `fit*`/`zoomToFit` symbol); initial framing = first-time centering.

### 3.5 What re-roots (CONFIRMED)

`recenterAroundIndividual(id, skipRevCheck, animate, event, onDone,
rootParentsType)` (~offset 256579):

- Card present and not ridge → pivot + select + animated centre (+
  breadcrumbs). If `skipRevCheck` falsy, still verifies `fetchFamilyTreeRev`
  and re-roots if the server rev changed.
- Card **absent or ridge** (or explicit parents-type) → `setRootIndividualID`
  + `setRootParentsType` + `requestTreeData` = full re-root on server branch.
- Callers: search select (`onSelect → recenterAroundIndividual(e.id, true,
  true, n)`, ~offset 545900: always animate, skip rev check), breadcrumb
  clicks, Home (`goToHomePerson`: reselect pivot if already home, else
  recenter), ridge clicks, panel "View his tree".

### 3.6 Search "Find a person" (CONFIRMED)

- Toolbar input `#FindAPerson` (`isIndividualsCombo=1`,
  placeholder `translator.text("Find a person")`, ~offset 533920).
- Small trees (`count <= getMaxSearchResults()`): local dropdown listing all
  individuals. Large trees: magnifier → server search. Autocomplete shows
  photo/silhouette + name + lifespan + relation; Enter picks highlighted,
  Esc cancels (`onKeyDown`, ~offset 106214).
- Choosing a result **selects + centres if visible, otherwise re-roots**
  (follows §3.5). It does not merely highlight.

### 3.7 "N of M people" (CONFIRMED)

`Toolbar.updateTotal` (~offset 566270):
`text("Total people summary", N, M)` with Dictionary
`"Total people summary":"%1 of %2 people"`. Screenshot "84 of 186 people"
matches. **N = pruned-session count minus expansion cards**
(`getNumberOfIndividualsInCurrentPrunedSesssion() - getNumberOfExpansionCardsInCurrentPrunedSession()`),
**M = `familyTreeSize`** (whole file). Not "shown/selected".

### 3.8 Breadcrumbs (CONFIRMED)

`addToBreadcrumbs` on every select/re-root; rendered into `#TreeBreadcrumbs`
with separator buttons; click → `recenterAroundIndividual(id, true, false)`
(back-navigate, may re-root). `updateBreadcrumbsIndividuals` refreshes names.

---

## 4. Card text rules

### 4.1 Facelift HTML cards (CONFIRMED, `initNameAndDatesHTML` ~offset 400810)

Structure: `.cardName > .cardNameInner` (displayName) + optional
`.cardMaidenSuffix` + `.cardDates` (+ full birth/death date rows at larger
zooms with star/death icons, holocaust/cross variants).

- Name: `displayName`; if it starts with `mediumName`, remainder becomes the
  maiden suffix (`…(born X)` style rendering split). Crowns/premium icons
  prepended.
- Dates line `i`:
  - living: `birthYear` or empty (no line when unknown).
  - dead: `birthYear + " &ndash; " + deathYear`; missing birth → `"? – death"`;
    missing death → `"birth – ?"`.
  - dead with **neither** year → no year line from this code path; the
    `deathDate` field is shown instead — server fills it with the
    localized `"Deceased"` string (Dictionary has `"Deceased":"Deceased"`;
    screenshots show exactly that). Living without dates → empty sub-line.
- Ribbon: `initRibbonHTML` appends black-ribbon silhouette for the dead.
- Wrapping/truncation for HTML cards is CSS-driven (not in the JS bundle);
  measured: 15 px/500 name, 15 px sub, x=82, ≤3 lines, 16 px step.
  Treat as INFERRED-from-screenshot.

### 4.2 SVG text path (CONFIRMED, `initName`/`initDates` ~offset 383615/394164)

- `breakStringForDisplay(text, weight, px, indent, maxWidth=127,
  …)`: greedy word-wrap measured against hidden `#textBoxForMeasure`.
- Row caps: `c = Math.min(lines.length, 3)` (falls back to short/medium names
  when > 3 rows would be needed); dates get remaining rows of a 5-row budget
  (`y = 5 - nameRows`, minus ribbon/email rows). Short-date separator `" – "`.
- `initDates` shows full `"Born on X" / "Died on Y"` strings at Large zooms;
  facelift cards without missing-facts use `deathDeceased (dd)` as the death
  text when present (`t && ""!==u && (d=u)`).

### 4.3 Silhouette selection (CONFIRMED)

`svg_silhouette_${gender}_${isChild ? "C" : "A"}` (~offset 410610):

| gender | child flag | class → meaning |
|---|---|---|
| M | A | `svg_silhouette_M_A` → man |
| F | A | `svg_silhouette_F_A` → woman |
| M | C | `svg_silhouette_M_C` → boy |
| F | C | `svg_silhouette_F_C` → girl |
| U | A | `svg_silhouette_U_A` → unknown |

- `isChild` is a **server flag** (`null!=e.c && setIsChild(true)` in
  `initFromCardData`, ~offset 153795). No client age threshold exists; the
  client cannot recompute it. INFERRED server rule: living minor (likely
  < ~18 and childless), but this is a guess — for our port choose an explicit
  local rule (see §5).
- Facelift maps the same to `silhouette-{man,woman,boy,girl,unknown}.svg`
  (`drawFaceliftedSilhouette`, ~offset 412172). Search dropdown uses the same
  M/F + child mapping with its own PNG/SVG assets.

### 4.4 Left-panel labels (CONFIRMED)

- Headline relationship ("Your father", "His brother", …): **server string**.
  Panel binds `relationship` / `getRelationshipDescription()`; the value comes
  from a GraphQL `individual.relationship(relationship_prefix,
  is_relationship_in_mid_sentence){relationship_description}` query
  (NewTree bundle, Adhoc/left-panel services). Screenshots show "Your father"
  + "Deceased" life state.
- Immediate-family rows: Dictionary role labels `"Relatives
  {father,mother,husband,wife,brother,sister,son,daughter,parent,child,
  ex husband,ex wife,ex partner,…}:"` + name + years; each row links back
  (`selectPersonCard` on click).
- Sections: `"Immediate family"`, `"Facts"` / `"Facts (%1)"` with year column
  + fact name (`"Birth"`, `"Marriage to:"`, `"Birth of son:"`, `"Death"`) +
  place/person (templates in `NewTreeLeftPanelBundled.js`,
  `LeftPanelFactsTemplate`).
- Panel geometry: open width **370 px** (`getVisibleWidth`, CONFIRMED), which
  the centering math compensates for.

---

## 5. Implementation recommendations (React + SVG)

1. **Own the layout engine** (MyHeritage's is server-side; we have the GEDCOM
   locally). Per root + `{generations, cousins}` compute the included set:
   ancestors ≤ N (with their spouses), root siblings + spouses, descendants ≤
   N (with spouses), and — cousins on — children of aunts/uncles (their
   sub-branches, depth-bounded by the same N).
2. **Rows by generation**, root generation = 0, parents −1, children +1.
   Fixed card 220×102; vertical pitch 188; couple pitch 254 (34 gap, male
   left / female right); sibling-unit pitch 277 (57 min gap). Bottom-up
   subtree widths, centre parent unit over children, shift siblings to avoid
   overlap (keep it simple: balance, then resolve collisions left-to-right).
3. **Couples as units**: layout spouses adjacently, drop one vertical from
   the couple midpoint, fan to children with 30-unit arc corners (our own
   path code: `M…L…A 30 30 0 0 1 …L…`). Multiple spouses → repeat the person
   node per family (ghost-style) or stack spouses; keep ex-spouses with the
   same geometry but labelled role in the panel.
4. **Pruning**: cap rendered individuals (~100 default); replace cut subtrees
   with a compact branch affordance card reusing the ridge metaphor
   (click = re-root). Counter `N of M` where N excludes affordance cards.
   Duplicate persons (pedigree collapse): render twice with an `×N` badge that
   cycles, matching observed behaviour.
5. **Viewport**: one `<svg>` + transformed `<g>`; scale state with default
   0.7, min 0.05, max ~0.65–0.875, wheel step 0.05 centre-anchored, drag-pan
   with click suppression past ~1% viewBox movement; arrow keys pan 30 units;
   Home re-centres root; animated re-centre 0.5 s (CSS transition on the
   transform is fine); compensate centering by panel width (370) and RTL.
6. **Selection model**: `selectedId` + `panelId`; first click selects +
   centres (no relayout), second click opens panel; search/breadcrumb/cross
   clicks reuse one `focus(id)` helper: centre if laid out, else re-root and
   then select. No double-click gesture.
7. **Cards**: name (display − maiden split), dates line
   `birth[ – death| – ?]` / `? – death`, server-style `"Deceased"` fallback
   for dead without dates, black ribbon for dead, silhouette by
   sex × child/adult with an explicit local child rule (e.g. living and
   < 18) since MyHeritage's flag is server-computed.
8. **Panel**: headline relationship computed locally (kinship path → "Father
   of X" phrasing since we have no viewer concept… or "Your father" with the
   home person as viewer), immediate-family grouped rows with role labels
   (include Ex-husband/wife/partner), facts timeline (birth/marriage/children/
   death with years). Row clicks select in tree.
9. **Do not copy**: MyHeritage silhouette SVGs, icons, strings, or CSS.
   Re-implement with original assets; keep identifiers/behaviour only.

### Open questions / limits

- Exact server inclusion edge cases (half-siblings in view? cousin depth when
  N < branch depth? ordering with multiple/secondary spouses?) are **not
  decidable from the client bundle** — the geometry arrives precomputed.
  Screenshots suggest full/half siblings render identically; confirm against
  a GEDCOM fixture with known half-sibling/cousin structures during
  implementation.
- `isChild` (boy/girl) threshold is server-side; pick a documented local rule.
- Wheel-zoom cursor anchoring would be a strict improvement over the original
  (centre-anchored); decide consciously whether to match or improve.
- Persisted zoom clamp (60–90 ⇒ 0.30–0.45) and the "100% = 0.35" label
  convention are quirks we should simplify (label = scale × 100).
