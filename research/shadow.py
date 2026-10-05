"""On-demand, offline evaluation only. Never imported by SNAAP's server/monitor."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import platform
import subprocess
import time
import urllib.parse
import urllib.request
import uuid

STEP = 3600000
HORIZON = 12
FEATURE_NAMES = ['return_1h', 'return_6h', 'return_24h', 'range_fraction', 'volume_ratio_24h']


def validate_candles(rows, now):
    if len(rows) < 200:
        raise ValueError('At least 200 contiguous closed hourly candles required')
    for i, c in enumerate(rows):
        if not all(isinstance(c[k], (int, float)) and math.isfinite(c[k])
                   for k in ['time', 'open', 'high', 'low', 'close', 'volume']):
            raise ValueError('Invalid candle number')
        if c['time'] > now or c['time'] % STEP or (i and c['time']-rows[i-1]['time'] != STEP):
            raise ValueError('Future, duplicate, out-of-order or missing hourly candle')
        if min(c[k] for k in ['open', 'high', 'low', 'close']) <= 0 or c['volume'] < 0:
            raise ValueError('Prices must be positive and volume nonnegative')
        if c['low'] > min(c['open'], c['close']) or c['high'] < max(c['open'], c['close']):
            raise ValueError('Invalid OHLC range')


def features(rows):
    # Each row uses only the current closed bar and its preceding 24 bars.
    result = []
    for i in range(24, len(rows)):
        c = rows[i]
        mean_volume = sum(b['volume'] for b in rows[i-24:i])/24
        result.append([c['close']/rows[i-n]['close']-1 for n in [1, 6, 24]] +
                      [(c['high']-c['low'])/c['close'], c['volume']/mean_volume if mean_volume else 0])
    return result


def split_indices(n):
    a, b = int(n*.6), int(n*.8)
    if a-HORIZON < 50 or b-a-HORIZON < 20 or n-b < 20:
        raise ValueError('Insufficient data for chronological partitions')
    return list(range(a-HORIZON)), list(range(a, b-HORIZON)), list(range(b, n))


def fetch_dataset():
    end = int(time.time()*1000)//STEP*STEP
    start = end-365*24*STEP
    cursor, rows = start, []
    while cursor < end:
        query = urllib.parse.urlencode(dict(symbol='BTCUSDT', interval='1h', startTime=cursor,
                                           endTime=end-1, limit=1000))
        with urllib.request.urlopen('https://api.binance.com/api/v3/klines?'+query, timeout=30) as response:
            batch = json.load(response)
        if not batch:
            raise ValueError('Exchange returned an incomplete year')
        for r in batch:
            if int(r[0])+STEP <= end:
                rows.append(dict(time=int(r[0])+STEP, open=float(r[1]), high=float(r[2]),
                                 low=float(r[3]), close=float(r[4]), volume=float(r[5])))
        next_cursor = int(batch[-1][0])+STEP
        if next_cursor <= cursor:
            raise ValueError('Exchange pagination did not advance')
        cursor = next_cursor
    if len(rows) != 365*24:
        raise ValueError('Expected exactly 365 days of hourly bars')
    return dict(source=dict(exchange='Binance', market='Spot', pair='BTC/USDT', timeframe='1h',
                            fetchedAt=int(time.time()*1000), endpoint='/api/v3/klines'), candles=rows)


def experiment(dataset):
    import numpy as np
    import sklearn
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
    from sklearn.calibration import calibration_curve
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    source = dataset['source']
    if any(source.get(k) != v for k, v in dict(exchange='Binance', market='Spot', pair='BTC/USDT', timeframe='1h').items()):
        raise ValueError('This experiment supports Binance Spot BTC/USDT 1h only')
    rows = dataset['candles']
    validate_candles(rows, int(time.time()*1000))
    x = np.asarray(features(rows)[:-HORIZON])
    y = np.asarray([int(rows[i+HORIZON]['close'] > rows[i]['close']) for i in range(24, len(rows)-HORIZON)])
    train, validation, test = split_indices(len(y))
    if len(set(y[train])) < 2 or len(set(y[validation])) < 2:
        raise ValueError('Train and calibration partitions must contain both classes')
    model = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000, random_state=0))
    model.fit(x[train], y[train])
    # Separate chronological validation segment calibrates scores; test is untouched.
    calibrator = LogisticRegression(C=1.0, max_iter=1000, random_state=0)
    calibrator.fit(model.decision_function(x[validation]).reshape(-1, 1), y[validation])
    raw = model.predict_proba(x[test])[:, 1]
    calibrated = calibrator.predict_proba(model.decision_function(x[test]).reshape(-1, 1))[:, 1]
    baseline = np.full(len(test), float(y[train].mean()))

    def metrics(probabilities):
        observed, predicted = calibration_curve(y[test], probabilities, n_bins=5, strategy='uniform')
        return dict(accuracy=float(accuracy_score(y[test], probabilities >= .5)),
                    brier=float(brier_score_loss(y[test], probabilities)),
                    logLoss=float(log_loss(y[test], probabilities, labels=[0, 1])),
                    reliability=dict(predicted=predicted.tolist(), observed=observed.tolist()))

    scaler, classifier = model.steps[0][1], model.steps[1][1]
    try:
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = None
    partitions = {name: dict(count=len(indices), first=rows[indices[0]+24]['time'],
                            last=rows[indices[-1]+24]['time'], lastLabelAt=rows[indices[-1]+24+HORIZON]['time'])
                  for name, indices in [('train', train), ('calibration', validation), ('test', test)]}
    return dict(version=1, mode='OFFLINE_SHADOW', createdAt=int(time.time()*1000), source=source,
                datasetSha256=hashlib.sha256(json.dumps(dataset, sort_keys=True).encode()).hexdigest(),
                codeSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), gitRevision=revision,
                python=platform.python_version(), sklearn=sklearn.__version__, numpy=np.__version__,
                features=FEATURE_NAMES, horizon=HORIZON, split='60/20/20 chronological, 12-bar gaps',
                coverage=dict(first=rows[0]['time'], last=rows[-1]['time'], bars=len(rows)), partitions=partitions,
                target='close[t+12] > close[t]; equal closes belong to class 0',
                metrics=dict(raw=metrics(raw), calibrated=metrics(calibrated), trainingPrior=metrics(baseline)),
                model=dict(type='LogisticRegression', C=1.0, threshold=.5, scalerMean=scaler.mean_.tolist(),
                           scalerScale=scaler.scale_.tolist(), coefficients=classifier.coef_.tolist(),
                           intercept=classifier.intercept_.tolist(), calibrationCoefficients=calibrator.coef_.tolist(),
                           calibrationIntercept=calibrator.intercept_.tolist()),
                predictions=[dict(time=rows[i+24]['time'], label=int(y[i]), raw=float(raw[j]),
                                  calibrated=float(calibrated[j])) for j, i in enumerate(test)],
                limitations=['Retrospective research, not prospective shadow performance',
                             'Overlapping labels within partitions; samples are not independent',
                             'No orders, fees, slippage, returns, alerts or user-facing win probabilities'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true', help='Download 365 days from public Binance Spot API')
    mode.add_argument('--input', type=Path, help='Previously saved dataset JSON')
    parser.add_argument('--output-dir', type=Path, default=Path('.local/research'))
    args = parser.parse_args()
    dataset = fetch_dataset() if args.fetch else json.loads(args.input.read_text(encoding='utf-8'))
    result = experiment(dataset)
    folder = args.output_dir / (time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])
    folder.mkdir(parents=True, exist_ok=False)
    (folder/'dataset.json').write_text(json.dumps(dataset), encoding='utf-8')
    (folder/'result.json').write_text(json.dumps(result, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps(dict(output=str(folder.resolve()), metrics=result['metrics'], coverage=result['coverage']), indent=2))


if __name__ == '__main__':
    main()
