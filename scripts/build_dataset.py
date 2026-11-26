# Merges wheat yields (CSV) with ERA5 climate (.nc) using GADM district boundaries.
# pip install pandas numpy xarray netCDF4 geopandas pyogrio
import re, warnings
warnings.filterwarnings("ignore")   # distance-in-degrees warning is harmless here
import numpy as np, pandas as pd, xarray as xr, geopandas as gpd

WHEAT_CSV = "wheat_districts.csv"
NC_FILE   = "data_stream-moda.nc"
SHP_FILE  = "gadm41_PAK_3.shp"
OUT_CSV   = "wheat_climate_merged.csv"

def clean(name):                      # "ATTOCK DISTRICT" -> "ATTOCK"
    s = re.sub(r"\b(DISTRICT|PROTECTED AREA)\b", "", name.upper())
    return re.sub(r"[^A-Z]", "", s)    # letters only, so spelling quirks shrink

# Same district, spelled differently in GADM (cleaned names)
ALIAS = {"ATTOCK":"ATTOK","JACOBABAD":"JAKOBABAD","BATAGRAM":"BATTAGRAM",
 "KILLASAIFULLAH":"QILLASAIFULLAH","KILLAABDULLAH":"QILLAABDULLAH",
 "MIRPURKHAS":"MIRPHURKHAS","NAUSHAHROFEROZE":"NAUSHAHROFIROZ",
 "TANDOMUHAMMADKHAN":"TANDOMKHAN","JAFFARABAD":"JAFARABAD","KOHLU":"KHOLU",
 "NORTHWAZIRISTAN":"NWAZIRISTAN","SOUTHWAZIRISTAN":"SWAZIRISTAN",
 "DERAGHAZIKHAN":"DERAGHAZIKHA","MALAKAND":"MALAKANDPA",
 "SHAHEEDBENAZIRABAD":"NAWABSHAH"}

# ---------- 1. Climate: season (Nov..Apr) features per grid cell ----------
ds = xr.open_dataset(NC_FILE)
month, year = ds.valid_time.dt.month, ds.valid_time.dt.year
temp = ds.t2m - 273.15                              # Kelvin -> Celsius
rain = ds.tp * 1000 * ds.valid_time.dt.days_in_month  # m/day -> mm/month
season = xr.where(month >= 11, year, year - 1)      # Nov 1981..Apr 1982 -> 1981
in_season = (month >= 11) | (month <= 4)
late = (month == 3) | (month == 4)                  # grain-filling window

def seasonal(da, mask, how):
    da = da.where(mask, drop=True)
    da = da.assign_coords(season=("valid_time", season.where(mask, drop=True).values))
    g = da.groupby("season")
    return g.sum() if how == "sum" else g.mean()

feats = {
  "temp_mean_c":    seasonal(temp,      in_season, "mean"),
  "rain_total_mm":  seasonal(rain,      in_season, "sum"),
  "soil_moist_l1":  seasonal(ds.swvl1,  in_season, "mean"),
  "soil_moist_l2":  seasonal(ds.swvl2,  in_season, "mean"),
  "temp_marapr_c":  seasonal(temp,      late,      "mean"),
}

# ---------- 2. Which grid cell belongs to which district ----------
g = gpd.read_file(SHP_FILE)
g["key"] = g.NAME_3.map(clean)
lon, lat = np.meshgrid(ds.longitude.values, ds.latitude.values)
pts = gpd.GeoDataFrame({"cell": np.arange(lon.size)},
        geometry=gpd.points_from_xy(lon.ravel(), lat.ravel()), crs=g.crs)
cells = gpd.sjoin(pts, g[["key", "geometry"]], predicate="within").drop_duplicates("cell")
# Tiny districts may contain no cell centre: give them the nearest cell
for _, row in g[~g.key.isin(cells.key)].iterrows():
    nearest = pts.geometry.distance(row.geometry.representative_point()).idxmin()
    cells = pd.concat([cells, pd.DataFrame({"cell": [nearest], "key": [row.key]})])

def to_district(da, name):             # average all cells of each district
    arr = da.values.reshape(da.shape[0], -1)
    df = pd.DataFrame(arr[:, cells.cell.values], index=da.season.values,
                      columns=cells.key.values)
    return df.T.groupby(level=0).mean().T.stack().rename(name)

clim = pd.concat([to_district(v, k) for k, v in feats.items()], axis=1)
clim.index.names = ["season", "key"]
clim = clim.reset_index()

# ---------- 3. Wheat table: add keys, drop unmatched districts ----------
w = pd.read_csv(WHEAT_CSV, dtype={"district_code": str})
w["key"] = w.district.map(clean).replace(ALIAS)
w["season"] = w.fy.str[:4].astype(int)               # "1981-82" -> 1981
no_shape = w[~w.key.isin(g.key)].district.unique()
print("Dropped (no matching boundary):", len(no_shape), list(no_shape))
w = w[w.key.isin(g.key)]
zero = (w.yield_t_per_ha <= 0).sum()
w = w[w.yield_t_per_ha > 0]                          # 0 yield = no real data
print("Dropped zero-yield rows:", zero)

# ---------- 4. Merge and save ----------
m = w.merge(clim, on=["key", "season"], how="inner").dropna()
m = m.drop(columns=["key", "crop_id"])
m.to_csv(OUT_CSV, index=False)
print("Saved", OUT_CSV, m.shape, "| districts:", m.district.nunique())
