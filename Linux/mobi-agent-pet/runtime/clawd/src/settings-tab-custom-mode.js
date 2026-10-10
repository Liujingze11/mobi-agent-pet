"use strict";
(function(root) {
  const model = root.MobiCustomModeProfile;
  const BOOL_FIELDS = [
    ['petVisible', '显示桌宠', 'Show pet'], ['trayAlerts', '托盘提醒', 'Tray alerts'],
    ['agentBubbles', 'Agent 气泡', 'Agent bubbles'],
    ['sessionHud', '任务提示', 'Session HUD'], ['hudStateLabels', '状态标签', 'State labels'],
    ['hudElapsed', '运行时间', 'Elapsed time'], ['hudContext', '上下文用量', 'Context usage'], ['hudQuota', '额度提示', 'Quota indicator'],
    ['lowPowerIdle', '空闲省电', 'Low power while idle'],
    ['keepAwake', '工作时保持唤醒', 'Keep awake while working'], ['allowEdgePinning', '允许贴边', 'Allow edge pinning'],
    ['keepSizeAcrossDisplays', '跨屏保持大小', 'Keep size across displays'], ['miniModeEnabled', '允许迷你显示', 'Allow mini display'],
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
        intro.textContent = label('前三种模式使用固定规则。此处只编辑第四种模式，保存不会切换当前模式。空闲必须保留；其他未启用状态回到空闲。', 'The first three modes use fixed rules. Edit only the fourth mode here; saving does not switch modes. Idle is required; disabled states fall back to idle.');
        const form = document.createElement('form'); form.className = 'custom-mode-form';
        const message = document.createElement('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
        parent.append(heading, intro, form, message);
        function draw() {
          form.replaceChildren();
          function row(text, input) {
            const wrap = document.createElement('label'); wrap.className = 'custom-mode-row';
            const copy = document.createElement('span'); copy.textContent = text; wrap.append(copy, input); form.append(wrap);
          }
          for (const [key, zh, en] of BOOL_FIELDS) {
            const input = document.createElement('input'); input.type = 'checkbox'; input.checked = draft[key]; input.dataset.customModeField = key;
            input.addEventListener('change', () => { draft[key] = input.checked; dirty = true; }); row(label(zh, en), input);
          }
          const states = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = label('桌宠状态', 'Pet states'); states.append(legend);
          model.PET_STATE_IDS.forEach((state, index) => {
            const wrap = document.createElement('label'); wrap.className = 'custom-mode-state';
            const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.customModeState = state;
            input.checked = draft.states.includes(state); input.disabled = state === 'idle';
            input.addEventListener('change', () => { draft.states = model.PET_STATE_IDS.filter(id => id === state ? input.checked : draft.states.includes(id)); dirty = true; });
            wrap.append(input, document.createTextNode(label(STATES[index], state))); states.append(wrap);
          }); form.append(states);
          for (const [key, zh, en, min, max] of NUMBERS) {
            const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = '1'; input.value = draft[key]; input.required = true; input.dataset.customModeField = key;
            input.addEventListener('input', () => { draft[key] = Number(input.value); dirty = true; }); row(label(zh, en), input);
          }
          const roamHint = document.createElement('p'); roamHint.className = 'subtitle';
          roamHint.textContent = label('漫游间隔从进入空闲或上次漫游结束后开始计时。空闲动作需要更久时会继续等待；未启用漫游状态时不会移动。', 'The interval starts when entering idle or when the previous walk ends. Longer idle playback takes priority. Roaming must be enabled in the state list.');
          form.append(roamHint);
          const approval = document.createElement('select'); approval.dataset.customModeField = 'permissionAutomationMode';
          [['off', '手动审批', 'Manual approval'], ['auto-tools', '自动批准工具', 'Auto approve tools'], ['unattended', '无人值守', 'Unattended']].forEach(([value, zh, en]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = label(zh, en); approval.append(option);
          }); approval.value = draft.permissionAutomationMode;
          approval.addEventListener('change', () => { draft.permissionAutomationMode = approval.value; dirty = true; }); row(label('审批方式', 'Approval mode'), approval);
          const save = document.createElement('button'); save.type = 'submit'; save.className = 'soft-btn accent'; save.dataset.customModeSave = ''; save.textContent = label('保存', 'Save');
          const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'soft-btn'; reset.textContent = label('恢复默认配置', 'Reset draft');
          reset.addEventListener('click', () => { draft = model.defaultCustomModeProfile(); dirty = true; draw(); }); form.append(save, reset);
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
            draft = model.normalizeCustomModeProfile(config.profile); message.textContent = ''; draw();
          }).catch(error => { if (id === renderId) message.textContent = error.message; });
        }
      },
    };
  }
  root.ClawdSettingsTabCustomMode = {init};
})(globalThis);
