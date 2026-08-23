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
# Crossing: soa x cross_congruency x t1_target_dir = 12 cells.
# t2 is the OTHER task (client derives via t2Rule='switch'); t2_target_dir is
# derived from cross-congruency (client's dual-task assignDirections). No
# transition window here, so the crossing is clean (no preamble).

def build_prp(n_trials=96, condition="A", soa_levels=(100, 300, 600)):
    target_task = "mov" if condition == "A" else "or"
    soa = Factor("soa", list(soa_levels))
    cross_congruency = Factor("congruency", ["congruent", "incongruent"])
    t1_target_dir = Factor("target_dir", ["left", "right"])

    design = [soa, cross_congruency, t1_target_dir]
    crossing = [soa, cross_congruency, t1_target_dir]
    constraints = [MinimumTrials(n_trials)]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_prp",
                "condition": condition,
                "trial_index": i,
                "task": target_task,            # T1 task; T2 derived client-side
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


# ==================================================================
# FOUR-CUE scheme builders  (?scheme=fourcue)
# ==================================================================
# The four-cue scheme decouples RESPONSE HAND from TASK. In the disjoint scheme
# above, movement is always the left hand and orientation always the right, so a
# task's hand is fixed and never a factor. Here the cue carries BOTH the task
# (hue: orange=mov, blue=or) AND the responding hand (border SIDE: left/right),
# and `hand` varies trial-to-trial as a full 2x2 crossing with task.
#
# What each builder adds over its disjoint twin:
#   * a `hand` Factor ("left"/"right"), emitted as a CSV column the client reads
#     to pick the vertical key map (left -> W/S, right -> I/K) and the cue side;
#   * for the switching paradigms, a `hand_transition` derived factor, so the
#     hand switch is counterbalanced ORTHOGONALLY to the task switch (a task
#     switch is no longer forced to be a hand switch, and vice versa);
#   * run-length caps on `task` AND `hand` directly (AtMostKInARow), so neither
#     the attended dimension nor the responding hand sticks for more than 3.
#
# Condition still reaches `to_rows` ONLY (asserted by assert_condition_agnostic):
#   * switching / Stroop: block construction is condition-independent; `hand` is a
#     sampled factor, so one sampled sequence is still valid under both A and B.
#   * PRP: `hand` is DETERMINISTIC given the T1/T2 role and condition (T1 left +
#     T2 right for A; reversed for B), so it is written in to_rows like `task`,
#     and the block is condition-independent exactly as the disjoint PRP is.

def build_taskswitch_fourcue(n_trials=96, condition="A"):
    task = Factor("task", ["mov", "or"])
    hand = Factor("hand", ["left", "right"])
    target_dir = Factor("target_dir", ["left", "right"])
    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_coh = Factor("target_coh_level", ["easy", "hard"])

    task_transition = _transition_factor("task_transition", task)
    hand_transition = _transition_factor("hand_transition", hand)
    response_transition = _transition_factor("response_transition", target_dir)

    design = [task, hand, target_dir, congruency, target_coh,
              task_transition, hand_transition, response_transition]
    # Primary crossing (the 2x2 confound fix): task_transition x hand_transition x
    # response_transition x congruency x target_coh = 32 cells. 96 = 3 x 32.
    # Secondary crossing balances task x hand x coh (8 cells) so every task appears
    # on each hand equally often, each at easy and hard equally.
    crossings = [
        [task_transition, hand_transition, response_transition, congruency, target_coh],
        [task, hand, target_coh],
    ]
    constraints = [
        AtMostKInARow(3, task),
        AtMostKInARow(3, hand),
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
                "hand": t["hand"],
                "task_transition": "First" if i == 0 else _cap(t["task_transition"]),
                "hand_transition": "First" if i == 0 else _cap(t["hand_transition"]),
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
                "congruency": t["congruency"],
                "target_coh_level": t["target_coh_level"],
                "target_dir": t["target_dir"],
            })
        return rows

    return block, to_rows


def build_taskswitch_asym_fourcue(n_trials=96, condition="A"):
    easy_task = "mov" if condition == "A" else "or"

    task = Factor("task", ["mov", "or"])
    hand = Factor("hand", ["left", "right"])
    target_dir = Factor("target_dir", ["left", "right"])
    congruency = Factor("congruency", ["congruent", "incongruent"])

    task_transition = _transition_factor("task_transition", task)
    hand_transition = _transition_factor("hand_transition", hand)
    response_transition = _transition_factor("response_transition", target_dir)

    design = [task, hand, target_dir, congruency,
              task_transition, hand_transition, response_transition]
    # No target-coh factor here (coherence is tied to task, resolved in to_rows).
    # Primary crossing: task_transition x hand_transition x response_transition x
    # congruency = 16 cells; 96 = 6 x 16. Secondary balances task x hand (4 cells).
    crossings = [
        [task_transition, hand_transition, response_transition, congruency],
        [task, hand],
    ]
    constraints = [
        AtMostKInARow(3, task),
        AtMostKInARow(3, hand),
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
                "hand": t["hand"],
                "task_transition": "First" if i == 0 else _cap(t["task_transition"]),
                "hand_transition": "First" if i == 0 else _cap(t["hand_transition"]),
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
                "congruency": t["congruency"],
                "target_coh_level": coh,
                "target_dir": t["target_dir"],
            })
        return rows

    return block, to_rows


def build_prp_fourcue(n_trials=96, condition="A", soa_levels=(100, 300, 600)):
    target_task = "mov" if condition == "A" else "or"
    # T1 responds with the LEFT hand in condition A (T2 right); reversed in B.
    # Deterministic, so it is written in to_rows -- not a sampled factor -- which
    # keeps block construction condition-independent (assert_condition_agnostic).
    t1_hand = "left" if condition == "A" else "right"

    soa = Factor("soa", list(soa_levels))
    cross_congruency = Factor("congruency", ["congruent", "incongruent"])
    t1_target_dir = Factor("target_dir", ["left", "right"])

    design = [soa, cross_congruency, t1_target_dir]
    crossing = [soa, cross_congruency, t1_target_dir]
    constraints = [MinimumTrials(n_trials)]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_prp",
                "condition": condition,
                "trial_index": i,
                "task": target_task,            # T1 task; T2 derived client-side
                "hand": t1_hand,                # T1 hand; T2 hand is the opposite
                "soa_level": t["soa"],
                "congruency": t["congruency"],
                "target_dir": t["target_dir"],
            })
        return rows

    return block, to_rows


def build_stroop_fourcue(n_trials=96, condition="A"):
    target_task = "mov" if condition == "A" else "or"

    hand = Factor("hand", ["left", "right"])
    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_dir = Factor("target_dir", ["left", "right"])
    response_transition = _transition_factor("response_transition", target_dir)

    design = [hand, congruency, target_dir, response_transition]
    # hand x target_dir x congruency = 8 cells; 96 = 12 x 8.
    crossing = [hand, target_dir, congruency]
    constraints = [
        AtMostKInARow(3, response_transition),
        AtMostKInARow(3, hand),
        MinimumTrials(n_trials),
    ]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_stroop",
                "condition": condition,
                "trial_index": i,
                "task": target_task,
                "hand": t["hand"],
                "congruency": t["congruency"],
                "target_dir": t["target_dir"],
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
            })
        return rows

    return block, to_rows


def build_stroop_crossed_fourcue(n_trials=108, condition="A",
                                 levels=("low", "mid", "high")):
    target_task = "mov" if condition == "A" else "or"

    target_coh = Factor("target_coh_level", list(levels))
    distractor_coh = Factor("distractor_coh_level", list(levels))
    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_dir = Factor("target_dir", ["left", "right"])
    hand = Factor("hand", ["left", "right"])

    design = [target_coh, distractor_coh, congruency, target_dir, hand]
    # The coherence crossing (36) IS the point of crossed Stroop, so it stays the
    # PRIMARY crossing and the trial count stays 108 (= 3 x 36). Folding hand into
    # it would force 72 cells / 144 trials, so hand is balanced by a SECONDARY
    # crossing instead (54/54), with a run-length cap.
    crossings = [
        [target_coh, distractor_coh, congruency, target_dir],
        [hand],
    ]
    constraints = [AtMostKInARow(3, hand), MinimumTrials(n_trials)]
    block = MultiCrossBlock(design, crossings, constraints,
                            alignment=AlignmentMode.POST_PREAMBLE,
                            mode=RepeatMode.WEIGHT)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_stroop_crossed",
                "condition": condition,
                "trial_index": i,
                "task": target_task,
                "hand": t["hand"],
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

BUILDERS_FOURCUE = {
    "cp_prp": build_prp_fourcue,
    "cp_taskswitch": build_taskswitch_fourcue,
    "cp_taskswitch_asym": build_taskswitch_asym_fourcue,
    "cp_stroop": build_stroop_fourcue,
    "cp_stroop_crossed": build_stroop_crossed_fourcue,
}


# ==================================================================
# FOUR-CUE + CSE scheme builders  (?scheme=fourcue_cse)
# ==================================================================
# Adds an n−1 congruency (congruency-sequence) factor to cp_stroop and cp_prp
# ON TOP of the fourcue scheme. The other three paradigms are unchanged from
# fourcue (task switching / crossed Stroop excluded on cost — see README §6).
#
# The CSE factor is a property of the SEQUENCE and analysis-only: it does NOT
# change how any trial renders. `prev_congruency` / `prev_cross_congruency` are
# extra CSV columns the client ignores; the rendering path is identical to fourcue.

def build_stroop_fourcue_cse(n_trials=96, condition="A"):
    """Stroop basic + n−1 congruency (CSE) + response_transition in the crossing.

    PRIMARY crossing: congruency × prev_congruency × response_transition = 8.
    This PROMOTES response_transition into the crossing (today it's only
    run-length-capped in fourcue Stroop) — required so the CSE isn't confounded
    with feature integration / partial repetition (Sebastian's 08-18 point,
    Tim's original objection).

    SECONDARY crossing: hand × target_dir = 4.  Keeps hand balanced.
    96 = 12 × 8; a ±1 first-trial residual is expected/acceptable.
    """
    target_task = "mov" if condition == "A" else "or"

    hand = Factor("hand", ["left", "right"])
    congruency = Factor("congruency", ["congruent", "incongruent"])
    target_dir = Factor("target_dir", ["left", "right"])

    # n−1 congruency: the congruency of the PREVIOUS trial.
    # SweetPea Transition window: a[-1] is previous (-1), a[0] is current (0).
    prev_congruency = Factor("prev_congruency", [
        DerivedLevel("congruent", Transition(lambda a: a[-1] == "congruent", [congruency])),
        DerivedLevel("incongruent", Transition(lambda a: a[-1] == "incongruent", [congruency])),
    ])

    response_transition = _transition_factor("response_transition", target_dir)

    design = [hand, congruency, target_dir, prev_congruency, response_transition]
    # Primary crossing (interpretable CSE, per README §6):
    #   congruency × prev_congruency × response_transition = 8 cells.
    # Secondary crossing balances hand × target_dir (4 cells).
    crossings = [
        [congruency, prev_congruency, response_transition],
        [hand, target_dir],
    ]
    constraints = [
        AtMostKInARow(3, response_transition),
        AtMostKInARow(3, hand),
        MinimumTrials(n_trials),
    ]
    block = MultiCrossBlock(design, crossings, constraints,
                            alignment=AlignmentMode.POST_PREAMBLE,
                            mode=RepeatMode.WEIGHT)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_stroop",
                "condition": condition,
                "trial_index": i,
                "task": target_task,
                "hand": t["hand"],
                "congruency": t["congruency"],
                "prev_congruency": "First" if i == 0 else _cap(t["prev_congruency"]),
                "target_dir": t["target_dir"],
                "response_transition": "First" if i == 0 else _cap(t["response_transition"]),
            })
        return rows

    return block, to_rows


def build_prp_fourcue_cse(n_trials=96, condition="A", soa_levels=(100, 300, 600)):
    """PRP / dual-task + n−1 cross-congruency (CSE).

    Crossing: soa × congruency × prev_cross_congruency × target_dir = 24.
    96 = 4 × 24.

    NOTE: response_transition is NOT added here. PRP has two responses per trial
    (T1 and T2), so "response repetition" is ill-defined: T1's response could
    repeat while T2's switches, or vice versa. This is a known limitation; the
    CSE will be interpretable but its interaction with response repetition cannot
    be controlled within PRP. Flag for Tim to review.
    """
    target_task = "mov" if condition == "A" else "or"
    # T1 responds with the LEFT hand in condition A (T2 right); reversed in B.
    # Deterministic, so it is written in to_rows — not a sampled factor — which
    # keeps block construction condition-independent (assert_condition_agnostic).
    t1_hand = "left" if condition == "A" else "right"

    soa = Factor("soa", list(soa_levels))
    cross_congruency = Factor("congruency", ["congruent", "incongruent"])
    t1_target_dir = Factor("target_dir", ["left", "right"])

    # n−1 cross-congruency: the cross-task congruency of the PREVIOUS trial.
    prev_cross_congruency = Factor("prev_cross_congruency", [
        DerivedLevel("congruent", Transition(lambda a: a[-1] == "congruent", [cross_congruency])),
        DerivedLevel("incongruent", Transition(lambda a: a[-1] == "incongruent", [cross_congruency])),
    ])

    design = [soa, cross_congruency, t1_target_dir, prev_cross_congruency]
    crossing = [soa, cross_congruency, prev_cross_congruency, t1_target_dir]
    constraints = [MinimumTrials(n_trials)]
    block = CrossBlock(design, crossing, constraints)

    def to_rows(trials):
        rows = []
        for i, t in enumerate(trials):
            rows.append({
                "block_id": "cp_prp",
                "condition": condition,
                "trial_index": i,
                "task": target_task,            # T1 task; T2 derived client-side
                "hand": t1_hand,                # T1 hand; T2 hand is the opposite
                "soa_level": t["soa"],
                "congruency": t["congruency"],  # cross-task congruency
                "prev_cross_congruency": "First" if i == 0 else _cap(t["prev_cross_congruency"]),
                "target_dir": t["target_dir"],  # T1 target dir; T2 derived
            })
        return rows

    return block, to_rows


# Four-cue + CSE registry: cp_stroop and cp_prp get CSE-aware builders; the
# other three reuse the fourcue builders unchanged (the CSE is excluded from
# task switching and crossed Stroop on cost — see README §6).
BUILDERS_FOURCUE_CSE = {
    "cp_prp": build_prp_fourcue_cse,
    "cp_taskswitch": build_taskswitch_fourcue,
    "cp_taskswitch_asym": build_taskswitch_asym_fourcue,
    "cp_stroop": build_stroop_fourcue_cse,
    "cp_stroop_crossed": build_stroop_crossed_fourcue,
}

# Scheme name -> builder registry. `generate.py --scheme` selects one; everything
# downstream (sampling, row stamping, the condition-agnostic assertion) reads the
# registry through `builders_for`, so the disjoint path is byte-for-byte unchanged.
BUILDER_REGISTRIES = {
    "disjoint": BUILDERS,
    "fourcue": BUILDERS_FOURCUE,
    "fourcue_cse": BUILDERS_FOURCUE_CSE,
}


def builders_for(scheme):
    try:
        return BUILDER_REGISTRIES[scheme]
    except KeyError:
        raise ValueError(f"unknown scheme '{scheme}' (expected one of "
                         f"{'/'.join(BUILDER_REGISTRIES)})")

# Natural full-crossing size per paradigm (one balanced replication). Trial
# counts default to a multiple of this via MinimumTrials. These are the SWEETPEA
# crossings (they include target_dir, which the client's own Factorial generator
# does not cross) -- so they are strictly finer than the JS-side cell counts in
# canonical_paradigms.js, and a row count that divides these divides those too.
CROSSING_SIZE = {
    # soa(3) x congruency(2) x target_dir(2). Was recorded as 24 until 2026-08-16;
    # nothing read it, but it disagreed with build_prp's actual crossing.
    "cp_prp": 12,
    "cp_taskswitch": 16,
    "cp_taskswitch_asym": 8,
    "cp_stroop": 4,
    "cp_stroop_crossed": 36,
}

# Primary-crossing size per fourcue paradigm (the `hand` factor and, for the
# switching paradigms, `hand_transition`, enlarge it). A row count that divides
# these divides the disjoint ones too, so the JS block-size invariants still hold.
#   cp_prp:            soa(3) x congruency(2) x target_dir(2)                  = 12
#   cp_taskswitch:     tt x ht x rt x congruency x coh                        = 32
#   cp_taskswitch_asym:tt x ht x rt x congruency                             = 16
#   cp_stroop:         hand x target_dir x congruency                         = 8
#   cp_stroop_crossed: target_coh x distractor_coh x congruency x target_dir  = 36
#                      (hand balanced by the secondary crossing, not the primary)
CROSSING_SIZE_FOURCUE = {
    "cp_prp": 12,
    "cp_taskswitch": 32,
    "cp_taskswitch_asym": 16,
    "cp_stroop": 8,
    "cp_stroop_crossed": 36,
}

# Primary-crossing size per fourcue_cse paradigm. cp_stroop and cp_prp have
# enlarged crossings (the CSE factor doubles them); the other three inherit
# fourcue's crossing unchanged.
#   cp_prp:            soa(3) x congruency(2) x prev_cross_congruency(2) x target_dir(2) = 24
#   cp_stroop:         congruency(2) x prev_congruency(2) x response_transition(2)       = 8
#                      (hand x target_dir balanced by secondary crossing)
CROSSING_SIZE_FOURCUE_CSE = {
    "cp_prp": 24,
    "cp_taskswitch": 32,        # inherited from fourcue
    "cp_taskswitch_asym": 16,   # inherited from fourcue
    "cp_stroop": 8,             # was 8 in fourcue; still 8 but from a different crossing
    "cp_stroop_crossed": 36,    # inherited from fourcue
}

CROSSING_SIZES = {
    "disjoint": CROSSING_SIZE,
    "fourcue": CROSSING_SIZE_FOURCUE,
    "fourcue_cse": CROSSING_SIZE_FOURCUE_CSE,
}

SAMPLERS = {"CMSGen": CMSGen, "IterateGen": IterateGen, "RandomGen": RandomGen}


def sample_trial_dicts(paradigm, n_trials, n_samples, sampler="CMSGen",
                       acceptable_error=0, condition="A", scheme="disjoint"):
    """Sample `n_samples` sequences and return them as raw trial dict-lists.

    Deliberately stops short of CSV rows: the pool stamps ONE sampled sequence
    with every condition label (see `rows_for`), which is what makes condition
    and trial sequence exactly orthogonal. `condition` here only decides which
    builder call constructs the block, and `assert_condition_agnostic` is what
    guarantees that choice cannot matter.
    """
    block, _ = builders_for(scheme)[paradigm](n_trials=n_trials, condition=condition)
    if sampler == "RandomGen":
        strategy = RandomGen(acceptable_error=acceptable_error)
    else:
        strategy = SAMPLERS[sampler]
    exps = synthesize_trials(block, n_samples, sampling_strategy=strategy)
    return experiments_to_dicts(block, exps)


def rows_for(paradigm, trials, condition, n_trials, scheme="disjoint"):
    """Stamp one sampled sequence with one condition's labels -> CSV rows.

    Rebuilding the block costs nothing (no synthesis) and keeps `to_rows` the
    single place a condition label is ever applied.
    """
    _, to_rows = builders_for(scheme)[paradigm](n_trials=n_trials, condition=condition)
    return to_rows(trials)


def _block_signature(block):
    """Everything about a block that could change what gets SAMPLED.

    Constraint objects print their address, so their reprs are not comparable
    across two builds; compare their types plus the design/crossing structure
    instead. That is enough to catch a factor, level, or crossing term that
    varies with condition.
    """
    return (
        tuple((f.name, tuple(str(l.name) for l in f.levels)) for f in block.design),
        tuple(tuple(f.name for f in crossing) for crossing in block.crossings),
        tuple(block.crossing_sizes),
        # Called, not referenced: it is a METHOD, and a bound method compares by
        # identity, so leaving off the parentheses made every signature unequal
        # to every other -- including a block's to its own.
        block.common_preamble_size(),
        tuple(type(c).__name__ for c in block.constraints),
    )


def assert_condition_agnostic(paradigm, n_trials, conditions=("A", "B"),
                              scheme="disjoint"):
    """Fail if `condition` reaches block CONSTRUCTION for this paradigm.

    The pool writes one sampled sequence out under every condition label. That
    is only legitimate while condition affects `to_rows` alone. If a builder ever
    starts branching on condition before the block is built (a different
    crossing, a condition-specific factor), the two labels would no longer
    describe the same sampled sequence, and every A/B pair in the pool would be
    quietly mislabelled -- an error nothing downstream could detect. So it throws
    here instead, and generation falls back to per-condition sampling.
    """
    sigs = {c: _block_signature(builders_for(scheme)[paradigm](n_trials=n_trials, condition=c)[0])
            for c in conditions}
    first = sigs[conditions[0]]
    for c in conditions[1:]:
        if sigs[c] != first:
            raise ValueError(
                f"{paradigm}: block construction depends on condition "
                f"('{conditions[0]}' vs '{c}'). The pool emits ONE sampled sequence "
                "under both condition labels, which is only valid while condition "
                "affects to_rows() alone."
            )


def sample_rows(paradigm, n_trials, condition, n_samples, sampler="CMSGen",
                acceptable_error=0, scheme="disjoint"):
    """Return a list of `n_samples` row-lists, all labelled `condition`."""
    dict_lists = sample_trial_dicts(paradigm, n_trials, n_samples, sampler,
                                    acceptable_error, condition=condition, scheme=scheme)
    return [rows_for(paradigm, trials, condition, n_trials, scheme=scheme)
            for trials in dict_lists]
