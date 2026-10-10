import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Globe2, MoreHorizontal, Plus, Pencil, RefreshCw, Trash2, Upload, Wallet, X } from "lucide-react";
import type { AgentLogApi, ProviderBalance, ProviderBalanceRule, ProviderEditorView, ProviderStatus, ProviderSummary } from "../types";
import { getProviderPreset } from "./catalog";
import type { ProviderDraft, ProviderScope } from "./types";
import { ProviderEditor } from "./forms/ProviderEditor";
import { ProviderAgentTabs } from "./ProviderAgentTabs";

const APP_LABELS: Record<ProviderScope, string> = {
  claude: "Claude Code", codex: "OpenAI", gemini: "Gemini CLI", grokbuild: "Grok Build",
  "claude-desktop": "Claude Desktop", opencode: "OpenCode", openclaw: "OpenClaw",
  hermes: "Hermes", pi: "Pi", mcode: "MiniMax Code", universal: "通用供应商",
};

type EditorState = { id: string | null; draft: ProviderDraft | null; view: ProviderEditorView; request: number };
const EMPTY_BALANCE_RULE: ProviderBalanceRule = { url: "", method: "GET", valuePath: "data.balance",
  kind: "money", unit: "CNY" };

function balanceLabel(balance: ProviderBalance | null | undefined): string {
  if (!balance) return "余额 —";
  if (balance.kind === "money" && typeof balance.amount === "number" && balance.currency) {
    try { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: balance.currency,
      maximumFractionDigits: 2 }).format(balance.amount); } catch { return `${balance.amount} ${balance.currency}`; }
  }
  if (balance.kind === "quota" && typeof balance.remaining === "number" && balance.unit) {
    return `${balance.remaining} ${balance.unit}`;
  }
  return balance.error === "unsupported" ? "暂不支持余额查询" : "暂无余额数据";
}

export function ProviderPage({ api, onChanged }: {
  api: AgentLogApi["providers"];
  onChanged(callback: (scope: string) => void): () => void;
}) {
  const [appId, setAppId] = useState<ProviderScope>("claude");
  const [rows, setRows] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [balances, setBalances] = useState<Record<string, ProviderBalance | null>>({});
  const [pendingBalance, setPendingBalance] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [ruleEditorId, setRuleEditorId] = useState<string | null>(null);
  const [balanceRule, setBalanceRule] = useState<ProviderBalanceRule>(EMPTY_BALANCE_RULE);
  const [savedRule, setSavedRule] = useState(false);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleEditorRequest, setRuleEditorRequest] = useState(0);
  const requestId = useRef(0);
  const editingRequestId = useRef(0);
  const ruleRequestId = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const selectionEpoch = useRef(0);
  const selectedApp = useRef<ProviderScope>("claude");

  const refresh = useCallback(async (targetApp: ProviderScope, silent = false) => {
    if (targetApp !== selectedApp.current) return;
    const request = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      const [result, live] = await Promise.all([
        api.list(targetApp), targetApp === "universal" ? Promise.resolve(null) : api.status(targetApp),
      ]);
      if (request !== requestId.current) return;
      setRows(result);
      setStatus(live);
      const snapshots = await Promise.all(result.map((row) => api.balance(row.id).catch(() => null)));
      if (request !== requestId.current) return;
      setBalances(Object.fromEntries(result.map((row, index) => [row.id, snapshots[index]])));
      setError("");
    } catch {
      if (request === requestId.current) setError("供应商列表暂时无法读取");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh(appId);
    return () => { requestId.current += 1; };
  }, [appId, refresh]);

  useEffect(() => onChanged((scope) => {
    if (scope === "providers") void refresh(appId, true);
  }), [appId, onChanged, refresh]);

  function selectApp(next: ProviderScope) {
    if (next === appId) return;
    selectionEpoch.current += 1;
    selectedApp.current = next;
    requestId.current += 1;
    editingRequestId.current += 1;
    ruleRequestId.current += 1;
    setEditor(null);
    setPendingDelete(null);
    setMessage("");
    setError("");
    setRows([]);
    setLoading(true);
    setStatus(null);
    setBalances({});
    setRuleEditorId(null);
    setAppId(next);
  }

  async function openEditor(providerId: string | null = null) {
    const request = ++editingRequestId.current;
    setMessage("");
    setError("");
    try {
      const [view, draft] = await Promise.all([
        api.getEditorView(appId),
        providerId ? api.getEditDraft(providerId) : Promise.resolve(null),
      ]);
      if (request !== editingRequestId.current) return;
      if (providerId && !draft) { setError("供应商已经不存在"); return; }
      setEditor({ id: providerId, draft, view, request });
    } catch { if (request === editingRequestId.current) setError("无法打开供应商配置"); }
  }

  async function save(draft: ProviderDraft) {
    if (!editor) return;
    const selection = selectionEpoch.current;
    const request = editor.request;
    if (editor.id) await api.update({ ...draft, id: editor.id });
    else await api.create(draft);
    if (selection !== selectionEpoch.current || request !== editingRequestId.current) return;
    closeEditor();
    setMessage("供应商已保存");
    await refresh(appId, true);
  }

  function closeEditor() {
    editingRequestId.current += 1;
    setEditor(null);
  }

  function closeBalanceRule() {
    ruleRequestId.current += 1;
    setRuleEditorId(null);
  }

  async function remove(providerId: string) {
    const selection = selectionEpoch.current;
    try {
      await api.remove(providerId);
      if (selection !== selectionEpoch.current) return;
      setPendingDelete(null);
      setMessage("供应商已删除");
      await refresh(appId, true);
    } catch { if (selection === selectionEpoch.current) setError("删除失败，请重试"); }
  }

  async function move(providerId: string, beforeId: string | null) {
    if (pendingAction) return;
    setPendingAction(providerId);
    const selection = selectionEpoch.current;
    try {
      const next = await api.move(providerId, beforeId);
      if (selection !== selectionEpoch.current) return;
      setRows(next);
      setError("");
    } catch { if (selection === selectionEpoch.current) setError("调整顺序失败，请重试"); }
    finally { setPendingAction(null); }
  }

  async function activate(providerId: string) {
    if (pendingAction) return;
    setPendingAction(providerId);
    setError("");
    const selection = selectionEpoch.current;
    try {
      const next = await api.activate(providerId);
      if (selection !== selectionEpoch.current) return;
      setStatus(next);
      setMessage(next.restartHint === "restart-agent" ? "已切换；重新启动 Agent 后生效" : "已切换供应商");
    } catch {
      if (selection !== selectionEpoch.current) return;
      setError("切换失败。请检查当前配置是否被其他程序修改，或供应商配置是否有效。");
      await refresh(appId, true);
    } finally { setPendingAction(null); }
  }

  async function toggleLive(providerId: string, enabled: boolean) {
    if (pendingAction) return;
    setPendingAction(providerId);
    setError("");
    const selection = selectionEpoch.current;
    try {
      const next = enabled ? await api.removeFromLive(providerId) : await api.addToLive(providerId);
      if (selection !== selectionEpoch.current) return;
      setStatus(next);
      setMessage(enabled ? "已从 Agent 配置移除" : "已加入 Agent 配置；重新启动 Agent 后生效");
    } catch {
      if (selection !== selectionEpoch.current) return;
      setError("更新 Agent 配置失败。请检查配置文件是否被修改，或供应商配置是否有效。");
      await refresh(appId, true);
    } finally { setPendingAction(null); }
  }

  async function refreshBalance(providerId: string) {
    if (pendingBalance) return;
    setPendingBalance(providerId);
    const selection = selectionEpoch.current;
    try {
      const next = await api.refreshBalance(providerId);
      if (selection !== selectionEpoch.current) return;
      setBalances((current) => ({ ...current, [providerId]: next }));
    } catch { if (selection === selectionEpoch.current) setError("余额暂时无法查询，请稍后重试。"); }
    finally { setPendingBalance(null); }
  }

  async function openBalanceRule(providerId: string) {
    if (ruleEditorId === providerId) { closeBalanceRule(); return; }
    setError("");
    const selection = selectionEpoch.current;
    const request = ++ruleRequestId.current;
    try {
      const current = await api.getBalanceRule(providerId);
      if (selection !== selectionEpoch.current || request !== ruleRequestId.current) return;
      setBalanceRule(current || EMPTY_BALANCE_RULE);
      setSavedRule(Boolean(current));
      setRuleEditorId(providerId);
      setRuleEditorRequest(request);
    } catch { if (selection === selectionEpoch.current && request === ruleRequestId.current) setError("无法读取余额设置"); }
  }

  async function saveBalanceRule(providerId: string, rule: ProviderBalanceRule | null) {
    if (ruleBusy) return;
    setRuleBusy(true);
    setError("");
    const selection = selectionEpoch.current;
    const request = ruleEditorRequest;
    try {
      await api.setBalanceRule(providerId, rule);
      if (selection !== selectionEpoch.current || request !== ruleRequestId.current) return;
      closeBalanceRule();
      setMessage(rule ? "余额查询设置已保存" : "已恢复默认余额查询");
      await refreshBalance(providerId);
    } catch { if (selection === selectionEpoch.current && request === ruleRequestId.current) setError("余额设置无效。请检查 HTTPS 地址、JSON 字段和单位。"); }
    finally { setRuleBusy(false); }
  }

  async function exportProviders() {
    try {
      const payload = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "mobi-providers.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage("供应商列表已导出；密钥不会包含在文件中");
    } catch { setError("导出失败，请重试"); }
  }

  async function importProviders(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > 2_000_000) { setError("导入文件过大"); return; }
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      const parsed = JSON.parse(source);
      const result = await api.importData(parsed);
      setMessage(`已导入 ${result.added} 个供应商；请检查配置并补齐凭据`);
      await refresh(selectedApp.current, true);
    } catch { setError("导入失败。请检查文件格式与配置内容。"); }
    finally { if (importInput.current) importInput.current.value = ""; }
  }

  async function restoreOriginal() {
    if (pendingAction) return;
    setPendingAction("original");
    setError("");
    const selection = selectionEpoch.current;
    try {
      const next = await api.restoreOriginal(appId);
      if (selection !== selectionEpoch.current) return;
      setStatus(next);
      setMessage(next.restartHint === "restart-agent" ? "已恢复原配置；重新启动 Agent 后生效" : "已恢复原配置");
    } catch { if (selection === selectionEpoch.current) setError("恢复原配置失败。请检查配置文件是否被其他程序修改。"); }
    finally { setPendingAction(null); }
  }

  return <section className="provider-page" aria-label="供应商管理">
    <div className="provider-page__toolbar">
      <ProviderAgentTabs appId={appId} onSelect={selectApp} />
      <div className="provider-page__heading-actions">
        <button type="button" className="provider-icon-button" aria-label="导出列表" title="导出列表"
          onClick={() => void exportProviders()}><Download size={17} /></button>
        <button type="button" className="provider-icon-button" aria-label="导入列表" title="导入列表"
          onClick={() => importInput.current?.click()}><Upload size={17} /></button>
        <input ref={importInput} type="file" accept="application/json,.json" hidden
          aria-label="选择供应商导入文件" onChange={(event) => void importProviders(event.target.files?.[0])} />
        <button type="button" className="provider-button provider-button--primary" onClick={() => void openEditor()}>
          <Plus aria-hidden="true" size={17} />添加供应商
        </button>
      </div>
    </div>

    <div className="provider-page__content" role="tabpanel" id="provider-agent-panel" aria-labelledby={`provider-tab-${appId}`}>
      {message ? <p className="provider-page__message" role="status">{message}</p> : null}
      {error ? <p className="provider-page__error" role="alert">{error}</p> : null}
      {status?.conflict ? <p className="provider-page__error" role="alert">配置文件已由其他程序修改，请先检查文件后再切换。</p> : null}
      {editor ? <ProviderEditor key={`${appId}:${editor.id || "new"}:${editor.request}`} appId={appId}
        initialDraft={editor.draft} editorView={editor.view} api={api} onSave={save}
        onCancel={closeEditor} /> : null}
      <div className="provider-page__section-heading"><div><h2>{APP_LABELS[appId]}</h2>
        <span>{rows.length} 个供应商{appId === "codex" ? " · 本地任务" : ""}</span></div>
        {status?.mode === "switch" && status.activeId ? <button type="button" className="provider-button"
          disabled={Boolean(pendingAction) || status.conflict} onClick={() => void restoreOriginal()}>恢复原配置</button> : null}
      </div>
      {loading ? <p className="provider-page__empty" role="status">正在读取供应商…</p> : null}
      {!loading && rows.length === 0 ? <div className="provider-page__empty">
        <span className="provider-page__empty-icon" aria-hidden="true"><Globe2 size={26} /></span>
        <h3>添加你的第一个供应商</h3><p>为 {APP_LABELS[appId]} 配置常用 API。</p>
        <button type="button" className="provider-button" onClick={() => void openEditor()}><Plus size={15} />添加第一个供应商</button>
      </div> : null}
      {!loading && rows.length > 0 ? <div className="provider-page__cards">{rows.map((row, index) => {
        const current = status?.activeId === row.id && !status.conflict;
        const models = row.modelNames || [];
        const official = row.presetId ? getProviderPreset(row.appId, row.presetId)?.isOfficial === true : false;
        const reason = row.unavailableReason === "Requires a local protocol proxy" ? "需要本地代理"
          : row.unavailableReason === "Requires CC Switch managed sign-in" ? "需要授权登录" : row.unavailableReason;
        return <article className={`provider-card${current ? " provider-card--current" : ""}`}
          aria-label={`${row.name} 供应商`} key={row.id}>
          <div className="provider-card__mark" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</div>
          <div className="provider-card__main"><div className="provider-card__title"><h3>{row.name}</h3>
            {current ? <span className="provider-card__status"><Check size={12} aria-hidden="true" />当前使用</span>
              : row.activation === "unavailable" ? <span className="provider-card__status provider-card__status--unavailable">暂不能启用</span> : null}
          </div>
            <p className="provider-card__endpoint"><Globe2 size={13} aria-hidden="true" />
              <span>{row.apiHost || (official ? "官方服务" : "未设置接口")}</span></p>
            {models.length ? <div className="provider-card__models" aria-label="配置的模型">
              {models.slice(0, 3).map((model) => <span key={model} title={model}>{model}</span>)}
              {models.length > 3 ? <span title={models.slice(3).join("、")}>+{models.length - 3}</span> : null}
            </div> : null}
            {row.activation === "unavailable" && reason ? <p className="provider-card__reason">{reason}</p> : null}
          </div>
          <div className="provider-card__account"><Wallet size={14} aria-hidden="true" />
            <span>{balanceLabel(balances[row.id])}{balances[row.id]?.stale && balances[row.id]?.checkedAt ? " · 上次结果" : ""}</span>
            <button type="button" className="provider-icon-button" aria-label={`刷新 ${row.name} 余额`} title="刷新余额"
              disabled={pendingBalance === row.id} onClick={() => void refreshBalance(row.id)}>
              <RefreshCw size={14} className={pendingBalance === row.id ? "is-spinning" : undefined} /></button>
          </div>
          <div className="provider-card__actions">
            {status?.mode === "switch" && status.supported ? <button type="button" className="provider-button"
              disabled={row.activation !== "available" || status.activeId === row.id || Boolean(pendingAction) || status.conflict}
              aria-label={`启用 ${row.name} 供应商`} onClick={() => void activate(row.id)}>
              {pendingAction === row.id ? "切换中…" : current ? "使用中" : "启用"}</button> : null}
            {status?.mode === "coexist" && status.supported ? <button type="button" className="provider-button"
              disabled={(row.activation !== "available" && !status.enabledIds?.includes(row.id)) || Boolean(pendingAction) || status.conflict}
              onClick={() => void toggleLive(row.id, Boolean(status.enabledIds?.includes(row.id)))}>
              {pendingAction === row.id ? "处理中…" : status.enabledIds?.includes(row.id) ? "移出 Agent" : "加入 Agent"}
            </button> : null}
            <button type="button" className="provider-icon-button" title="编辑供应商" aria-label={`编辑 ${row.name}`}
              disabled={status?.activeId === row.id || Boolean(status?.enabledIds?.includes(row.id))}
              onClick={() => void openEditor(row.id)}><Pencil size={16} /></button>
            {pendingDelete === row.id ? <>
              <button type="button" className="provider-button provider-button--danger" onClick={() => void remove(row.id)}>确认删除</button>
              <button type="button" className="provider-icon-button" aria-label="取消删除" onClick={() => setPendingDelete(null)}><X size={16} /></button>
            </> : <button type="button" className="provider-icon-button" title="删除供应商" aria-label={`删除 ${row.name}`}
              disabled={status?.activeId === row.id || Boolean(status?.enabledIds?.includes(row.id))}
              onClick={() => setPendingDelete(row.id)}><Trash2 size={16} /></button>}
            <details className="provider-card__more"><summary className="provider-icon-button" aria-label={`更多操作 ${row.name}`} title="更多操作"><MoreHorizontal size={17} /></summary>
              <div className="provider-card__menu">
                <button type="button" aria-label={`上移 ${row.name}`} disabled={index === 0 || Boolean(pendingAction)}
                  onClick={(event) => { event.currentTarget.closest("details")!.open = false; void move(row.id, rows[index - 1].id); }}><ArrowUp size={14} />上移</button>
                <button type="button" aria-label={`下移 ${row.name}`} disabled={index === rows.length - 1 || Boolean(pendingAction)}
                  onClick={(event) => { event.currentTarget.closest("details")!.open = false; void move(row.id, rows[index + 2]?.id || null); }}><ArrowDown size={14} />下移</button>
                <button type="button" onClick={(event) => { event.currentTarget.closest("details")!.open = false; void openBalanceRule(row.id); }}><Wallet size={14} />余额设置</button>
              </div>
            </details>
          </div>
          {ruleEditorId === row.id ? <form className="provider-card__rule" onSubmit={(event) => {
            event.preventDefault(); void saveBalanceRule(row.id, balanceRule);
          }}>
            <p>设置余额查询接口，使用此供应商已保存的 API Key。</p>
            <label className="provider-field">查询地址（HTTPS）<input type="url" required value={balanceRule.url}
              onChange={(event) => setBalanceRule({ ...balanceRule, url: event.target.value })} /></label>
            <div className="provider-fields-grid">
              <label className="provider-field">请求方式<select value={balanceRule.method}
                onChange={(event) => setBalanceRule({ ...balanceRule, method: event.target.value as "GET" | "POST" })}>
                <option value="GET">GET</option><option value="POST">POST</option></select></label>
              <label className="provider-field">数值类型<select value={balanceRule.kind}
                onChange={(event) => setBalanceRule({ ...balanceRule, kind: event.target.value as "money" | "quota",
                  unit: event.target.value === "money" ? "CNY" : "次" })}>
                <option value="money">余额</option><option value="quota">剩余额度</option></select></label>
            </div>
            <div className="provider-fields-grid">
              <label className="provider-field">JSON 数值字段<input required value={balanceRule.valuePath}
                placeholder="data.balance" onChange={(event) => setBalanceRule({ ...balanceRule, valuePath: event.target.value })} /></label>
              <label className="provider-field">{balanceRule.kind === "money" ? "币种（如 CNY）" : "单位"}<input required
                value={balanceRule.unit} onChange={(event) => setBalanceRule({ ...balanceRule, unit: event.target.value })} /></label>
            </div>
            <div className="provider-card__rule-actions"><button type="submit" className="provider-button provider-button--primary"
              disabled={ruleBusy}>{ruleBusy ? "保存中…" : "保存查询设置"}</button>
              {savedRule ? <button type="button" className="provider-button" disabled={ruleBusy}
                onClick={() => void saveBalanceRule(row.id, null)}>恢复默认</button> : null}
              <button type="button" className="provider-button provider-button--quiet"
                onClick={closeBalanceRule}>取消</button></div>
          </form> : null}
        </article>;
      })}</div> : null}
    </div>
  </section>;
}
