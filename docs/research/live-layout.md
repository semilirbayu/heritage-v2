# Live layout ground truth (MyHeritage, user's own tree, root = Beka Bub Fekeme)

Captured 2026-10-23 from the live Family view (generations = 5+, cousins on).
Coordinates are tree units (card top-left), scale removed. Only cards present in the DOM
were captured (MyHeritage culls off-screen 500×500 buckets), so this is a partial set
(39 of 64 laid-out cards). `x` step between card lefts: couple = 254, siblings = 277.

| id | name | sex | x | y | role relative to root |
|---|---|---|---|---|---|
| 1500118 | Pe'usa | M | 3899 | 278 | gg-grandparent line (single parent shown) |
| 1500125 | Pimipufevi | M | 4915 | 466 | parent of Sabema |
| 1500126 | Vukipa | F | 5169 | 466 | parent of Sabema |
| 1500117 | Fitivufub | M | 4026 | 466 | parent of Mepe Buvumus |
| 1500022 | Mepe Buvumus | M | 4153 | 654 | father of Bumub Sebav |
| 1500023 | Mepapa | F | 4407 | 654 | mother of Bumub Sebav |
| 1500123 | Mebifebupi | M | 4661 | 654 | father of Kebikum |
| 1500124 | Sabema | F | 4915 | 654 | mother of Kebikum |
| 1500122 | Bumub Mivufu | M | 5423 | 654 | father of Sekisepe |
| 1500121 | Bikakom | M | 5804 | 654 | father of Kemevov |
| 1500015 | Bumub Sebav | M | 4407 | 842 | paternal grandfather |
| 1500016 | Kebikum | F | 4661 | 842 | paternal grandmother |
| 1500119 | Sekisepe / Fitivufub | M | 5550 | 842 | maternal grandfather |
| 1500120 | Kemevov | F | 5804 | 842 | maternal grandmother |
| 1500020 | Sapemop | F | 3669 | 1030 | paternal aunt |
| 1500046 | Bavepefu | M | 4350 | 1030 | husband of paternal aunt |
| 1500021 | Vufasafa | F | 4604 | 1030 | paternal aunt |
| 1500013 | Basamuko | M | 5169 | 1030 | **father** |
| 1500014 | Kesuka | F | 5423 | 1030 | **mother** |
| 1500131 | Bobeva | M | 5989 | 1030 | maternal uncle |
| 1500133 | Ves Vemibev | F | 6243 | 1030 | wife of maternal uncle |
| 1500132 | Fesuvo | M | 6531 | 1030 | maternal uncle |
| 1500137 | Pafasof | F | 6785 | 1030 | wife of maternal uncle |
| 1500184 | Pevuk Mabev Vefu | M | 3553 | 1218 | 2nd husband of cousin Bubibuf |
| 1500044 | Kukivu Sumiki | M | 3807 | 1218 | 1st husband of cousin Bubibuf |
| 1500041 | Bubibuf Kekesupufe | F | 4061 | 1218 | paternal cousin (2 marriages) |
| 1500047 | Fub Kukivib | M | 4350 | 1218 | paternal cousin |
| 1500181 | Bafa Mimem Bupakokome | F | 4604 | 1218 | wife of cousin |
| 1500204 | Pupip Fub Pifafek | M | 4892 | 1218 | brother (b.1985 d.1985) |
| 1500001 | **Beka Bub Fekeme** | M | 5169 | 1218 | **ROOT** (b.1989) |
| 1500127 | Kesabufukubu Kamemuku | F | 5423 | 1218 | wife |
| 1500012 | Fev Fepumapem | F | 5700 | 1218 | sister |
| 1500134 | Bafa Fupepisu | M | 5977 | 1218 | maternal cousin |
| 1500135 | Bofe Mos Vefu | M | 6254 | 1218 | maternal cousin |
| 1500045 | M. Pakasuk Saso Sumiki | M | 3934 | 1406 | child of Bubibuf + Kukivu |
| 1500186 | Posavubu Vopis Mivef Bako | M | 4338 | 1406 | child of Fub + Bafa |
| 1500187 | Posavubu Pupif Kavuvib Bako | M | 4615 | 1406 | child of Fub + Bafa |
| 1500128 | Fifap Kamok Sipakas | F | 5296 | 1406 | daughter of root |
| 1500136 | Vikus | M | 6658 | 1218 | child of Fesuvo + Pafasof (maternal cousin) |

Not rendered although they are children of the grandparents: Febibos, Sobubam, Vepesim
(brothers of the father) — either culled off-screen or pruned (64 of 186 shown).

## Derived layout rules (orchestrator analysis — use these, they are verified against the table)

1. **Rows**: one row per generation, row step 188. Root row = 0, parents −1, children +1.
2. **Couples**: partner cards are 254 apart (34 gap). **Husband left, wife right** — always,
   regardless of which partner is the blood relative (verified on every couple: Bavepefu|Vufasafa,
   Fub|Bafa Mimem, Bobeva|Ves, Fesuvo|Pafasof, Beka|Kesabufukubu, Kukivu|Bubibuf).
   *(Correction 2026-10-23: an earlier version said "blood relative on the inner side"; that was wrong.)*
3. **Multiple spouses**: extra spouses stack further out on the spouse's side (a woman's
   husbands all to her left, newest/last marriage farthest: Pevuk ← Kukivu ← Bubibuf), each
   marriage's children centred under that specific couple's midpoint.
4. **Children of a couple**: sibling units (a person + their spouses) laid left→right with
   277 between card lefts of adjacent singles (57 gap), and the whole children group is centred
   under the parents' couple midpoint (verified: Bobeva+Ves → 5977/6254; Fub+Bafa → 4338/4615;
   Beka+Kesabufukubu → Fifap at 5296; Basamuko+Kesuka → [Pupip, Beka+Kesabufukubu, Fev] centred).
5. **Root's sibling row**: siblings in birth order (Pupip 1985 left of Beka 1989); root keeps
   its spouse adjacent; younger siblings after the spouse.
6. **Two-sided ancestry (hourglass)**: the father's family expands to the **left**, the
   mother's family to the **right**. The father's siblings are placed left of him, the mother's
   siblings right of her, each with their spouses on the outer side and their descendants
   (cousins, cousins' children) below them. Subtrees are packed with no overlap (tidy-tree).
7. **Ancestor couples**: each ancestor couple sits above its child so that the parent on the
   *inner* side of the couple is directly above the child and the couple extends outward
   (Bumub Sebav is the left card of his couple → his parents sit with Mepapa (right card) at the
   same x; Kebikum is the right card → her father Mebifebupi (left card) is at the same x).
   Adjacent ancestor couples therefore abut at 254 spacing (4153, 4407, 4661, 4915).
8. **Single known parent**: the card is placed as if paired with an empty slot (Pe'usa is
   half a couple-step from his child). Read-only: keep the slot empty (no placeholder card).
9. **Connectors**: couple bar between partners; a vertical drop from the couple midpoint to a
   horizontal bus above the children row; vertical drops into each child; rounded corners r=30.
