import type { ProviderDraft } from "../types";

export function validateProviderDraft(draft: ProviderDraft) {
  const fieldErrors: Record<string, string> = {};
  if (!draft.name.trim()) fieldErrors.name = "请输入名称";
  if (draft.name.length > 200) fieldErrors.name = "名称过长";
  if (draft.websiteUrl) {
    try {
      const url = new URL(draft.websiteUrl);
      if (!(["https:", "http:"].includes(url.protocol))) fieldErrors.websiteUrl = "网址格式不正确";
    } catch { fieldErrors.websiteUrl = "网址格式不正确"; }
  }
  if (!draft.settingsConfig || typeof draft.settingsConfig !== "object" || Array.isArray(draft.settingsConfig)) {
    fieldErrors.settingsConfig = "配置需要是 JSON 对象";
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}
