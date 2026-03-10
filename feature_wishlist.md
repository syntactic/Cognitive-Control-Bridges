Feature Wish List
=================

Ideas for future extensions, not needed for the current Hirsch replication.

- **Alternating-canvas PRP/dual-task:** Combine spatial alternation with SOA manipulation. Would need SOA sampling in `generateAlternatingBlockTrials`.
- **Within-canvas congruency:** Bivalent distractors on dual-canvas trials (TODO already in engine.js).
- **Task-specific coherence:** Different coherence levels per task type (e.g., movement=0.8, orientation=0.6). `buildSingleCanvasSpec` already takes coherence per-trial; just need a lookup by task type in the block config.
