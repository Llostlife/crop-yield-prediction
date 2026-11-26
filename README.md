# 🌾 Crop Yield Prediction Under Climate Change

Machine learning project that predicts **district-level wheat yield in Pakistan** from temperature, rainfall and soil moisture, with an interactive "what if the climate changes?" dashboard.



## Results (test years 2016–2024)

| Model | R² | RMSE (t/ha) | MAE (t/ha) |
|---|---|---|---|
| **XGBoost** | **0.689** | **0.464** | **0.364** |
| Gradient Boosting | 0.668 | 0.480 | 0.378 |
| Random Forest | 0.660 | 0.486 | 0.383 |
| Linear Regression | 0.520 | 0.577 | 0.470 |

Models are trained on 1981–2015 and tested on 2016–2024 (a time-based split, like real forecasting). K-Means groups districts into four climate zones for exploration. Known limitation: tree models under-predict the newest high-yield years.

## Data

1. **Pakistan Bureau of Statistics**: district-wise wheat area, production, yield
2. **ERA5-Land** (Copernicus CDS, monthly means, 1981–2025): temperature, rainfall, soil moisture
3. **GADM 4.1**: district boundaries, used to average climate grid cells per district

Wheat season = Nov to Apr. The merged table (`data/`) has 3,591 district-season rows across 107 districts. The raw ERA5 `.nc` file (~100 MB) is not included; `scripts/build_dataset.py` shows how the merge was made.

## Structure

```
notebook/   crop_yield_prediction.ipynb   cleaning, training, evaluation, export
scripts/    build_dataset.py              builds the merged CSV from raw sources
data/       wheat_climate_merged.csv, wheat_clean.csv
docs/       index.html, style.css, app.js, data/*.json   the dashboard
```

## Run it

- **Notebook:** `pip install -r requirements.txt`, then run `notebook/crop_yield_prediction.ipynb` from its own folder.
- **Dashboard locally:** `cd docs && python -m http.server 8000`, then open http://localhost:8000 (double-clicking the HTML file will not work, because browsers block local JSON loading).
- **Publish:** push to GitHub, then Settings → Pages → Deploy from branch → `main` → `/docs`.

The dashboard runs the exported XGBoost trees directly in JavaScript, so no server is needed.