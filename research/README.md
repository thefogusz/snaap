# SNAAP offline ML experiment

This is a separate, on-demand research runner. The server, monitor, setup-drafting
AI and notifications do not import it. It makes no LLM calls and places no orders.

## Run

Python 3.11+ is required. Create a separate environment; do not install these
dependencies in the application runtime.

```powershell
python -m venv .local/ml-venv
.local/ml-venv/Scripts/python.exe -m pip install -r research/requirements.txt
.local/ml-venv/Scripts/python.exe -m unittest discover -s research -p test_shadow.py
.local/ml-venv/Scripts/python.exe research/shadow.py --fetch
```

On macOS/Linux use `.local/ml-venv/bin/python`. For a reproducible rerun, replace
`--fetch` with `--input .local/research/<run>/dataset.json`.
Each run writes its own `dataset.json` and `result.json` under `.local/research/`.
These files are ignored by Git and are not served by SNAAP. Do not load untrusted
pickle/model files; the model coefficients and scaler are saved as plain JSON.

## Method

- Binance Spot BTC/USDT, 1h, 365 complete days (8,760 bars), public klines endpoint.
  Candle timestamps are exclusive close times, matching the application.
- Reject incomplete, duplicate, future, nonfinite or invalid OHLC data.
- Features: trailing 1/6/24-hour returns, current high-low divided by close,
  and current volume divided by the previous 24-hour mean volume.
- Target: close 12 hours later exceeds current close. Ties are class 0.
- Split labeled observations chronologically at 60% and 80%; remove the last
  12 observations before each boundary. The last training label is strictly
  before the first calibration observation; likewise for calibration/test.
- StandardScaler and logistic regression (`C=1`, 0.5 threshold, seed 0) fit only
  the training segment. A separate sigmoid logistic calibrator fits the next
  segment. No hyperparameter search or refitting on the test segment.
- Compare raw and calibrated scores to the training-label frequency baseline.
  Report accuracy, Brier score, log loss, and reliability bins. Brier/log loss
  include discrimination and calibration effects; they are not pure calibration
  measures. Lower Brier/log loss is better.
- Save input/code hashes, Git revision, versions, feature definitions, splits,
  parameters, coefficients and individual test predictions.

This is retrospective evaluation, not months of prospective shadow operation.
Labels overlap within each segment, so observations are not independent. There
are no trade returns, costs, execution assumptions or win-rate claims. Models
are never promoted to live signals by this runner.

## Initial run, 2026-10-05

Public data fetch succeeded with 8,760 hourly bars. On the held-out test segment:

| Method | Accuracy | Brier | Log loss |
|---|---:|---:|---:|
| Training-frequency baseline | 0.44126 | 0.25114 | 0.69542 |
| Logistic regression | 0.51748 | 0.25161 | 0.69654 |
| Calibrated logistic regression | 0.44642 | 0.25126 | 0.69565 |

Neither model beats the baseline on Brier or log loss. The accuracy difference
alone is insufficient evidence for live use. No model has been connected to
user-facing signals.

Sources: [Binance public market data](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market),
[LogisticRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html),
[data leakage and preprocessing](https://scikit-learn.org/stable/common_pitfalls.html).
