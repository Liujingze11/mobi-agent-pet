import { useEffect, useState } from "react";
import type { ProviderScope } from "../types";

// Model collection shapes adapted from pinned CC Switch provider forms.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.

type Config = Record<string, unknown>;
type Model = Record<string, unknown>;
const OBJECT_MODELS = new Set<ProviderScope>(["opencode", "mcode"]);
const ARRAY_MODELS = new Set<ProviderScope>(["openclaw", "hermes", "pi"]);
const MODEL_ID = /^[A-Za-z0-9._:/-]{1,128}$/;
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);

function validId(value: string) { return MODEL_ID.test(value) && !RESERVED_IDS.has(value); }

function isObject(value: unknown): value is Model {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function newArrayModel(appId: ProviderScope, id: string, name: string): Model {
  if (appId === "openclaw") return { id, name, input: ["text"] };
  if (appId === "pi") return { id, name, reasoning: false, input: ["text"],
    contextWindow: 128000, maxTokens: 8192 };
  return { id, name };
}

export function addNativeProviderModel(appId: ProviderScope, config: Config, id: string, name = id): Config {
  if (!validId(id)) throw new Error("模型 ID 无效");
  if (OBJECT_MODELS.has(appId)) {
    const models = isObject(config.models) ? config.models : {};
    if (Object.hasOwn(models, id)) return config;
    if (Object.keys(models).length >= 100) throw new Error("最多添加 100 个模型");
    return { ...config, models: { ...models, [id]: { name } } };
  }
  if (ARRAY_MODELS.has(appId)) {
    const models = Array.isArray(config.models) ? config.models : [];
    if (models.some((model) => isObject(model) && model.id === id)) return config;
    if (models.length >= 100) throw new Error("最多添加 100 个模型");
    return { ...config, models: [...models, newArrayModel(appId, id, name)] };
  }
  throw new Error("此 Agent 不使用模型列表");
}

function ModelIdInput({ id, onCommit }: { id: string; onCommit(value: string): boolean }) {
  const [value, setValue] = useState(id);
  useEffect(() => setValue(id), [id]);
  return <label className="provider-field">ID<input aria-label={`模型 ${id} ID`} value={value}
    onChange={(event) => setValue(event.target.value)}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
    onBlur={() => { if (!onCommit(value.trim())) setValue(id); }} /></label>;
}

export function ProviderModelList({ appId, config, onChange }: {
  appId: ProviderScope;
  config: Config;
  onChange(config: Config): void;
}) {
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const objectModels = OBJECT_MODELS.has(appId);
  if (!objectModels && !ARRAY_MODELS.has(appId)) return null;
  const models = objectModels ? (isObject(config.models) ? config.models : {})
    : (Array.isArray(config.models) ? config.models : []);
  const entries: Array<[string, Model]> = objectModels
    ? Object.entries(models as Model).filter(([, value]) => isObject(value)) as Array<[string, Model]>
    : (models as unknown[]).map((value, index) => [String(index), isObject(value) ? value : {}]);

  function add() {
    const id = newId.trim();
    try {
      const next = addNativeProviderModel(appId, config, id, newName.trim() || id);
      if (next === config) { setError("模型 ID 已存在"); return; }
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法添加模型"); return;
    }
    setNewId("");
    setNewName("");
    setError("");
  }

  function changeName(key: string, value: string) {
    if (objectModels) {
      const next = { ...(models as Model), [key]: { ...((models as Model)[key] as Model), name: value } };
      onChange({ ...config, models: next });
    } else {
      const next = [...(models as Model[])];
      next[Number(key)] = { ...next[Number(key)], name: value };
      onChange({ ...config, models: next });
    }
  }

  function changeId(key: string, value: string): boolean {
    const current = objectModels ? key : String((models as Model[])[Number(key)]?.id || "");
    if (value === current) return true;
    if (!validId(value)) { setError("模型 ID 无效"); return false; }
    if (entries.some(([entryKey, model]) => entryKey !== key &&
      (objectModels ? entryKey : model.id) === value)) { setError("模型 ID 已存在"); return false; }
    if (objectModels) {
      const next = Object.fromEntries(Object.entries(models as Model)
        .map(([entryKey, model]) => [entryKey === key ? value : entryKey, model]));
      onChange({ ...config, models: next });
    } else {
      const next = [...(models as Model[])];
      next[Number(key)] = { ...next[Number(key)], id: value };
      onChange({ ...config, models: next });
    }
    setError("");
    return true;
  }

  function remove(key: string) {
    if (objectModels) {
      const next = { ...(models as Model) };
      delete next[key];
      onChange({ ...config, models: next });
    } else onChange({ ...config, models: (models as Model[]).filter((_, index) => index !== Number(key)) });
    setError("");
  }

  return <details className="provider-advanced"><summary>模型列表</summary>
    <div className="provider-model-list">
      {entries.map(([key, model]) => {
        const id = objectModels ? key : typeof model.id === "string" ? model.id : "";
        return <div className="provider-model-list__row" key={key}>
          <ModelIdInput id={id} onCommit={(value) => changeId(key, value)} />
          <label className="provider-field">名称<input aria-label={`模型 ${id || key} 名称`}
            value={typeof model.name === "string" ? model.name : ""}
            onChange={(event) => changeName(key, event.target.value)} /></label>
          <button type="button" className="provider-button provider-button--quiet"
            aria-label={`移除模型 ${id || key}`} onClick={() => remove(key)}>移除</button>
        </div>;
      })}
      <div className="provider-model-list__add">
        <label className="provider-field">新增模型 ID<input value={newId}
          onChange={(event) => setNewId(event.target.value)} /></label>
        <label className="provider-field">新增模型名称<input value={newName}
          onChange={(event) => setNewName(event.target.value)} /></label>
        <button type="button" className="provider-button" onClick={add}>添加模型</button>
      </div>
      {error ? <p className="provider-editor__error" role="alert">{error}</p> : null}
      <p className="provider-editor__note">模型的其他选项可在「各工具配置字段」中修改。</p>
    </div>
  </details>;
}
