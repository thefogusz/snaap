import math
import unittest
from shadow import features, split_indices, validate_candles, experiment

class ShadowTests(unittest.TestCase):
    def setUp(self):
        self.rows = [dict(time=(i+1)*3600000, open=100, high=102, low=98,
                          close=100+math.sin(i/5), volume=10+i%7) for i in range(500)]

    def test_features_are_causal(self):
        full = features(self.rows)
        prefix = features(self.rows[:200])
        self.assertEqual(full[:len(prefix)], prefix)

    def test_labels_do_not_overlap_next_partition(self):
        train, validation, test = split_indices(500)
        self.assertLess(train[-1]+12, validation[0])
        self.assertLess(validation[-1]+12, test[0])
        self.assertEqual(test[-1], 499)

    def test_gaps_duplicates_future_and_invalid_prices_rejected(self):
        validate_candles(self.rows, now=self.rows[-1]['time'])
        for bad in [self.rows[:20]+self.rows[21:], self.rows+[self.rows[-1]],
                    [{**self.rows[0], 'close':float('nan')}]+self.rows[1:]]:
            with self.assertRaises(ValueError):
                validate_candles(bad, now=self.rows[-1]['time'])
        with self.assertRaises(ValueError):
            validate_candles(self.rows, now=self.rows[-2]['time'])

    def test_future_test_data_cannot_change_fitted_model(self):
        source=dict(exchange='Binance', market='Spot', pair='BTC/USDT', timeframe='1h')
        original=experiment(dict(source=source,candles=self.rows))
        changed=[dict(c) for c in self.rows]
        for c in changed[-50:]:
            for key in ['open','high','low','close']:
                c[key]+=50
        altered=experiment(dict(source=source,candles=changed))
        self.assertEqual(original['model'], altered['model'])
        self.assertNotEqual(original['datasetSha256'], altered['datasetSha256'])
        self.assertEqual(original['mode'], 'OFFLINE_SHADOW')
        self.assertEqual(original['horizon'], 12)

if __name__ == '__main__':
    unittest.main()
