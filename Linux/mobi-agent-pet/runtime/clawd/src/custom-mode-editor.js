"use strict";
(function(root) {
  const model = root.MobiCustomModeProfile;
  const BOOL_FIELDS = [
    ['petVisible', '显示桌宠', 'Show pet'], ['trayAlerts', '托盘提醒', 'Tray alerts'],
    ['agentBubbles', 'Agent 气泡', 'Agent bubbles'],
    ['sessionHud', '任务卡片', 'Task cards'], ['hudStateLabels', '状态标签', 'State labels'],
    ['hudContext', '上下文用量', 'Context usage'], ['hudQuota', '额度提示', 'Quota indicator'],
    ['keepAwake', '工作时保持唤醒', 'Keep awake while working'],
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
  const GROUPS = [
    ['桌宠显示', 'Pet display', ['petVisible', 'states', 'roamIntervalSeconds']],
    ['提醒与审批', 'Alerts and approvals', ['trayAlerts', 'flashIntervalMs', 'flashDurationMs', 'agentBubbles', 'notificationSeconds', 'permissionSeconds', 'permissionAutomationMode']],
    ['任务卡片', 'Task cards', ['sessionHud', 'hudStateLabels', 'hudContext', 'hudQuota']],
    ['保持唤醒', 'Keep awake', ['keepAwake']],
    ['窗口行为', 'Window behavior', ['keepSizeAcrossDisplays', 'fullscreenOverlay']],
  ];
  function init(core) {
    let draft = null, dirty = false, saving = false, renderId = 0, redrawCurrent = null;
    const cn = () => /^zh/.test(core.state.snapshot?.lang || 'en');
    const label = (zh, en) => cn() ? zh : en;
    core.tabs['custom-mode'] = {
      patchInPlace(changes) {
        if (Object.hasOwn(changes, 'lang')) return false;
        if (Object.hasOwn(changes, 'customModeProfile') && !dirty) { draft = model.normalizeCustomModeProfile(changes.customModeProfile); return false; }
        return true;
      },
      render(parent) {
        const id = ++renderId;
        const heading = document.createElement('h1'); heading.textContent = label('编辑自定义模式', 'Edit Custom Mode');
        const intro = document.createElement('p'); intro.className = 'subtitle';
        intro.textContent = label('仅影响自定义模式，保存不会切换模式。', 'Only affects Custom mode. Saving does not switch modes.');
        const form = document.createElement('form'); form.className = 'custom-mode-form';
        const message = document.createElement('p'); message.className = 'custom-mode-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
        parent.append(heading, intro, form, message);
        function draw() {
          form.replaceChildren();
          const body = document.createElement('div'); body.className = 'custom-mode-body'; form.append(body);
          function row(parent, text, control) {
            const wrap = document.createElement('label'); wrap.className = 'custom-mode-row';
            const copy = document.createElement('span'); copy.textContent = text; wrap.append(copy, control); parent.append(wrap);
          }
          function switchControl(input, text) {
            input.setAttribute('role', 'switch'); input.setAttribute('aria-label', text);
            const control = document.createElement('span'); control.className = 'custom-mode-switch';
            const track = document.createElement('span'); track.className = 'custom-mode-switch-track'; track.setAttribute('aria-hidden', 'true');
            control.append(input, track); return control;
          }
          for (const [zhTitle, enTitle, keys] of GROUPS) {
            const section = document.createElement('section'); section.className = 'custom-mode-section';
            const title = document.createElement('h2'); title.textContent = label(zhTitle, enTitle);
            const card = document.createElement('div'); card.className = 'custom-mode-card'; section.append(title, card); body.append(section);
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
                  if (state === 'idle') { const fixed = document.createElement('small'); fixed.textContent = label('必选', 'Required'); copy.append(' ', fixed); }
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
                [['off', '手动审批', 'Manual approval'], ['auto-tools', '自动批准工具', 'Auto approve tools'], ['unattended', '无人值守', 'Unattended']].forEach(([value, zh, en]) => {
                  const option = document.createElement('option'); option.value = value; option.textContent = label(zh, en); approval.append(option);
                }); approval.value = draft[key];
                approval.addEventListener('change', () => { draft[key] = approval.value; dirty = true; }); row(card, label('审批方式', 'Approval mode'), approval);
              }
            }
          }
          const actions = document.createElement('div'); actions.className = 'custom-mode-actions';
          const save = document.createElement('button'); save.type = 'submit'; save.className = 'soft-btn accent'; save.dataset.customModeSave = ''; save.textContent = label('保存', 'Save');
          const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'soft-btn'; reset.dataset.customModeReset = ''; reset.textContent = label('恢复默认', 'Reset');
          reset.addEventListener('click', () => { draft = model.defaultCustomModeProfile(); dirty = true; draw(); }); actions.append(reset, save); form.append(actions);
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
