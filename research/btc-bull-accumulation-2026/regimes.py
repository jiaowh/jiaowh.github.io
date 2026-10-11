"""Fixed, causal crash/range diagnostics; future prices used only for labels.

Crash: >=15% below next-open price within 30 days. Quiet: all future highs/lows
remain within +/-10% of next-open price for 30 days. These do not exhaust outcomes.
Past range: efficiency20 < .20 and trailing 30-day high/low width <=20%.
No parameter optimization; daily observations overlap. Also report alerts spaced
at least 30 calendar days apart, with incomplete labels excluded at cycle ends.
"""
from bull import *
from search import rolling

def features(G):
    h,l,c,e,s=G.daily();n=len(c);E,events,gates=inputs(G)
    change=np.r_[0,np.diff(c)];distance=sma(abs(change),20)*20
    displacement=np.r_[np.full(20,np.nan),abs(c[20:]-c[:-20])]
    er=np.divide(displacement,distance,out=np.full(n,np.nan),where=distance>0)
    hi=rolling(h,30);lo=rolling(l,30,False);width=hi/lo-1
    up=np.r_[0,np.diff(h)];down=np.r_[0,-np.diff(l)]
    pdm=np.where((up>down)&(up>0),up,0);ndm=np.where((down>up)&(down>0),down,0)
    pc=np.r_[c[0],c[:-1]];atr=smma(np.maximum(h-l,np.maximum(abs(h-pc),abs(l-pc))),14)
    pdi=smma(pdm,14)/atr;ndi=smma(ndm,14)/atr
    dx=np.divide(abs(pdi-ndi),pdi+ndi,out=np.zeros(n),where=(pdi+ndi)>0)*100
    adx=np.full(n,np.nan);adx[13:]=smma(dx[13:],14)
    rare=np.array([np.any(events['e20'][a:b+1]&gates[200][a:b+1]) for a,b in zip(s,e)])
    f={'always':np.ones(n,bool),'breadth<40%':E[e]<.4,'breadth<20%':E[e]<.2,
      'close<SMA50':c<sma(c,50),'close<SMA200':c<sma(c,200),
      'breadth<20% and close<SMA50':(E[e]<.2)&(c<sma(c,50)),
      'rare gated breadth crossing':rare,'low efficiency + narrow range':(er<.2)&(width<=.2),
      'ADX14<20':adx<20,'range + ADX14<20':(er<.2)&(width<=.2)&(adx<20)}
    return f,(h,l,c,e,s,hi,lo,er,width,adx)

def run():
    hourly=data();G=Grid(0,a1h=hourly);F,D=features(G);h,l,c,e,s,hi,lo,*_=D
    t=G.real[e]+14400;n=len(c);forwardLow=np.full(n,np.nan);forwardHigh=forwardLow.copy()
    crash=np.zeros(n,bool);quiet=crash.copy();breakout=crash.copy();breakdown=crash.copy()
    valid=np.zeros(n,bool);entry=np.full(n,np.nan)
    for j in range(n-30):
        if e[j]+1>=G.n:continue
        entry[j]=G.o[e[j]+1]
        forwardLow[j]=min(l[j+1:j+31])/entry[j]-1;forwardHigh[j]=max(h[j+1:j+31])/entry[j]-1
        crash[j]=forwardLow[j]<=-.15;quiet[j]=(forwardLow[j]>=-.1)&(forwardHigh[j]<=.1)
        breakout[j]=bool(np.any(c[j+1:j+31]>hi[j]*1.01))
        breakdown[j]=bool(np.any(c[j+1:j+31]<lo[j]*.99))
        valid[j]=True
    rows={};episodes={}
    def stats(ix,pop):
        m=len(ix);return {'n':m,'crashes':int(sum(crash[ix])),'crashRate':float(np.mean(crash[ix])) if m else None,
          'quiet':int(sum(quiet[ix])),'quietRate':float(np.mean(quiet[ix])) if m else None,
          'upBreaks':int(sum(breakout[ix])),'downBreaks':int(sum(breakdown[ix])),
          'eitherBreaks':int(sum(breakout[ix]|breakdown[ix])),
          'crashDayRecall':float(sum(crash[ix])/sum(crash[pop])) if sum(crash[pop]) else None}
    for w,(a,b) in {k:WINDOWS[k] for k in CYCLES}.items():
        # Last future bar closes <= end; no labels from next strategic bear year.
        pop=valid&(t>=ts(a))&(t+30*86400<=ts(b));rows[w]={};episodes[w]={}
        for name,mask in F.items():
            ix=np.flatnonzero(pop&mask);chosen=[];last=-1e20
            for i in ix:
                if t[i]-last>=30*86400:chosen.append(i);last=t[i]
            rows[w][name]={'daily':stats(ix,pop),'spaced30days':stats(chosen,pop)}
            episodes[w][name]=[{'time':int(t[i]),'entry':float(entry[i]),'forwardLow':float(forwardLow[i]),
              'forwardHigh':float(forwardHigh[i]),'crash':bool(crash[i]),'quiet':bool(quiet[i]),
              'rangeLow':float(lo[i]),'rangeHigh':float(hi[i]),'upBreak':bool(breakout[i]),'downBreak':bool(breakdown[i])} for i in chosen]
    # Indicators must not change when the future is removed, including partial days.
    for cut,hour in [('2021-04-01',0),('2024-08-01',8),('2025-02-01',16)]:
        g=Grid(0,a1h=hourly[hourly[:,0]<ts(cut)+hour*3600]);f,d=features(g)
        for name in F:assert np.array_equal(f[name],F[name][:len(d[0])]),(cut,name)
    out={'definitions':__doc__,'rows':rows,'episodes':episodes,'prefixChecks':3}
    (O/'regime-results.json').write_text(json.dumps(out,indent=1))
    for w,r in rows.items():
        print(w)
        for name,rr in r.items():
            z=rr['spaced30days'];print(name,z['n'],'crash',z['crashes'],'quiet',z['quiet'],'rangebreak',z['eitherBreaks'])

if __name__=='__main__':run()
