"""Compact public report and static sensitivity figure; raw trials stay local."""
from pathlib import Path
import json,math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
O=Path(__file__).resolve().parent
j=json.loads((O/'weights-results.json').read_text())
BASE='page_x50_c3_timeout';REC='page_x50_c3_e50';winner=j['selected']['recent']
labels={'page':'Original: 72% iMACD','im50':'50% iMACD','im25':'Equal families: 25% iMACD','im0':'No iMACD; other families equal',
 'im90':'90% iMACD','im100':'iMACD only','daily14':'Daily 14 votes only','slow_im50':'Slow iMACD at 50%',
 'fast_im50':'Fast iMACD at 50%','half_fast':'Half-weight 4h/8h iMACD','replace_bands':'Replace iMACD with band channels',
 'replace_macd':'Replace iMACD with MACD','replace_rsi':'Replace iMACD with RSI','add_bands20':'Add 20% band channels',
 'im35_bands35':'35% iMACD + 35% band channels','five_equal':'Five equal families with bands'}
byname={n:[r for r in j['rows'] if r['name']==n] for n in j['rules']}
def base(n,k):return byname[n][0]['periods'][k]
def bounds(n,k):return min(r['periods'][k]['btc'] for r in byname[n]),max(r['periods'][k]['btc'] for r in byname[n])
def cell(n,k):
    r=base(n,k);return f"{r['btc']:.4f}"+('*' if r['cash']>0 else '')
def range_text(n,k):
    a,b=bounds(n,k);return f'{a:.4f}–{b:.4f}'
fixed={v:v+'_x50_c3_timeout' for v in labels}
lines=['# iMACD weighting and alternative breadth indicators','',
'Completed 11 October 2026. We reviewed the earlier ensemble notes and tested 288 fixed combinations: '
'16 breadth definitions × three exit thresholds × two confirmation lengths × three buyback modes, each across eight candle alignments. '
'All history was previously examined; these are retrospective experiments, not independent forecasting evidence.','',
'**Finding:** the numerical dominance of iMACD is real, but equal family weights did not produce a robust improvement. '
'Removing iMACD and equal-weighting the remaining families lost BTC throughout the recent cycle in all eight alignments. '
'Plain MACD is a plausible alternative, but the evidence does not establish it as a universal upgrade. '
'The earlier >50% recovery-buyback candidate remains a more useful comparison than simply reducing the iMACD weight. '
'The displayed Average and refined strategies have not been replaced.','',
'## What the previous research found','',
'Read-only sources in the adjacent quant repository: `reports/iMACD ensemble.md` (weighting addendum); '
'`reports/Average strategy v2 research.md` (rounds 5 and 5b); `research_notes/ensemble_v2/r20_tfweight.py` and `r25_indicator_screen.py`.','',
'The old Average model tested equal family weights, dropping iMACD, downweighting fast timeframes, ordinary MACD, and 24 alternative indicator families. '
'Equal families reduced 2019+ spot Sharpe by approximately 0.09; dropping iMACD reduced it by approximately 0.16. '
'The notes attribute part of iMACD’s contribution to its channel/dead-band behavior, which avoids declaring an upward trend during small price movements. '
'The Keltner/Bollinger breakout family was the closest alternative in the broad screen, but did not meet its adoption criteria.','',
'Those results used dollar returns, drawdown and risk-adjusted performance under the old sizing/funding mapping. '
'They do not settle the present objective of gaining BTC through tactical exits and buybacks, which is why the new test uses our BTC ledger.','',
'## Is the 72% weight inherently excessive?','',
'The original weights are iMACD 72%, SMA 10%, momentum 10%, Donchian 8%. '
'Equal weighting each family changes that to 25% each. The 50% experiment gives iMACD 50% and each other family 16⅔%. '
'Equal family names do not mean independent information: all are transformations of the same BTC price history. '
'In 2023–2024, SMA-family and momentum-family breadth had correlation 0.880; it was 0.917 in 2025. '
'iMACD’s correlations with other families were also high (approximately 0.80–0.82 in training). '
'These are descriptive correlations across consecutive, overlapping observations, not independent statistical tests.','',
'## Isolate the weighting change','',
'Every row below keeps the original sale threshold below 50%, three-close confirmation, 10% BTC target and seven-day timeout. '
'The same buffered daily SMA200 gate applies. Start with 1 BTC, use next-open fills and 0.10% costs each side. '
'Multi-year windows are continuous accounts. * means ending cash valued as BTC after its purchase fee.','',
'| Breadth definition | 2020 | 2025 | 2023–2025 | Recent-cycle range across alignments | Beats original in recent cycle |',
'|---|---:|---:|---:|---:|---:|']
for v,n in fixed.items():
    wins=sum(r['periods']['2023-25']['btc']>b['periods']['2023-25']['btc']+1e-9 for r,b in zip(byname[n],byname[BASE]))
    lines.append('| '+labels[v]+' | '+' | '.join(cell(n,k) for k in ['2020','2025','2023-25'])+' | '+range_text(n,'2023-25')+f' | {wins}/8'+(' (reference)' if v=='page' else '')+' |')
lines += ['', '![Composition sensitivity, with trade rules held fixed](weights-comparison.png)', '',
'The equal-family default recent-cycle result, 1.6807 BTC, is slightly above the original 1.6638. '
'But its range is 1.0903–1.6807, versus the original 1.6541–2.0037. It wins only one alignment. '
'The 50%-iMACD blend also wins only one alignment. Selecting the default alone would conceal this fragility.','',
'## Fine-tuning without using 2025 to select','',
'Each breadth was tested at exit thresholds 40%, 45%, 50%; confirmation of one or three closes; and timeout-only, '
'additional >50% recovery, or additional >60% recovery. Target and timeout remained 10% BTC and seven days. '
'Both declared selectors chose **80% original breadth + 20% band channels, exit below 45% for three closes, timeout-only recovery**. '
'Its effective family weights are iMACD 57.6%, SMA 8%, momentum 8%, Donchian 6.4%, band channels 20%.','',
'Recent-only selection ranks the 25th percentile of log BTC across alignments in 2023–2024. '
'Recent-weighted selection uses 60% annualized 2023–2024, 30% 2019–2021, 10% 2015–2017, each using its alignment lower quartile. '
'Neither selection uses 2025/2026. Their common winner had a 2023–2024 lower-quartile score of '
f"{math.exp(j['scores'][winner]['recent']*2):.4f} BTC versus {math.exp(j['scores'][BASE]['recent']*2):.4f} for the reference. "
'This was additional selection on already explored history, not a fresh holdout.','',
'| Window | Current refined | Training-selected blend | Original breadth + >50% recovery | Plain MACD replacement, fixed rule |',
'|---|---:|---:|---:|---:|']
for k in [*map(str,range(2018,2027)),'2015-17','2019-21','2020-21','train','2023-25']:
    lines.append('| '+('2023–2024 training' if k=='train' else '2026 through Oct 9' if k=='2026' else k)+' | '+' | '.join(cell(n,k) for n in [BASE,winner,REC,'replace_macd_x50_c3_timeout'])+' |')
lines += ['', 'The selected blend’s 2025 result fell to 1.0794 BTC from 1.1506. It made 11 round trips versus eight, '
'and 2025 BTC drawdown increased from 14.99% to 19.35%. Its 2020 default lost 12.02% BTC, worse than the reference’s 9.27% loss. '
'Continuous 2023–2025 improved only from 1.6638 to 1.6735. This is not a convincing replacement.', '',
'| Stress on training-selected blend | 2020 range | 2025 range | 2023–2025 range |',
'|---|---:|---:|---:|']
for fee,delay,label in [(.003,0,'0.30% costs each side'),(.001,1,'Extra 4h delay'),(.001,6,'Extra 24h delay'),(.003,1,'0.30% costs + extra 4h delay')]:
    rr=[r for r in j['stress'] if r['name']==winner and r['fee']==fee and r['delay']==delay]
    lines.append('| '+label+' | '+' | '.join(f"{min(r['periods'][k]['btc'] for r in rr):.4f}–{max(r['periods'][k]['btc'] for r in rr):.4f}" for k in ['2020','2025','2023-25'])+' |')
lines += ['', 'The 2025 worst alignment dips below 1 BTC at higher costs. Full-cycle gains persist, but neither that nor '
'the training rank demonstrates superiority over the reference.','',
'## Other indicators and promising-looking exceptions','',
'**Classic MACD:** replacing iMACD, with other rules fixed, improves default 2019 to 1.0261 and 2020 to 1.0456 BTC. '
'The recent cycle rises to 1.7269. However, 2025 drops to 1.0620, it beats the reference in only four of eight recent-cycle alignments, '
'and 2019/2020 alignment minima are 0.8012/0.9748. It does not eliminate losing years reliably. '
'MACD uses the earlier screen’s slow lengths 21/34/55 with fast length round(12/26 × slow) and nine-bar signal, on the six original timeframes; this is a family, not just one 12/26/9 indicator.','',
'**RSI:** the tested family votes bullish above 50 and uses a separate 55/45 hysteresis state. '
'It replaces the iMACD block using the same timeframe/length grid. Default recent-cycle BTC is 1.2413 and it beats the reference in none of the eight alignments. '
'RSI can remain overbought during strong trends, so an overbought reading alone was not used as an automatic sell. '
'[Fidelity’s RSI guide](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI).','',
'**Keltner/Bollinger band channels:** each timeframe/length has two rules: enter above EMA+ATR and exit below EMA; '
'enter above SMA+one standard deviation and exit below SMA. Both retain their state between entry and exit. '
'They are alternative price-trend signals, not an independent flow or sentiment source. Full replacement with these bands gives 1.3508 BTC in the recent cycle.','',
'**50% iMACD plus >50% recovery:** a tempting default recent-cycle result is 1.9058 BTC, above the previous recovery candidate’s 1.8283. '
'But its full-cycle range is 1.5134–1.9058, and it loses BTC in 2020 across all eight alignments (0.8886–0.9967). '
'The previous recovery candidate ranges 1.7644–1.9562 in the recent cycle and 1.0016–1.1337 in 2020 before higher-cost stress. '
'The visually largest default gain is not the most stable choice.','',
'## Interpretation and reproducibility','',
'The experiments support keeping broad timeframe coverage and evaluating the whole trading rule rather than assuming 72% is inherently excessive. '
'The original blend’s alternatives trade off fast response, repeated exits and slower recovery. '
'More equal weights do not create more independent information, and every price indicator can be late or fooled by a reversal. '
'[CME describes these oscillators as price-following tools](https://www.cmegroup.com/education/courses/technical-analysis/oscillators-macd-rsi-stochastics).','',
'For the current goal, prioritize the previously tested >50% buyback-recovery candidate for comparison, while retaining the reference. '
'Neither it nor the new compositions guarantee BTC gains in every year, and none replaces the separate calendar bear exit. '
'No live weighting or strategy default has changed in this research update.','',
'Validation: 144 annual/phase parity checks against the prior engine for both original and recovery baselines; '
'two future-truncation checks for all 16 breadths, all exit events and all recoveries; tests for exact threshold ties and short prefixes. '
'Weighted votes use a 1e-12 tolerance to avoid spurious threshold crossings from floating-point roundoff. '
'Each simulated round trip independently reconciles its fee-net price ratio.','',
'See [the fixed protocol](WEIGHTS_PROTOCOL.md), [compact results](weights-summary.json), and [prior recovery/filter study](CONFIDENCE_REPORT.md). '
'Full 288 × 8 trial records are retained locally in ignored `weights-results.json`. '
'Reproduce with `weights.py`, then `weights_report.py`, using the adjacent quant repository and cached inputs described in the earlier reports.']
(O/'WEIGHTS_REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
compact={k:j[k] for k in ['selected','rules','scores','summary','stress','correlation','parityChecks']}
compact['fixed']={v:{k:dict(base=base(n,k),minimum=bounds(n,k)[0],maximum=bounds(n,k)[1]) for k in ['2019','2020','2025','2023-25']} for v,n in fixed.items()}
(O/'weights-summary.json').write_text(json.dumps(compact,separators=(',',':')))

plt.rcParams.update({'font.size':10,'axes.facecolor':'#111820','figure.facecolor':'#0c1117','text.color':'#d9e3ec',
 'axes.labelcolor':'#d9e3ec','xtick.color':'#9fadb9','ytick.color':'#d9e3ec','axes.edgecolor':'#344250'})
fig,ax=plt.subplots(figsize=(11,8));ax.axvline(1,color='#87929d',ls='--',lw=1,label='Hold: 1 BTC')
for i,(v,n) in enumerate(fixed.items()):
    lo,hi=bounds(n,'2023-25');color='#ffb000' if v=='page' else '#38bdf8'
    ax.plot([lo,hi],[i,i],color=color,lw=3,alpha=.8)
    ax.scatter([base(n,'2023-25')['btc']],[i],color=color,s=42,zorder=3)
ax.set_yticks(range(len(fixed)),list(labels.values()));ax.invert_yaxis();ax.grid(axis='x',color='#26313b',alpha=.6)
ax.set_xlabel('Ending BTC from 1 BTC · continuous 2023–2025 · fees included')
ax.set_title('Does reducing iMACD improve BTC accumulation?',loc='left',fontsize=15,pad=25)
ax.text(0,1.025,'Same trading rules for every row. Line: eight-alignment range · dot: current chart alignment.',transform=ax.transAxes,color='#9fadb9',fontsize=9)
fig.text(.02,.01,'Retrospective comparison; chart alignment is a sensitivity test, not eight independent samples.',fontsize=9,color='#9fadb9')
fig.tight_layout(rect=[0,.025,1,1]);fig.savefig(O/'weights-comparison.png',dpi=160);plt.close(fig)
print('Published WEIGHTS_REPORT.md, weights-summary.json and weights-comparison.png')
