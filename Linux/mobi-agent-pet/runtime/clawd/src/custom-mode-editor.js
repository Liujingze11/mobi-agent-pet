"use strict";
(function(root) {
  const model = root.MobiCustomModeProfile;
  const BOOL_FIELDS = [
    ['petVisible', '显示桌宠', 'Show pet'], ['trayAlerts', '托盘图标提醒', 'Tray icon alerts'],
    ['agentBubbles', '桌面通知与审批', 'Desktop notices and approvals'],
    ['sessionHud', '桌宠任务卡片', 'Pet task cards'], ['hudStateLabels', '状态标签', 'State labels'],
    ['hudContext', '上下文用量', 'Context usage'], ['hudQuota', '账号额度环', 'Account quota rings'],
    ['keepAwake', '任务期间防止电脑休眠', 'Prevent sleep during tasks'],
    ['keepSizeAcrossDisplays', '跨屏保持大小', 'Keep size across displays'],
    ['fullscreenOverlay', '全屏应用上显示桌宠', 'Show pet over fullscreen apps'],
  ];
  const STATES = ['空闲', '漫游', '工作', '等待', '完成', '错误', '提起'];
  const NUMBERS = [
    ['roamIntervalSeconds', '漫游间隔（秒）', 'Roaming interval (seconds)', 10, 3600],
    ['notificationSeconds', '通知气泡秒数', 'Notification bubble seconds', 1, 3600],
    ['permissionSeconds', '审批气泡秒数（0 为不自动关闭）', 'Permission bubble seconds (0 keeps open)', 0, 3600],
    ['flashIntervalMs', '托盘闪烁间隔（毫秒）', 'Tray flash interval (ms)', 200, 2000],
    ['flashDurationMs', '托盘闪烁时长（0 为持续）', 'Tray flash duration (0 until dismissed)', 0, 60000],
  ];
  const PRIMARY_KEYS = ['petVisible', 'trayAlerts', 'agentBubbles', 'permissionAutomationMode', 'sessionHud'];
  const PRESETS = [['normal', '常规模式', 'Normal'], ['background', '后台模式', 'Background'], ['automatic', '完全访问模式', 'Full Access']];
  const SECONDARY_GROUPS = [
    ['pet', '状态与漫游', 'States and roaming', ['states', 'roamIntervalSeconds']],
    ['alerts', '气泡与闪烁', 'Bubble and flash timing', ['notificationSeconds', 'permissionSeconds', 'flashIntervalMs', 'flashDurationMs']],
    ['cards', '卡片与额度', 'Cards and quota', ['hudStateLabels', 'hudContext', 'hudQuota']],
    ['window', '电脑与窗口', 'Computer and window', ['keepAwake', 'keepSizeAcrossDisplays', 'fullscreenOverlay']],
  ];
  // Images are cropped captures of the real application; values are examples.
  const HELP = {
    trayAlerts: {
      text: ['屏幕顶部的应用图标会通过颜色和闪烁提示工作、待审批、错误和完成。关闭后，托盘图标仍保留。', 'The app icon in the system tray uses color and flashing to signal work, pending approval, errors and completion. Turning this off keeps the tray icon.'],
      images: [['tray-bar.png', '屏幕顶部的蓝色环形图标（Linux 示例）', 'The blue ring icon in the top bar (Linux example)', 'tray']],
    },
    agentBubbles: {
      text: ['屏幕右下角的卡片，用于显示 Agent 通知，以及需要你批准或选择的请求。卡片按 Agent 配色。', 'Cards in the bottom-right corner show Agent notices and requests for approval or a choice. Colors identify the Agent.'],
      images: [['agent-bubble.png', 'Codex 审批卡片：批准或拒绝', 'Codex approval card: approve or deny']],
    },
    sessionHud: {
      text: ['双击桌宠，显示当前任务及状态；可显示上下文用量。未固定时，5 秒后、点击外部或拖动桌宠会收起。', 'Double-click the pet to see its task, status and optional context usage. Unless pinned, the card closes after 5 seconds, an outside click or a pet drag.'],
      images: [['pet-overlays.png', '任务卡片位于桌宠附近', 'The task card sits near the pet'], ['task-card.png', '任务名称、工作状态和上下文用量', 'Task name, working status and context usage']],
    },
    hudQuota: {
      text: ['桌宠旁的圆环显示 Agent 账号已使用的额度，越满越接近用完。它与任务的上下文用量不同，也不是 API 账户余额；仅在 Agent 提供额度数据时显示。', 'Rings beside the pet show used account quota: fuller rings mean less quota remains. This differs from task context usage and API credit balance. Rings appear only when an Agent reports quota data.'],
      images: [['pet-overlays.png', '桌宠左侧的额度环，与下方任务卡片分开显示', 'Quota rings beside the pet, separate from the task card'], ['quota-ring.png', '额度环细节：示例为 7 天额度已用 41%', 'Quota detail: example shows 41% used in a 7-day window', 'quota']],
    },
    keepAwake: {
      text: ['Agent 工作或等待操作时，暂时防止电脑自动休眠；任务结束后恢复。屏幕仍可自动关闭，不会唤醒已休眠的电脑。', 'While an Agent works or waits for input, this temporarily prevents automatic computer sleep. Normal sleep resumes after the task. The screen can still turn off; this does not wake a sleeping computer.'],
      images: [['keep-awake.png', '开启这个开关，任务期间防止自动休眠', 'Turn on this switch to prevent sleep during tasks'], ['task-card.png', '有进行中的任务时生效', 'Applies while a task is in progress']],
    },
    permissionAutomationMode: {
      text: ['处理本应用能接管的审批请求，不更改 Agent 自身的权限配置。', 'Handles supported requests received by this app without changing the Agent’s own permission settings.'],
      items: [
        ['手动审批：工具、问题与计划由你确认。', 'Manual: you confirm tools, questions and plans.'],
        ['自动批准工具：工具自动批准，问题与计划仍由你确认。', 'Auto tools: tools are approved automatically; you still confirm questions and plans.'],
        ['完全访问：工具与计划自动批准；问题优先选明确推荐项，否则交给 AI 决定。', 'Full Access: tools and plans are approved automatically. Questions use explicit recommendations, or ask the AI to decide.'],
      ],
      images: [['approval-modes.png', '审批方式的三个选项', 'The three approval options']],
    },
    hudContext: {
      text: ['任务卡片右侧的百分比，表示当前会话已占用的上下文空间。图中 80% 表示已用 80%；与账号额度环分别统计，仅在 Agent 提供数据时显示。', 'The percentage on the task card shows how much of this conversation’s context space is used. Here, 80% means 80% used. It is separate from account quota and appears only when the Agent reports data.'],
      images: [['task-card.png', '任务卡片右侧的 80% 是上下文用量', 'The 80% on the right is context usage']],
    },
    pet: {
      text: ['开关控制桌宠能显示哪些状态，空闲始终保留。关闭其他状态后，会用可用状态显示。漫游间隔是两次漫游之间的最短等待时间（秒），仅开启漫游时生效。', 'These switches control which pet states can be shown; Idle always stays available. Disabled states fall back to an available state. The roaming interval is the minimum pause between trips, in seconds, and applies only when Roam is enabled.'],
      images: [['states-roaming.png', '七种状态与漫游间隔在同一模块', 'Seven states and the roaming interval share this module']],
    },
    alerts: {
      text: ['这里控制气泡停留时间，以及任务完成时的托盘闪烁。', 'Controls bubble duration and tray flashing when a task finishes.'],
      items: [
        ['气泡时长用秒；闪烁间隔与时长用毫秒。1000 毫秒 = 1 秒。', 'Bubble times use seconds; flash times use milliseconds. 1000 ms = 1 second.'],
        ['审批气泡填 0：不自动关闭。', 'Permission bubble time 0: does not close automatically.'],
        ['托盘闪烁时长填 0：任务完成后持续闪烁，直到查看。', 'Tray flash duration 0: completion flashing continues until acknowledged.'],
      ],
      images: [['bubble-flash-timing.png', '气泡与闪烁的四项时间设置', 'The four bubble and flash timing settings']],
    },
    keepSizeAcrossDisplays: {
      text: ['使用按屏幕比例缩放时，开启后将桌宠移到另一块屏幕，会保持原来的大小；关闭后按目标屏幕重新计算大小。固定像素尺寸不受这个开关影响。', 'When sizing the pet as a screen proportion, turning this on preserves its current size on another display. Turning it off recalculates the size for the destination display. Fixed pixel sizes are unaffected.'],
      images: [['cross-display-size.png', '跨屏保持大小开关', 'The keep-size-across-displays switch']],
    },
  };
  function init(core) {
    let draft = null, dirty = false, saving = false, renderId = 0, redrawCurrent = null, currentForm = null, closeHelp = null, selectedPreset = null;
    const expandedSections = new Set();
    function rememberExpanded(form) {
      for (const panel of form?.querySelectorAll('details[data-custom-mode-section]') || []) {
        if (panel.open) expandedSections.add(panel.dataset.customModeSection);
        else expandedSections.delete(panel.dataset.customModeSection);
      }
    }
    const cn = () => /^zh/.test(core.state.snapshot?.lang || 'en');
    const label = (zh, en) => cn() ? zh : en;
    core.tabs['custom-mode'] = {
      patchInPlace(changes) {
        if (Object.hasOwn(changes, 'lang')) return false;
        if (Object.hasOwn(changes, 'customModeProfile') && !dirty) { draft = model.normalizeCustomModeProfile(changes.customModeProfile); selectedPreset = null; return false; }
        return true;
      },
      render(parent) {
        closeHelp?.();
        rememberExpanded(currentForm);
        const id = ++renderId;
        const heading = document.createElement('h1'); heading.textContent = label('编辑自定义模式', 'Edit Custom Mode');
        const intro = document.createElement('p'); intro.className = 'subtitle';
        intro.textContent = label('套用模式设置，修改后保存为自定义模式。', 'Use a mode as a starting point, then save your changes as Custom.');
        const form = document.createElement('form'); form.className = 'custom-mode-form';
        const message = document.createElement('p'); message.className = 'custom-mode-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
        currentForm = form;
        form.addEventListener('invalid', event => {
          const panel = event.target.closest('details');
          if (panel) panel.open = true;
        }, true);
        parent.append(heading, intro, form, message);
        function showHelp(key, title, trigger) {
          closeHelp?.();
          const topic = HELP[key];
          const dialog = document.createElement('dialog'); dialog.className = 'custom-mode-help-dialog'; dialog.dataset.customModeHelpTopic = key;
          dialog.setAttribute('aria-labelledby', 'custom-mode-help-title');
          const header = document.createElement('div'); header.className = 'custom-mode-help-header';
          const heading = document.createElement('h2'); heading.id = 'custom-mode-help-title'; heading.textContent = title;
          const close = document.createElement('button'); close.type = 'button'; close.className = 'custom-mode-help-close'; close.textContent = '×'; close.setAttribute('aria-label', label('关闭说明', 'Close help'));
          header.append(heading, close);
          const content = document.createElement('div'); content.className = 'custom-mode-help-content';
          const description = document.createElement('p'); description.textContent = label(...topic.text); content.append(description);
          if (topic.items) {
            const list = document.createElement('ul');
            for (const item of topic.items) { const line = document.createElement('li'); line.textContent = label(...item); list.append(line); }
            content.append(list);
          }
          for (const [file, zh, en, kind] of topic.images) {
            const figure = document.createElement('figure'); if (kind) figure.className = 'help-image-' + kind;
            const img = document.createElement('img'); img.src = '../assets/help/' + file; img.alt = label(zh, en); img.decoding = 'async';
            const caption = document.createElement('figcaption'); caption.textContent = img.alt;
            figure.append(img, caption); content.append(figure);
          }
          const note = document.createElement('small'); note.className = 'custom-mode-help-note'; note.textContent = label('真实应用截图 · 任务和数值为示例', 'Real app screenshots · example tasks and values'); content.append(note);
          dialog.append(header, content); parent.append(dialog);
          const dismiss = () => { if (closeHelp === dismiss) closeHelp = null; dialog.remove(); if (trigger.isConnected) trigger.focus(); };
          closeHelp = dismiss;
          close.addEventListener('click', dismiss);
          dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
          dialog.addEventListener('close', dismiss);
          dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } });
          dialog.addEventListener('click', event => { if (event.target === dialog) dismiss(); });
          if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
          close.focus();
        }
        function draw() {
          closeHelp?.();
          rememberExpanded(form);
          form.replaceChildren();
          const presets = document.createElement('div'); presets.className = 'custom-mode-presets';
          const group = document.createElement('div'); group.className = 'custom-mode-preset-group'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', label('套用模式设置', 'Use mode settings'));
          for (const [mode, zh, en] of PRESETS) {
            const button = document.createElement('button'); button.type = 'button'; button.dataset.customModePreset = mode; button.textContent = label(zh, en);
            button.setAttribute('aria-pressed', String(selectedPreset === mode)); button.title = label('套用配置，不切换当前模式', 'Use these settings without switching the active mode');
            button.addEventListener('click', () => {
              draft = model.builtInModeProfile(mode); selectedPreset = mode; dirty = true; message.textContent = ''; draw();
              form.querySelector('[data-custom-mode-preset="' + mode + '"]')?.focus();
            }); group.append(button);
          }
          const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'soft-btn'; reset.dataset.customModeReset = ''; reset.textContent = label('重置', 'Reset');
          reset.addEventListener('click', () => {
            draft = model.defaultCustomModeProfile(); selectedPreset = null; dirty = true; message.textContent = ''; draw();
            form.querySelector('[data-custom-mode-reset]')?.focus();
          });
          presets.append(group, reset); form.append(presets);
          const body = document.createElement('div'); body.className = 'custom-mode-body'; form.append(body);
          function addHelp(parent, key, text) {
            if (!HELP[key]) return;
            const help = document.createElement('button'); help.type = 'button'; help.className = 'custom-mode-help-button'; help.dataset.customModeHelp = key;
            help.textContent = '?'; help.setAttribute('aria-label', label('了解', 'About ') + text); help.setAttribute('aria-haspopup', 'dialog');
            help.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); showHelp(key, text, help); }); parent.append(help);
          }
          function row(parent, text, control) {
            const wrap = document.createElement('div'); wrap.className = 'custom-mode-row';
            const input = control.matches('input, select') ? control : control.querySelector('input');
            input.id = 'custom-mode-' + input.dataset.customModeField;
            const copy = document.createElement('span'); copy.className = 'custom-mode-label';
            const caption = document.createElement('label'); caption.htmlFor = input.id; caption.textContent = text; copy.append(caption);
            const key = input.dataset.customModeField;
            addHelp(copy, key, text);
            wrap.append(copy, control); parent.append(wrap);
          }
          function switchControl(input, text) {
            input.setAttribute('role', 'switch'); input.setAttribute('aria-label', text);
            const control = document.createElement('span'); control.className = 'custom-mode-switch';
            const track = document.createElement('span'); track.className = 'custom-mode-switch-track'; track.setAttribute('aria-hidden', 'true');
            control.append(input, track); return control;
          }
          function renderFields(card, keys) {
            for (const key of keys) {
              const bool = BOOL_FIELDS.find(field => field[0] === key);
              const number = NUMBERS.find(field => field[0] === key);
              if (bool) {
                const text = label(bool[1], bool[2]);
                const input = document.createElement('input'); input.type = 'checkbox'; input.checked = draft[key]; input.dataset.customModeField = key;
                input.addEventListener('change', () => { draft[key] = input.checked; dirty = true; }); row(card, text, switchControl(input, text));
              } else if (key === 'states') {
                const states = document.createElement('fieldset'); states.className = 'custom-mode-states';
                const legend = document.createElement('legend'); legend.textContent = label('允许的状态', 'Available states'); states.append(legend);
                model.PET_STATE_IDS.forEach((state, index) => {
                  const text = label(STATES[index], state);
                  const wrap = document.createElement('label'); wrap.className = 'custom-mode-state';
                  const copy = document.createElement('span'); copy.textContent = text;
                  const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.customModeState = state;
                  input.checked = draft.states.includes(state); input.disabled = state === 'idle';
                  input.addEventListener('change', () => { draft.states = model.PET_STATE_IDS.filter(id => id === state ? input.checked : draft.states.includes(id)); dirty = true; });
                  wrap.append(copy, switchControl(input, text)); states.append(wrap);
                }); card.append(states);
              } else if (number) {
                const [, zh, en, min, max] = number;
                const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = '1'; input.value = draft[key]; input.required = true; input.dataset.customModeField = key;
                input.addEventListener('input', () => { draft[key] = Number(input.value); dirty = true; }); row(card, label(zh, en), input);
              } else if (key === 'permissionAutomationMode') {
                const approval = document.createElement('select'); approval.dataset.customModeField = key;
                [['off', '手动审批', 'Manual approval'], ['auto-tools', '自动批准工具', 'Auto approve tools'], ['unattended', '完全访问', 'Full Access']].forEach(([value, zh, en]) => {
                  const option = document.createElement('option'); option.value = value; option.textContent = label(zh, en); approval.append(option);
                }); approval.value = draft[key];
                approval.addEventListener('change', () => { draft[key] = approval.value; dirty = true; }); row(card, label('审批方式', 'Approval mode'), approval);
              }
            }
          }
          function section(zh, en, parent = body, helpKey = null) {
            const wrap = document.createElement('section'); wrap.className = 'custom-mode-section';
            const title = document.createElement('h2'); title.textContent = label(zh, en);
            addHelp(title, helpKey, label(zh, en));
            const card = document.createElement('div'); card.className = 'custom-mode-card';
            wrap.append(title, card); parent.append(wrap); return card;
          }
          renderFields(section('主要功能', 'Main features'), PRIMARY_KEYS);
          function collapsible(key, zh, en) {
            const panel = document.createElement('details'); panel.className = 'custom-mode-details'; panel.dataset.customModeSection = key;
            panel.open = expandedSections.has(key);
            const summary = document.createElement('summary'); summary.textContent = label(zh, en);
            addHelp(summary, key, label(zh, en));
            const contents = document.createElement('div'); contents.className = 'custom-mode-detail-content';
            panel.append(summary, contents); body.append(panel);
            panel.addEventListener('toggle', () => {
              if (!panel.isConnected) return;
              if (panel.open) expandedSections.add(key); else expandedSections.delete(key);
            });
            return contents;
          }
          const contents = collapsible('more', '更多设置', 'More settings');
          for (const [key, zh, en, fields] of SECONDARY_GROUPS) {
            const card = section(zh, en, contents, key); card.parentElement.dataset.customModeGroup = key;
            renderFields(card, fields);
          }
          const actions = document.createElement('div'); actions.className = 'custom-mode-actions';
          const save = document.createElement('button'); save.type = 'submit'; save.className = 'soft-btn accent'; save.dataset.customModeSave = ''; save.textContent = label('保存', 'Save');
          actions.append(save); form.append(actions);
          if (saving) [...form.elements].forEach(control => {control.disabled = true;});
        }
        redrawCurrent = () => { if (parent.isConnected && id === renderId) draw(); };
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (saving) return; const error = model.validateCustomModeProfile(draft);
          if (error) { message.textContent = error; return; }
          saving = true;
          const profile = model.normalizeCustomModeProfile(draft);
          const disabled = [...form.elements].map(control => [control, control.disabled]); disabled.forEach(([control]) => { control.disabled = true; });
          try {
            let result = await window.settingsAPI.saveCustomMode(profile);
            if (result?.status === 'confirmation-required') {
              const choice = await core.helpers.showSettingsConfirmModal({
                title: label('启用自动审批？', 'Enable automatic approval?'),
                detail: label(profile.permissionAutomationMode === 'auto-tools' ? '工具请求（包括终端命令和文件写入）将自动批准，问题与计划仍由你确认。' : '工具请求将自动批准，问题和计划将自动处理。仅在信任当前 Agent 时启用。', profile.permissionAutomationMode === 'auto-tools' ? 'Tool requests, including shell commands and file writes, will be approved automatically. Questions and plans still wait for you.' : 'Tool requests will be approved, and questions and plans handled automatically. Enable only for agents you trust.'),
                actions: [{id:'cancel', label:label('取消', 'Cancel'), defaultFocus:true}, {id:'confirm', label:label('启用', 'Enable'), tone:'danger'}],
              });
              if (choice !== 'confirm') return;
              result = await window.settingsAPI.saveCustomMode(profile, {confirmed:true});
            }
            if (result?.status !== 'ok') throw new Error(result?.message || label('保存失败', 'Save failed'));
            dirty = false; draft = model.normalizeCustomModeProfile(result.profile || profile);
            message.textContent = label('已保存自定义模式', 'Custom mode saved');
          } catch (error) { if (id === renderId) message.textContent = error.message; }
          finally { saving = false; if (id === renderId) disabled.forEach(([control, wasDisabled]) => { control.disabled = wasDisabled; }); else redrawCurrent?.(); }
        });
        if (draft) draw();
        else {
          message.textContent = label('加载中…', 'Loading…');
          window.settingsAPI.getModeConfig().then(config => {
            if (id !== renderId || !parent.isConnected) return;
            draft = model.normalizeCustomModeProfile(config.profile);
            if (config.lang) { core.state.snapshot = {...core.state.snapshot, lang:config.lang}; core.ops?.requestRender?.({content:true}); }
            message.textContent = ''; draw();
          }).catch(error => { if (id === renderId) message.textContent = error.message; });
        }
      },
    };
  }
  root.MobiCustomModeEditor = {init};
})(globalThis);
