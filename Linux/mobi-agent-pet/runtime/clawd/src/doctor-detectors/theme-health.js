"use strict";

const { validateThemeShape, getDefaultThemeId, getThemeMetadata } = require("../theme-loader");

function checkThemeHealth(options = {}) {
  const prefs = options.prefs || {};
  const defaultThemeId = getDefaultThemeId();
  const themeId = options.themeId || prefs.theme || defaultThemeId;
  const variantMap = prefs.themeVariant || {};
  const variant = options.variant || variantMap[themeId] || "default";
  const overrides = options.overrides !== undefined
    ? options.overrides
    : (prefs.themeOverrides && prefs.themeOverrides[themeId]) || null;
  const validate = options.validateThemeShape || validateThemeShape;
  const result = validate(themeId, { variant, overrides });

  if (!result.ok) {
    return {
      id: "theme-health",
      status: "fail",
      level: "warning",
      detail: result.errors.join("; "),
      textHint: `Open Settings -> Theme and switch to the default '${(getThemeMetadata(defaultThemeId) || {}).name || defaultThemeId}' theme.`,
      themeId,
      variant,
      result,
    };
  }

  return {
    id: "theme-health",
    status: "pass",
    level: null,
    detail: `${themeId} (${result.resolvedVariant || variant}) validated`,
    themeId,
    variant,
    result,
  };
}

module.exports = { checkThemeHealth };
