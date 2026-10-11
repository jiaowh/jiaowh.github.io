"""Download only the missing tail of public Coin Metrics daily BTC MVRV."""
import json,urllib.request
from pathlib import Path
url='https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur&frequency=1d&start_time=2026-09-27&end_time=2026-10-09&page_size=100'
with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'BTC-research/1.0'}),timeout=30) as r:
    data=json.load(r)
assert data.get('data')
Path(__file__).with_name('mvrv-extension.json').write_text(json.dumps({'url':url,**data},indent=1))
print('MVRV rows:',len(data['data']),'last:',data['data'][-1]['time'])
