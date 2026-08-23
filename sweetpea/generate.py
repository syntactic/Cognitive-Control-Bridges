"""Generate the POOL of counterbalanced trial-sequence CSVs for the canonical paradigms.

Usage:

    # the whole default pool (all five paradigms, both conditions)
    python sweetpea/generate.py --all --pool 50

    # one paradigm, or an extension of an existing pool
    python sweetpea/generate.py --paradigm cp_taskswitch --pool 50
    python sweetpea/generate.py --paradigm cp_taskswitch --pool 50 --start-id 11 --skip-existing

Files are written to  sequences/<paradigm>_<condition>_s<NNN>.csv  (NNN zero-padded),
one row per trial, columns per the schema the JS `loadSequenceVectors` consumes.

EACH FILE IS ONE COMPLETE BLOCK. The client draws five distinct sequence ids per
participant (seeded on their Prolific id) and runs them as its five test blocks --
there is no per-participant file and no assignment table, so the drawn ids are
recorded in the output CSV instead. See EXPERIMENT_OVERVIEW.md section 8.

A sequence is SAMPLED ONCE and written out under every condition label. `condition`
only affects `to_rows` in designs.py (asserted before generating, see
`assert_condition_agnostic`), so this costs nothing and buys exact orthogonality
between condition and trial sequence: an A/B difference can never be a sequence
difference. It also halves generation time, which matters -- see the timings in
README.md; cp_taskswitch runs about 108 s per sequence.
"""

import argparse
import csv
import os
import time

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

# Output directory per scheme. The disjoint pool lives in sequences/ (unchanged);
# the fourcue pool is a SEPARATE directory so the two never collide and the client
# can point at one or the other by scheme name alone.
OUT_DIRS = {
    "disjoint": os.path.join(os.path.dirname(__file__), "..", "sequences"),
    "fourcue": os.path.join(os.path.dirname(__file__), "..", "sequences_fourcue"),
    "fourcue_cse": os.path.join(os.path.dirname(__file__), "..", "sequences_fourcue_cse"),
}
OUT_DIR = OUT_DIRS["disjoint"]   # default; main() overrides per --scheme

# Default pool size per paradigm per condition. 50 blocks drawn 5 at a time gives
# 50x49x48x47x46 ~ 254 million distinct sessions, so uniqueness across
# participants is free; at ~60 participants per cell each block is seen ~6 times.
DEFAULT_POOL_SIZE = 50

# Column order per paradigm (disjoint scheme)
COLUMNS = {
    "cp_prp": ["block_id", "condition", "sequence_id", "trial_index", "task",
               "soa_level", "congruency", "target_dir"],
    "cp_taskswitch": ["block_id", "condition", "sequence_id", "trial_index", "task",
                      "task_transition", "response_transition", "congruency",
                      "target_coh_level", "target_dir"],
    "cp_taskswitch_asym": ["block_id", "condition", "sequence_id", "trial_index", "task",
                           "task_transition", "response_transition", "congruency",
                           "target_coh_level", "target_dir"],
    "cp_stroop": ["block_id", "condition", "sequence_id", "trial_index", "task",
                  "congruency", "target_dir", "response_transition"],
    "cp_stroop_crossed": ["block_id", "condition", "sequence_id", "trial_index", "task",
                          "congruency", "target_coh_level", "distractor_coh_level",
                          "target_dir"],
}

# Column order per paradigm (fourcue scheme). Same as disjoint plus a `hand`
# column everywhere, and `hand_transition` for the two switching paradigms.
COLUMNS_FOURCUE = {
    "cp_prp": ["block_id", "condition", "sequence_id", "trial_index", "task",
               "hand", "soa_level", "congruency", "target_dir"],
    "cp_taskswitch": ["block_id", "condition", "sequence_id", "trial_index", "task",
                      "hand", "task_transition", "hand_transition",
                      "response_transition", "congruency",
                      "target_coh_level", "target_dir"],
    "cp_taskswitch_asym": ["block_id", "condition", "sequence_id", "trial_index", "task",
                           "hand", "task_transition", "hand_transition",
                           "response_transition", "congruency",
                           "target_coh_level", "target_dir"],
    "cp_stroop": ["block_id", "condition", "sequence_id", "trial_index", "task",
                  "hand", "congruency", "target_dir", "response_transition"],
    "cp_stroop_crossed": ["block_id", "condition", "sequence_id", "trial_index", "task",
                          "hand", "congruency", "target_coh_level",
                          "distractor_coh_level", "target_dir"],
}

COLUMNS_BY_SCHEME = {"disjoint": COLUMNS, "fourcue": COLUMNS_FOURCUE}

# Column order per paradigm (fourcue_cse scheme). Same as fourcue for the three
# unchanged paradigms; cp_stroop and cp_prp gain their prev-congruency column.
COLUMNS_FOURCUE_CSE = {
    "cp_prp": ["block_id", "condition", "sequence_id", "trial_index", "task",
               "hand", "soa_level", "congruency", "prev_cross_congruency",
               "target_dir"],
    "cp_taskswitch": COLUMNS_FOURCUE["cp_taskswitch"],
    "cp_taskswitch_asym": COLUMNS_FOURCUE["cp_taskswitch_asym"],
    "cp_stroop": ["block_id", "condition", "sequence_id", "trial_index", "task",
                  "hand", "congruency", "prev_congruency", "target_dir",
                  "response_transition"],
    "cp_stroop_crossed": COLUMNS_FOURCUE["cp_stroop_crossed"],
}

COLUMNS_BY_SCHEME["fourcue_cse"] = COLUMNS_FOURCUE_CSE

# Trials per BLOCK. One file is one block, and a participant runs five of them,
# so these are per-block counts (480 test trials, 540 for crossed Stroop) -- not
# per-session ones. Each must stay a whole multiple of its paradigm's crossing
# (designs.CROSSING_SIZE); 96 is not a multiple of crossed Stroop's 36, hence 108.
DEFAULT_TRIALS = {
    "cp_prp": 96,
    "cp_taskswitch": 96,
    "cp_taskswitch_asym": 96,
    "cp_stroop": 96,
    "cp_stroop_crossed": 108,
}


def sequence_filename(paradigm, condition, sequence_id):
    return f"{paradigm}_{condition}_s{sequence_id:03d}.csv"


def write_csv(paradigm, condition, sequence_id, rows, out_dir, columns):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, sequence_filename(paradigm, condition, sequence_id))
    cols = columns[paradigm]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})
    return os.path.normpath(path)


def _sequence_signature(rows):
    """A hashable summary of one sequence, for spotting duplicate pool members."""
    return tuple(tuple(sorted(r.items())) for r in rows)


def generate(paradigm, conditions, ids, trials, sampler, acceptable_error,
             skip_existing=False, scheme="disjoint"):
    """Sample one sequence per id in `ids` and write it under every condition."""
    out_dir = OUT_DIRS[scheme]
    columns = COLUMNS_BY_SCHEME[scheme]
    # Refuse to stamp two condition labels on one sample unless that is still
    # sound for this paradigm.
    designs.assert_condition_agnostic(paradigm, trials, tuple(conditions), scheme=scheme)

    todo = ids
    if skip_existing:
        todo = [i for i in ids
                if not all(os.path.exists(os.path.join(out_dir,
                                                       sequence_filename(paradigm, c, i)))
                           for c in conditions)]
        skipped = len(ids) - len(todo)
        if skipped:
            print(f"  skipping {skipped} sequence id(s) already on disk")
    if not todo:
        print("  nothing to do")
        return

    t0 = time.time()
    dict_lists = designs.sample_trial_dicts(
        paradigm, n_trials=trials, n_samples=len(todo),
        sampler=sampler, acceptable_error=acceptable_error, scheme=scheme,
    )
    elapsed = time.time() - t0
    print(f"  sampled {len(dict_lists)} sequence(s) in {elapsed:.0f}s "
          f"({elapsed / max(1, len(dict_lists)):.0f}s each)")

    seen = {}
    for sequence_id, trials_dicts in zip(todo, dict_lists):
        for condition in conditions:
            rows = designs.rows_for(paradigm, trials_dicts, condition, trials, scheme=scheme)
            for r in rows:
                r["sequence_id"] = sequence_id
            path = write_csv(paradigm, condition, sequence_id, rows, out_dir, columns)
            print(f"  wrote {path}  ({len(rows)} trials)")
            if condition == conditions[0]:
                # Duplicate pool members are waste, not a correctness bug (the
                # DRAW is what must be distinct), so this warns rather than
                # aborting a run that may have taken an hour.
                sig = _sequence_signature(rows)
                if sig in seen:
                    print(f"  WARNING: sequence {sequence_id} is identical to "
                          f"{seen[sig]} -- the sampler returned a duplicate")
                seen[sig] = sequence_id


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paradigm", choices=list(designs.BUILDERS),
                    help="paradigm id (omit with --all)")
    ap.add_argument("--conditions", nargs="+", default=["A", "B"],
                    help="between-subjects condition labels to stamp (default A B). "
                         "One sample per id is written out under each.")
    ap.add_argument("--pool", type=int, default=DEFAULT_POOL_SIZE,
                    help=f"pool size: highest sequence id to generate "
                         f"(default {DEFAULT_POOL_SIZE})")
    ap.add_argument("--start-id", type=int, default=1,
                    help="lowest sequence id to generate (default 1). Use with --pool "
                         "to extend an existing pool in chunks -- generation is slow "
                         "and this makes it resumable.")
    ap.add_argument("--skip-existing", action="store_true",
                    help="leave sequence ids whose files are already on disk alone")
    ap.add_argument("--trials", type=int, default=None,
                    help="trials per sequence, i.e. per BLOCK (default: paradigm-specific)")
    ap.add_argument("--sampler", choices=list(designs.SAMPLERS), default="CMSGen")
    ap.add_argument("--acceptable-error", type=int, default=None,
                    help="RandomGen acceptable_error override "
                         "(default: paradigm-specific, see DEFAULT_ACCEPTABLE_ERROR)")
    ap.add_argument("--all", action="store_true",
                    help="generate the pool for every paradigm")
    ap.add_argument("--scheme", choices=list(OUT_DIRS), default="disjoint",
                    help="response-set scheme: 'disjoint' -> sequences/ (default), "
                         "'fourcue' -> sequences_fourcue/ (adds the `hand` column and "
                         "the 2x2 task x hand crossing)")
    args = ap.parse_args()

    if args.start_id < 1:
        ap.error("--start-id must be >= 1 (ids are 1-based and zero-padded to 3 digits)")
    if args.pool < args.start_id:
        ap.error(f"--pool ({args.pool}) is below --start-id ({args.start_id}); "
                 "--pool is the HIGHEST id to generate, not a count")
    ids = list(range(args.start_id, args.pool + 1))

    paradigms = list(designs.BUILDERS) if args.all else [args.paradigm]
    if not args.all and not args.paradigm:
        ap.error("either --paradigm or --all is required")

    started = time.time()
    for paradigm in paradigms:
        trials = args.trials or DEFAULT_TRIALS[paradigm]
        err = (args.acceptable_error if args.acceptable_error is not None
               else DEFAULT_ACCEPTABLE_ERROR[paradigm])
        print(f"[{paradigm}] scheme={args.scheme} trials/block={trials} "
              f"conditions={args.conditions} ids={ids[0]}-{ids[-1]} "
              f"sampler={args.sampler} acceptable_error={err}")
        generate(paradigm, args.conditions, ids, trials, args.sampler, err,
                 skip_existing=args.skip_existing, scheme=args.scheme)
    print(f"done in {(time.time() - started) / 60:.1f} min")


if __name__ == "__main__":
    main()
