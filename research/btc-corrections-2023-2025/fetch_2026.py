"""Public Binance data only; appendable 4h candles/funding through 2026-10-09 UTC."""
import json,urllib.request,datetime
from pathlib import Path
O=Path(__file__).resolve().parent
ts=lambda s:int(datetime.datetime.fromisoformat(s).replace(tzinfo=datetime.timezone.utc).timestamp()*1000)
start,end=ts('2026-09-27'),ts('2026-10-10')
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'BTC-research/1.0'}),timeout=25) as r:return json.load(r)
out={'start':start,'endExclusive':end,'errors':[]}
for host in ['https://api.binance.com','https://data-api.binance.vision']:
    try:
        u=host+f'/api/v3/klines?symbol=BTCUSDT&interval=4h&startTime={start}&endTime={end-1}&limit=1000'
        rows=get(u)
        if not isinstance(rows,list) or not rows:raise ValueError('No candles returned')
        out['bars']=[dict(time=int(x[0])//1000,open=float(x[1]),high=float(x[2]),low=float(x[3]),close=float(x[4])) for x in rows if int(x[0])+14400000<=end]
        out['priceSource']=u;break
    except Exception as e:out['errors'].append(str(e))
try:
    rows=get(f'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&startTime={start}&endTime={end-1}&limit=1000')
    out['hourly']=[[int(x[0])//1000,*[float(x[k]) for k in range(1,6)]] for x in rows if int(x[0])+3600000<=end]
except Exception as e:out['errors'].append(str(e))
try:
    u=f'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&startTime={ts("2026-09-10")}&endTime={end}&limit=1000'
    rows=get(u)
    out['stamps']=[[int(x['fundingTime'])//1000,float(x['fundingRate'])] for x in rows]
    out['fundingSource']=u
except Exception as e:out['errors'].append(str(e))
(O/'extension-2026.json').write_text(json.dumps(out,indent=1))
print(json.dumps({'bars':len(out.get('bars',[])),'hourly':len(out.get('hourly',[])),'funding':len(out.get('stamps',[])),'errors':out['errors']}))
