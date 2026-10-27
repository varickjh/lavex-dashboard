/* LaVEX (Louisiana Violence Experiences) static dashboard — two survey
 * waves, 2023 and 2025. Vanilla JS + Plotly.js, no build step, no server.
 * All filtering and weighted aggregation happens client-side over data.js.
 *
 * Laid out like the CalVEX dashboard: bars (or lines) are grouped by survey
 * year on the x-axis, one series per category of the selected comparison.
 * A dimension that was not collected in a wave (e.g. Louisiana Region in
 * 2023) simply has no bars for that wave. */
"use strict";

const D = window.LAVEX_DATA;
const N = D.WEIGHT.length;

// ---------------------------------------------------------------------------
// Demographic dimensions: column name -> display config.
// Values arrive from build_data.py as plain label strings (the Stata value
// label itself), so no code->label lookup is needed — the value IS the
// label, optionally shortened for chart display via `chip`.
// ---------------------------------------------------------------------------
const DEMOGRAPHICS = {
  GENDER_NEW: {
    label: "Gender",
    order: ["Woman", "Man", "Non-binary, genderqueer, gender fluid, self describe"],
    chip: { "Non-binary, genderqueer, gender fluid, self describe": "Non-binary / self-described" }
  },
  LGB_3: {
    label: "Sexuality",
    order: ["Straight", "Lesbian or gay", "Bisexual or other identity"]
  },
  AGE_6: {
    label: "Age",
    order: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
  },
  // race_4, not the RACE_5 the LaVEX dashboard compares by: RACE_5's Asian
  // category has 8 respondents in this 1,034-person state sample, which is
  // far too thin to plot as its own bar. race_4 is the same recode with
  // Asian folded into the residual group.
  race_4: {
    label: "Race/Ethnicity",
    order: ["White", "Black", "Hispanic", "Others"],
    chip: { "Others": "Other or multiple races" }
  },
  MARITAL: {
    label: "Marital Status",
    order: ["Married", "Widowed", "Divorced", "Separated", "Never married"]
  },
  HHSIZE: {
    label: "Household Size",
    only2025: true,
    order: ["One person, I live by myself", "Two persons", "Three persons",
            "Four persons", "Five persons", "Six or more persons"],
    chip: {
      "One person, I live by myself": "1 person", "Two persons": "2 people",
      "Three persons": "3 people", "Four persons": "4 people",
      "Five persons": "5 people", "Six or more persons": "6+ people"
    }
  },
  INCOME_QUINTILE: {
    label: "Household Income",
    order: ["$0-$29,999", "$30,000-$59,999", "$60,000-$99,999", "$100,000-$149,999", "$150,000 or more"]
  },
  HOUSING: {
    label: "Home Ownership",
    order: ["Owned or being bought by you or someone in your household", "Rented for cash", "Occupied without payment of cash rent"],
    chip: {
      "Owned or being bought by you or someone in your household": "Owned",
      "Rented for cash": "Rented for cash",
      "Occupied without payment of cash rent": "Occupied, no cash rent"
    }
  },
  EDUC_RECODE: {
    label: "Education Level",
    order: ["Less than HS", "Completed HS/some college/AD", "BA/4yr college degree", "Graduate degree"]
  },
  EMPLOY_2: {
    label: "Employment Status",
    order: ["Employed", "Not employed"]
  },
  DISABILITY: {
    label: "Disability Status",
    order: ["No Disability", "Has Disability"]
  },
  INSURANCE: {
    label: "Health Insurance",
    order: ["Has health insurance", "No health insurance"],
    chip: { "Has health insurance": "Insured", "No health insurance": "Uninsured" }
  },
  religon: {
    label: "Religion",
    only2025: true,
    order: ["Protestant", "Catholic", "Christian", "None/Atheist/Agnostic", "Others"],
    chip: {
      "Christian": "Christian (other)",
      "None/Atheist/Agnostic": "None / atheist / agnostic",
      "Others": "Other religion"
    }
  },
  INCARCERATION: {
    label: "Incarceration History",
    only2025: true,
    order: ["Never incarcerated", "First incarcerated at 18+", "First incarcerated before 18"]
  },
  IDEO: {
    label: "Political Ideology",
    order: ["Very liberal", "Somewhat liberal", "Moderate", "Somewhat conservative", "Very conservative"]
  },
  LA_REGION: {
    label: "Louisiana Region",
    only2025: true,
    order: ["North", "South"]
  },
  LADH_REGION: {
    label: "LDH Public Health Region",
    // The codebook labels these only "Region 1"..."Region 9" and supplies
    // no parish or city mapping, so they are shown exactly as labelled
    // rather than guessing at the administrative names behind the numbers.
    order: ["Region 1", "Region 2", "Region 3", "Region 4", "Region 5",
            "Region 6", "Region 7", "Region 8", "Region 9"]
  },
  METRO: {
    label: "Metro/Non-Metro",
    order: ["Metro Area", "Non-Metro Area"]
  }
};

const SIDEBAR_DEMO_GROUPS = [
  "GENDER_NEW", "LGB_3", "AGE_6", "race_4", "MARITAL", "HHSIZE",
  "INCOME_QUINTILE", "HOUSING", "EDUC_RECODE", "EMPLOY_2",
  "DISABILITY", "INSURANCE", "religon", "INCARCERATION", "IDEO"
];
// LADH_REGION is deliberately absent: its categories are only labelled
// "Region 1".."Region 9" (no parish/city names in the codebook), so it is
// withheld as both a Compare by option (index.html) and a filter. It stays
// in DEMOGRAPHICS with every box checked, so it filters nothing. Restore
// by adding it back here and uncommenting its <option> in index.html.
const SIDEBAR_LOCATION_GROUPS = ["LA_REGION", "METRO"];

function chipLabel(demKey, raw) {
  const chip = DEMOGRAPHICS[demKey].chip;
  return (chip && chip[raw]) || raw;
}

// ---------------------------------------------------------------------------
// Topics: outcome column per time period, plus past-year subcategory config.
// `ever: null` means the topic has no lifetime measure in the source data —
// the UI disables the Lifetime option for those topics. No topic currently
// needs it (every LaVEX topic has both waves), but the mechanism stays in
// case a future data refresh drops a column.
// `subcats` is keyed by time period: each period lists the columns that
// break that period's headline measure down by form. A period with an
// empty list has no breakdown, and the "Show subcategories" checkbox hides
// itself whenever the current period's list is empty.
//
// The lifetime columns are not named like their past-year counterparts.
// Physical and sexual victimisation use the raw survey batteries (Q1_1..3,
// Q6_1..6) because no derived pv_*/sv_* lifetime per-form column exists;
// IPV and perpetration do have derived ones (IPV_*_ever, everperp*). All
// of them were checked against the LaVEX 2025 report's Appendix A — see
// the README's Validation section, including the one column (IPV_P_ever)
// that does not reproduce it.
// ---------------------------------------------------------------------------
const TOPICS = {
  physical: {
    title: "Physical Violence", isPerp: false,
    ever: "pv_ever", past_year: "pv_12mo",
    subcats: {
      lifetime: [
        { col: "Q1_1", title: "Physical abuse" },
        { col: "Q1_2", title: "Knife violence" },
        { col: "Q1_3", title: "Gun violence" }
      ],
      past_year: [
        { col: "pastyearpv1", title: "Physical abuse" },
        { col: "pastyearpv2", title: "Knife violence" },
        { col: "pastyearpv3", title: "Gun violence" }
      ]
    }
  },
  sexual: {
    title: "Sexual Violence", isPerp: false,
    ever: "sv_ever", past_year: "sv_12mo",
    subcats: {
      lifetime: [
        { col: "Q6_1", title: "Verbal sexual harassment" },
        { col: "Q6_2", title: "Homophobic or transphobic comments" },
        { col: "Q6_3", title: "Cyber sexual harassment" },
        { col: "Q6_4", title: "Physically aggressive sexual harassment" },
        { col: "Q6_5", title: "Quid pro quo sexual harassment or coercion" },
        { col: "Q6_6", title: "Forced sex" }
      ],
      past_year: [
        { col: "pastyearsv1", title: "Verbal sexual harassment" },
        { col: "pastyearsv2", title: "Homophobic or transphobic comments" },
        { col: "pastyearsv3", title: "Cyber sexual harassment" },
        { col: "pastyearsv4", title: "Physically aggressive sexual harassment" },
        { col: "pastyearsv5", title: "Quid pro quo sexual harassment or coercion" },
        { col: "pastyearsv6", title: "Forced sex" }
      ]
    }
  },
  ipv: {
    title: "Intimate Partner Violence", isPerp: false,
    ever: "IPV25_EVER", past_year: "IPV25_YEAR",
    subcats: {
      lifetime: [
        { col: "IPV_E_ever", title: "Emotional abuse" },
        { col: "IPV_C_ever", title: "Coercive control" },
        { col: "IPV_T_ever", title: "Threats" },
        { col: "IPV_P_ever", title: "Physical violence" },
        { col: "IPV_L_ever", title: "Severe / life-threatening violence" },
        { col: "IPV_S_ever", title: "Sexual violence" },
        { col: "IPV_R_ever", title: "Reproductive coercion" }
      ],
      past_year: [
        { col: "IPV_E_12mo", title: "Emotional abuse" },
        { col: "IPV_C_12mo", title: "Coercive control" },
        { col: "IPV_T_12mo", title: "Threats" },
        { col: "IPV_P_12mo", title: "Physical violence" },
        { col: "IPV_L_12mo", title: "Severe / life-threatening violence" },
        { col: "IPV_S_12mo", title: "Sexual violence" },
        { col: "IPV_R_12mo", title: "Reproductive coercion" }
      ]
    }
  },
  // The combined headline measure (any physical OR sexual violence). Its
  // components are the "physical" and "sexual" topics above, so it has no
  // subcategory breakdown of its own.
  any: {
    title: "Physical or Sexual Violence", isPerp: false,
    ever: "any_violence", past_year: "any_v12",
    subcats: { lifetime: [], past_year: [] }
  },
  sexual_perp: {
    title: "Sexual Violence Perpetration", isPerp: true,
    ever: "sv_perp_ever", past_year: "sv_perp_12mo",
    subcats: {
      lifetime: [
        { col: "everperpsv1", title: "Perpetrated verbal sexual harassment" },
        { col: "everperpsv2", title: "Perpetrated homophobic or transphobic comments" },
        { col: "everperpsv3", title: "Perpetrated cyber sexual harassment" },
        { col: "everperpsv4", title: "Perpetrated physically aggressive sexual harassment" },
        { col: "everperpsv5", title: "Perpetrated quid pro quo sexual harassment or coercion" },
        { col: "everperpsv6", title: "Perpetrated forced sex" }
      ],
      past_year: [
        { col: "pastyearperpsv1", title: "Perpetrated verbal sexual harassment" },
        { col: "pastyearperpsv2", title: "Perpetrated homophobic or transphobic comments" },
        { col: "pastyearperpsv3", title: "Perpetrated cyber sexual harassment" },
        { col: "pastyearperpsv4", title: "Perpetrated physically aggressive sexual harassment" },
        { col: "pastyearperpsv5", title: "Perpetrated quid pro quo sexual harassment or coercion" },
        { col: "pastyearperpsv6", title: "Perpetrated forced sex" }
      ]
    }
  },
  physical_perp: {
    title: "Physical Violence Perpetration", isPerp: true,
    ever: "pv_perp_ever", past_year: "pv_perp_12mo",
    subcats: {
      lifetime: [
        { col: "everperppv1", title: "Perpetrated physical abuse" },
        { col: "everperppv2", title: "Perpetrated knife violence" },
        { col: "everperppv3", title: "Perpetrated gun violence" }
      ],
      past_year: [
        { col: "pastyearperppv1", title: "Perpetrated physical abuse" },
        { col: "pastyearperppv2", title: "Perpetrated knife violence" },
        { col: "pastyearperppv3", title: "Perpetrated gun violence" }
      ]
    }
  }
};

// Base outcome name used in title-building (perp topics drop "Perpetration").
const BASE_TITLE = {
  physical: "Physical Violence", sexual: "Sexual Violence",
  ipv: "Intimate Partner Violence", any: "Physical or Sexual Violence",
  sexual_perp: "Sexual Violence", physical_perp: "Physical Violence"
};
// Matches the CalVEX dashboard's purple palette per request.
const PALETTE = ["#CEA9EA", "#B08FD4", "#8E6FB0", "#6b558e", "#4A3D66", "#3d2d52"];
const OVERALL_COLOR = "#5c5c5c";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const YEARS = [2025, 2023];   // sidebar order, newest first

function defaultFilters() {
  const f = { YEAR: YEARS.slice() };
  for (const k of Object.keys(DEMOGRAPHICS)) f[k] = DEMOGRAPHICS[k].order.slice();
  return f;
}

function defaultState() {
  return {
    time_period: "past_year",
    topic: "physical",
    demographic: "GENDER_NEW",
    chart_type: "bar",
    statistics: "percent",
    overall: true,
    show_subcategories: false,
    scale_max: 40,
    count_max: null, // null = auto-fit to current data
    filters: defaultFilters()
  };
}
let state = defaultState();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function comma(x) { return x.toLocaleString("en-US"); }
function pctLabel(p) { return String(Number(p.toFixed(1))) + "%"; }

function filteredIndices() {
  const s = state;
  const out = [];
  for (let i = 0; i < N; i++) {
    if (!s.filters.YEAR.includes(D.YEAR[i])) continue;
    let ok = true;
    for (const k of Object.keys(DEMOGRAPHICS)) {
      const sel = s.filters[k];
      const val = D[k][i];
      // A row with no value for dimension k (missing/skipped in the survey)
      // has no checkbox representing it in that filter group, so it must
      // not be excluded by k's filter — otherwise missingness in ANY one
      // dimension (e.g. political ideology) would silently drop that
      // respondent from every OTHER comparison too (gender, region, etc.),
      // shrinking "Overall" and every subgroup's true denominator.
      if (val !== null && sel.length > 0 && !sel.includes(val)) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  return out;
}

// Weighted summary of one outcome column by year x demographic category (+ Overall).
// pct = sum(weight * (col==1)) / sum(weight) * 100 per group; n_total and
// raw count are unweighted.
// The "Overall" bar covers women and men only, following both LaVEX reports:
// the 2023 report's Total column reproduces from women+men alone for 22 of
// 22 past-year rates (13 of 22 with every gender), and the 2025 report's
// Overall bars for 24 of 26 measures (19 of 26).
// The ~15 gender non-conforming respondents still appear as their own bar
// when comparing by Gender, and in every other comparison — they are just
// not counted into the Overall bar. See the README's Validation section.
const OVERALL_GENDERS = new Set(["Woman", "Man"]);

function summarize(idx, vcol, demKey, showOverall) {
  const col = D[vcol], dcol = D[demKey], w = D.WEIGHT;
  const groups = new Map();
  const acc = (label, year, v, wt) => {
    const key = label + "|" + year;
    let g = groups.get(key);
    if (!g) { g = { label, year, n_total: 0, count: 0, wcount: 0, wtotal: 0 }; groups.set(key, g); }
    g.n_total += 1;
    g.wtotal += wt;
    if (v === 1) { g.count += 1; g.wcount += wt; }
  };
  for (const i of idx) {
    const v = col[i];
    if (v === null) continue;
    const yr = D.YEAR[i];
    if (showOverall && OVERALL_GENDERS.has(D.GENDER_NEW[i])) acc("Overall", yr, v, w[i]);
    const cat = dcol[i];
    if (cat !== null) acc(cat, yr, v, w[i]);
  }
  const recs = [];
  for (const g of groups.values()) {
    g.pct = g.wtotal > 0 ? (g.wcount / g.wtotal) * 100 : 0;
    recs.push(g);
  }

  const sel = state.filters[demKey];
  const keep = new Set(showOverall ? ["Overall"] : []);
  if (sel.length > 0) for (const c of sel) keep.add(c);
  return recs.filter(r => keep.has(r.label));
}

function levelOrder(recs, demKey, showOverall) {
  const present = new Set(recs.map(r => r.label));
  const levels = [];
  if (showOverall && present.has("Overall")) levels.push("Overall");
  for (const c of DEMOGRAPHICS[demKey].order) {
    if (present.has(c)) levels.push(c);
  }
  return levels;
}

function onlyOverallMode() {
  const sel = state.filters[state.demographic];
  return !sel || sel.length === 0;
}

// Overall is always neutral gray; categories walk the purple ramp in order
// (CalVEX's rule: the ramp is counted over categories only, not Overall).
function fillValues(levels) {
  const colors = {};
  let i = 0;
  for (const lv of levels) {
    if (lv === "Overall") { colors[lv] = OVERALL_COLOR; continue; }
    colors[lv] = PALETTE[Math.min(i, PALETTE.length - 1)];
    i++;
  }
  return colors;
}

// Line charts triple-encode each series (colour + dash + marker) so they
// survive grayscale printing; Overall always takes the plain first slot.
const LINE_DASH_POOL = ["solid", "solid", "dash", "dashdot", "longdash", "longdashdot", "dot"];
const LINE_SYMBOL_POOL = ["circle", "circle", "triangle-up", "square", "diamond", "asterisk-open", "x-thin-open"];
function lineAesthetics(levels) {
  const dash = {}, symbol = {};
  let catIdx = 0;
  for (const lv of levels) {
    if (lv === "Overall") { dash[lv] = LINE_DASH_POOL[0]; symbol[lv] = LINE_SYMBOL_POOL[0]; continue; }
    catIdx++;
    const slot = Math.min(catIdx + 1, LINE_DASH_POOL.length) - 1;
    dash[lv] = LINE_DASH_POOL[slot];
    symbol[lv] = LINE_SYMBOL_POOL[slot];
  }
  return { dash, symbol };
}

function buildTitle(onlyOverall) {
  const tp = state.time_period === "lifetime" ? "Lifetime" : "Past-Year";
  const topic = TOPICS[state.topic];
  const base = BASE_TITLE[state.topic];
  const stem = topic.isPerp ? `${tp} ${base} Perpetrated by` : `${tp} Experiences of ${base} by`;
  const group = onlyOverall ? "women and men combined" : DEMOGRAPHICS[state.demographic].label;
  return `${stem} ${group}`;
}

// "Experiencing" vs "Perpetrating", matching the verb the title and
// subtitle already use for the current topic.
function yAxisLabel() {
  const word = TOPICS[state.topic].isPerp ? "Perpetrating" : "Experiencing";
  return state.statistics === "percent"
    ? `Percent ${word} Violence (%)`
    : `Number ${word} Violence`;
}

function buildSubtitle(years) {
  const isPerp = TOPICS[state.topic].isPerp;
  const verb = isPerp ? "perpetrating" : "experiencing";
  const statLabel = state.statistics === "percent" ? `Percent ${verb} violence` : `Number ${verb} violence`;
  const ys = [...new Set(years)].sort((a, b) => a - b);
  if (ys.length === 0) return statLabel;
  return `${statLabel} · ${ys.length === 1 ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`}`;
}

function footnoteLines() {
  const dem = DEMOGRAPHICS[state.demographic];
  const lines = [
    "* Hover over a bar or point for the raw count (number affected / number surveyed).",
    "* “Lifetime” means ever; “past year” means the 12 months before the survey."
  ];
  if (state.overall) {
    lines.push("* Overall = women and men combined, as in the LaVEX reports. Gender non-conforming respondents (n=13 in 2023, 15 in 2025) appear only in the Gender comparison.");
  }
  if (state.topic === "any") {
    lines.push("* Counts anyone who reported physical or sexual violence, once.");
  }
  if (state.topic === "ipv") {
    lines.push("* IPV covered 22 items in 2023 and 25 in 2025; forms asked in one year only show for that year.");
  }
  // Louisiana Region gets one merged line (2025-only + its definition);
  // other 2025-only comparisons get the short generic line.
  if (state.demographic === "LA_REGION") {
    lines.push("* Collected in 2025 only. North = LDH Regions 4–8; South = Regions 1–3 and 9 (from the 2025 sample frame; not formally defined).");
  } else if (dem.only2025) {
    lines.push(`* ${dem.label} was collected in 2025 only.`);
  }
  if (state.demographic === "DISABILITY") {
    lines.push("* Measured differently each year (2023: six functional-limitation questions; 2025: one question on whether a disability limits daily activities), so the years aren't comparable.");
  }
  if (state.demographic === "METRO") {
    lines.push("* Metro = parishes in an OMB metropolitan area; Non-Metro = all other parishes.");
  }
  if (state.demographic === "race_4") {
    lines.push("* Asian respondents (n=10 in 2023, 8 in 2025) are included in “Other or multiple races.”");
  }
  if (state.demographic === "INCARCERATION") {
    lines.push("* Ever held in prison, jail, or juvenile detention, by age when first held.");
  }
  return lines;
}

function validationMessage() {
  if (state.filters.YEAR.length === 0) return "Please select at least one survey year.";
  const dem = DEMOGRAPHICS[state.demographic];
  if (dem.only2025 && !state.filters.YEAR.includes(2025)) {
    return `${dem.label} was only collected in 2025. Select 2025 under Survey year to compare by it.`;
  }
  for (const key of SIDEBAR_LOCATION_GROUPS) {
    if (state.filters[key].length === 0) {
      return `Please select at least one ${DEMOGRAPHICS[key].label} option.`;
    }
  }
  const categoriesUnselected = state.filters[state.demographic].length === 0;
  if (!state.overall && categoriesUnselected) {
    return `Please select at least one of "Overall" or ${DEMOGRAPHICS[state.demographic].label} labels`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Y-axis auto-fit helpers
// ---------------------------------------------------------------------------
function niceStep(v) {
  const raw = Math.max(1, v / 40);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
}

function autoPercentMax(maxPct) {
  if (!isFinite(maxPct) || maxPct <= 0) return 20;
  const target = Math.ceil((maxPct * 1.15) / 5) * 5;
  return Math.min(100, Math.max(10, target));
}

function syncSlider(cfg) {
  const slider = document.getElementById("scale_max");
  slider.min = cfg.min;
  slider.max = cfg.max;
  slider.step = cfg.step;
  slider.value = cfg.value;
  document.getElementById("scale_max_unit").textContent = cfg.unit;
  document.getElementById("scale_max_value").textContent =
    cfg.unit === "n" ? comma(cfg.value) : String(cfg.value);
}

function countAxis(autoY) {
  const step = niceStep(autoY);
  const sliderMax = Math.ceil(autoY / step) * step;
  if (state.count_max !== null) state.count_max = Math.min(state.count_max, sliderMax);
  const top = state.count_max !== null ? state.count_max : sliderMax;
  syncSlider({ min: step, max: sliderMax, step, value: top, unit: "n" });
  return [0, top];
}

function percentAxis() {
  if (state.time_period !== "past_year") {
    return { range: [0, 107], tickvals: percentAxisBreaks(100), hline: null };
  }
  syncSlider({ min: 5, max: 100, step: 5, value: state.scale_max, unit: "%" });
  // hline: a thin reference line at the cap, as in CalVEX, so a truncated
  // axis reads as truncated rather than as the top of the scale.
  return { range: [0, state.scale_max + 5], tickvals: percentAxisBreaks(state.scale_max), hline: state.scale_max };
}

function percentAxisBreaks(scaleMax) {
  const step = scaleMax <= 25 ? 5 : scaleMax <= 50 ? 10 : 20;
  const out = [];
  for (let v = 0; v <= scaleMax; v += step) out.push(v);
  return out;
}

// Recompute the percent slider's data-driven default and clear the count
// override. Called whenever topic / demographic / time period changes;
// filter-checkbox tweaks deliberately leave the slider where the user left
// it (so toggling a filter doesn't yank the axis around mid-comparison).
function resetSliderDefaults() {
  const topic = TOPICS[state.topic];
  const vcol = state.time_period === "lifetime" ? topic.ever : topic.past_year;
  if (vcol) {
    const idx = filteredIndices();
    const recs = summarize(idx, vcol, state.demographic, state.overall);
    const maxPct = Math.max(0, ...recs.map(r => r.pct));
    state.scale_max = autoPercentMax(maxPct);
  }
  state.count_max = null;
}

// ---------------------------------------------------------------------------
// Trace + layout construction
// ---------------------------------------------------------------------------
// Body/heading fonts match the page's CSS (--lavex-font / --lavex-font-heading
// in style.css) so the chart doesn't look like a different typeface system
// grafted onto the surrounding UI.
const BODY_FONT = "'Plus Jakarta Sans', sans-serif";
// Same family as BODY_FONT, not a separate display face — Fredoka read too
// punchy/rounded for chart titles, so the heading role instead leans on
// Plus Jakarta Sans's boldest weight (800, set explicitly below) at a
// larger size, kept as its own constant so it can still be swapped
// independently later.
const HEADING_FONT = "'Plus Jakarta Sans', sans-serif";

const HOVER_LABEL = {
  bgcolor: "#fff", bordercolor: "#ccc",
  font: { family: BODY_FONT, size: 13, color: "#111" }
};

// Plain system font for the legend — always available, so Plotly's text
// measurements are correct on the very first draw. Plotly mis-measures
// label widths the first time it draws a webfont it hasn't seen yet, which
// leaves the color swatch drawn over the first letters of the label; a
// plain, always-loaded stack sidesteps that instead of chasing it with a
// relayout workaround.
const LEGEND_FONT = "Arial, sans-serif";

// Material Design's "home" glyph, reused as a custom modebar button below —
// a reset-to-defaults control that lives on the chart itself (next to the
// download icon), not just on the header logo.
const HOME_ICON = { width: 24, height: 24, path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" };

const PLOTLY_CONFIG = {
  responsive: true,
  displaylogo: false,
  // Keep hover (tooltips) as the only data-reveal interaction, plus
  // Plotly's native double-click-to-reset. Drag-to-zoom/pan and the
  // corner-resize handles are disabled below via dragmode/fixedrange, and
  // their toolbar buttons are removed so they're not even discoverable.
  modeBarButtonsToRemove: ["lasso2d", "select2d", "zoom2d", "pan2d", "zoomIn2d", "zoomOut2d", "autoScale2d", "resetScale2d"],
  modeBarButtonsToAdd: [{
    name: "resetToDefaults",
    title: "Reset to defaults",
    icon: HOME_ICON,
    click: () => resetToDefaults()
  }],
  toImageButtonOptions: { filename: "lavex-chart", scale: 2 }
};

// One trace per category (not one multi-colour trace) — Plotly's legend
// gives one clickable entry per trace. Traces that represent the same
// category across every subcategory panel share a legendgroup, so clicking
// one legend entry toggles that category everywhere; only the first panel
// registers a legend entry (opts.showLegend).
//
// A category can be missing from a year (e.g. Louisiana Region was not
// collected in 2023). Plotly's automatic grouping would reserve an empty slot
// for it and push the bars that ARE present off-centre under their year tick,
// so each bar gets an explicit width and offset that centres whatever is
// present in that year (ggplot's position_dodge), as the CalVEX dashboard does.
function tracesFor(recs, levels, opts) {
  const s = state;
  const verb = TOPICS[s.topic].isPerp ? "perpetrating" : "experiencing";
  const colors = fillValues(levels);
  const aes = lineAesthetics(levels);
  const years = [...new Set(recs.map(r => r.year))].sort((a, b) => a - b);
  const presentByYear = new Map();
  for (const y of years) {
    presentByYear.set(y, levels.filter(lv => recs.some(r => r.year === y && r.label === lv)));
  }
  // Slot = the width one bar claims inside its group, in category units (a
  // year's whole column is 1.0). Capped at 0.14 so bars stay narrow however
  // few categories there are, and the whole group at 0.62 so there is a clear
  // gap between the 2023 and 2025 groups. A bar fills 92% of its slot, so
  // neighbours within a group nearly touch.
  // On a phone the plot is ~300px wide, so the desktop caps would leave each
  // bar ~20px — too narrow for a "31.4%" label. Phones let the groups use
  // more of their column instead (the between-year gap shrinks, but stays).
  const slot = isNarrow()
    ? Math.min(0.2, 0.8 / Math.max(1, levels.length))
    : Math.min(0.14, 0.62 / Math.max(1, levels.length));
  const barW = slot * 0.92;
  const traces = [];

  for (const lv of levels) {
    const rows = years.map(y => recs.find(r => r.label === lv && r.year === y)).filter(Boolean);
    if (rows.length === 0) continue;
    const name = chipLabel(s.demographic, lv);
    const texts = rows.map(r => s.statistics === "percent" ? pctLabel(r.pct) : comma(r.count));
    const base = {
      name,
      x: rows.map(r => String(r.year)),
      y: rows.map(r => s.statistics === "percent" ? r.pct : r.count),
      customdata: rows.map(r => [
        pctLabel(r.pct).replace("%", ""), comma(r.count), comma(r.n_total),
        `${name} ${verb} ${opts.vLabel} in ${r.year}`
      ]),
      hovertemplate:
        "<b>%{customdata[3]}</b><br>" +
        "Year: <b>%{x}</b><br>" +
        "Percentage: <b>%{customdata[0]}%</b><br>" +
        "Raw count: <b>%{customdata[1]}/%{customdata[2]}</b><extra></extra>",
      hoverlabel: HOVER_LABEL,
      legendgroup: lv,
      showlegend: opts.showLegend !== false,
      xaxis: "x" + (opts.axisSuffix || ""),
      yaxis: "y" + (opts.axisSuffix || "")
    };
    if (s.chart_type === "line") {
      traces.push({
        ...base, type: "scatter", mode: "lines+markers+text",
        text: texts, textposition: "top center",
        textfont: { size: opts.smallText ? 9 : 11, family: BODY_FONT },
        line: { color: colors[lv], width: 2.4, dash: aes.dash[lv] },
        marker: { color: colors[lv], size: 9, symbol: aes.symbol[lv] },
        cliponaxis: false
      });
    } else {
      traces.push({
        ...base, type: "bar",
        text: texts, textposition: "outside",
        textfont: { size: opts.smallText ? 9 : 11, family: BODY_FONT, color: "#111" },
        marker: { color: colors[lv] },
        width: rows.map(() => barW),
        offset: rows.map(r => {
          const present = presentByYear.get(r.year);
          return (present.indexOf(lv) - present.length / 2) * slot + (slot - barW) / 2;
        }),
        cliponaxis: true
      });
    }
  }
  return { traces, years };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const chartEl = document.getElementById("chart");
const validationEl = document.getElementById("validation-msg");

function isNarrow() { return window.innerWidth <= 768; }

function wrapTitle(text) {
  if (!isNarrow()) return { text, lines: 1 };
  const limit = Math.max(22, Math.floor((window.innerWidth - 30) / 8.5));
  const lines = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if (cur && (cur + " " + w).length > limit) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return { text: lines.join("<br>"), lines: lines.length };
}

// The page is one naturally-scrolling column now (chart, then the refine-
// population filters below it) rather than a chart pinned beside a
// fixed-height sidebar, so this just sizes the chart to a large-but-bounded
// share of the viewport instead of "whatever's left after the sidebar".
function mainChartHeight() {
  const floor = isNarrow() ? 380 : 420;
  const cap = isNarrow() ? 620 : 680;
  const reserve = isNarrow() ? 170 : 230;
  return Math.max(floor, Math.min(cap, window.innerHeight - reserve));
}

function showValidation(msg) {
  Plotly.purge(chartEl);
  chartEl.style.display = "none";
  validationEl.hidden = false;
  validationEl.textContent = msg;
}

// The subcategory list for the current topic + time period. Both periods
// now have breakdowns for every topic except "Any physical or sexual
// violence", whose components ARE the other topics.
function currentSubcats() {
  return TOPICS[state.topic].subcats[state.time_period] || [];
}

function subcatsActive() {
  return state.show_subcategories && currentSubcats().length > 0;
}

function renderMainChart(idx) {
  const s = state;
  const topic = TOPICS[s.topic];
  const vcol = s.time_period === "lifetime" ? topic.ever : topic.past_year;
  const recs = summarize(idx, vcol, s.demographic, s.overall);
  const levels = levelOrder(recs, s.demographic, s.overall);
  const onlyOverall = onlyOverallMode();

  const { traces, years } = tracesFor(recs, levels, { vLabel: topic.title, smallText: levels.length > 4 });
  const ax = s.statistics === "percent" ? percentAxis() : { range: countAxis(Math.max(0, ...recs.map(r => r.count)) * 1.15) };
  const yLab = yAxisLabel();
  const wrapped = wrapTitle(buildTitle(onlyOverall));

  const layout = {
    barmode: "group",
    bargap: 0.25,
    bargroupgap: 0.06,
    // One label size per chart. By default Plotly shrinks each "outside"
    // label to fit its own bar, so labels come out at visibly different
    // sizes; uniformtext gives them all the size of the tightest fit.
    uniformtext: { mode: "show", minsize: isNarrow() ? 7 : 8 },
    dragmode: false,
    font: { family: BODY_FONT, color: "#111" },
    title: {
      text: `<b>${wrapped.text}</b>`,
      // Heading font here only — the one big, prominent moment on the page,
      // matching how the header title uses it. Axis/tick/legend text stays
      // in the body font (or Arial for the legend). Explicit weight: 800
      // goes past the <b> tag's default bold (700) to match the header's
      // ExtraBold weight.
      font: { family: HEADING_FONT, weight: 800, size: isNarrow() ? 14 : 19 },
      x: 0.01, xanchor: "left",
      yref: "container", y: 0.97, yanchor: "top",
      subtitle: { text: buildSubtitle(idx.map(i => D.YEAR[i])), font: { family: BODY_FONT, size: 12, color: "#737373" } }
    },
    // A one-entry legend (just "Overall") is redundant with the title
    // already saying "all respondents", so it's dropped in that mode.
    // Paper-referenced (not container-referenced): with xref: "container"
    // Plotly reserves the legend's full width as side margin and squeezes
    // the plot area, instead of just floating above it.
    showlegend: !onlyOverall,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.0, yanchor: "bottom", font: { size: 11, family: LEGEND_FONT } },
    xaxis: {
      title: { text: "<b>Year</b>", font: { size: 13 } },
      type: "category",
      categoryorder: "array",
      categoryarray: years.map(String),
      tickfont: { size: 14 },
      // Space between the bars' baseline and the year labels.
      ticklabelstandoff: 14,
      fixedrange: true,
      showgrid: false
    },
    yaxis: {
      title: { text: `<b>${yLab}</b>`, font: { size: 13 } },
      range: ax.range,
      gridcolor: "#e8eaee",
      zeroline: false,
      fixedrange: true,
      ...(ax.tickvals ? { tickvals: ax.tickvals } : { tickformat: "," })
    },
    shapes: ax.hline ? [{
      type: "line", xref: "paper", x0: 0, x1: 1, y0: ax.hline, y1: ax.hline,
      line: { color: "#CCCCCC", width: 1 }
    }] : [],
    margin: isNarrow()
      ? { t: 115 + (wrapped.lines - 1) * 18, r: 10, b: 50, l: 55 }
      : { t: 135, r: 20, b: 60, l: 75 },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#fff",
    width: chartEl.clientWidth || undefined,
    height: mainChartHeight()
  };

  // The horizontal legend is anchored to the top of the plot and grows
  // UPWARD as it wraps, so a long legend (7 age bands; long marital labels
  // on a phone) would run into the subtitle. Plotly only knows the wrapped
  // height after drawing, so draw, read it, and give each extra row (29px,
  // the measured height of one legend row) back to the top margin.
  const baseTop = layout.margin.t;
  Plotly.react(chartEl, traces, layout, PLOTLY_CONFIG).then(() => {
    const lg = chartEl._fullLayout && chartEl._fullLayout.legend;
    if (!layout.showlegend || !lg || !lg._height) return;
    const need = baseTop + Math.max(0, lg._height - 29);
    if (Math.abs(need - chartEl._fullLayout.margin.t) > 1) {
      Plotly.relayout(chartEl, { "margin.t": need, height: layout.height + (need - baseTop) });
    }
  });
}

function renderSubcategories(idx) {
  const s = state;
  const showOverall = s.overall;
  const onlyOverall = onlyOverallMode();

  const panels = currentSubcats()
    .map(item => ({ ...item, recs: summarize(idx, item.col, s.demographic, showOverall) }))
    .filter(p => p.recs.length > 0);
  if (panels.length === 0) { showValidation("No data for the current selection."); return; }

  // Uniform y-axis across all panels. In percent mode this follows the same
  // rule percentAxis() applies to the main chart: past-year is capped by
  // the slider (its values cluster low), lifetime always shows the full
  // 0-100 range. That matters here because updateConditionalControls()
  // hides the slider in lifetime + percent — capping the panels at
  // state.scale_max there would leave a truncated axis the user has no
  // control to raise.
  let yRange, tickvals = null;
  if (s.statistics === "percent" && s.time_period !== "past_year") {
    yRange = [0, 107];
    tickvals = percentAxisBreaks(100);
  } else if (s.statistics === "percent") {
    syncSlider({ min: 5, max: 100, step: 5, value: s.scale_max, unit: "%" });
    yRange = [0, s.scale_max + Math.max(5, Math.round(s.scale_max * 0.1))];
    tickvals = percentAxisBreaks(s.scale_max);
  } else {
    const globalMax = Math.max(1, ...panels.flatMap(p => p.recs.map(r => r.count)));
    yRange = countAxis(globalMax * 1.15);
  }

  // Grid the panels instead of stacking them in one long column, so
  // comparing subcategories doesn't require scrolling. Two columns, not
  // three: each panel now holds a bar per category PER YEAR, which gets too
  // thin to read at a third of the width. Narrow/mobile viewports always
  // fall back to a single column.
  const gridCols = isNarrow() ? 1 : Math.min(2, panels.length);
  const gridRows = Math.ceil(panels.length / gridCols);

  // Panel titles are positioned via "<axis> domain" y-refs, which are
  // fractions of THAT SUBPLOT's own height — not a fixed pixel gap. A
  // single-row grid gives its subplot the whole plot-area height, so a
  // fixed offset (e.g. 6%) pushes the title much further up in absolute
  // pixels than the same 6% would in a 3-row grid, where each subplot is a
  // third as tall. Left uncorrected, that's exactly what made the legend
  // and row-1 titles collide only in low-row-count grids (e.g. 3 panels =
  // 1 row) while 2-3 row grids looked fine. Scale the offset by each row's
  // actual height fraction (matching Plotly's own row-height formula for
  // the ygap below) so the absolute gap above every row stays ~constant.
  const rowHeightFrac = 1 / (gridRows + (gridRows - 1) * 0.34);
  const titleYOffset = 1 + 0.025 / rowHeightFrac;

  const traces = [];
  const annotations = [];
  const layout = {
    barmode: "group",
    bargap: 0.25,
    bargroupgap: 0.06,
    // One label size per chart. By default Plotly shrinks each "outside"
    // label to fit its own bar, so labels come out at visibly different
    // sizes; uniformtext gives them all the size of the tightest fit.
    uniformtext: { mode: "show", minsize: isNarrow() ? 7 : 8 },
    dragmode: false,
    font: { family: BODY_FONT, color: "#111" },
    title: { text: "", subtitle: { text: "" } },
    showlegend: !onlyOverall,
    legend: { orientation: "h", x: 1, xanchor: "right", y: 1.16, yanchor: "bottom", font: { size: 11, family: LEGEND_FONT } },
    grid: { rows: gridRows, columns: gridCols, pattern: "independent", xgap: 0.12, ygap: 0.34 },
    // The legend/title collision this margin.t once tried to fix was
    // actually solved by legend.y above (both this margin and the legend's
    // y move together when margin changes, so widening margin.t alone
    // never closed that gap) — this had crept up past what a legend row
    // alone needs, leaving a big empty band above every subcategory chart.
    margin: isNarrow() ? { t: 118, r: 10, b: 46, l: 55 } : { t: 130, r: 20, b: 50, l: 75 },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#fff",
    width: chartEl.clientWidth || undefined,
    height: gridRows * (isNarrow() ? 260 : 300) + 155
  };

  panels.forEach((panel, k) => {
    const suffix = k === 0 ? "" : String(k + 1);
    const inLeftColumn = k % gridCols === 0;
    const levels = levelOrder(panel.recs, s.demographic, showOverall);
    const { traces: panelTraces, years } = tracesFor(panel.recs, levels, {
      vLabel: panel.title, axisSuffix: suffix, smallText: true, showLegend: k === 0
    });
    traces.push(...panelTraces);

    layout["xaxis" + suffix] = {
      type: "category",
      categoryorder: "array",
      categoryarray: years.map(String),
      tickfont: { size: isNarrow() ? 12 : 14 },
      ticklabelstandoff: 10,
      automargin: true,
      fixedrange: true,
      showgrid: false
    };
    layout["yaxis" + suffix] = {
      // Only the leftmost column repeats the axis title — every panel
      // shares the same scale, so titling every column is redundant and
      // eats into already-tight per-column width.
      title: inLeftColumn ? { text: `<b>${yAxisLabel()}</b>`, font: { size: 10.5 } } : undefined,
      range: yRange,
      gridcolor: "#e8eaee",
      zeroline: false,
      fixedrange: true,
      ...(tickvals ? { tickvals } : { tickformat: "," })
    };
    annotations.push({
      text: `<b>${panel.title}</b>`,
      // Anchored to this panel's own x-axis domain (not the whole figure),
      // so the title sits above its own subplot in every grid column.
      xref: "x" + suffix + " domain", x: 0, xanchor: "left",
      yref: "y" + suffix + " domain", y: titleYOffset, yanchor: "bottom",
      showarrow: false, font: { size: 13 }
    });
  });
  layout.annotations = annotations;

  Plotly.react(chartEl, traces, layout, PLOTLY_CONFIG);
}

let lastView = null;
let lastRenderWidth = 0;
function render() {
  const msg = validationMessage();
  if (msg) { showValidation(msg); lastView = null; renderFootnotes(); return; }
  validationEl.hidden = true;
  chartEl.style.display = "";

  const view = subcatsActive() ? "sub" : "main";
  if (view !== lastView && lastView !== null) Plotly.purge(chartEl);
  lastView = view;

  const idx = filteredIndices();
  if (view === "sub") renderSubcategories(idx);
  else renderMainChart(idx);
  lastRenderWidth = chartEl.clientWidth;
  renderFootnotes();
}

function renderFootnotes() {
  document.getElementById("footnotes").innerHTML =
    footnoteLines().map(l => `<p>${l}</p>`).join("");
}

// ---------------------------------------------------------------------------
// Sidebar construction
// ---------------------------------------------------------------------------
function buildFilterGroup(container, id, label, choices, help) {
  const wrap = document.createElement("div");
  wrap.className = "lavex-filter-group";
  wrap.dataset.filterId = id;

  const head = document.createElement("div");
  head.className = "lavex-filter-head";
  head.innerHTML =
    `<span class="lavex-filter-label">${label}</span>` +
    `<span class="lavex-filter-links">` +
    `<a href="#" data-bulk="all">All</a><a href="#" data-bulk="none">None</a></span>`;
  wrap.appendChild(head);

  for (const value of choices) {
    const lab = document.createElement("label");
    lab.className = "lavex-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = value;
    cb.checked = state.filters[id].includes(value);
    cb.addEventListener("change", () => {
      const set = new Set(state.filters[id]);
      cb.checked ? set.add(value) : set.delete(value);
      state.filters[id] = choices.filter(c => set.has(c));
      render();
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + (id === "YEAR" ? String(value) : chipLabel(id, value))));
    wrap.appendChild(lab);
  }
  if (help) {
    const h = document.createElement("span");
    h.className = "lavex-filter-help";
    h.textContent = help;
    wrap.appendChild(h);
  }

  head.querySelectorAll("a[data-bulk]").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const all = a.dataset.bulk === "all";
      state.filters[id] = all ? choices.slice() : [];
      wrap.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = all; });
      render();
    });
  });

  container.appendChild(wrap);
}

function buildSidebar() {
  const demoBox = document.getElementById("demographic-filters");
  demoBox.innerHTML = "";
  for (const key of SIDEBAR_DEMO_GROUPS) {
    buildFilterGroup(demoBox, key, DEMOGRAPHICS[key].label, DEMOGRAPHICS[key].order);
  }
  const locBox = document.getElementById("location-filters");
  locBox.innerHTML = "";
  buildFilterGroup(locBox, "YEAR", "Survey year", YEARS);
  for (const key of SIDEBAR_LOCATION_GROUPS) {
    buildFilterGroup(locBox, key, DEMOGRAPHICS[key].label, DEMOGRAPHICS[key].order);
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function updateConditionalControls() {
  const sliderVisible =
    (state.statistics === "percent" && state.time_period === "past_year") ||
    state.statistics === "count";
  document.getElementById("slider-control").style.display = sliderVisible ? "" : "none";
  document.getElementById("subcat-wrap").style.display =
    currentSubcats().length > 0 ? "" : "none";
}

// Disables the Lifetime option and forces Past Year while the active topic
// has no lifetime column (TOPICS[topic].ever === null) — see the TOPICS
// comment above. No topic currently triggers this, but a future data
// refresh dropping a lifetime column should just work without UI changes.
function updateTimePeriodAvailability() {
  const sel = document.getElementById("time_period");
  const lifetimeOpt = sel.querySelector('option[value="lifetime"]');
  const noLifetime = TOPICS[state.topic].ever === null;
  lifetimeOpt.disabled = noLifetime;
  if (noLifetime && state.time_period === "lifetime") {
    state.time_period = "past_year";
    sel.value = "past_year";
  }
}

function syncTopbarFromState() {
  for (const id of ["time_period", "topic", "demographic", "chart_type", "statistics"]) {
    document.getElementById(id).value = state[id];
  }
  document.getElementById("overall").checked = state.overall;
  document.getElementById("show_subcategories").checked = state.show_subcategories;
  updateTimePeriodAvailability();
  updateConditionalControls();
}

// Shared by the header logo click and the chart's own "Reset to defaults"
// modebar button (see PLOTLY_CONFIG) so both trigger identical behavior.
function resetToDefaults() {
  state = defaultState();
  syncTopbarFromState();
  buildSidebar();
  render();
}

function wireControls() {
  const on = (id, fn) => document.getElementById(id).addEventListener("change", fn);

  on("time_period", e => {
    state.time_period = e.target.value;
    resetSliderDefaults(); updateConditionalControls(); render();
  });
  on("topic", e => {
    state.topic = e.target.value;
    updateTimePeriodAvailability();
    resetSliderDefaults(); updateConditionalControls(); render();
  });
  on("demographic", e => {
    state.demographic = e.target.value;
    resetSliderDefaults(); render();
  });
  on("chart_type", e => { state.chart_type = e.target.value; render(); });
  on("statistics", e => {
    state.statistics = e.target.value;
    state.count_max = null;
    updateConditionalControls(); render();
  });
  on("overall", e => { state.overall = e.target.checked; render(); });
  on("show_subcategories", e => {
    state.show_subcategories = e.target.checked;
    state.count_max = null;
    render();
  });

  const slider = document.getElementById("scale_max");
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    if (state.statistics === "count") state.count_max = v;
    else state.scale_max = v;
    document.getElementById("scale_max_value").textContent =
      state.statistics === "count" ? comma(v) : String(v);
    render();
  });

  document.getElementById("home-reset").addEventListener("click", e => {
    e.preventDefault();
    resetToDefaults();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (validationEl.hidden) render(); }, 120);
  });

  const wireToggle = (btnId, target, collapsedClass, startOpen, affectsChart = true) => {
    const btn = document.getElementById(btnId);
    const set = open => {
      target.classList.toggle(collapsedClass, !open);
      btn.classList.toggle("closed", !open);
      btn.setAttribute("aria-expanded", String(open));
    };
    set(startOpen);
    btn.addEventListener("click", () => {
      set(target.classList.contains(collapsedClass));
      // Only re-render for toggles that change the chart's own available
      // width (topbar/sidebar); Demographic Specifics sits below the chart
      // and never affects its size, so re-rendering there would just be
      // wasted work.
      if (affectsChart && validationEl.hidden) render();
    });
  };
  // phones start with both panels collapsed; tablet and desktop start open
  const isPhone = window.innerWidth <= 576;
  wireToggle("topbar-toggle", document.getElementById("topbar"), "collapsed", !isPhone);
  wireToggle("sidebar-toggle", document.getElementById("sidebar-wrap"), "collapsed", !isPhone);
  // Always closed by default, regardless of viewport — this is a secondary
  // filter panel, not primary chart controls, so it shouldn't compete for
  // attention on first load.
  wireToggle("demographic-specifics-toggle", document.getElementById("demographic-specifics-wrap"), "collapsed", false, false);

  // Catch every container-width change the window 'resize' event misses
  // (panel toggles, embed/iframe resizes, zoom reflows) and redraw if the
  // chart's width no longer matches what was last rendered.
  if (typeof ResizeObserver !== "undefined") {
    let roTimer = null;
    new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = setTimeout(() => {
        if (validationEl.hidden && Math.abs(chartEl.clientWidth - lastRenderWidth) > 1) render();
      }, 100);
    }).observe(document.querySelector(".lavex-main"));
  }
}

// ---------------------------------------------------------------------------
buildSidebar();
syncTopbarFromState();
resetSliderDefaults();
wireControls();

if (document.fonts && document.fonts.status !== "loaded") {
  let started = false;
  const start = () => { if (!started) { started = true; render(); } };
  document.fonts.ready.then(start);
  setTimeout(start, 1500);
} else {
  render();
}
