"""Weighted breadth threshold edges must not create floating-point trades."""
from pathlib import Path
import sys
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'research/btc-bull-accumulation-2026'))
from weights import confirmed,TOL,RULES

assert len(RULES)==288
E=np.array([.5,.5-1e-16,.5,.49,.48,.47,.46,.5,.49,.48,.47])
assert list(np.flatnonzero(confirmed(E,.5,3)))==[5,10]
assert not confirmed(np.array([.45-1e-16]*4),.45,3).any()
assert confirmed(np.array([.44]*3),.45,3)[-1]
assert not np.any(np.array([.5,.5+1e-16])>.5+TOL)
assert .52>.5+TOL
for k in range(1,len(E)+1):assert np.array_equal(confirmed(E[:k],.5,3),confirmed(E,.5,3)[:k])
print('PASS: 288 rules, strict weighted thresholds, exact-tie tolerance, three-close confirmation, recovery and fresh rearming.')
