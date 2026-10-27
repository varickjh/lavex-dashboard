# LaVEX Data Visualization Tool

An interactive dashboard for the **Louisiana Violence Experiences Survey
(LaVEX)**, 2023 and 2025. Explore how many Louisiana adults have experienced
or perpetrated violence, compare groups, and see how rates changed between
survey years.

LaVEX is a statewide survey of Louisiana adults conducted by the Newcomb
Institute at Tulane University and the University of California San Diego
(1,081 respondents in 2023, 1,034 in 2025).

## What you can explore

- **Topics**: Physical Violence, Sexual Violence, Intimate Partner Violence
  (IPV), Any Physical or Sexual Violence, Sexual Violence Perpetration, and
  Physical Violence Perpetration.
- **Time period**: Lifetime (ever) or Past Year.
- **Compare by**: Gender, Louisiana Region, Metro/Non-Metro, Age,
  Race/Ethnicity, Sexuality, Marital Status, Household Size, Household
  Income, Home Ownership, Education Level, Employment Status, Disability
  Status, Health Insurance, Religion, Incarceration History, and Political
  Ideology.
- **Subcategories**: break a topic down by form, for example verbal sexual
  harassment, cyber sexual harassment, and forced sex within Sexual
  Violence.
- **Display**: bar or line chart, and percent or raw number.
- **Filters**: narrow the population by survey year, location, or any
  demographic group (under "Demographic Specifics" below the chart).

Charts group results by survey year, so each comparison shows 2023 and 2025
side by side.

## Reading the charts

- **All percentages are weighted** to represent Louisiana adults. Each
  survey year uses its own survey weight.
- **"Overall" means women and men combined**, matching the published LaVEX
  reports. Respondents who identify as gender non-conforming are too few to
  analyze as a group; they appear in their own bar when comparing by Gender.
- **Interpret with caution when a group has fewer than 100 respondents.**
  Differences between groups or years have not been tested for statistical
  significance.
- **Some comparisons were only collected in 2025**: Louisiana Region,
  Household Size, Religion, and Incarceration History.
- **Some measures changed between years.** IPV covered 22 items in 2023 and
  25 in 2025. Disability was measured differently each year, so 2023 and
  2025 disability results are not directly comparable.
- **Hover** over a bar or point to see the raw count behind it.
- **Download** any chart as a PNG with the camera icon in the chart toolbar.
  The house icon resets the dashboard to its defaults.

## Running it locally

The dashboard is a set of static files: no server-side code and no build
step for the page itself. It does need one generated data file, `data.js`,
which is **not included in this repository** because it contains
respondent-level survey records.

1. Place the source data files in a `data/` folder:
   - `data/ICPSR_199088-V1.1/LaVEX2023 OpenICPSR dataset v1.dta` (2023,
     available from openICPSR, project 199088)
   - `data/[P003] UCSD_Tulane_LA_VEX_Survey_2025_data.dta` (2025)
2. Generate `data.js`:

   ```bash
   pip install -r requirements.txt
   python3 build_data.py
   ```

3. Serve the folder and open it in a browser:

   ```bash
   python3 -m http.server 8124
   ```

   Then visit http://localhost:8124.

Re-run `python3 build_data.py` whenever the source data files change.

## Embedding

Host the files on any static web host (GitHub Pages, Netlify, S3, or a
WordPress server), including the generated `data.js`. Then either embed
`index.html` in an iframe or paste its markup into a WordPress Custom HTML
block.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The dashboard page |
| `style.css` | Styling |
| `app.js` | Filtering, weighting, and chart drawing |
| `build_data.py` | Generates `data.js` from the source survey files |
| `logo.png`, `logo-lockup.png` | LaVEX logo (original, and the version shown in the header) |

Designed by Varick Hasim & Claire Mallela.
