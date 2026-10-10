import { listProviderPresets } from "../catalog";
import type { ProviderScope } from "../types";

export function ProviderPresetPicker({ appId, value, onChange }: {
  appId: ProviderScope;
  value: string;
  onChange(id: string): void;
}) {
  return <label className="provider-field">预设
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">自定义</option>
      {listProviderPresets(appId).map((preset) =>
        <option key={preset.id} value={preset.id}>{preset.name}{preset.hidden === true ? " · 进阶" : ""}</option>)}
    </select>
  </label>;
}
