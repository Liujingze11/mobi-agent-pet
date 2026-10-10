# Mobi 三款角色

`concepts-2026-10-09.png` 保留经用户确认的 A / B / C 形象概念。用户要求三款全部创建，并在应用中提供选择。

- A：圆角方头。
- B：圆头。
- C：扁方头。

运行时使用独立制作的 SVG，位于 `runtime/clawd/themes/mobi-a`、`mobi-b`、`mobi-c`，每款包含 20 个普通状态和 9 个迷你状态。概念图仅作为源资料，不进入运行时包。

从应用目录重新生成：

```sh
node scripts/generate-mobi-themes.cjs
```

修改图形时编辑生成器，再重新生成三个主题。主题通过现有主题加载器发现，保留用户原来的主题选择。
