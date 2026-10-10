import { useRef } from "react";
import { Monitor, Terminal } from "lucide-react";
import type { ProviderScope } from "./types";

// Brand artwork copied from pinned CC Switch. MIT notice in THIRD_PARTY_NOTICES.md.
const claudeIcon = new URL("./assets/claude.svg", import.meta.url).href;
const openaiIcon = new URL("./assets/openai.svg", import.meta.url).href;
const AGENTS = [
  { id: "claude", label: "Claude Code", icon: claudeIcon, badge: Terminal, title: "Claude Code · CLI" },
  { id: "claude-desktop", label: "Claude Desktop", icon: claudeIcon, badge: Monitor, title: "Claude 桌面应用" },
  { id: "codex", label: "OpenAI", icon: openaiIcon, badge: null, title: "OpenAI 桌面应用 · Codex 本地配置" },
] as const;

export function ProviderAgentTabs({ appId, onSelect }: {
  appId: ProviderScope;
  onSelect(id: ProviderScope): void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  return <div className="provider-page__tabs" role="tablist" aria-label="选择 Agent">
    {AGENTS.map(({ id, label, icon, badge: Badge, title }, index) => <button key={id} id={`provider-tab-${id}`}
      type="button" role="tab" aria-selected={id === appId} aria-controls="provider-agent-panel"
      tabIndex={id === appId ? 0 : -1} ref={(node) => { buttons.current[index] = node; }} title={title}
      className={id === appId ? "provider-page__tab is-selected" : "provider-page__tab"}
      onClick={() => onSelect(id)} onKeyDown={(event) => {
        const target = event.key === "ArrowRight" ? (index + 1) % AGENTS.length
          : event.key === "ArrowLeft" ? (index + AGENTS.length - 1) % AGENTS.length
            : event.key === "Home" ? 0 : event.key === "End" ? AGENTS.length - 1 : null;
        if (target === null) return;
        event.preventDefault();
        onSelect(AGENTS[target].id);
        buttons.current[target]?.focus();
      }}>
      <span className="provider-agent-glyph" aria-hidden="true"><img src={icon} alt="" />
        {Badge ? <span className="provider-agent-glyph__badge"><Badge size={9} strokeWidth={2.3} /></span> : null}
      </span><span>{label}</span>
    </button>)}
  </div>;
}
