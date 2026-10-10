# Two-metric usage page

The application page presents two primary measures: Agent work time and Token usage. Day and week controls apply to both. Complete conversations remain available in a collapsed detail area. Project organization and estimated cost do not appear on this page.

## Time accounting

- A work interval begins at a recorded working state and ends at a recorded nonworking or terminal state.
- Overlapping intervals count once in the page total and once in each hour/day bucket.
- Open intervals enter confirmed totals only after a closing event. This prevents a missing terminal event from growing the total indefinitely.
- Recovery after an interrupted application run closes intervals at the last observed event, never at the later restart time. Previously interrupted intervals are read using their last observed event as their effective end.
- The day uses local midnight; the week begins Monday. Previous-period comparison covers the same elapsed portion.

## Token accounting

- Read the local Codex and Claude Code usage records for every tracked local session. Recorded usage timestamps, rather than hook timestamps or session start times, determine the day/week and chart bucket.
- Claude Code streaming updates are deduplicated by message ID. Codex cumulative counters are converted to increments; a new rollout with inherited cumulative counts uses its first recorded turn instead of recounting the inherited baseline. Input includes cached input exactly once; total Tokens equal input plus output.
- Each usage increment belongs to the bucket containing its timestamp. A turn crossing a bucket boundary is assigned at the recorded usage event. Missing or undated records are excluded from day/week totals; complete session details may still show undated records.
- A missing local log is reported as incomplete coverage when the tracker observed that session during the period. Unknown coverage is never represented as zero usage.

## Presentation

- The time panel shows a total and hoverable hour/day chart.
- The Token panel shows a total and hoverable chart on the same time axis. If local data is unavailable, it shows a short coverage notice.
- The conversation list is collapsed by default and omits project organization and cost fields.
- Statistical methods stay in documentation and tests rather than the user interface.
- The page avoids presenting incomplete data as an exact zero.
