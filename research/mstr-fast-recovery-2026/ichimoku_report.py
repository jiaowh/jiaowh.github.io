"""Publish the fixed selections, including failures, under the units objective."""
from pathlib import Path
import json,csv,datetime as dt
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm

P=Path(__file__).resolve().parent
x=json.loads((P/'ichimoku-results.json').read_text());d=json.loads((P/'ichimoku-diagnostics.json').read_text())
BASE='threshold_x50_b50_c3';JOINT=BASE+'__joint200'
VB='legacy_add_vortex_x50_b50';VJ=VB+'__joint200'
labels={BASE:'Current fast 50/50, 3 closes',JOINT:'Current fast + joint SMA200 exit',
 'threshold_x40_b65_c1':'Fast 40/65, 1 close','threshold_x45_b65_c3':'Fast 45/65, 3 closes',
 'threshold_x45_b60_c3__joint200':'Fast 45/60, 3 closes + joint exit',
 'threshold_x50_b50_c1':'Fast 50/50, 1 close',VB:'Fast + Vortex',VJ:'Fast + Vortex + joint exit',
 'ichitactical_4h_spanb_c3':'4h Span B correction, 3 closes',
 'ichitactical_daily_kijun_c3':'Daily Kijun correction, 3 closes',
 'legacy_add_ichimoku_x45_b55':'Fast + old Ichimoku, 45/55',
 'legacy_add_vma_x45_b55':'Fast + old VMA, 45/55',
 'ichifilter_either_spanb_c2':'Fast + either asset above Span B',
 'ichistate_mstr_tkcross_c1':'MSTR Tenkan/Kijun cross',
 'ichistate_btc_tkcross_c2':'BTC Tenkan/Kijun cross',
 'ichitactical_4h_spanb_c3__joint200':'4h Span B correction + joint exit',
 'ichitactical_4h_cloud_c1':'4h cloud correction, 1 close',
 'nativelegacy_decycler':'Native MSTR decycler','hold':'Hold'}
label=lambda n:labels.get(n,n)
pct=lambda v:f'{100*v:.1f}%'
def cell(asset,name,period):
    r=x[asset.lower()][name][period];key='btc' if asset=='BTC' else 'shares'
    cash=r['cash']>0 if asset=='BTC' else not r['holding']
    return f"{r[key]:.3f}"+(' *' if cash else '')
def table(asset,names,periods):
    return ['| Strategy | '+' | '.join(periods)+' |','|---|'+'---:|'*len(periods)]+[
        '| '+label(n)+' | '+' | '.join(cell(asset,n,p) for p in periods)+' |' for n in names]
def phase_range(asset,n,p):
    key='btc' if asset=='BTC' else 'shares'
    vals=[x[asset.lower()][n][p][key]]+[r['units'] for r in x['phases'] if r['asset']==asset and r['name']==n and r['period']==p]
    return f'{min(vals):.3f}–{max(vals):.3f}'
def stress(asset,n,p,fee,delay):
    key='btc' if asset=='BTC' else 'shares'
    return next(r['result'][key] for r in x['stress'] if (r['asset'],r['name'],r['period'],r['fee'],r['delay'])==(asset,n,p,fee,delay))

bmain=[BASE,x['selectedBTC']['balanced'],x['selectedBTC']['bull']]
mmain=[BASE,JOINT,VJ]
lines=['# Old strategies revised for asset accumulation','',
 'Research date: October 13, 2026. Frozen price sample through October 9, 2026. Research results only; no site or Telegram rules changed.','',
 '**Finding:** threshold changes repair the tested BTC 2020–2021 loss but sacrifice recent-cycle accumulation. Ichimoku did not provide a superior preselected replacement. For MSTR, adding Vortex to BTC breadth is a promising improvement to the prior joint-SMA200 candidate, with meaningful timing sensitivity. There is no single setting that dominates the controls across all years and execution assumptions.','',
 '## Objective, scope and selection','',
 'Start with one BTC or one split-adjusted MSTR share and maximize fee-net ending units relative to holding, which always ends at one. Include 0.1% per transaction side; no leverage, taxes or cash interest. An asterisk marks cash valued as units at the final close after a hypothetical repurchase fee. These units have not yet been bought. Annual tests restart with one unit; continuous windows carry their portfolio across years. Do not multiply annual rows to recreate continuous tests.','',
 f"Tested **{len(x['btc'])} BTC rules and {len(x['mstr'])} MSTR rules**: 38 BTC threshold/confirmation settings, 96 revisions of the 24 old indicator families, 12 tactical Ichimoku rules, plus MSTR native signals and trend filters. BTC executes at the next four-hour opening; the principal MSTR comparison executes at actual daily openings after the signal is available. Recent MSTR candidates are also checked at regular-session hourly openings.",'',
 'The balanced selector uses half the mean and half the worst annual log units in 2021–2024. The bull selector uses mean annual log units in 2023–2024. Each family is selected separately using those same dates. Choices are frozen before comparing 2025–2026. Those later prices have already been examined in previous research, so this is retrospective chronological validation, not an untouched holdout. The 535 results are related variants, not 535 independent experiments.','',
 'The prior 24-family study optimized dollar Sharpe with a different allocation system. Here its indicator definitions are retained but its ranking and allocation objective are replaced. Families: '+', '.join(x['oldFamilies'])+'.','',
 '## BTC: threshold trade-off','',
 '50% was already tested against alternatives in the earlier breadth research. This revision extends sell thresholds to 40/45/50/55/60%, recovery thresholds to 45/50/55/60/65%, and one/three consecutive sell closes. Recovery must be at or above the sell threshold. Comparisons are strict: below to sell, above to recover. The BTC bullish SMA200 gate, 10% nominal BTC buyback hurdle and seven-day cash timeout remain unchanged.','',
 'The pre-2025 balanced selection is 40% sell /65% recovery with one close. The bull-focused selection is 45%/65% with three closes. Both beat holding in the combined 2020–2021 test, but the current 50/50 strategy earns more BTC in 2023–2025 and 2025–2026.','']
lines+=table('BTC',bmain,['2020-21','2022','2023-25','validation'])
lines+=['','`validation` means January 2025–October 9, 2026. The 2023–2025 and validation windows overlap; they are not independent evidence.','']
lines+=table('BTC',bmain,list(map(str,range(2018,2027))))
lines+=['','2026 is partial-year. At the reference candle phase, both revised thresholds avoid an annual unit loss across 2018–2026, but this is not an always-winning property. The 40/65 rule falls to **0.967 BTC** in 2025–2026 with 0.3% costs plus an extra four-hour execution delay. The 45/65 rule falls to **0.940 BTC** in one alternate candle phase over the same period.','',
 'The 2020–2021 repair is more convincing than a single favorable alignment: 40/65 ends at 1.106–1.824 BTC across eight candle phases and 1.706 with higher costs plus delay at the reference phase; 45/65 ends at 1.111–1.525 across phases and 1.991 under that combined cost/delay test. These are post-selection diagnostics, not a new selection stage.','',
 '**Bear-market distinction:** all three BTC rules finish 2022 at 1.000 BTC because they stay invested. Their 2022 dollar return is −64.2% and sampled dollar drawdown is 67.2%. The bullish SMA200 gate prevents correction trades in a bearish regime; it does not itself liquidate BTC. Improving BTC units is different from protecting dollar value.','',
 'A lower selling threshold waits for deeper breadth weakness; a higher recovery threshold waits for a stronger rebound. That can improve a sustained correction and lose ground during a quick recovery. The observed historical trade-off does not establish that either setting predicts crashes.','',
 '## Ichimoku and the other old BTC families','',
 'Kijun is the midpoint of the previous 26 bars’ highest high and lowest low. Span B uses 52 bars and is plotted 26 bars forward. The cloud shown at today’s coordinate therefore uses spans calculated 26 bars ago. Newly calculated spans use current/past prices; their forward placement does not supply future observations. The test separates displayed Span B from the unshifted 52-bar midpoint. [Fidelity indicator definition](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ichimoku-cloud)','',
 'These family representatives were picked before the later-period comparison:','']
bother=list(dict.fromkeys([BASE]+[n for fam,r in x['selectedBTC']['families'].items() if fam!='threshold' for n in r.values()]))
lines+=table('BTC',bother,['2020-21','2023','2024','2025','2026','2023-25','validation'])
lines+=['','Daily Kijun correction timing loses BTC in both 2025 and 2026. Four-hour Span B performs better, but still accumulates less than the current strategy in the recent cycle. The multi-timeframe old Ichimoku addition fixes some earlier weakness, yet also gives up much of the recent gain. “Leading” Span B is not an early-warning guarantee.','',
 '## MSTR: the Vortex addition','',
 'The balanced selector chooses **BTC fast + Vortex + joint SMA200 exit**. The bull-only selector chooses the same Vortex breadth without that bear exit. The latter still loses shares in 2026, so the two serve different objectives.','',
 'The revised breadth uses 36 fast iMACD vote weights, 36 Vortex vote weights and the existing 14 daily trend votes: iMACD weight falls from 72% to 41.9%; Vortex gets 41.9%; the daily block gets 16.3%. Vortex uses the original 21/34/55 lengths on 4/8/12/24/48/72-hour BTC bars. Its 18 directional conditions each receive weight two to match the old family convention. These are correlated votes, not independent probabilities.','',
 'Vortex compares summed upward cross-bar movement, abs(high[t]−low[t−1]), with downward movement, abs(low[t]−high[t−1]). Higher upward movement votes bullish. Three fresh BTC closes below 50% combined breadth initiate a sale while BTC’s SMA200 regime is bullish. Recovery above 50%, the same BTC-based buyback target, or the seven-day timer restores the underlying BTC position.','',
 'For the MSTR bear exit, hold only if that BTC position is invested and at least one of BTC or MSTR has a bullish daily SMA200 regime. Each regime needs two daily closes above 102% or below 98% of its SMA200 to switch. Both bearish means cash. BTC uses calendar days; MSTR uses trading sessions. The BTC correction engine keeps running even when the MSTR overlay is in cash.','']
lines+=table('MSTR',mmain,list(map(str,range(2018,2027))))
lines+=['','Earlier MSTR years precede its Bitcoin-treasury business. Even so, the new rule’s 2020 loss to **0.882 shares** must remain visible. The better 2021–2026 rows do not mean it always wins.','']
lines+=table('MSTR',mmain,['2020-21','2023-25','validation'])
lines+=['','**Why it improved:** in 2025 it adds a March 28–April 4 cash leg gaining 11.48% in shares; it also changes the August buyback from August 26 to September 2, improving that cash leg from 6.04% to 8.22%. It still loses 7.87% on January 10–15 and 7.23% on February 3–10. This is better correction timing in some cases, not removal of false signals.','',
 'The January 2023 regime exit/re-entry still loses 37.34% of shares in both models. Later Vortex timing recovers enough to finish that year at 1.064 instead of 0.981. The 2026 improvement versus unchanged fast comes from the joint bear exit; adding Vortex does not change that year’s 1.202 result.','',
 'Over 2025–2026 the Vortex/joint candidate returns **+40.0% in dollars**, versus **+21.0%** for the preceding joint candidate and **−48.6%** for holding. Its sampled dollar drawdown is **33.3%**, versus **34.4%** and **81.9%**, respectively. Share accumulation does not eliminate risk.','',
 '## Other MSTR choices','']
mother=list(dict.fromkeys([JOINT,VJ]+[r['balanced'] for r in x['selectedMSTR']['families'].values()]))
lines+=table('MSTR',mother,['2022','2023','2024','2025','2026','validation'])
lines+=['','The selected threshold-only alternative (45% sell /60% recovery, three closes, plus joint exit) reaches 2.824 shares in 2025–2026, higher than Vortex’s 2.723. It was weaker on the original fitting score and recent bull window (4.025 versus 6.057 in 2023–2025). Choosing it now because of the later-period number would add hindsight selection.','',
 'The selected Span B filter finishes 2025–2026 at 1.642 shares, below the joint SMA200 control’s 2.352. Its 2022 dollar loss is 67.3%, so it is not a substitute for the existing bear exit. Native Tenkan/Kijun crossing protects some declines but loses substantial share exposure during 2023–2024.','',
 '## Robustness and limits','',
 '| Test, continuous 2025–2026 | Prior MSTR joint exit | Vortex + joint exit |','|---|---:|---:|',
 f"| Daily openings, 0.1%/side | {cell('MSTR',JOINT,'validation')} | {cell('MSTR',VJ,'validation')} |"]
for fee,delay in [(.003,0),(.001,1),(.003,1)]:
    lines.append(f'| Daily openings, {fee*100:.1f}%/side, {delay} extra session | '+ ' | '.join(f"{stress('MSTR',n,'validation',fee,delay):.3f}" for n in [JOINT,VJ])+' |')
for fee,delay in [(.001,0),(.003,0),(.001,1),(.003,1)]:
    vals=[next(r['result']['shares'] for r in d['hourly'] if (r['name'],r['period'],r['fee'],r['extraBars'])==(n,'validation',fee,delay)) for n in [JOINT,VJ]]
    lines.append(f'| Hourly openings, {fee*100:.1f}%/side, {delay} extra available bar | '+' | '.join(f'{v:.3f}' for v in vals)+' |')
lines+=['',
 '- Vortex beats the preceding joint strategy in seven of eight matched candle phases in 2025–2026, but only four of eight in 2023–2025. Its 2023–2025 result ranges from 3.775 to 6.057; the reference phase is its best. This weakens the claim of a general bull-market improvement.',
 '- A full extra stock-session delay reduces 2023–2025 Vortex units from 6.057 to 1.301; the prior joint rule retains 1.716 under the same delay. Acting promptly matters, and the ranking is not invariant to execution.',
 '- Removing the best completed 2025–2026 cash-leg multiplier leaves 1.231 shares for Vortex versus 1.064 for the prior joint strategy. The dominant shared leg sold October 30, 2025 and bought August 24, 2026. This arithmetic diagnostic is not a counterfactual rerun of the strategy.',
 '- The selected displayed-Span-B MSTR filter varies from 1.464 to 1.745 shares in 2025–2026 with offsets of 25–27 bars; none beats the joint SMA200 control. Offset sensitivity was not used to choose a new winner.',
 '- BTC 40/65 loses its later-period edge over holding when the best completed cash leg is factored out: 1.056 becomes 0.955. Current 50/50 remains at 1.082 by the same diagnostic.',
 '- These are quote-based opening fills with modeled costs, not observed executions. The hourly MSTR data retain nine audited sessions using a daily-candle fallback. Sampled drawdowns omit intrabar extremes. No result establishes a certain crash-versus-consolidation classifier.','',
 '## Verification and research decision','']
lines+=['- '+s+'.' for s in x['checks']+d['checks']]
lines+=['','Keep the current BTC rule as the recent-cycle control. Retain 40/65 and 45/65 as explicit historical trade-offs, rather than calling them universal improvements. For MSTR, the Vortex/joint rule deserves prospective comparison with the simpler joint rule; its later-period gain survived the tested costs/hourly execution, but historical timing sensitivity prevents treating it as settled superiority. No live rule changes were made.','',
 'All trials, not just winners, are in `ichimoku-candidates.csv` and `ichimoku-results.json`. Selected trade ledgers are in `ichimoku-trades.csv`; detailed execution and concentration diagnostics are in `ichimoku-diagnostics.json`. Definitions, selection dates and safeguards are in `ICHIMOKU_PROTOCOL.md`. Run `ichimoku_revisit.py`, then `ichimoku_diagnostics.py`, then `ichimoku_report.py` to reproduce using the documented adjacent quant data dependency.','',
 '![Annual unit comparison](ichimoku-annual.png)','']
(P/'ICHIMOKU_REPORT.md').write_text('\n'.join(lines),encoding='utf-8')

with (P/'ichimoku-candidates.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f);w.writerow(['asset','rule','family','period','ending_units','ends_in_cash','round_trips','wins','usd_return','usd_drawdown'])
    for asset,meta,key in [('BTC','btcDefinitions','btc'),('MSTR','mstrDefinitions','shares')]:
        for name,periods in x[asset.lower()].items():
            for period,r in periods.items():
                risk=d['btcRisk'].get(name,{}).get(period,{}) if asset=='BTC' else r
                w.writerow([asset,name,x[meta][name]['family'],period,r[key],r['cash']>0 if asset=='BTC' else not r['holding'],r['roundTrips'],r['wins'],risk.get('usdReturn',''),risk.get('usdDD','')])
with (P/'ichimoku-trades.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f);w.writerow(['asset','rule','period','side','fill_utc','decision_utc','price','units_before','units_after','reason'])
    iso=lambda t:dt.datetime.fromtimestamp(t,dt.timezone.utc).isoformat()
    for asset in ['BTC','MSTR']:
        for name,periods in x['details'+asset].items():
            for period,r in periods.items():
                for t in r['ledger']:w.writerow([asset,name,period,t['side'],iso(t['time']),iso(t['decision']),t['price'],t.get('unitsBefore',''),t.get('unitsAfter',t.get('units','')),t['reason']])

years=list(map(str,range(2018,2027)))
fig,axes=plt.subplots(2,1,figsize=(13,6.8),gridspec_kw={'hspace':.68})
for ax,asset,names,key in [(axes[0],'BTC',bmain,'btc'),(axes[1],'MSTR',mmain,'shares')]:
    a=np.array([[x[asset.lower()][n][y][key] for y in years] for n in names])
    ax.imshow(a,cmap='RdYlGn',norm=TwoSlopeNorm(vmin=.7,vcenter=1,vmax=2.7),aspect='auto')
    ax.set_yticks(range(len(names)),[label(n) for n in names],fontsize=10)
    ax.set_xticks(range(len(years)),[y+('*' if y=='2026' else '') for y in years],fontsize=10)
    ax.tick_params(length=0,pad=8);ax.set_title(f'{asset}: ending units from 1 at each year’s start',loc='left',fontsize=14,pad=16,weight='bold')
    for i,n in enumerate(names):
        for j,y in enumerate(years):ax.text(j,i,cell(asset,n,y),ha='center',va='center',fontsize=10,color='#101820',weight='bold')
    for spine in ax.spines.values():spine.set_visible(False)
fig.suptitle('Revisiting old signals under the accumulation objective',x=.03,ha='left',fontsize=18,weight='bold')
fig.text(.03,.025,'Holding = 1.000. 0.1% cost per side. * Cash equivalent in cells; 2026* ends Oct 9. Annual tests reset; no guarantee of future gains.',fontsize=10,color='#44505b')
fig.subplots_adjust(left=.29,right=.98,top=.82,bottom=.12)
fig.savefig(P/'ichimoku-annual.png',dpi=160,facecolor='white');plt.close(fig)
print('Saved report, all-candidate CSV, selected trades and annual chart')
