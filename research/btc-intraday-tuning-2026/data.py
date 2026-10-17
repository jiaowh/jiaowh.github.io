"""Download checksummed public candles. No credentials, orders, or private data."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request, hashlib, zipfile, io, json, datetime as dt, time
import numpy as np

HERE=Path(__file__).resolve().parent
CACHE=HERE/'cache'; CACHE.mkdir(exist_ok=True)
BASE='https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/5m/'

def get(url):
    for attempt in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'BTC research'}),timeout=30).read()
        except Exception:
            if attempt==2: raise
            time.sleep(1)

def month(ym):
    name=f'BTCUSDT-5m-{ym}.zip'; p=CACHE/name
    if not p.exists(): p.write_bytes(get(BASE+name))
    cp=CACHE/(name+'.CHECKSUM')
    if not cp.exists(): cp.write_bytes(get(BASE+name+'.CHECKSUM'))
    digest=hashlib.sha256(p.read_bytes()).hexdigest()
    assert digest==cp.read_text().split()[0],name
    with zipfile.ZipFile(p) as z:
        a=np.loadtxt(io.BytesIO(z.read(z.namelist()[0])),delimiter=',',usecols=range(6))
    a[:,0]/=1e6 if a[0,0]>1e14 else 1e3
    assert np.all(a[:,0]%300==0) and np.all(np.diff(a[:,0])>0)
    return a,dict(file=name,sha256=digest,rows=len(a))

def aggregate(a,span):
    groups=a[:,0].astype(np.int64)//span; rows=[]
    starts=np.r_[0,np.flatnonzero(np.diff(groups))+1,len(a)]
    for lo,hi in zip(starts[:-1],starts[1:]):
        b=a[lo:hi]
        if len(b)!=span//300 or b[0,0]%span or np.any(np.diff(b[:,0])!=300): continue
        rows.append([b[0,0],b[0,1],b[:,2].max(),b[:,3].min(),b[-1,4],b[:,5].sum()])
    return np.array(rows)

def main():
    months=[f'{y}-{m:02}' for y in range(2020,2027) for m in range(1,13) if y<2026 or m<=9]
    with ThreadPoolExecutor(max_workers=4) as pool:
        data=list(pool.map(month,months))
    a=np.vstack([x[0] for x in data]); arrays={'5m':a,'1h':aggregate(a,3600),'4h':aggregate(a,14400)}
    assert np.all(np.isfinite(a)) and np.all(a[:,1:5]>0)
    assert np.all(a[:,2]>=a[:,[1,3,4]].max(axis=1)) and np.all(a[:,3]<=a[:,[1,2,4]].min(axis=1))
    assert np.all(np.diff(a[:,0])>0)
    audit={'source':BASE,'fetchedAtUTC':dt.datetime.now(dt.timezone.utc).isoformat(),'files':[x[1] for x in data],'frames':{}}
    for key,b in arrays.items():
        # Compact JSON arrays also allow the exact page indicator code to be tested in Node.
        np.save(CACHE/(key+'.npy'),b)
        (CACHE/(key+'.json')).write_text(json.dumps(b[:,:5].tolist(),separators=(',',':')))
        span={'5m':300,'1h':3600,'4h':14400}[key]
        audit['frames'][key]={'rows':len(b),'first':int(b[0,0]),'last':int(b[-1,0]),'missingBars':int(np.sum(np.diff(b[:,0])/span-1)),'sha256':hashlib.sha256(b.tobytes()).hexdigest()}
    (HERE/'data-audit.json').write_text(json.dumps(audit,indent=2))
    print(json.dumps(audit['frames']),flush=True)

if __name__=='__main__': main()
