"""Publish recency results, including carried positions and fresh-account tests."""
from bull import *
from datetime import datetime,timezone
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

def run():
    x=json.loads((O/'recency-results.json').read_text());old=json.loads((O/'results.json').read_text())
    carry={};neighbors=[];extra={};hourly=data()
    for label,n in x['selected'].items():
        rr=[r for r in x['records'] if r['name']==n];cc=[]
        for r in rr:
            s=next(s for s in x['stress'] if s['name']==n and s['phase']==r['phase'] and s['fee']==.001 and s['delay']==0)
            cc.append({'phase':r['phase'],'ratio':s['rows']['2023-25']['btc']/r['rows']['2023-24']['btc'],
              'cashEntering2025':r['rows']['2023-24']['cash'],'unitsEntering2025':r['rows']['2023-24']['units']})
        carry[label]={'base':cc[0]['ratio'],'min':min(r['ratio'] for r in cc),'max':max(r['ratio'] for r in cc),
          'above1':sum(r['ratio']>1 for r in cc),'rows':cc}
    # Immediate parameter neighbors already in the original grid; no new tuning.
    name=x['selected']['recentWeighted'];p=CONFIGS[name];triggers=['e20','e30','e40','e50'];gains=[.03,.05,.1,.15]
    for n,q in CONFIGS.items():
        if q['gate']!=p['gate'] or q['recovery']!=p['recovery'] or q['trigger'] not in triggers:continue
        if abs(triggers.index(q['trigger'])-triggers.index(p['trigger']))>1 or abs(gains.index(q['gain'])-gains.index(p['gain']))>1:continue
        rr=[r for r in x['records'] if r['name']==n];vals=[r['rows']['2025']['btc'] for r in rr]
        neighbors.append({'name':n,'fullCycleBase':old['detail'][n]['2023-25']['btc'],
          'fresh2025Base':next(r['rows']['2025']['btc'] for r in rr if r['phase']==0),
          'fresh2025Min':min(vals),'fresh2025Max':max(vals),'fresh2025Above1':sum(v>1 for v in vals)})
    for phase in PHASES:
        G=Grid(phase,a1h=hourly);I=inputs(G)
        extra[str(phase)]={w:replay(G,I,name,*ab) for w,ab in {
          '2020-21':('2020-01-01','2022-01-01'),'2022':('2022-01-01','2023-01-01'),
          '2026 through Oct 9':('2026-01-01','2026-10-10')}.items()}
    diagnostics={'carried2025':carry,'neighbors':neighbors,'recentWeightedOtherWindows':extra}
    (O/'recency-diagnostics.json').write_text(json.dumps(diagnostics,indent=1))
    # Check saved baseline results against the earlier, independent batch.
    v=json.loads((O/'validation-results.json').read_text());base=x['selected']['baseline']
    assert abs(x['summary']['baseline']['stress']['0.001/0']['2023-25']['base']-v['detail'][base]['2023-25']['btc'])<1e-12
    assert len(x['records'])==216*8
    for r in x['records']:
        assert all(0<=z['cashFraction']<=1 and z['btc']>0 for z in r['rows'].values())
    for label in ['recentOnly','recentWeighted']:
        assert x['selected'][label]==max(x['scores'],key=lambda n:x['scores'][n][label])
    fig,ax=plt.subplots(figsize=(11,4.7),layout='constrained')
    labels={'baseline':'Current candidate: 20% / 5% / breadth recovery','recentWeighted':'Recent-weighted: 50% / 10% / 14 days','recentOnly':'Recent-only: 50% / 10% / 3% recovery stop'}
    for label,color in [('baseline','#207c83'),('recentWeighted','#bd7713'),('recentOnly','#9869a4')]:
        a=np.array(x['detail'][x['selected'][label]]['2023-25']['curve'])
        ax.plot([datetime.fromtimestamp(t,timezone.utc) for t in a[:,0]],a[:,1],label=labels[label],color=color,lw=1.7)
    ax.axhline(1,c='gray',ls='--');split=datetime(2025,1,1,tzinfo=timezone.utc);ax.axvline(split,c='gray',ls=':')
    ax.set_title('Recent-cycle tuning: full-cycle gains can hide weaker later performance\n2023–2024 selection window | 2025 carried-position diagnostic',fontsize=12)
    ax.set_ylabel('BTC equivalent per initial BTC');ax.grid(alpha=.2);ax.legend(fontsize=9,loc='upper left')
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=6));ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
    fig.savefig(O/'recency-comparison.png',dpi=150);plt.close(fig)
    lines=['# Does newer Bitcoin history deserve more weight?', '',
      'Research completed 11 October 2026. **Yes, recent-cycle weighting is a defensible research preference. It produces a stronger full-cycle fit here, but does not establish that the chosen parameters forecast the next cycle better.**', '',
      '## Is there evidence that the recent cycle differs?', '',
      '| Supplied bull window | Annualized daily log-return volatility | Median rolling 30-day annualized volatility | Daily-close maximum drawdown |',
      '|---|---:|---:|---:|']
    for w,r in x['volatility'].items():lines.append(f"| {w} | {r['annualizedDailyVol']:.1%} | {r['median30dVol']:.1%} | {r['dailyCloseMaxDD']:.1%} |")
    lines += ['', 'Volatility is substantially lower in 2023–2025. It is not monotonically lower across all cycles: 2019–2021 was more volatile than 2015–2017 by this measure. These metrics describe the sample; they cannot identify the change as being caused by maturity or guarantee that future volatility or crash risk declines.', '',
      'Fidelity’s [A Closer Look at Bitcoin’s Volatility](https://www.fidelitydigitalassets.com/research-and-insights/closer-look-bitcoins-volatility) documents a long-term decline in realized volatility and discusses a growing capital base. Glassnode’s [Thinking Ahead](https://research.glassnode.com/the-week-onchain-week-04-2025/) discusses diminished cycle growth and a more mature market structure. Those sources support testing the hypothesis, not the specific trading thresholds below.', '',
      '## Selection method', '',
      'The [protocol](RECENCY_PROTOCOL.md) was written before this new run. Reuse all 216 rules from the original grid. Rank their 25th-percentile annualized log BTC growth across eight candle alignments. Recent-only selection uses 2023–2024. Recent-weighted selection uses illustrative weights of 60% on 2023–2024, 30% on 2019–2021, and 10% on 2015–2017. The weights express a preference, not a fitted estimate of predictive relevance. Earlier losses no longer veto a rule.', '',
      'Selection scores exclude 2025 returns. Nevertheless all history, including 2025, was already viewed during earlier research and helped shape the grid and baseline. This is a retrospective chronological diagnostic, not an untouched holdout or evidence of live performance.', '',
      'Costs are 0.10% per side, next-open fills after completed candles. Start each independent replay with 1 BTC. Cash is measured after its hypothetical BTC purchase fee. The calendar bear exit remains separate.', '',
      '## Results', '',
      '| Selection | 2023–2024 training, base | Continuous 2023–2025, base | 2025 carried account: BTC growth | Fresh 1 BTC in 2025 |',
      '|---|---:|---:|---:|---:|']
    titles={'baseline':'Current conservative candidate','recentOnly':'Recent-only winner','recentWeighted':'Recent-weighted winner','fullCycleHindsight':'Full-cycle hindsight winner'}
    for label in ['baseline','recentOnly','recentWeighted','fullCycleHindsight']:
        s=x['summary'][label];lines.append(f"| {titles[label]} | {s['trainingAndTest']['2023-24']['base']:.4f} BTC | {s['stress']['0.001/0']['2023-25']['base']:.4f} BTC | {carry[label]['base']-1:+.2%} | {s['trainingAndTest']['2025']['base']:.4f} BTC |")
    lines += ['', '![Continuous BTC-equivalent paths](recency-comparison.png)', '',
      'Carried growth divides year-end 2025 BTC equivalent by year-end 2024 BTC equivalent without resetting units, cash or pending decisions. A fresh account starts January 2025 holding exactly 1 BTC. The selected weighted rule entered 2025 in cash in its simulated continuous history; an investor adopting it fresh in January would not automatically inherit that cash position. This difference matters and both results are retained. Training return multiplied by the fresh-account result need not equal the continuous result.', '',
      '## What recent weighting actually changes', '',
      f"Recent-weighted selection chooses `{x['selected']['recentWeighted']}`:", '',
      '- Keep the same buffered SMA200 gate: two daily closes above 102% to turn bullish, two below 98% to turn bearish.',
      '- Sell the full account after breadth crosses below **50%**, instead of below 20%. This permits earlier and more frequent tactical exits.',
      '- Target **10% additional BTC**, instead of 5%, using the same fee-adjusted buyback formula.',
      '- Buy back when the target is reached or after **14 days in cash**, rather than waiting for breadth above 60%. All fills remain next-open.', '',
      'The maturity hypothesis itself does not imply a 10% target, a 50% breadth threshold or a 14-day timeout. These emerged from the particular training sample and ranking. In particular, lower volatility does not automatically imply that lowering every percentage threshold will improve accumulation.', '',
      'Recent-only selection chooses the same 50% breadth and 10% target, but uses a recovery buyback when price closes 3% above the actual sale price. Its continuous account loses BTC during 2025 on all eight alignments, despite the impressive 2023–2024 training fit.', '',
      'The full-cycle hindsight winner uses 50% breadth, a 3% target and the 14-day timeout. Its 1.7379 BTC full-cycle result was selected using all of 2023–2025, including the evaluation year; it is explicitly not a forecast test.', '',
      '## Alignment and execution sensitivity of the recent-weighted winner', '',
      '| Separate stress | Continuous 2023–2025 BTC range | Fresh 2025 BTC range | Fresh 2025 alignments above 1 BTC |',
      '|---|---:|---:|---:|']
    st=x['summary']['recentWeighted']['stress']
    for k,label in [('0.001/0','Base'),('0.003/0','0.30% cost each side'),('0.001/1','Extra 4h execution delay'),('0.001/6','Extra 24h execution delay')]:
        a,b=st[k]['2023-25'],st[k]['2025'];lines.append(f"| {label} | {a['min']:.4f}–{a['max']:.4f} | {b['min']:.4f}–{b['max']:.4f} | {b['above1']}/8 |")
    q=carry['recentWeighted']
    lines += ['', f"At base costs, the weighted rule’s carried 2025 BTC growth is {q['min']-1:+.2%} to {q['max']-1:+.2%}, positive on all eight alignments. Its fresh-account result is positive on only 1/8. Eight alignments reuse the same prices and are sensitivity checks, not independent market samples.", '',
      'It also has meaningful earlier-cycle exposure: 2015–2017 ends at 0.8853 BTC at the base alignment (0.6595–1.2013 across alignments), while 2019–2021 ends at 1.3588 BTC (1.1813–1.6457). A recent preference allows this tradeoff; it does not make those losses disappear.', '',
      '| Additional fresh-account test of weighted rule | Default BTC | Eight-alignment range |', '|---|---:|---:|']
    for w in extra['0']:
        vals=[r[w]['btc'] for r in extra.values()];lines.append(f"| {w} | {extra['0'][w]['btc']:.4f} | {min(vals):.4f}–{max(vals):.4f} |")
    lines += ['', 'The 2026 cutoff is October 9 UTC. These are standalone overlays; the combined calendar framework is in cash during bear years.', '',
      '## Neighboring parameters', '',
      'Keep SMA200 and the 14-day recovery; inspect immediately adjacent breadth and target settings from the existing grid. These were not used to revise the selected rule after seeing 2025.', '',
      '| Rule | Default 2023–2025 BTC | Fresh 2025 BTC range | Fresh 2025 wins / alignments |', '|---|---:|---:|---:|']
    for r in neighbors:lines.append(f"| {r['name']} | {r['fullCycleBase']:.4f} | {r['fresh2025Min']:.4f}–{r['fresh2025Max']:.4f} | {r['fresh2025Above1']}/8 |")
    lines += ['', '## Interpretation', '',
      'Give modern data more relevance and retain old periods as stress scenarios. The weighted candidate is a plausible modern-cycle alternative, with a higher continuous recent-cycle result and better 24-hour-delay behavior than the conservative candidate. Its weaker fresh-2025 result and earlier losses mean it has not demonstrated general superiority. Recent-only optimization failed the subsequent carried-year check outright.', '',
      'Do not equate better retrospective fit with better projection. A volatility-scaled target would be another distinct hypothesis requiring a fixed formula and its own chronological evaluation; this run did not test or validate one. Likewise, if maturity changes the market structure, the exact four-year calendar exit deserves future scrutiny too. This study keeps it fixed to isolate the overlay comparison.', '',
      'No live model or calendar position was changed. Reproduce using `recency.py` followed by `recency_report.py`; inputs and dependencies match the [main report](REPORT.md). All 216 × 8 training/test records, scores and stress results are in [recency-results.json](recency-results.json); carried-account and neighboring-rule diagnostics are in [recency-diagnostics.json](recency-diagnostics.json). Checks confirm selection from the declared training scores, baseline parity with the prior run, positive ledger values and valid cash fractions. Each simulation also independently reconciles the actual sale/buy price ratios after fees.']
    (O/'RECENCY_REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('PASS: all trials retained, training-score selection, baseline parity and ledger sanity; report and figure generated.')
    print('Extra windows',json.dumps({w:{'base':extra['0'][w]['btc'],'min':min(r[w]['btc'] for r in extra.values()),'max':max(r[w]['btc'] for r in extra.values())} for w in extra['0']}))

if __name__=='__main__':run()
