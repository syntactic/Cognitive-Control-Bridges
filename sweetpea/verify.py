"""Verify the counterbalancing of the generated sequence pool.

    python sweetpea/verify.py            # one line per paradigm/condition
    python sweetpea/verify.py --verbose  # per-file detail (the old output)

Hard checks (non-zero exit on failure):

  * switching CSVs -- `response_transition` is balanced WITHIN each
    `task_transition` level, i.e. the response-repetition / task-transition
    confound is broken.
  * every file has the paradigm's expected row count, so one CSV really is one
    complete block.
  * for each sequence id, the A and B files are identical apart from the label
    columns. The pool samples each sequence ONCE and writes it under both
    condition labels; if that ever stops being true, condition and trial sequence
    stop being orthogonal and an A/B difference could be a sequence difference.
  * no two sequence ids in a pool are the same sequence (reported, not fatal --
    duplicates are waste rather than a correctness bug).
"""

import argparse
import csv
import glob
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate  # noqa: E402  (DEFAULT_TRIALS, for the row-count check)

SEQ_DIR = os.path.join(os.path.dirname(__file__), "..", "sequences")

# `condition` itself, plus the two columns a condition label is allowed to change:
# `task` (which dimension is the Stroop target / PRP's T1) and `target_coh_level`
# (asymmetric switching resolves easy/hard per task).
CONDITION_LABEL_COLUMNS = {"condition", "task", "target_coh_level"}

FILENAME_RE = re.compile(r"^(?P<paradigm>.+)_(?P<condition>[A-Z])_s(?P<seq>\d+)\.csv$")

failures = []


def load(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def check_switching(path, rows, verbose):
    """response_transition must be balanced within each task_transition level."""
    tr = [r for r in rows if r["task_transition"] not in ("First", "")]
    by_tt = {}
    for r in tr:
        by_tt.setdefault(r["task_transition"], Counter())[r["response_transition"]] += 1

    for tt, counter in sorted(by_tt.items()):
        rep = counter.get("Repeat", 0)
        sw = counter.get("Switch", 0)
        # Allow an off-by-one from odd trial counts.
        if abs(rep - sw) > 1:
            failures.append(f"{os.path.basename(path)}: response_transition NOT "
                            f"balanced within task_transition={tt} "
                            f"(Repeat={rep} Switch={sw})")
        if verbose:
            print(f"    task_transition={tt:<7} response Repeat={rep} Switch={sw}"
                  f"  {'OK' if abs(rep - sw) <= 1 else 'IMBALANCED'}")

    if verbose:
        cell = Counter((r["task_transition"], r["response_transition"]) for r in tr)
        print(f"    tt x rt cells: {dict(cell)}")
        print(f"    congruency: {dict(Counter(r['congruency'] for r in rows))}")
        if any(r.get("target_coh_level") for r in rows):
            tc = Counter((r["task"], r["target_coh_level"]) for r in rows)
            print(f"    task x target_coh_level: {dict(tc)}")


def check_generic(path, rows, verbose):
    if not verbose:
        return
    print(f"    congruency: {dict(Counter(r['congruency'] for r in rows))}")
    print(f"    target_dir: {dict(Counter(r['target_dir'] for r in rows))}")
    if any(r.get("soa_level") for r in rows):
        print(f"    soa_level: {dict(Counter(r['soa_level'] for r in rows))}")
    if any(r.get("target_coh_level") for r in rows):
        print(f"    target x distractor coh cells: "
              f"{dict(Counter((r.get('target_coh_level'), r.get('distractor_coh_level')) for r in rows))}")


def check_row_count(path, paradigm, rows):
    """One CSV is one complete block, so its length is not a free parameter."""
    expected = generate.DEFAULT_TRIALS.get(paradigm)
    if expected is not None and len(rows) != expected:
        failures.append(f"{os.path.basename(path)}: {len(rows)} rows, expected "
                        f"{expected} (one CSV must be one complete block)")


def check_condition_pairs(by_key, verbose):
    """A and B of one sequence id must differ only in the label columns."""
    for (paradigm, seq), by_condition in sorted(by_key.items()):
        if len(by_condition) < 2:
            continue
        conditions = sorted(by_condition)
        base_c = conditions[0]
        base = by_condition[base_c]
        for other_c in conditions[1:]:
            other = by_condition[other_c]
            if len(base) != len(other):
                failures.append(f"{paradigm} s{seq:03d}: {base_c} and {other_c} differ in length")
                continue
            differing = set()
            for ra, rb in zip(base, other):
                for col in ra:
                    if ra[col] != rb.get(col):
                        differing.add(col)
            bad = differing - CONDITION_LABEL_COLUMNS
            if bad:
                failures.append(
                    f"{paradigm} s{seq:03d}: {base_c} and {other_c} differ in "
                    f"non-label column(s) {sorted(bad)} -- condition and trial "
                    "sequence are no longer orthogonal")
            elif verbose:
                print(f"  {paradigm} s{seq:03d}: {base_c}/{other_c} differ only in "
                      f"{sorted(differing)}")


def report_duplicates(pool_signatures):
    """Two pool ids that are the same sequence: waste, not a correctness bug."""
    for (paradigm, condition), sigs in sorted(pool_signatures.items()):
        seen = {}
        for seq, sig in sorted(sigs.items()):
            if sig in seen:
                print(f"  NOTE {paradigm}/{condition}: s{seq:03d} is identical to "
                      f"s{seen[sig]:03d}")
            else:
                seen[sig] = seq


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true",
                    help="per-file balance tables (unreadable for a 500-file pool)")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(SEQ_DIR, "*.csv")))
    if not paths:
        print(f"No CSVs found in {os.path.normpath(SEQ_DIR)}. Run generate.py first.")
        sys.exit(1)

    counts = Counter()
    by_key = defaultdict(dict)          # (paradigm, seq) -> {condition: rows}
    pool_signatures = defaultdict(dict)  # (paradigm, condition) -> {seq: signature}

    for path in paths:
        name = os.path.basename(path)
        m = FILENAME_RE.match(name)
        if not m:
            failures.append(f"{name}: filename does not match "
                            "<paradigm>_<condition>_s<NNN>.csv")
            continue
        paradigm, condition, seq = m["paradigm"], m["condition"], int(m["seq"])
        rows = load(path)
        counts[(paradigm, condition)] += 1
        by_key[(paradigm, seq)][condition] = rows
        pool_signatures[(paradigm, condition)][seq] = tuple(
            tuple(sorted(r.items())) for r in rows)

        if args.verbose:
            print(f"\n{name}  ({len(rows)} trials)")
        check_row_count(path, paradigm, rows)
        if rows and "task_transition" in rows[0]:
            check_switching(path, rows, args.verbose)
        else:
            check_generic(path, rows, args.verbose)

    print()
    for (paradigm, condition), n in sorted(counts.items()):
        seqs = sorted(pool_signatures[(paradigm, condition)])
        gaps = [i for i in range(1, max(seqs) + 1) if i not in set(seqs)]
        print(f"  {paradigm:<20} {condition}  {n:>3} sequences  ids 1-{max(seqs)}"
              + (f"  MISSING {len(gaps)}: {gaps[:5]}" if gaps else ""))
        if gaps:
            failures.append(f"{paradigm}/{condition}: pool has gaps at {gaps[:10]} -- "
                            "the client draws ids from a contiguous 1..N range")

    check_condition_pairs(by_key, args.verbose)
    report_duplicates(pool_signatures)

    print("\n" + "=" * 60)
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures[:40]:
            print("  " + f)
        if len(failures) > 40:
            print(f"  ... and {len(failures) - 40} more")
        sys.exit(1)
    print(f"All counterbalancing checks passed ({len(paths)} files).")


if __name__ == "__main__":
    main()
