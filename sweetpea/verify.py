"""Verify the counterbalancing of generated sequence CSVs.

    python sweetpea/verify.py

Checks that in every switching CSV, `response_transition` is balanced
WITHIN each `task_transition` level (the response-repetition / task-transition
confound is broken). Also reports congruency balance and, for cp_taskswitch, the
task x target_coh_level balance (expected near-balanced, not exact -- see README).

Exit code is non-zero if any hard assertion fails.
"""

import csv
import glob
import os
import sys
from collections import Counter

SEQ_DIR = os.path.join(os.path.dirname(__file__), "..", "sequences")

failures = []


def load(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def check_switching(path, rows):
    """response_transition must be balanced within each task_transition level."""
    # Drop the first trial (no transition defined).
    tr = [r for r in rows if r["task_transition"] not in ("First", "")]
    by_tt = {}
    for r in tr:
        by_tt.setdefault(r["task_transition"], Counter())[r["response_transition"]] += 1

    ok = True
    for tt, counter in sorted(by_tt.items()):
        rep = counter.get("Repeat", 0)
        sw = counter.get("Switch", 0)
        # Allow an off-by-one from odd trial counts.
        if abs(rep - sw) > 1:
            ok = False
        print(f"    task_transition={tt:<7} response Repeat={rep} Switch={sw}"
              f"  {'OK' if abs(rep - sw) <= 1 else 'IMBALANCED'}")
    if not ok:
        failures.append(f"{os.path.basename(path)}: response_transition NOT "
                        f"balanced within task_transition")

    # Independence table (should be ~equal across all four cells).
    cell = Counter((r["task_transition"], r["response_transition"]) for r in tr)
    print(f"    tt x rt cells: {dict(cell)}")

    # congruency balance
    cong = Counter(r["congruency"] for r in rows)
    print(f"    congruency: {dict(cong)}")

    # task x target_coh_level (only meaningful when the column varies)
    if any(r.get("target_coh_level") for r in rows):
        tc = Counter((r["task"], r["target_coh_level"]) for r in rows)
        print(f"    task x target_coh_level: {dict(tc)}")


def check_generic(path, rows):
    cong = Counter(r["congruency"] for r in rows)
    print(f"    congruency: {dict(cong)}")
    tdir = Counter(r["target_dir"] for r in rows)
    print(f"    target_dir: {dict(tdir)}")
    if any(r.get("soa_level") for r in rows):
        print(f"    soa_level: {dict(Counter(r['soa_level'] for r in rows))}")
    if any(r.get("target_coh_level") for r in rows):
        print(f"    target x distractor coh cells: "
              f"{dict(Counter((r.get('target_coh_level'), r.get('distractor_coh_level')) for r in rows))}")


def main():
    paths = sorted(glob.glob(os.path.join(SEQ_DIR, "*.csv")))
    if not paths:
        print(f"No CSVs found in {os.path.normpath(SEQ_DIR)}. Run generate.py first.")
        sys.exit(1)

    for path in paths:
        rows = load(path)
        print(f"\n{os.path.basename(path)}  ({len(rows)} trials)")
        if "task_transition" in rows[0]:
            check_switching(path, rows)
        else:
            check_generic(path, rows)

    print("\n" + "=" * 60)
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print("  " + f)
        sys.exit(1)
    print("All counterbalancing checks passed.")


if __name__ == "__main__":
    main()
