# LaVEX Data Visualization Tool

An interactive dashboard for the **Louisiana Violence Experiences Survey
(LaVEX)**, 2023 and 2025. Explore how many Louisiana adults have experienced
or perpetrated violence, compare groups, and see how rates changed between
survey years.

LaVEX is a statewide survey of Louisiana adults conducted by the Newcomb
Institute at Tulane University and the University of California San Diego.

**View the dashboard: https://varickjh.github.io/lavex-dashboard/**

## What you can explore

- **Topics**: physical violence, sexual violence, intimate partner violence
  (IPV), any physical or sexual violence, and perpetration of physical and
  sexual violence.
- **Time period**: lifetime (ever) or past year.
- **Comparisons**: demographic groups such as gender, age, race/ethnicity,
  sexuality, income, education, and disability, plus Louisiana region and
  metro/non-metro residence.
- **Subcategories**: break a topic down by form, such as verbal sexual
  harassment or forced sex within sexual violence.
- **Display**: bar or line chart, percent or raw number.
- **Filters**: narrow the population by survey year, location, or
  demographic group.

## Reading the charts

- Percentages are weighted to represent Louisiana adults.
- "Overall" means women and men combined, as in the published LaVEX
  reports.
- Interpret results with caution when a group has fewer than 100
  respondents. Differences have not been tested for statistical
  significance.
- Some comparisons were collected in only one survey year, and some
  measures changed between years. Footnotes under each chart point these
  out.
- Hover over a bar or point to see its raw count. Use the camera icon to
  download a chart as an image.

## About this repository

The dashboard is a static website (HTML, CSS, and JavaScript, with charts
drawn by [Plotly](https://plotly.com/javascript/)). It has no server-side
code and can be hosted on any static web host or embedded in another site
with an iframe.

| File | Purpose |
| --- | --- |
| `index.html` | The dashboard page |
| `style.css` | Styling |
| `app.js` | Filtering, weighting, and chart drawing |
| `data.js` | Survey data used by the dashboard |
| `build_data.py` | Regenerates `data.js` from the source survey data files (not included) |
| `logo.png`, `logo-lockup.png` | LaVEX logo |

Designed by Varick Hasim & Claire Mallela.
