"""SweetPea designs for the five canonical single-canvas paradigms.

Run:

    python sweetpea/generate.py --help

Each `build_*` function returns a `(block, to_rows)` pair:

  * `block`     — a SweetPea Block ready for `synthesize_trials`.
  * `to_rows`   — a function turning one experiment dict-list (the output of
                  `experiments_to_dicts`) into a list of CSV row dicts that
                  match the schema the JS client's `loadSequenceVectors`
                  expects.

Design notes:

  * The two switching paradigms (`taskswitch`, `taskswitch_asym`) are the whole
    point of this exercise. With the *identical* A/D keymap the correct response
    is a pure function of `target_dir` (left->'a', right->'d'), so
    `response_transition` is just direction-repetition. We cross
    `task_transition x response_transition` so the two are ORTHOGONAL — this is
    the fix for the response-repetition / task-transition confound.

  * SweetPea emits LEVELS only (easy/hard, low/mid/high, left/right, soa in ms).
    The JS client owns the level->value encoding (coherence numbers, degrees,
    keys, distractor direction, ITI jitter). Nothing here touches those.

  * Between-subjects assignment (which task is EASY in asym switching; which
    dimension is the TARGET in Stroop) is baked into the emitted CSV so the
    client stays agnostic:
      - asym switching emits `target_coh_level` already resolved per task
        (easy on the easy task, hard on the other), so the client just maps
        easy/hard -> coherence with a level-keyed table.
      - Stroop emits `task` = the target dimension directly.
    `condition` ('A'/'B') selects the between-subjects variant and is written
    as a column for provenance.
"""

from collections import Counter

from sweetpea import (
    Factor, DerivedLevel, Transition, WithinTrial,
    CrossBlock, MultiCrossBlock, MinimumTrials, AtMostKInARow,
    AlignmentMode, RepeatMode,
    synthesize_trials, experiments_to_dicts,
    CMSGen, RandomGen, IterateGen,
)

# ------------------------------------------------------------------
# Transition predicates.  SweetPea calls a width-2 window predicate with a
# dict keyed by relative trial offset: {-1: previous, 0: current}.
# ------------------------------------------------------------------

def _repeat(a):
    return a[0] == a[-1]

def _switch(a):
    return a[0] != a[-1]


def _transition_factor(name, base):
    return Factor(name, [
        DerivedLevel("repeat", Transition(_repeat, [base])),
        DerivedLevel("switch", Transition(_switch, [base])),
    ])


def _cap(x):
    """repeat -> Repeat, switch -> Switch (client transition vocabulary)."""
    return str(x).capitalize()


# ==================================================================
# 2. Task switching (basic)  --  cp_taskswitch
# ==================================================================
# Crossing (the critical one):
#     task_transition x response_transition x congruency x target_coh_level
# = 16 balanced cells  =>  response_transition is orthogonal to task_transition.
# target_coh_level is balanced overall; it is balanced across tasks only in
# expectation (an exact task x coh crossing is geometrically incompatible with
# the odd trial count that transition counterbalancing forces -- see README).

def build_taskswitch(n_trials=96, condition="A"):
    task = Factor("task", ["mov", "or"])
    target_dir = Factor("target_dir", ["left", "right"])
    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_coh = Factor("target_coh_level", ["easy", "hard"])

    task_transition = _transition_factor("task_transition", task)
    response_transition = _transition_factor("response_transition", target_dir)

    design = [task, target_dir, congruency, target_coh,
              task_transition, response_transition]
    # Primary crossing = the confound fix (tt x rt x congruency x coh, 16 cells).
    # Secondary crossing (task x coh) balances task identity AND coherence within
    # each task -- so mov/or appear equally often, each at easy and hard equally.
    crossings = [
        [task_transition, response_transition, congruency, target_coh],
        [task, target_coh],
    ]
    constraints = [
        AtMostKInARow(3, task_transition),
        AtMostKInARow(3, response_transition),
        MinimumTrials(n_trials),
    ]
    block = MultiCrossBlock(design, crossings, constraints,
                            alignment=AlignmentMode.POST_PREAMBLE,
                            mode=RepeatMode.WEIGHT)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_taskswitch",
                "condition": condition,
                "trial_index": i,
                "task": t["task"],
                "task_transition": "First" if i == 0 else _cap(t["task_transition"]),
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
                "congruency": t["congruency"],
                "target_coh_level": t["target_coh_level"],
                "target_dir": t["target_dir"],
            })
        return rows

    return block, to_rows


# ==================================================================
# 3. Task switching (asymmetric)  --  cp_taskswitch_asym
# ==================================================================
# Same transition counterbalancing as #2, but NO target-coh factor: one task is
# systematically EASY, the other HARD (between-subjects via `condition`).
# We emit target_coh_level already resolved per task so the client is agnostic.

def build_taskswitch_asym(n_trials=96, condition="A"):
    easy_task = "mov" if condition == "A" else "or"

    task = Factor("task", ["mov", "or"])
    target_dir = Factor("target_dir", ["left", "right"])
    congruency = Factor("congruency", ["congruent", "incongruent"])

    task_transition = _transition_factor("task_transition", task)
    response_transition = _transition_factor("response_transition", target_dir)

    design = [task, target_dir, congruency, task_transition, response_transition]
    # Primary crossing = confound fix (tt x rt x congruency, 8 cells). Secondary
    # crossing balances task identity (mov/or equally often) -- important here
    # because coherence is tied to task (easy vs hard), so a task imbalance would
    # be a coherence imbalance.
    crossings = [
        [task_transition, response_transition, congruency],
        [task],
    ]
    constraints = [
        AtMostKInARow(3, task_transition),
        AtMostKInARow(3, response_transition),
        MinimumTrials(n_trials),
    ]
    block = MultiCrossBlock(design, crossings, constraints,
                            alignment=AlignmentMode.POST_PREAMBLE,
                            mode=RepeatMode.WEIGHT)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            coh = "easy" if t["task"] == easy_task else "hard"
            rows.append({
                "block_id": "cp_taskswitch_asym",
                "condition": condition,
                "trial_index": i,
                "task": t["task"],
                "task_transition": "First" if i == 0 else _cap(t["task_transition"]),
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
                "congruency": t["congruency"],
                "target_coh_level": coh,          # resolved: easy on easy_task
                "target_dir": t["target_dir"],
            })
        return rows

    return block, to_rows


# ==================================================================
# 1. PRP / dual-task  --  cp_prp
# ==================================================================
# Crossing: t1_task x soa x cross_congruency x t1_target_dir = 24 cells.
# t2 is the OTHER task (client derives via t2Rule='switch'); t2_target_dir is
# derived from cross-congruency (client's dual-task assignDirections). No
# transition window here, so the crossing is clean (no preamble).

def build_prp(n_trials=96, condition="A", soa_levels=(100, 300, 600)):
    t1_task = Factor("task", ["mov", "or"])
    soa = Factor("soa", list(soa_levels))
    cross_congruency = Factor("congruency", ["congruent", "incongruent"])
    t1_target_dir = Factor("target_dir", ["left", "right"])

    design = [t1_task, soa, cross_congruency, t1_target_dir]
    crossing = [t1_task, soa, cross_congruency, t1_target_dir]
    constraints = [AtMostKInARow(3, t1_task), MinimumTrials(n_trials)]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_prp",
                "condition": condition,
                "trial_index": i,
                "task": t["task"],            # T1 task; T2 derived client-side
                "soa_level": t["soa"],
                "congruency": t["congruency"],  # cross-task congruency
                "target_dir": t["target_dir"],  # T1 target dir; T2 derived
            })
        return rows

    return block, to_rows


# ==================================================================
# 4. Stroop / interference (basic)  --  cp_stroop
# ==================================================================
# Single task (target = TARGET_TASK via `condition`). Crossing: congruency x
# target_dir = 4 cells. No switching, no transition preamble.

def build_stroop(n_trials=96, condition="A"):
    target_task = "mov" if condition == "A" else "or"

    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_dir = Factor("target_dir", ["left", "right"])
    # response repetition == target_dir repetition; tracked for the run-length
    # constraint only (not required to be balanced -- no task transition here).
    response_transition = _transition_factor("response_transition", target_dir)

    design = [congruency, target_dir, response_transition]
    crossing = [congruency, target_dir]
    constraints = [AtMostKInARow(3, response_transition), MinimumTrials(n_trials)]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_stroop",
                "condition": condition,
                "trial_index": i,
                "task": target_task,
                "congruency": t["congruency"],
                "target_dir": t["target_dir"],
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
            })
        return rows

    return block, to_rows


# ==================================================================
# 5. Stroop, crossed target x distractor coherence  --  cp_stroop_crossed
# ==================================================================
# Crossing: target_coh_level(3) x distractor_coh_level(3) x congruency(2) x
# target_dir(2) = 36 cells. Including target_dir in the crossing balances it
# exactly within every coherence x congruency cell.

def build_stroop_crossed(n_trials=108, condition="A",
                         levels=("low", "mid", "high")):
    target_task = "mov" if condition == "A" else "or"

    target_coh = Factor("target_coh_level", list(levels))
    distractor_coh = Factor("distractor_coh_level", list(levels))
    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_dir = Factor("target_dir", ["left", "right"])

    design = [target_coh, distractor_coh, congruency, target_dir]
    crossing = [target_coh, distractor_coh, congruency, target_dir]
    constraints = [MinimumTrials(n_trials)]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_stroop_crossed",
                "condition": condition,
                "trial_index": i,
                "task": target_task,
                "congruency": t["congruency"],
                "target_coh_level": t["target_coh_level"],
                "distractor_coh_level": t["distractor_coh_level"],
                "target_dir": t["target_dir"],
            })
        return rows

    return block, to_rows


# ------------------------------------------------------------------
# Registry + sampler helper
# ------------------------------------------------------------------

BUILDERS = {
    "cp_prp": build_prp,
    "cp_taskswitch": build_taskswitch,
    "cp_taskswitch_asym": build_taskswitch_asym,
    "cp_stroop": build_stroop,
    "cp_stroop_crossed": build_stroop_crossed,
}

# Natural full-crossing size per paradigm (one balanced replication). Trial
# counts default to a multiple of this via MinimumTrials.
CROSSING_SIZE = {
    "cp_prp": 24,
    "cp_taskswitch": 16,
    "cp_taskswitch_asym": 8,
    "cp_stroop": 4,
    "cp_stroop_crossed": 36,
}

SAMPLERS = {"CMSGen": CMSGen, "IterateGen": IterateGen, "RandomGen": RandomGen}


def sample_rows(paradigm, n_trials, condition, n_samples, sampler="CMSGen", acceptable_error=0):
    """Return a list of `n_samples` row-lists (one per participant sequence)."""
    build = BUILDERS[paradigm]
    block, to_rows = build(n_trials=n_trials, condition=condition)
    if sampler == "RandomGen":
        strategy = RandomGen(acceptable_error=acceptable_error)
    else:
        strategy = SAMPLERS[sampler]
    exps = synthesize_trials(block, n_samples, sampling_strategy=strategy)
    dict_lists = experiments_to_dicts(block, exps)
    return [to_rows(trials) for trials in dict_lists]
