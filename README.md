# LaVEX Data Visualization Tool

A static, interactive dashboard for the 2023 and 2025 Louisiana Violence
Experiences (LaVEX) surveys. Same stack and design system as the
[CalVEX](../calvex-static) and [USVEX](../usvex-dashboard) dashboards: plain
HTML/CSS/JS + [Plotly.js](https://plotly.com/javascript/), no build step, no
backend. All filtering and weighted aggregation happens in the browser over
`data.js`.

Laid out like CalVEX: **bars (or lines) are grouped by survey year, one
series per category of the selected comparison.** A comparison that was not
collected in a year simply has no bars for it (see "2023 vs 2025" below).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell: header, chart controls bar, a sidebar (Overall/subcategory toggles, Location, Notes, citation), and a main column (chart, then the Demographic Specifics filter groups below it) |
| `style.css` | Theme — the shared VEX purple palette and font pairing |
| `logo.png` / `logo-lockup.png` | The official LaVEX lockup as supplied, and the content-cropped version the header renders (see "Logo") |
| `app.js` | All logic: filtering, weighted aggregation, Plotly chart building |
| `data.js` | Respondent-level rows (columnar JSON) built from the source `.dta`. **Not committed** (gitignored) — generate it with `python3 build_data.py` |
| `build_data.py` | Regenerates `data.js` from `data/[P003] UCSD_Tulane_LA_VEX_Survey_2025_data.dta` (requires pandas — see `requirements.txt`) |
| `data/` | Source `.dta` and codebook (git-ignored, not deployed — only `data.js` ships to the browser) |

## Run locally

```bash
python3 -m http.server 8124
```

Then open http://localhost:8124.

## Building the data

`data.js` is not in the repository: it holds respondent-level rows, so it
is generated locally from the source `.dta` files (also not committed —
place them under `data/` as listed in `WAVES` in `build_data.py`). The
dashboard will not load without it.

## Updating the data

```bash
pip install -r requirements.txt   # one-time, for pandas
python3 build_data.py
```

Reads the `.dta` directly and rewrites `data.js` — no CSV intermediate to
go stale. Update `SRC` at the top of `build_data.py` if the source file is
renamed or replaced.

One difference from the USVEX build script: this one reads the `.dta`
raw-numeric and applies Stata value labels per column itself, rather than
using `pd.read_stata(convert_categoricals=True)`. One column in this file
(`P_INDUSTRY20`) has duplicate value labels, which makes pandas refuse to
convert *any* column in the file.

## What's in the data

**N = 2,115 Louisiana respondents** — 1,081 in 2023 and 1,034 in 2025.

- **Topics**: Physical Violence, Sexual Violence, Intimate Partner Violence,
  Any Physical or Sexual Violence, Sexual Violence Perpetration, Physical
  Violence Perpetration. All have both Lifetime and Past Year measures.
  "Any Physical or Sexual Violence" (`any_violence` / `any_v12`) is a LaVEX
  addition to the USVEX topic list — the combined headline measure. It has
  no subcategory breakdown of its own, since its components are the
  Physical and Sexual topics.
- **Subcategories**: **both lifetime and past-year** breakdowns for every
  topic except "Any", including the 7 IPV subtypes. Panels render as a grid
  up to 2 columns wide (each panel holds a bar per category per year); narrow viewports fall back to a single column.

  The lifetime columns are not named like their past-year counterparts, so
  `TOPICS` in `app.js` keys `subcats` by time period rather than assuming
  one list. Physical and sexual victimisation use the raw survey batteries
  (`Q1_1`–`Q1_3`, `Q6_1`–`Q6_6`) because the dataset has no derived
  `pv_*`/`sv_*` lifetime per-form column; IPV and perpetration use derived
  ones (`IPV_*_ever`, `everperppv*`, `everperpsv*`).

  Like the main chart, the lifetime subcategory panels show the full
  0–100% axis and hide the Y-axis slider, while past-year panels are
  capped by it. If you would rather have a fitted, adjustable axis on the
  lifetime panels too, that is a small change in `renderSubcategories()`
  plus `updateConditionalControls()`.
- **Weight columns**: each wave uses its own — `WEIGHT` for 2023 (the
  state-representative weight; the 2023 data README says to use it) and
  `WEIGHT_LAMSTX` for 2025 (see the caveat below). `build_data.py` writes
  both into one `WEIGHT` column.

### 2023 vs 2025

`data.js` stacks both waves with a `YEAR` column. `build_data.py` harmonizes
the codings; anything the 2023 file does not have comes out null for 2023.

| Item | Handling |
| --- | --- |
| Race/Ethnicity | 2023 has `RACE_5` only; `race_4` is derived (Asian folded into "Other or multiple races", as in 2025) |
| Household income | **Rebuilt for 2023.** 2023's `INCOME_QUINTILE` is a data-driven sample quintile, not 2025's dollar bands, so they are not comparable. Both years carry the 18-level `INCOME`, and the 2025 bands are recomputed from it (the mapping reproduces 2025's own variable code-for-code) |
| Education | 2023 `EDUC_4` → 2025 `EDUC_RECODE` (same four categories) |
| Any-IPV | `IPV22_EVER/YEAR` in 2023 (22 items) → stored as `IPV25_*` (25 items in 2025). A footnote says it is not strictly like-for-like |
| IPV sub-forms | 2023 has emotional, controlling, threats, physical, sexual; **severe/life-threatening and reproductive coercion exist only in 2025** |
| 2025 physical IPV | **Rebuilt to the 2025 report's definition** (see "Validation against the LaVEX 2025 report") |
| Lifetime perpetration forms | `everperp*` exist only in 2025 |
| 2025-only comparisons | Louisiana Region, Household Size, Religion, Incarceration History (2023 has only ever/never incarceration, or a 86%-missing headcount, or no recode) |
| Disability | **Different measures — not comparable across years.** 2023 = "yes" to any of six functional items HL006–HL011 (serious difficulty concentrating/remembering or walking/climbing stairs; difficulty dressing/bathing; help with everyday tasks or personal care; mobility/care aids), per the 2023 codebook: 37%. 2025 = one item ("Does any disability, handicap, or chronic disease keep you from participating fully in work, school, household, or other activities?"), per the 2025 codebook: 24%. Footnoted |

The Year filter sits at the top of the sidebar's "Time & Location" group.
No year × category group has fewer than 10 respondents (the 2023 data
README's publication floor); `build_data.py` prints any that do.

### Compare-by dimensions

Chosen from the codebook's derived/recode variables, with categories too
thin to chart collapsed or dropped. Smallest-category n is from the
unweighted sample:

| Dimension | Column | Smallest category (n) |
| --- | --- | --- |
| Gender | `GENDER_NEW` | 15 (non-binary / self-described) |
| Sexuality | `LGB_3` | 36 |
| Age | `AGE_6` | 102 |
| Race/Ethnicity | `race_4` | 57 |
| Marital Status | `MARITAL` | 41 (separated) |
| Household Size | `HHSIZE` | 64 |
| Household Income | `INCOME_QUINTILE` | 94 |
| Home Ownership | `HOUSING` | 44 (occupied, no cash rent) |
| Education Level | `EDUC_RECODE` | 87 |
| Employment Status | `EMPLOY_2` | 469 |
| Disability Status | `disability` → `DISABILITY` | 249 |
| Health Insurance | `HL032` → `INSURANCE` | 140 |
| Religion | `religon` | 83 |
| Incarceration History | `incar_3` → `INCARCERATION` | 68 |
| Political Ideology | `IDEO` | 103 |
| Louisiana Region | `LA_REGION` | 513 |
| ~~LDH Public Health Region~~ | `LADH_REGION` | 46 (Region 6) — **withheld from Compare by and filters**, see caveats |
| Metro/Non-Metro | `METRO` | 155 |

Deliberate departures from USVEX's dimension list:

- **`REGION4` / `REGION9` are gone.** In a Louisiana-only sample they are
  constant (`South` / `West South Central`) and would chart as a single
  bar. They are replaced by the two Louisiana geographies the sample frame
  carries: `LA_REGION` (North/South) and `LADH_REGION` (Regions 1–9).
- **`race_4` instead of `RACE_5`.** `RACE_5`'s Asian category has **8**
  respondents here — far too thin to plot. `race_4` is the same recode with
  Asian folded into the residual "Other or multiple races" group. A
  footnote says so whenever Race/Ethnicity is the comparison.
- **Four dimensions added** that USVEX listed as candidates but never wired
  in: Household Size, Health Insurance, Religion (already a clean 5-group
  recode in this dataset, unlike USVEX's raw 15-category `RELIG`), and
  Incarceration History.

Available but **not** wired in, because their minority category is too
small to chart: `transgender` (27 yes), `birth_place` (14 non-US born),
`SURV_LANG` (3 Spanish). Also unused: `STATE` (constant `LA`), and the
whole location / perpetrator-relationship / health / discrimination
question modules, which are additional *topics* rather than demographics if
there is interest later.

### Caveats worth knowing

- **2025's weight is the one the study recommends.** `WEIGHT_LAMSTX` is the
  only weight in the 2025 file and was built for the pooled LA/MS/TX
  general-population sample (N=3,120) that this Louisiana subset was drawn
  from. The LaVEX 2025 report's Methods section states plainly that
  "WEIGHT_LAMSTX is recommended for overall analysis," and the dashboard's
  weighted percentages reproduce the report's published estimates exactly
  (see "Validation" below), so this is settled. If a Louisiana-specific
  weight is ever produced, change `WEIGHT_COLUMN` at the top of
  `build_data.py` and re-run.
- **No confidence intervals.** The source file ships `VPSU`/`VSTRAT` for
  variance estimation in Stata; the dashboard does not use them and shows
  point estimates only. The sidebar Notes say differences cannot be assumed
  statistically significant.
- **LDH Public Health Region is withheld entirely** — both as a Compare by
  option and as a sidebar filter — until the region names are known
  (below). The `LADH_REGION` entry in `DEMOGRAPHICS` (`app.js`) and its
  column in `data.js` are untouched. To restore it: uncomment the one
  `<option>` line in `index.html`, and add `"LADH_REGION"` back to
  `SIDEBAR_LOCATION_GROUPS` in `app.js`. While hidden it filters nothing
  (every box stays checked).
- **LDH region names are not in the codebook.** It labels them "Region 1"
  through "Region 9" and supplies no parish or city mapping — nor does the
  `.dta`'s own value-label table, and there is no ZIP, FIPS or parish
  variable in the data to reverse-engineer one from. The dashboard
  therefore shows them exactly as labelled rather than guessing. The
  codebook workbook links out to NORC's internal file spec
  (`s3889_ClientFileSpecsReviewCodebook.xlsx`), which is the place to ask
  for the definition.

  Before assuming the numbering is LDH's standard administrative one
  (Region 1 = New Orleans, 2 = Baton Rouge, ...), note how `LA_REGION`
  splits it: "North" is Regions 4, 5, 6, 7 and 8; "South" is 1, 2, 3 and 9.
  Under LDH's standard numbering that puts Lafayette (4) and Lake Charles
  (5) — both in south Louisiana — on the "North" side. So either the
  numbering is not LDH's standard, or "North/South" is really a
  southeast-vs-rest-of-state split. Worth confirming with whoever built the
  sample frame. The region grouping is surfaced as a chart footnote.
- **What the methods documents say about Metro and North/South.** Metro/
  Non-Metro is defined: the 2023 survey document calls it "Metro (as defined
  US OMB Core-Based Statistical Area)", and the 2025 report adds that it is
  OMB's county-based classification reflecting economic ties, commuting and
  remoteness, chosen over Census rural/urban. No parish list is given, and
  the data has no ZIP or parish column. **North/South is not defined in any
  document** — not the 2023 methods report, survey document, codebook or
  README, nor the 2025 materials — and it is **absent from the 2023 data
  entirely** (2023 carries only the constant Census regions). It is a
  sample-frame field for 2025 only. **Open question for the analysts.** The AmeriSpeak methods report describes
  NORC's national sampling frame, not Louisiana geography. The chart
  footnote for each says exactly this much and no more.
- **Region cells are small** (46–190 respondents), so region-level
  differences deserve particular caution. A footnote says so.
- **Missing values never cascade across dimensions.** `filteredIndices()`
  in `app.js` only excludes a respondent from a filter dimension they
  actually have a value for, so a blank answer in one field never drops
  that respondent from charts comparing by a different field.
- **The "Overall" bar covers women and men only, following the reports.**
  The report's Methods say total estimates include gender non-conforming
  respondents, but its *published* Overall bars say otherwise: scoring
  every whole-number Overall the report prints (Figs 1, 3, 8, 10 and the
  perpetration prevalence on p. 31 — 26 measures) against the data,
  women+men only reproduces **24 of 26**, while including all genders
  reproduces only 19. The **2023** report confirms it independently: its
  Appendix A Total column reproduces from women+men alone for 22 of 22
  past-year rates, against 13 of 22 with every gender. The dashboard
  therefore excludes the 15 gender
  non-conforming respondents from the Overall bar (`OVERALL_GENDERS` in
  `app.js`). They still appear as their own bar when comparing by Gender,
  and in every other comparison. The sidebar reads "Overall (women and
  men)", the title says "women and men combined" in Overall-only mode, and
  a footnote explains it.

  The two measures that still miss are past-year physical violence (7.4%
  against a published 8%) and lifetime gun violence (18.7% against 18%).
  Both are consistent with the report's own internal inconsistency on that
  one measure — its Appendix B women/men figures (7.3% / 7.5%) cannot
  average to 8%.

### Validation against the LaVEX 2023 report

The same recomputation against the 2023 report (*Findings from the
May/June 2023 Survey*), plus the rendered dashboard read back from the
live page:

| Source in the 2023 report | Checks | Result |
| --- | --- | --- |
| Appendix A past-year rates, Women and Men, 1 decimal (physical, sexual, perpetration, every subform) | 44 | **all exact** |
| Appendix A Total column, women+men only | 22 | **all exact** (13 of 22 with all genders) |
| Table 3 IPV — ever and past year, Women and Men, every subtype | 12 pairs | **all exact** |
| Weighted sample characteristics (gender, race, age, employment, disability, education, LGB+) | 16 | all within rounding |
| Rendered dashboard bars, 2023 and 2025, read back from Plotly | 26 | **26 of 26 exact** to the reported decimal |

Every 2023 IPV figure reproduces from the shipped columns.

### Validation against the LaVEX 2025 report

`data.js` has been checked against the published report
(*Findings from the 2025 Survey*, Newcomb Institute, November 2025) by
recomputing its figures with the same weighted formula `app.js` uses.

| Source in the report | Checks | Result |
| --- | --- | --- |
| Appendix A (lifetime) + Appendix B (past year), weighted % by gender to 1 decimal | 38 | **38 exact** to the reported decimal (36 before physical IPV was rebuilt) |
| Sociodemographic breakdowns, p. 25 (age, race, sexuality, income, metro, disability, incarceration × physical/sexual/IPV) | 42 | all within rounding |
| Weighted sample characteristics, pp. 8–9 (gender, age, race, metro, disability, employment, education, LGB+, incarceration) | 17 | all within rounding |
| Perpetration prevalence, p. 31 (Overall bars follow the women+men convention) | 8 | all within rounding |
| Appendix A re-checked through the rendered lifetime subcategory panels | 16 | **16 exact** to the reported decimal |

**Physical IPV (`IPV_P_ever` / `IPV_P_12mo`) — resolved.** The shipped
2025 columns did not reproduce the report: 39.1% / 22.7% lifetime and
5.0% / 3.5% past year for women / men, against a published 40.8% / 23.7%
and 5.2% / 3.9%. The report's own Appendix A/B define Physical IPV as any of
11 items (made threats to physically harm you; slapped; pushed or shoved;
hit with a fist or something hard; pulled hair; slammed against something;
choked or suffocated; beaten; burned; used a knife; used a gun —
`IPV1_6`, `IPV1_13`–`IPV1_22`). That union reproduces **both** published
pairs exactly when the denominator is everyone who answered the IPV
battery, with an unanswered item counted as "no". `build_data.py` now
builds 2025's physical IPV that way, so every 2025 IPV figure matches.
(2023's shipped `IPV_P` already matched the 2023 report and is unchanged.)

To re-run the check after a data refresh, the validation script is kept out
of the repo (it was a one-off); the comparison values are all in the
report's Appendix A and B.

### Chart details worth knowing

- **Cap line.** When a past-year percent axis is truncated by the slider, a
  thin grey line marks the cap (as in CalVEX), so the top of a truncated
  axis isn't mistaken for 100%.
- **Uniform bar labels.** `layout.uniformtext` gives every value label in a
  chart one size. Without it Plotly shrinks each "outside" label to its own
  bar's width, which with narrow bars produced visibly mixed sizes.
- **Legend height.** The legend sits above the plot and grows upward as it
  wraps (up to four rows on a phone for Political Ideology). After drawing,
  `renderMainChart()` reads Plotly's rendered legend height and adds each
  extra row (29px) to the top margin, so a long legend never runs into the
  subtitle. Checked for every comparison, on desktop and a 375px phone.
- **2025-only comparisons with 2023 selected alone** show a message
  explaining the comparison was only collected in 2025, rather than an
  Overall-only chart presented as a breakdown.

### One behavior change from USVEX

The y-axis label follows the topic's verb — "Percent **Perpetrating**
Violence (%)" on the two perpetration topics, matching what the chart title
and subtitle already say. The USVEX dashboard says "Experiencing" on every
topic, including perpetration.

## Logo

The official LaVEX lockup — the Louisiana silhouette with the hand motif,
plus the "LaVEX / LOUISIANA VIOLENCE EXPERIENCES SURVEY" wordmark.

| File | Role |
| --- | --- |
| `logo.png` | The lockup as supplied, with its transparent margin. Source asset — leave it untouched |
| `logo-lockup.png` | What `index.html` renders: `logo.png` darkened and cropped to its content |

The supplied mark has a transparent background and is already in the
dashboard's palette, but its light purple (`#CF9BF1` — the hand and "VEX")
nearly vanishes against the light-purple header band. So the header copy is
**darkened**, using the same colour moves the USVEX dashboard's logo
used: light purple `#CF9BF1` → `#8E6FB0`, the state silhouette `#6B558E` →
`#4A3D66`, the wordmark text `#463B5B` → `#302846`; the black child hand is
unchanged. Colours are remapped piecewise-linearly on luminance, so
anti-aliased edges and the hand/state boundary stay smooth, and alpha is
untouched.

```python
from PIL import Image
import numpy as np

SRC = np.array([(207,155,241), (107,85,142), (70,59,91), (30,21,35)], float)
DST = np.array([(142,111,176), ( 74,61,102), (48,40,70), (30,21,35)], float)
lum = lambda c: 0.299*c[..., 0] + 0.587*c[..., 1] + 0.114*c[..., 2]

a = np.array(Image.open("logo.png").convert("RGBA")).astype(float)
L = lum(a[..., :3])
for ch in range(3):
    a[..., ch] = np.interp(L, lum(SRC)[::-1], DST[::-1, ch])
im = Image.fromarray(a.astype("uint8"), "RGBA")
im.crop(im.getbbox()).save("logo-lockup.png")
```

Re-run that if `logo.png` is ever replaced.

**Size and legibility.** The header renders the lockup at 2.94rem tall
(2.1rem on mobile), about 114px wide. At that size "LaVEX" reads but the
four-line tagline beneath it is below legibility — it renders as texture,
not words. That is a property of the artwork (a small-print tagline under a
large wordmark), not of the file. If it needs to be readable, either
raise `.lavex-logo`'s height in `style.css` (the tagline starts to resolve
around 4rem and is comfortable around 5rem), or use a mark-only crop: the
Louisiana-and-hand mark is the largest connected component of the lockup,
so it can be isolated with `scipy.ndimage.label` on the alpha channel and
saved as a near-square icon, which stays recognisable at small sizes.

If a future logo is *not* already header-safe, follow what the USVEX
dashboard's README describes: transparent background, cropped to content,
light tones deepened so the mark doesn't blend into the band.

## Remaining checklist

- [x] Official LaVEX logo in place (see "Logo" above).
- [ ] Add the tool's own author list to the footer's first line if there
      is one — CalVEX and USVEX credit named authors; none has been given
      for LaVEX, so the line is author-less rather than guessed (comment in
      `index.html`).
- [x] Weight confirmed — the report's Methods recommend `WEIGHT_LAMSTX`
      for overall analysis, and the dashboard reproduces its published
      estimates.
- [x] "Overall" now follows the report's convention (women and men
      only) — see "Caveats".
- [x] Disability 2023 vs 2025 — answered by the two codebooks: a six-item
      functional battery in 2023, a single participation item in 2025. Not
      comparable across years; footnoted.
- [x] 2025 physical IPV — answered by the 2025 report's Appendix A
      definition; the column is now rebuilt to it and reproduces the report.
- [ ] Ask the analysts how North/South (`LA_REGION`) was assigned. No
      document defines it; it exists only in the 2025 sample frame.
- [ ] Confirm that shipping respondent-level rows to the browser is
      acceptable for LaVEX's data-sharing policy. `data.js` currently
      contains de-identified but row-level survey responses; if that is not
      acceptable, precompute aggregates in `build_data.py` instead.
- [ ] Decide on final hosting path and update the embed instructions below.

## Embedding

Host these files anywhere static (GitHub Pages, Netlify, S3, or uploaded
directly to a WordPress server) and either iframe `index.html` or paste the
markup into a Custom HTML block — there is no server component.
