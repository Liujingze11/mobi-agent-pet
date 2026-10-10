import { useEffect, useState } from "react";

type Config = Record<string, unknown>;
type Field = { path: Array<string | number>; value: string | number | boolean };

function fieldsIn(value: unknown, path: Array<string | number> = [], result: Field[] = []): Field[] {
  if (result.length >= 250 || path.length > 9) return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => fieldsIn(item, [...path, index], result));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => fieldsIn(item, [...path, key], result));
  } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    result.push({ path, value });
  }
  return result;
}

function replaceAt(config: Config, path: Array<string | number>, value: unknown): Config {
  const next = structuredClone(config);
  let node: Record<string | number, unknown> = next;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  node[path[path.length - 1]] = value;
  return next;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange(value: number): void }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  return <label className="provider-field">{label}<input inputMode="decimal" value={raw}
    onChange={(event) => {
      const next = event.target.value;
      setRaw(next);
      if (next.trim() && Number.isFinite(Number(next))) onChange(Number(next));
    }} onBlur={() => { if (!raw.trim() || !Number.isFinite(Number(raw))) setRaw(String(value)); }} /></label>;
}

export function StructuredProviderFields({ config, onChange }: { config: Config; onChange(config: Config): void }) {
  const fields = fieldsIn(config);
  if (!fields.length) return <p className="provider-editor__note">当前配置没有可单独编辑的字段，可使用下方完整配置 JSON。</p>;
  return <div className="provider-structured-fields">
    {fields.map(({ path, value }) => {
      const label = path.join(".");
      const update = (next: unknown) => onChange(replaceAt(config, path, next));
      if (typeof value === "boolean") return <label className="provider-structured-switch" key={label}>
        <input type="checkbox" checked={value} onChange={(event) => update(event.target.checked)} />{label}</label>;
      if (typeof value === "number") return <NumberField key={label} label={label} value={value}
        onChange={update} />;
      const sensitive = /api.?key|token|secret|password|authorization/i.test(String(path.at(-1)));
      return <label className="provider-field" key={label}>{label}
        {!sensitive && (value.includes("\n") || value.length > 180) ? <textarea rows={Math.min(12, Math.max(4, value.split("\n").length))}
          spellCheck={false} value={value} onChange={(event) => update(event.target.value)} />
          : <input type={sensitive ? "password" : "text"} autoComplete="off" value={value}
            onChange={(event) => update(event.target.value)} />}
      </label>;
    })}
    {fields.length >= 250 ? <p className="provider-editor__note">其余字段可在完整配置 JSON 中编辑。</p> : null}
  </div>;
}
