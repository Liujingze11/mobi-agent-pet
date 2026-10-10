# Usage page polish and manual refresh

The application page keeps its two measures: Agent work time and Token usage. The Token total continues to include cached input; the user's concern is the visual size of the number, not the accounting definition.

The page adapts Apple's Screen Time visual rhythm to the existing desktop window: a quiet light background, restrained blue, rounded grouped surfaces, smaller totals, subtle chart gridlines, and a compact day/week/date toolbar. A visible Refresh button recalculates both measures by rereading local usage files, bypassing the current reader cache and Codex rollout index. The button shows progress without clearing the visible report; failures retain the previous result and show a concise message.

Complete conversations stay on the same page. Each row shows the conversation, numeric local start and end time, Agent, confirmed work duration, and complete Token total. The list remains collapsible and opens by default so these fields are easy to find. Selecting a row keeps the existing detailed Token breakdown. Missing values remain visibly unavailable rather than zero.

The current report and session list continue to use the same query and filtering contracts. Refresh is an explicit analytics request flag, not a new data source. Automatic event updates may use cached file data when unchanged.
