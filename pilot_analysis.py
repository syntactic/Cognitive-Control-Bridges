import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _(mo):
    mo.md("""
    # Canonical-paradigm pilot — multi-session analysis

    This notebook processes the whole `pilot_data_30/` pilot (13 sessions, five paradigms). It loads everything and decides who to keep on QC grounds, and then runs the
    generic sanity and descriptive checks that apply to any paradigm, then runs an analysis paradigm by paradigm.

    Helpers live in `cp_analysis_tools.py` (imported as `tools`).

    - **~1 participant per paradigm×condition cell**, so this is within-subject descriptive
      work with bootstrap CIs and not group inference. The only paradigms with enough sessions
      for even a crude pooled view are `cp_stroop` (3) and `cp_stroop_crossed` (5).
    - **Congruency is derived, and the rule differs by paradigm** — single-task compares
      target vs distractor; PRP compares T1 vs T2 target. Use the matching `tools` helper.
    """)
    return


@app.cell
def _():
    import marimo as mo
    import numpy as np
    import pandas as pd
    import matplotlib.pyplot as plt

    import cp_analysis_tools as tools

    return mo, pd, tools


@app.cell
def _(tools):
    # Training rows stay in `combined` for the QC checks in A4. The analyses use `kept_test`,
    # the test rows of the sessions that pass QC.
    combined = tools.load_all()
    test = combined[combined.phase == "test"].copy()
    return combined, test


@app.cell
def _(mo):
    mo.md("""
    ## A · Load & select
    """)
    return


@app.cell
def _(mo):
    mo.md("""
    ### A3 · Session inventory

    One row per session with its paradigm, condition, and trial counts by phase.
    """)
    return


@app.cell
def _(combined, tools):
    # TODO(you): build the inventory table.
    #   group `combined` by `source_file` (one session per file); for each, pull the scalar
    #   provenance columns (.iloc[0]) and count phase=='test' vs phase=='training' rows.
    #   A groupby(['source_file','cp_paradigm','condition']) with .agg over phase counts is one way.
    grouped = combined.groupby("source_file")
    for _key, _item in grouped:
        print(tools.parse_experiment_condition(_key))
        print("Training trials:",
              (_item['phase'] == 'training').sum(),
              "Testing trials:",
              (_item['phase'] == 'test').sum())
    return


@app.cell
def _(mo):
    mo.md("""
    ### A4 · QC & exclusion

    Sessions are excluded when test accuracy is below `ACCURACY_FLOOR`. Miss rate, sub-200 ms
    RTs, and wrong-hand presses are listed under `flags` but do not exclude anyone. PRP accuracy
    counts both responses, and its wrong-hand rate is blank because T1 and T2 use different hands.
    """)
    return


@app.cell
def _():
    return


@app.cell
def _(combined, pd, test, tools):
    # Accuracies fall either near chance (0.5) or above 0.83, so any floor in that gap drops the
    # same sessions. A floor of 0.85 would also drop crossed-Stroop sessions, whose low-coherence
    # targets are hard by design.
    ACCURACY_FLOOR = 0.65

    # Diagnostic thresholds only. In this pilot they flag the same sessions as the floor.
    MAX_MISS_RATE = 0.05
    MAX_SUBFLOOR_RATE = 0.05
    MAX_WRONG_HAND_RATE = 0.05

    def _wrong_hand_rate(trials):
        # On a four-cue single-task trial `hand` is the cued hand, so any key outside its pair is
        # a wrong-hand press. Not defined for PRP, where T1 and T2 are answered by different hands.
        n_presses = n_wrong = 0
        for hand, raw in zip(trials.hand, trials.rawKeyPresses):
            keys = tools.parse_keys(raw)
            n_presses += len(keys)
            n_wrong += sum(key not in tools.ALLOWED_KEYS[hand] for key in keys)
        return n_wrong / n_presses if n_presses else float("nan")

    def _session_qc(session):
        trials = session[session.phase == "test"]
        paradigm = session.cp_paradigm.iloc[0]
        is_prp = paradigm == "cp_prp"
        # PRP has two responses per trial. Pooling both keeps a chance-level T2 from hiding
        # behind a good T1.
        if is_prp:
            responses = pd.concat([trials.accuracy1, trials.accuracy2])
            rts = pd.concat([trials.rt1, trials.rt2])
        else:
            responses, rts = trials.accuracy1, trials.rt1
        return {
            "cp_paradigm": paradigm,
            "condition": session.condition.iloc[0],
            "reached_S8": (session.stage == "S8").any(),
            "accuracy": (responses == "correct").mean(),
            "miss_rate": (responses == "miss").mean(),
            "subfloor_rate": (rts < tools.RT_FLOOR).mean(),
            "wrong_hand_rate": float("nan") if is_prp else _wrong_hand_rate(trials),
        }

    def _flags(row):
        # NaN compares False, so PRP's blank wrong-hand rate never raises a flag.
        checks = {
            "misses": row.miss_rate > MAX_MISS_RATE,
            "fast RTs": row.subfloor_rate > MAX_SUBFLOOR_RATE,
            "wrong hand": row.wrong_hand_rate > MAX_WRONG_HAND_RATE,
        }
        return ", ".join(name for name, failed in checks.items() if failed)

    qc_table = pd.DataFrame(
        [{"source_file": name, **_session_qc(session)} for name, session in combined.groupby("source_file")]
    )
    qc_table["flags"] = qc_table.apply(_flags, axis=1)
    qc_table["keep"] = qc_table.reached_S8 & (qc_table.accuracy >= ACCURACY_FLOOR)

    kept_sessions = set(qc_table.source_file[qc_table.keep])
    kept_test = test[test.source_file.isin(kept_sessions)]

    qc_table.sort_values(["cp_paradigm", "condition"]).round(3)
    return kept_sessions, kept_test


@app.cell
def _(mo):
    mo.md("""
    ## B · Generic sanity checks
    """)
    return


@app.cell
def _(mo):
    mo.md("""
    ### B5 · Configuration readback

    The parameters each session actually ran, recovered from the trial rows: coherence by task,
    CSI, mean RSI, and SOA levels.
    """)
    return


@app.cell
def _():
    # TODO(you): config readback per session.
    #   coherence: `t1_target_coherence` grouped by `t1_task`
    #   CSI: `rt1_raw - rt1`, which should be one constant per session
    #   RSI: mean `iti` (sampled 400-600 per trial, so report the mean)
    #   SOA: unique non-null `soa`; only PRP's dual-task rows have one
    return


@app.cell
def _(mo):
    mo.md("""
    ### B6 · Timing & key handling

    RT zero point, anticipations, misses, sub-floor RTs, and sequence-file reuse, per session.
    """)
    return


@app.cell
def _():
    # TODO(you): timing + key-handling checks per session.
    #   `rt1_raw - rt1` should be constant (the CSI); a varying offset means stimulus onset was
    #   applied inconsistently. `anticipations1` should be 0. `sequenceId` should differ across
    #   the 5 blocks, since a reused file means replayed trials.
    #   analyze_cp_taskswitch_asym.py `timing_and_keys` does this for a single session.
    return


@app.cell
def _(mo):
    mo.md("""
    ### B7 · Factor balance

    Trial counts per level of task, hand, transition, coherence level, and congruency, by
    paradigm.
    """)
    return


@app.cell
def _():
    # TODO(you): add a congruency column (tools.derive_congruency) and tabulate per cp_paradigm.
    #   Transitions and congruency are crossed within each block, so their counts should be
    #   exact. Task and hand come from a secondary crossing, so expect near 50/50, not exact.
    #   PRP needs tools.derive_cross_congruency; leave it for D15.
    #   Build a new frame (kept_test.assign(...)) rather than adding a column to kept_test in
    #   place: marimo doesn't track mutation, so cells that read kept_test wouldn't rerun.
    return


@app.cell
def _(mo):
    mo.md("""
    ### B8 · Overall performance

    Accuracy breakdown, correct-RT descriptives, and accuracy and correct RT by test block.
    """)
    return


@app.cell
def _():
    # TODO(you): overall + per-block performance. Group by `blockOrder` for the per-block
    #   view; a steady drift across the 5 blocks points to learning or fatigue.
    return


@app.cell
def _(mo):
    mo.md("""
    ## C · RT distributions & trimming
    """)
    return


@app.cell
def _(mo):
    mo.md("""
    ### C9 · Correct-RT distributions

    Histograms of correct `rt1` by paradigm, with the 200 ms floor marked.
    """)
    return


@app.cell
def _():
    # TODO(you): distribution plots on correct trials. Expect right skew and no pile-up at the
    #   fast edge; a spike near 200 ms suggests guessing.
    return


@app.cell
def _(mo):
    mo.md("""
    ### C10 · Trimming

    Correct trials only, trimmed at 3 SD of each session's own RT distribution.
    """)
    return


@app.cell
def _():
    # TODO(you): filter to correct, apply tools.trim_sd per session, record bounds and drops.
    #   trim_sd trims whatever it's given, so filter accuracy1 == 'correct' first.
    #   Check how the headline effects move with the cutoff: in the earlier self-run session
    #   (5663) the switch cost changed sign between the raw and trimmed data.
    return


@app.cell
def _(mo):
    mo.md("""
    ## D · Canonical effects

    Effects are mean differences in correct, trimmed RT with bootstrap 95% CIs, shown next to
    accuracy for the same cells. Definitions follow `EXPERIMENT_OVERVIEW.md` §2–6.
    """)
    return


@app.cell
def _(mo):
    mo.md("""
    ### D11 · Task switching (`cp_taskswitch`, `cp_taskswitch_asym`)

    - Switch cost: RT(switch) − RT(repeat)
    - Congruency effect, and congruency × task transition
    - Coherence effect (`cp_taskswitch` only)
    - Task transition × hand transition
    """)
    return


@app.cell
def _():
    # TODO(you): switching effects on transitionType in {Repeat, Switch}; drop 'First'.
    #   Hand transition: within each (source_file, blockOrder), compare `hand` to the previous
    #   row with shift(1). The first row of a block has no transition.
    #   Under four-cue, task and hand switch independently, so the switch cost on hand-repeat
    #   trials is a task switch without an effector switch.
    return


@app.cell
def _(mo):
    mo.md("""
    ### D12 · Asymmetric switch cost (`cp_taskswitch_asym`)

        cost_easy = RT(switch → easy) − RT(repeat easy)
        cost_hard = RT(switch → hard) − RT(repeat hard)
        asymmetry = cost_easy − cost_hard

    The usual finding is a larger cost for the easier task (Allport, Styles & Hsieh, 1994).
    Movement is the easy task in condition A and orientation in condition B.
    """)
    return


@app.cell
def _():
    # TODO(you): per-task switch cost, then the asymmetry.
    #   Each cost is taken against its own repeat baseline. Comparing switch→easy with
    #   switch→hard directly measures difficulty, not switching.
    #   Pooling A and B cancels task identity only if the conditions mirror each other (E17).
    #   One session per condition, so report CIs, not tests.
    return


@app.cell
def _(mo):
    mo.md("""
    ### D13 · Stroop (`cp_stroop`)

    Congruency effect, RT(incongruent) − RT(congruent), per session and pooled.
    """)
    return


@app.cell
def _():
    # TODO(you): congruency effect per cp_stroop session, then pooled.
    #   Under four-cue the distractor maps to the other hand's keys, so this is dimension-level
    #   interference without response competition. A small effect is plausible.
    return


@app.cell
def _(mo):
    mo.md("""
    ### D14 · Crossed Stroop (`cp_stroop_crossed`)

    Congruency effect by distractor coherence (pooled over target coherence) and by target
    coherence (pooled over distractor coherence), with the full target × distractor surface as a
    heatmap.
    """)
    return


@app.cell
def _():
    # TODO(you): congruency effect within each level of one coherence dimension, pooling the
    #   other. A single cell has ~15 trials (SE ≈ 65 ms), too few to test; a pooled level has
    #   ~180. The heatmap is for looking at, not for per-cell comparisons.
    return


@app.cell
def _(mo):
    mo.md("""
    ### D15 · PRP (`cp_prp`)

    RT2 by SOA, backward crosstalk (RT1 incongruent − congruent within each SOA), and
    cross-task congruency on RT2. Congruency here compares the T1 and T2 targets.
    """)
    return


@app.cell
def _():
    # TODO(you): PRP effects on the dual-task test rows.
    #   RT2 should fall as SOA grows. A flat RT2 means all three SOAs sit on the same side of
    #   T1's processing time.
    #   Check `responseOrder` first: in the one PRP session it is 'T2-first' on 466 of 480 test
    #   trials, so rt1/rt2 may not reflect T1/T2 processing order.
    return


@app.cell
def _(mo):
    mo.md("""
    ## E · Cross-cutting
    """)
    return


@app.cell
def _(mo):
    mo.md("""
    ### E16 · Speed–accuracy

    Error rates for the same cells as each RT effect in D.
    """)
    return


@app.cell
def _():
    # TODO(you): error rates alongside the RT effects from D. Errors moving with RT support the
    #   effect; errors moving against it point to a speed-accuracy tradeoff.
    return


@app.cell
def _(mo):
    mo.md("""
    ### E17 · Movement vs orientation at matched coherence

    Repeat-trial correct RT for the easy and hard task within each condition
    (`EXPERIMENT_OVERVIEW.md` §8.4).
    """)
    return


@app.cell
def _():
    # TODO(you): repeat-trial RT by task within each condition, per switching paradigm.
    #   If the easy task isn't faster in condition B, A and B aren't mirror images and the
    #   A+B pooling in D12 doesn't hold.
    return


@app.cell
def _(mo):
    mo.md("""
    ### E18 · Summary

    Headline effects with CIs, accuracy, and mean correct RT for each kept session.
    """)
    return


@app.cell
def _():
    # TODO(you): assemble the summary table from the per-paradigm results above.
    return


if __name__ == "__main__":
    app.run()
