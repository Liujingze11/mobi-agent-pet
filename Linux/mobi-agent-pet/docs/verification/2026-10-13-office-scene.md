# 宠物概览办公场景

采用用户确认的侧后方视角，屏幕内容可见，周围三位同事在各自工位上工作。莫比/莫莫/比比切换后都可成为主角。

按后续布局反馈，动画等比例铺满整个模块，轻微裁掉素材四周留白；状态浮在左上，以深色文字和细白色描边保证可读，去掉磨砂底板、边框和阴影。根据最新反馈，去掉画面上的角色名，只为辅助技术保留动态名称。概览上方左侧与配额区宽度比例改为 1.65:1，高度由 266px 增至 330–420px；小窗口动画区高度为 280–380px。保持人物和电脑的比例与动作对齐。根据最新背景反馈，移除概览上方共用的浅蓝色外框，办公室和额度各自成为独立圆角背景块，桌面尺寸下间隔 18px，小窗口上下排列时保留 12px 间隔。

主角动作仅包含敲键盘、用鼠标、偷偷看手机、喝咖啡。工作时敲键盘保持 35 秒，用鼠标保持 24 秒；空闲时在鼠标与手机之间缓慢切换。等待或完成时触发一次 5 秒的咖啡动作，结束后放下杯子并使用鼠标，持续相同状态不会重复喝；两次咖啡至少间隔 120 秒。状态稳定 2 秒才接受变化，当前动作至少保持 8 秒，减少状态抖动导致的突变。

办公室同事使用独立、错开的四帧轻量动作。离开概览、窗口隐藏或系统启用减少动态效果时停止动画计时；自定义宠物缺图时显示内置主角。

验证：64 个相关 Node 测试通过；隔离 Electron 验证实际 renderer，检查素材加载、铺满且不变形、状态浮层、角色名无可见标签且保留无障碍名称、模块占比、四个动作、咖啡结束、状态变化、角色切换、隐藏暂停、720px 小窗口布局及控制台错误。截图在 `office-scene/`。浏览器动画预览使用生产组件与模拟状态，不读取或修改真实 Agent 会话。

源素材和 ImageGen 提示词：`runtime/clawd/assets/source/dashboard-office/`。运行素材：`runtime/clawd/assets/dashboard-office/`。设计核对见项目根目录 `design-qa.md`。

复验：

```sh
node --test runtime/clawd/test/dashboard*.test.js runtime/clawd/test/session-renderer-behavior.test.js
env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron --no-sandbox --ozone-platform=x11 scripts/verify-office-scene.cjs
```

动画预览：`node scripts/preview-office.cjs`，地址 `http://127.0.0.1:4176/`。
