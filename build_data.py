#!/usr/bin/env python3
"""Build data.js from the LaVEX (Louisiana VEX) 2025 Stata source file.

Reads the .dta directly (not a CSV export) so refreshing the data is just
"drop in a new .dta and re-run" — no separate CSV-export step to remember,
and no risk of a CSV intermediate silently drifting out of date relative to
the .dta. Re-run whenever the .dta changes:

    python3 build_data.py

Requires pandas (see requirements.txt): `pip install -r requirements.txt`.

Unlike the USVEX build script, this one does NOT use
`pd.read_stata(convert_categoricals=True)`: one column in this file
(P_INDUSTRY20) has duplicate value labels, which makes pandas refuse to
convert ANY column. Instead the file is read raw-numeric and value labels
are applied per column from the StataReader's own label table, which is
both more robust and lets the yes/no normalizer see the raw codes (77 =
DON'T KNOW, 98 = SKIPPED ON WEB, 99 = REFUSED) directly.
"""
import json
import pathlib

import pandas as pd

HERE = pathlib.Path(__file__).parent
OUT = HERE / "data.js"

# One entry per survey wave. `weight` is the wave's final analysis weight;
# 2023's is the state-representative post-stratification weight shipped with
# the ICPSR release (its README: "use sampling weight variable WEIGHT"),
# 2025's is the pooled LA/MS/TX weight the 2025 report recommends.
WAVES = [
    {"year": 2023, "weight": "WEIGHT",
     "path": HERE / "data" / "ICPSR_199088-V1.1" / "LaVEX2023 OpenICPSR dataset v1.dta"},
    {"year": 2025, "weight": "WEIGHT_LAMSTX",
     "path": HERE / "data" / "[P003] UCSD_Tulane_LA_VEX_Survey_2025_data.dta"},
]

# Binary (0/1) outcome + subcategory columns. Most carry Stata's "yesno"
# value label; a handful (IPV_P_*, IPV_L_*, ever_*_perp, ...) have no label
# attached and come through as raw 0.0/1.0 — norm_binary() handles both
# rather than assuming every sibling column is labeled the same way.
BINARY_COLUMNS = [
    # headline "any violence" measures
    "any_violence", "any_v12",
    # physical violence, experienced. The lifetime per-form breakdown lives
    # in the raw Q1_* battery rather than a derived pv_* column; Q1_1..Q1_3
    # reproduce the report's Appendix A rates exactly.
    "pv_ever", "pv_12mo",
    "Q1_1", "Q1_2", "Q1_3",
    "pastyearpv1", "pastyearpv2", "pastyearpv3",
    # physical violence, perpetrated
    "pv_perp_ever", "pv_perp_12mo",
    "everperppv1", "everperppv2", "everperppv3",
    "pastyearperppv1", "pastyearperppv2", "pastyearperppv3",
    # sexual violence, experienced. Q6_1..Q6_6 is the lifetime counterpart
    # of pastyearsv1..6, again matching Appendix A exactly.
    "sv_ever", "sv_12mo",
    "Q6_1", "Q6_2", "Q6_3", "Q6_4", "Q6_5", "Q6_6",
    "pastyearsv1", "pastyearsv2", "pastyearsv3",
    "pastyearsv4", "pastyearsv5", "pastyearsv6",
    # sexual violence, perpetrated
    "sv_perp_ever", "sv_perp_12mo",
    "everperpsv1", "everperpsv2", "everperpsv3",
    "everperpsv4", "everperpsv5", "everperpsv6",
    "pastyearperpsv1", "pastyearperpsv2", "pastyearperpsv3",
    "pastyearperpsv4", "pastyearperpsv5", "pastyearperpsv6",
    # intimate partner violence
    "IPV25_EVER", "IPV25_YEAR",
    "IPV_E_ever", "IPV_C_ever", "IPV_T_ever",
    "IPV_P_ever", "IPV_L_ever", "IPV_S_ever", "IPV_R_ever",
    "IPV_E_12mo", "IPV_C_12mo", "IPV_T_12mo",
    "IPV_P_12mo", "IPV_L_12mo", "IPV_S_12mo", "IPV_R_12mo",
]

# Demographic columns exported as-is: the Stata value label IS the display
# label, so no code->label table is needed on the JS side. Blank -> null.
DEMOGRAPHIC_COLUMNS = [
    "GENDER_NEW", "LGB_3", "AGE_6", "race_4", "MARITAL", "HHSIZE",
    "INCOME_QUINTILE", "HOUSING", "EDUC_RECODE", "EMPLOY_2",
    "religon", "LA_REGION", "LADH_REGION", "METRO",
]

# Columns whose raw labels need rewording before they reach the browser,
# so a category reads correctly standing alone in a chart legend ("Yes" on
# its own says nothing; "Has Disability" does).
RELABEL = {
    "disability": {"No": "No Disability", "Yes": "Has Disability"},
    "HL032": {"Yes": "Has health insurance", "No": "No health insurance"},
}
# Source column -> exported name, for the two columns above.
RENAME = {"disability": "DISABILITY", "HL032": "INSURANCE"}

# IDEO uses "Unknown" (source code -1) as its missing-data sentinel rather
# than a blank, so it needs its own exclusion on top of the blank check.
EXCLUDE_VALUES = {"IDEO": {"Unknown"}}

YES = {"yes"}
NO = {"no"}


def label_maps(path):
    """var name -> {numeric code: label text}, from the file's label table."""
    rdr = pd.io.stata.StataReader(path)
    rdr.variable_labels()          # forces the header/label table to load
    value_labels = rdr.value_labels()
    per_var = dict(zip(rdr._varlist, rdr._lbllist))
    return {v: value_labels[ls] for v, ls in per_var.items() if ls in value_labels}


def norm_binary(v, labels):
    """1 / 0 / None from either a yes-no-labeled column or a raw 0/1 one.

    Anything else — missing, DON'T KNOW (77), SKIPPED ON WEB (98),
    REFUSED (99), or a stray skip code — becomes null, which the dashboard
    drops from both the numerator and the denominator.
    """
    if pd.isna(v):
        return None
    if labels:
        text = str(labels.get(v, "")).strip().lower()
        if text in YES:
            return 1
        if text in NO:
            return 0
        return None
    f = float(v)
    return 1 if f == 1.0 else (0 if f == 0.0 else None)


def norm_demo(v, labels, exclude=(), relabel=None):
    if pd.isna(v):
        return None
    text = str(labels.get(v, v)).strip() if labels else str(v).strip()
    if relabel:
        text = relabel.get(text, text)
    if not text or text in exclude:
        return None
    return text


# ---------------------------------------------------------------------------
# 2023 -> 2025 harmonization. Each output column is read from the 2023 file
# under a different name or recoded; a column the 2023 file simply does not
# have comes out as all-null for 2023, which the dashboard treats as "not
# asked that year" (that year's bars just don't appear).
# ---------------------------------------------------------------------------
# 2023 asked 22 IPV items, 2025 asked 25 (it added the reproductive-coercion
# pair and split a document-control item), so the any-IPV columns are named
# IPV22_* in 2023 and IPV25_* in 2025. Same measure, different item count.
RENAME_2023 = {
    "IPV25_EVER": "IPV22_EVER", "IPV25_YEAR": "IPV22_YEAR",
    "EDUC_RECODE": "EDUC_4",            # same four categories, older name
    "DISABILITY": "DISABILITY",         # 2023 has the capitalised source only
}

# 2023's INCOME_QUINTILE is a sample quintile with data-driven cut points
# (it splits inside dollar brackets), not the dollar bands 2025 uses, so the
# two are not comparable. Both files carry the same 18-level INCOME, so the
# 2025 bands are rebuilt for 2023 from it. The mapping below reproduces
# 2025's own INCOME_QUINTILE exactly (verified code-by-code).
INCOME_BAND = {**{c: 1 for c in range(1, 7)}, **{c: 2 for c in range(7, 11)},
               **{c: 3 for c in range(11, 14)}, **{c: 4 for c in (14, 15)},
               **{c: 5 for c in (16, 17, 18)}}
INCOME_BAND_LABEL = {1: "$0-$29,999", 2: "$30,000-$59,999", 3: "$60,000-$99,999",
                     4: "$100,000-$149,999", 5: "$150,000 or more"}

# 2023 has RACE_5 but no race_4; race_4 is RACE_5 with Asian folded into the
# residual group (Asian is n=10 in 2023, n=8 in 2025 — too thin to chart).
RACE4_FROM_RACE5 = {"White, NH": "White", "Black, NH": "Black", "Hispanic": "Hispanic",
                    "White": "White", "Black": "Black",
                    "Other/multiple races, NH": "Others", "Asian, NH": "Others",
                    "Other/multiple races": "Others", "Asian": "Others"}


def build_wave(w):
    df = pd.read_stata(w["path"], convert_categoricals=False)
    labels = label_maps(w["path"])
    n, is23 = len(df), w["year"] == 2023
    src = lambda c: (RENAME_2023.get(c, c) if is23 else c)
    has = lambda c: src(c) in df.columns
    out = {"YEAR": [w["year"]] * n, "WEIGHT": [float(v) for v in df[w["weight"]]]}

    for c in BINARY_COLUMNS:
        out[c] = ([norm_binary(v, labels.get(src(c))) for v in df[src(c)]]
                  if has(c) else [None] * n)

    for c in DEMOGRAPHIC_COLUMNS:
        if c == "race_4" and is23:
            out[c] = [RACE4_FROM_RACE5.get(norm_demo(v, labels.get("RACE_5")))
                      for v in df["RACE_5"]]
        elif c == "INCOME_QUINTILE" and is23:
            out[c] = [INCOME_BAND_LABEL.get(INCOME_BAND.get(int(v))) if pd.notna(v) else None
                      for v in df["INCOME"]]
        elif c == "HHSIZE" and is23:
            # a raw household headcount in 2023 (86% missing), not 2025's
            # labelled categories — 2025-only
            out[c] = [None] * n
        elif has(c):
            out[c] = [norm_demo(v, labels.get(src(c))) for v in df[src(c)]]
        else:
            out[c] = [None] * n          # e.g. LA_REGION: not in the 2023 file

    # 2025 physical IPV, rebuilt to the 2025 report's own definition. Its
    # Appendix A/B define Physical IPV as any of 11 partner-violence items
    # (made threats to physically harm you; slapped; pushed or shoved; hit
    # with a fist or something hard; pulled hair; slammed against something;
    # choked or suffocated; beaten; burned; used a knife; used a gun — IPV1_6
    # and IPV1_13..22). The shipped IPV_P_ever / IPV_P_12mo do not reproduce
    # the report (39.1/22.7 ever and 5.0/3.5 past year for women/men, against
    # a published 40.8/23.7 and 5.2/3.9); this union reproduces it exactly
    # when the denominator is everyone who answered the IPV battery, with an
    # unanswered item counted as "no". 2023's shipped IPV_P already matches
    # the 2023 report, so it is left as is.
    if not is23:
        PHYS_ITEMS = [6, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
        for out_col, item_fmt, base_col in (("IPV_P_ever", "IPV1_{}", "IPV25_EVER"),
                                            ("IPV_P_12mo", "IPV{}_12mo", "IPV25_YEAR")):
            items = [[norm_binary(v, labels.get(item_fmt.format(k))) for v in df[item_fmt.format(k)]]
                     for k in PHYS_ITEMS]
            out[out_col] = [None if out[base_col][i] is None
                            else int(any(col[i] == 1 for col in items))
                            for i in range(n)]

    # Columns that need rewording so a category reads correctly standing alone.
    d_src = "DISABILITY" if is23 else "disability"
    out["DISABILITY"] = [norm_demo(v, labels.get(d_src), relabel=RELABEL["disability"])
                         for v in df[d_src]]
    out["INSURANCE"] = [norm_demo(v, labels.get("HL032"), relabel=RELABEL["HL032"],
                                  exclude={"SKIPPED ON WEB", "DON'T KNOW", "REFUSED"})
                        for v in df["HL032"]]
    out["IDEO"] = [norm_demo(v, labels.get("IDEO"), exclude=EXCLUDE_VALUES["IDEO"])
                   for v in df["IDEO"]]
    for c in ("LGB_3",):                 # 2023 has an explicit "Skipped" category
        out[c] = [None if x == "Skipped" else x for x in out[c]]

    # Incarceration history: 2025 asked about age at first incarceration, 2023
    # only ever/never — the two don't share categories, so it is 2025-only.
    if "incar_3" in df.columns:
        incar = labels.get("incar_3")
        out["INCARCERATION"] = [norm_demo(v, incar, relabel={
            "Never incarcerated": "Never incarcerated",
            "Yes, but not before the age of 18": "First incarcerated at 18+",
            "Yes before the age of 18": "First incarcerated before 18"}) for v in df["incar_3"]]
    else:
        out["INCARCERATION"] = [None] * n
    return out


def main():
    waves = [build_wave(w) for w in WAVES]
    data = {k: sum((wv[k] for wv in waves), []) for k in waves[0]}

    # Guard rail from the 2023 data README: denominators under 10 should not
    # be published. Report any year x category group that falls below it.
    import collections
    thin = []
    for dem in DEMOGRAPHIC_COLUMNS + ["DISABILITY", "INSURANCE", "IDEO", "INCARCERATION"]:
        cnt = collections.Counter((y, c) for y, c in zip(data["YEAR"], data[dem]) if c is not None)
        thin += [(dem, y, c, k) for (y, c), k in cnt.items() if k < 10]
    print("groups with n < 10:", thin or "none")

    out = "window.LAVEX_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n"
    OUT.write_text(out)
    by_year = collections.Counter(data["YEAR"])
    print(f"wrote {OUT.name}: {len(data['WEIGHT'])} rows {dict(by_year)}, "
          f"{len(data)} columns, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
