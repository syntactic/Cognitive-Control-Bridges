"""Generate counterbalanced trial-sequence CSVs for the canonical paradigms.

Usage:

    python sweetpea/generate.py \
        --paradigm cp_taskswitch --conditions A B --participants 1 4 --trials 96

    # or generate the whole default pilot pool:
    python sweetpea/generate.py --all

Files are written to  sequences/<paradigm>_<condition>_p<NN>.csv  (NN zero-padded)
one row per trial, columns per the schema the JS `loadSequenceVectors` consumes.
"""

import argparse
import csv
import os

import designs

# Acceptable-error default for RandomGen: the two switching paradigms have a
# secondary crossing (task x coh) that is geometrically incompatible with the
# 16k+1 preamble-forced trial count, so a slack of 1 is inherent, not a bug.
# The other three paradigms have no such conflict -- exact balance (0) is
# achievable and preferred so RandomGen doesn't paper over an actual mismatch.
DEFAULT_ACCEPTABLE_ERROR = {
    "cp_prp": 0,
    "cp_taskswitch": 1,
    "cp_taskswitch_asym": 1,
    "cp_stroop": 0,
    "cp_stroop_crossed": 0,
}

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "sequences")

# Column order per paradigm
COLUMNS = {
    "cp_prp": ["block_id", "condition", "trial_index", "task", "soa_level",
               "congruency", "target_dir"],
    "cp_taskswitch": ["block_id", "condition", "trial_index", "task",
                      "task_transition", "response_transition", "congruency",
                      "target_coh_level", "target_dir"],
    "cp_taskswitch_asym": ["block_id", "condition", "trial_index", "task",
                           "task_transition", "response_transition", "congruency",
                           "target_coh_level", "target_dir"],
    "cp_stroop": ["block_id", "condition", "trial_index", "task", "congruency",
                  "target_dir", "response_transition"],
    "cp_stroop_crossed": ["block_id", "condition", "trial_index", "task",
                          "congruency", "target_coh_level", "distractor_coh_level",
                          "target_dir"],
}

# Default pilot-pool trial counts (roughly a few full crossings each).
DEFAULT_TRIALS = {
    "cp_prp": 96,
    "cp_taskswitch": 96,
    "cp_taskswitch_asym": 96,
    "cp_stroop": 96,
    "cp_stroop_crossed": 108,
}


def write_csv(paradigm, condition, participant, rows):
    os.makedirs(OUT_DIR, exist_ok=True)
    fname = f"{paradigm}_{condition}_p{participant:02d}.csv"
    path = os.path.join(OUT_DIR, fname)
    cols = COLUMNS[paradigm]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})
    return os.path.normpath(path)


def generate(paradigm, conditions, participants, trials, sampler, acceptable_error):
    p_lo, p_hi = participants
    n_per_condition = p_hi - p_lo + 1
    for condition in conditions:
        seqs = designs.sample_rows(
            paradigm, n_trials=trials, condition=condition,
            n_samples=n_per_condition, sampler=sampler,
            acceptable_error=acceptable_error,
        )
        for offset, rows in enumerate(seqs):
            pid = p_lo + offset
            path = write_csv(paradigm, condition, pid, rows)
            print(f"  wrote {path}  ({len(rows)} trials)")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paradigm", choices=list(designs.BUILDERS),
                    help="paradigm id (omit with --all)")
    ap.add_argument("--conditions", nargs="+", default=["A", "B"],
                    help="between-subjects conditions to generate (default A B)")
    ap.add_argument("--participants", nargs=2, type=int, metavar=("LO", "HI"),
                    default=[1, 4], help="inclusive participant id range")
    ap.add_argument("--trials", type=int, default=None,
                    help="trials per sequence (default: paradigm-specific)")
    ap.add_argument("--sampler", choices=list(designs.SAMPLERS), default="CMSGen")
    ap.add_argument("--acceptable-error", type=int, default=None,
                    help="RandomGen acceptable_error override "
                         "(default: paradigm-specific, see DEFAULT_ACCEPTABLE_ERROR)")
    ap.add_argument("--all", action="store_true",
                    help="generate the default pilot pool for every paradigm")
    args = ap.parse_args()

    if args.all:
        for paradigm in designs.BUILDERS:
            trials = args.trials or DEFAULT_TRIALS[paradigm]
            err = (args.acceptable_error if args.acceptable_error is not None
                   else DEFAULT_ACCEPTABLE_ERROR[paradigm])
            print(f"[{paradigm}] trials={trials} conditions={args.conditions} "
                  f"participants={args.participants} sampler={args.sampler} "
                  f"acceptable_error={err}")
            generate(paradigm, args.conditions, args.participants, trials,
                     args.sampler, err)
        return

    if not args.paradigm:
        ap.error("either --paradigm or --all is required")
    trials = args.trials or DEFAULT_TRIALS[args.paradigm]
    err = (args.acceptable_error if args.acceptable_error is not None
           else DEFAULT_ACCEPTABLE_ERROR[args.paradigm])
    print(f"[{args.paradigm}] trials={trials} conditions={args.conditions} "
          f"participants={args.participants} sampler={args.sampler} "
          f"acceptable_error={err}")
    generate(args.paradigm, args.conditions, args.participants, trials,
             args.sampler, err)


if __name__ == "__main__":
    main()
