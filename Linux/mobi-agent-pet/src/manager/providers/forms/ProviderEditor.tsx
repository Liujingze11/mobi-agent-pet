import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createProviderDraft } from "../catalog";
import type { ProviderDraft, ProviderScope } from "../types";
import type { AgentLogApi, ProviderEditorView } from "../../types";
import { ProviderFields, readField, writeField } from "./ProviderFields";
import { ProviderPresetPicker } from "./ProviderPresetPicker";
import { ProviderModelList, addNativeProviderModel } from "./ProviderModelList";
import { ProviderToolOptions } from "./ProviderToolOptions";
import { StructuredProviderFields } from "./StructuredProviderFields";
import { validateProviderDraft } from "./provider-validation";

const COEXISTING_TOOLS = new Set(["opencode", "openclaw", "hermes", "pi", "mcode"]);
function suggestedKey(name: string, fallback: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64) || fallback;
}

export function ProviderEditor({ appId, initialDraft, editorView, api, onSave, onCancel }: {
  appId: ProviderScope;
  initialDraft?: ProviderDraft | null;
  editorView: ProviderEditorView;
  api?: Pick<AgentLogApi["providers"], "fetchModels" | "checkEndpoint">;
  onSave(draft: ProviderDraft): Promise<void>;
  onCancel?(): void;
}) {
  const [draft, setDraft] = useState<ProviderDraft>(() => initialDraft || createProviderDraft(appId));
  const [json, setJson] = useState(() => JSON.stringify(draft.settingsConfig, null, 2));
  const [metadataJson, setMetadataJson] = useState(() => JSON.stringify(draft.metadata, null, 2));
  const [error, setError] = useState("");
  const [queryStatus, setQueryStatus] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [importReviewed, setImportReviewed] = useState(false);
  const [providerKeyOverride, setProviderKeyOverride] = useState<string | null>(
    () => typeof initialDraft?.metadata?.providerKey === "string" ? initialDraft.metadata.providerKey : null);
  const fallbackKey = useRef(`mobi-${Math.random().toString(36).slice(2, 10)}`);
  const providerKey = providerKeyOverride ?? suggestedKey(draft.name, fallbackKey.current);
  const submitting = useRef(false);
  const importedSourceId = typeof initialDraft?.metadata?.importSourceId === "string"
    ? initialDraft.metadata.importSourceId : null;
  const requiresImportReview = Boolean(importedSourceId && initialDraft?.activation === "unavailable"
    && initialDraft.unavailableReason?.startsWith("导入后"));

  useEffect(() => {
    const next = initialDraft || createProviderDraft(appId);
    setDraft(next);
    setJson(JSON.stringify(next.settingsConfig, null, 2));
    setMetadataJson(JSON.stringify(next.metadata, null, 2));
    setError("");
    setImportReviewed(false);
    setProviderKeyOverride(typeof next.metadata.providerKey === "string" ? next.metadata.providerKey : null);
  }, [appId, initialDraft]);

  function selectPreset(presetId: string) {
    const next = createProviderDraft(appId, presetId || null);
    setDraft(next);
    setJson(JSON.stringify(next.settingsConfig, null, 2));
    setMetadataJson(JSON.stringify(next.metadata, null, 2));
    setError("");
    setProviderKeyOverride(typeof next.metadata.providerKey === "string" ? next.metadata.providerKey : null);
  }

  function changeConfig(config: Record<string, unknown>) {
    setDraft((current) => ({ ...current, settingsConfig: config }));
    setJson(JSON.stringify(config, null, 2));
    setError("");
  }

  async function query(kind: "models" | "connection") {
    if (!api) return;
    const configured = readField(draft.settingsConfig, appId, "endpoint");
    const endpoint = kind === "models" && typeof draft.metadata.modelsUrl === "string"
      ? draft.metadata.modelsUrl : configured;
    if (!endpoint) { setQueryStatus("请先填写接口地址"); return; }
    setQueryStatus("正在检查…");
    try {
      const input = { appId, endpoint, apiKey: readField(draft.settingsConfig, appId, "key"),
        allowLocal: draft.metadata.allowLocal === true };
      if (kind === "models") {
        const models = await api.fetchModels(input);
        setFetchedModels(models);
        setQueryStatus(models.length ? `获取到 ${models.length} 个模型` : "没有获取到模型");
      } else {
        const result = await api.checkEndpoint(input);
        setQueryStatus(result.reachable ? "连接成功" : `连接失败 (${result.status})`);
      }
    } catch { setQueryStatus("检查失败或已超时"); }
  }

  function chooseFetchedModel(model: string) {
    try {
      if (COEXISTING_TOOLS.has(appId)) {
        const next = addNativeProviderModel(appId, draft.settingsConfig, model);
        changeConfig(next);
        setQueryStatus(next === draft.settingsConfig ? "模型已在列表中" : "模型已加入列表");
      } else if (appId === "claude-desktop") {
        if (!/^(?:anthropic\/)?claude-[a-z0-9-]+$/i.test(model)) {
          throw new Error("直连模式仅支持 Claude 模型");
        }
        const routes = Array.isArray(draft.settingsConfig.modelRoutes) ? draft.settingsConfig.modelRoutes : [];
        if (routes.some((route) => route?.routeId === model)) { setQueryStatus("模型已在列表中"); return; }
        if (routes.length >= 100) throw new Error("最多添加 100 个模型");
        changeConfig({ ...draft.settingsConfig, modelRoutes: [...routes, { routeId: model, upstreamModel: model }] });
        setQueryStatus("模型已加入列表");
      } else changeConfig(writeField(draft.settingsConfig, appId, "model", model));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法添加模型"); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    let settingsConfig: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid object");
      settingsConfig = parsed as Record<string, unknown>;
    } catch { setError("完整配置 JSON 格式不正确"); return; }
    if (!draft.presetId && ["opencode", "hermes", "pi", "mcode"].includes(appId)
      && settingsConfig.name === "") settingsConfig.name = draft.name.trim();
    let metadata: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(metadataJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid object");
      metadata = parsed as Record<string, unknown>;
    } catch { setError("预设选项 JSON 格式不正确"); return; }
    if (importedSourceId) metadata.importSourceId = importedSourceId;
    if (COEXISTING_TOOLS.has(appId)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(providerKey)) {
        setError("配置标识只能包含字母、数字、下划线和连字符"); return;
      }
      metadata.providerKey = providerKey;
    }
    const next = { ...draft, settingsConfig, metadata };
    if (requiresImportReview) {
      if (importReviewed && (!next.unavailableReason || next.unavailableReason.startsWith("导入后"))) {
        next.activation = "available";
        next.unavailableReason = null;
      } else if (!importReviewed && next.activation === "available") {
        next.activation = "unavailable";
        next.unavailableReason = "导入后请检查配置并补齐凭据";
      }
    }
    const validation = validateProviderDraft(next);
    if (!validation.valid) { setError(Object.values(validation.fieldErrors)[0]); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try { await onSave(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <form className="provider-editor" onSubmit={(event) => void submit(event)}>
    <div className="provider-editor__header"><h3>{initialDraft ? "编辑供应商" : "添加供应商"}</h3>
      {onCancel ? <button type="button" className="provider-button provider-button--quiet" onClick={onCancel}>取消</button> : null}
    </div>
    <ProviderPresetPicker appId={appId} value={draft.presetId || ""} onChange={selectPreset} />
    <div className="provider-fields-grid">
      <label className="provider-field">名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="provider-field">网站<input type="url" value={draft.websiteUrl} onChange={(event) => setDraft({ ...draft, websiteUrl: event.target.value })} /></label>
    </div>
    {COEXISTING_TOOLS.has(appId) ? <label className="provider-field">配置标识
      <input autoComplete="off" value={providerKey}
        onChange={(event) => setProviderKeyOverride(event.target.value)} />
    </label> : null}
    <ProviderFields appId={appId} config={draft.settingsConfig} onChange={changeConfig} />
    <ProviderToolOptions appId={appId} config={draft.settingsConfig} onChange={changeConfig} />
    <ProviderModelList appId={appId} config={draft.settingsConfig} onChange={changeConfig} />
    <details className="provider-advanced"><summary>各工具配置字段</summary>
      <StructuredProviderFields config={draft.settingsConfig} onChange={changeConfig} />
    </details>
    {requiresImportReview ? <label className="provider-editor__local-access"><input type="checkbox"
      checked={importReviewed} onChange={(event) => setImportReviewed(event.target.checked)} />
      我已检查配置，可以启用</label> : null}
    {Array.isArray(draft.metadata.endpointCandidates) && draft.metadata.endpointCandidates.length ?
      <label className="provider-field">接口候选地址
        <select value="" onChange={(event) => changeConfig(writeField(draft.settingsConfig, appId, "endpoint", event.target.value))}>
          <option value="">选择候选地址</option>
          {draft.metadata.endpointCandidates.filter((item): item is string => typeof item === "string").map((item) =>
            <option key={item} value={item}>{item}</option>)}
        </select>
      </label> : null}
    <label className="provider-editor__local-access"><input type="checkbox" checked={draft.metadata.allowLocal === true}
      onChange={(event) => setDraft({ ...draft, metadata: { ...draft.metadata, allowLocal: event.target.checked } })} />
      允许检查本机接口地址</label>
    {api ? <div className="provider-editor__tools">
      <button type="button" className="provider-button provider-button--quiet" onClick={() => void query("connection")}>检查连接</button>
      <button type="button" className="provider-button provider-button--quiet" onClick={() => void query("models")}>获取模型</button>
      {queryStatus ? <span role="status">{queryStatus}</span> : null}
      {fetchedModels.length ? <div className="provider-editor__models">{fetchedModels.map((model) =>
        <button type="button" className="provider-button provider-button--quiet" key={model}
          onClick={() => chooseFetchedModel(model)}>{model}</button>)}</div> : null}
    </div> : null}
    <details className="provider-advanced"><summary>高级配置与全部字段</summary>
      <label className="provider-field">完整配置 JSON
        <textarea spellCheck={false} rows={11} value={json} onChange={(event) => {
          setJson(event.target.value);
          try {
            const parsed = JSON.parse(event.target.value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setDraft({ ...draft, settingsConfig: parsed });
          } catch { /* Keep invalid text for inline validation on save. */ }
        }} />
      </label>
      <label className="provider-field">预设选项 JSON
        <textarea spellCheck={false} rows={7} value={metadataJson} onChange={(event) => setMetadataJson(event.target.value)} />
      </label>
    </details>
    {editorView.exists ? <p className="provider-editor__note">已检测到当前 Agent 配置。</p> : null}
    {draft.unavailableReason ? <p className="provider-editor__note">此预设暂不能启用：{draft.unavailableReason}</p> : null}
    {error ? <p className="provider-editor__error" role="alert">{error}</p> : null}
    <button type="submit" className="provider-button provider-button--primary" disabled={busy}>{busy ? "正在保存…" : "保存供应商"}</button>
  </form>;
}
