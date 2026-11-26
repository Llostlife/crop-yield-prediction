// Loads the exported XGBoost trees and walks them in the browser (no server needed).
const $ = id => document.getElementById(id);
const nice = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace("Islamabad Capital Territory", "Islamabad (ICT)");
const LABELS = {season:"Year (trend)", temp_mean_c:"Season temperature", rain_total_mm:"Season rainfall",
  soil_moist_l1:"Soil moisture (top)", soil_moist_l2:"Soil moisture (deeper)", temp_marapr_c:"Mar–Apr temperature"};
const GREEN = "#4C9A6A", DARK = "#1F4D3A", AMBER = "#E0A030";
let M, H, charts = {};

Promise.all([fetch("data/model.json").then(r => r.json()), fetch("data/history.json").then(r => r.json())])
  .then(([m, h]) => { M = m; H = h; init(); });

// Sum the answers of all trees. Math.fround = 32-bit numbers, same as XGBoost.
function predict(v, prov) {
  const row = M.features.map(f => Math.fround(f in v ? v[f] : (f === M.province_features[prov] ? 1 : 0)));
  let s = M.base_score;
  for (const tree of M.trees) {
    let n = tree;
    while (n.v === undefined) n = row[n.f] < n.t ? n.y : n.n;
    s += n.v;
  }
  return s;
}

// Read the sliders; Mar–Apr temperature and deeper soil move together with the sliders
function values(useNormal) {
  const p = $("prov").value, c = M.province_climate[p];
  const t = useNormal ? c.temp_mean_c[1] : +$("temp").value;
  const r = useNormal ? c.rain_total_mm[1] : +$("rain").value;
  const s = useNormal ? c.soil_moist_l1[1] : +$("soil").value;
  return {season: +$("year").value, temp_mean_c: t, rain_total_mm: r, soil_moist_l1: s,
          soil_moist_l2: c.soil_moist_l2[1] + (s - c.soil_moist_l1[1]),
          temp_marapr_c: c.temp_marapr_c[1] + (t - c.temp_mean_c[1])};
}

function setSlider(id, min, max, step, val) {
  const e = $(id); e.min = min; e.max = max; e.step = step; e.value = val;
}

function resetSliders() {
  const c = M.province_climate[$("prov").value], [y0, y1] = M.season_range;
  setSlider("temp", (c.temp_mean_c[0] - 1).toFixed(1), (c.temp_mean_c[2] + 3).toFixed(1), 0.1, c.temp_mean_c[1].toFixed(1));
  setSlider("rain", Math.max(0, c.rain_total_mm[0] * 0.6).toFixed(0), (c.rain_total_mm[2] * 1.3).toFixed(0), 1, c.rain_total_mm[1].toFixed(0));
  setSlider("soil", 0, (c.soil_moist_l1[2] * 1.1).toFixed(3), 0.005, c.soil_moist_l1[1].toFixed(3));
  setSlider("year", y0, y1, 1, y1);
  update();
}

function update() {
  const p = $("prov").value, c = M.province_climate[p], v = values(false);
  const pred = predict(v, p), normal = predict(values(true), p), d = pred - normal;
  $("vTemp").textContent = v.temp_mean_c.toFixed(1) + " °C";
  $("vRain").textContent = Math.round(v.rain_total_mm) + " mm";
  $("vSoil").textContent = v.soil_moist_l1.toFixed(2) + " m³/m³";
  $("vYear").textContent = v.season + "–" + String(v.season + 1).slice(2);
  $("pred").textContent = pred.toFixed(2);
  $("delta").textContent = `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(2)} t/ha (${(d / normal * 100).toFixed(1)}%) vs normal climate`;
  $("delta").className = "delta " + (d >= 0 ? "up" : "down");
  const hist = H.yield_by_province[p].yield.slice(-10);
  $("avg").textContent = `Province average, last 10 seasons: ${(hist.reduce((a, b) => a + b) / hist.length).toFixed(2)} t/ha`;
  $("warn").hidden = !(v.temp_mean_c > c.temp_mean_c[2] || v.rain_total_mm > c.rain_total_mm[2] ||
                       v.rain_total_mm < c.rain_total_mm[0] || v.soil_moist_l1 > c.soil_moist_l1[2]);
  const h = charts.hist, yp = H.yield_by_province[p];
  h.data.datasets[0].data = yp.seasons.map((x, i) => ({x, y: yp.yield[i]}));
  h.data.datasets[1].data = [{x: v.season, y: pred}];
  h.update("none");
}

function chart(id, cfg) {
  cfg.options = Object.assign({responsive: true, maintainAspectRatio: false}, cfg.options);
  return new Chart($(id), cfg);
}

function init() {
  Chart.defaults.font.family = "Segoe UI, Calibri, sans-serif";
  const x = H.model_comparison.find(r => r.model === "XGBoost");
  $("stats").innerHTML = [[x.R2.toFixed(2), "R² (test years)"], [x.RMSE.toFixed(2), "RMSE (t/ha)"], [x.MAE.toFixed(2), "MAE (t/ha)"], ["3,591", "district-seasons"]]
    .map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join("");

  Object.keys(M.province_features).forEach(p => $("prov").add(new Option(nice(p), p)));
  $("prov").value = "PUNJAB";

  charts.hist = chart("cHist", {type: "line", data: {datasets: [
    {label: "Average yield", data: [], borderColor: DARK, backgroundColor: DARK, tension: .25, pointRadius: 2},
    {label: "Your prediction", data: [], type: "scatter", backgroundColor: AMBER, borderColor: "#fff", pointRadius: 9, borderWidth: 2}]},
    options: {scales: {x: {type: "linear", title: {display: true, text: "Season (start year)"}, ticks: {callback: v => String(v)}},
                       y: {title: {display: true, text: "Yield (t/ha)"}}}}});

  const models = H.model_comparison.filter(r => !r.model.includes("zones") && !r.model.includes("Floor"));
  charts.models = chart("cModels", {type: "bar", data: {labels: models.map(r => r.model), datasets: [{
    data: models.map(r => r.R2), backgroundColor: models.map(r => r.model === "XGBoost" ? AMBER : GREEN)}]},
    options: {indexAxis: "y", plugins: {legend: {display: false}}, scales: {x: {min: 0, max: 1}}}});

  const imp = Object.entries(H.feature_importance).slice(0, 8);
  charts.imp = chart("cImp", {type: "bar", data: {labels: imp.map(([k]) => LABELS[k] || "Province: " + nice(k.replace("prov_", ""))),
    datasets: [{data: imp.map(([, v]) => v), backgroundColor: GREEN}]},
    options: {indexAxis: "y", plugins: {legend: {display: false}}}});

  const t = H.test_years;
  charts.test = chart("cTest", {type: "line", data: {labels: t.seasons, datasets: [
    {label: "Actual", data: t.actual, borderColor: "#222", tension: .25},
    {label: "Predicted", data: t.predicted, borderColor: GREEN, tension: .25}]},
    options: {scales: {y: {title: {display: true, text: "Average yield (t/ha)"}}}}});

  ["temp", "rain", "soil", "year"].forEach(id => $(id).addEventListener("input", update));
  $("prov").addEventListener("change", resetSliders);
  $("reset").addEventListener("click", resetSliders);
  document.querySelectorAll("button[data-dt],button[data-rf]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.dt) $("temp").value = Math.min(+$("temp").max, +$("temp").value + +b.dataset.dt);
    if (b.dataset.rf) $("rain").value = Math.min(+$("rain").max, +$("rain").value * +b.dataset.rf);
    update();
  }));
  resetSliders();
}
