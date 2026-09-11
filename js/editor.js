  function setMode(type) {
    currentType = type;
    document.querySelectorAll(".mode-option").forEach((element) => {
      element.classList.toggle("active", element.getAttribute("data-type") === type);
    });
    const wrapper = document.getElementById("editorWrapper");
    wrapper.classList.remove("theme-diary", "theme-note", "theme-task");
    const settings = {
      "日记": ["theme-diary", "保存日记", "🛟 MeriMark 应急救生圈\n仅在主 PWA 无法使用时记录日记…"],
      "任务": ["theme-task", "保存任务", "🛟 MeriMark 应急救生圈\n仅在主 PWA 无法使用时记录任务…"],
      "便条": ["theme-note", "保存便条", "🛟 MeriMark 应急救生圈\n仅在主 PWA 无法使用时记录便条…"],
    }[type] || ["theme-note", "保存便条", "🛟 MeriMark 应急救生圈\n仅在主 PWA 无法使用时记录内容…"];
    wrapper.classList.add(settings[0]);

    const themePalettes = {
      "日记": { main: "var(--color-diary)", dim: "rgba(52, 152, 219, 0.28)", bright: "rgba(52, 152, 219, 0.95)", track: "rgba(52, 152, 219, 0.05)" },
      "便条": { main: "var(--color-note)", dim: "rgba(26, 188, 156, 0.28)", bright: "rgba(26, 188, 156, 0.95)", track: "rgba(26, 188, 156, 0.05)" },
      "任务": { main: "var(--color-task)", dim: "rgba(155, 89, 182, 0.28)", bright: "rgba(155, 89, 182, 0.95)", track: "rgba(155, 89, 182, 0.05)" },
    };
    const currentPalette = themePalettes[type] || themePalettes["日记"];
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--current-theme", currentPalette.main);
    rootStyle.setProperty("--current-theme-dim", currentPalette.dim);
    rootStyle.setProperty("--current-theme-bright", currentPalette.bright);
    rootStyle.setProperty("--current-theme-track", currentPalette.track);

    document.getElementById("btnSave").innerText = editingId ? "保存修改" : settings[1];
    document.getElementById("inputArea").placeholder = settings[2];
    renderList();
    if (window.refreshAllScrollbars) window.refreshAllScrollbars();
  }

  document.getElementById("modeSwitch").addEventListener("click", (event) => {
    if (event.target.classList.contains("mode-option")) setMode(event.target.getAttribute("data-type"));
  });

  function loadData() {
    const raw = localStorage.getItem("daily_notes_cache");
    return raw ? JSON.parse(raw) : { active: [], recycle: [] };
  }

  function saveData(data) {
    localStorage.setItem("daily_notes_cache", JSON.stringify(data));
    renderList();
  }

  function saveNote() {
    let text = document.getElementById("inputArea").value.trim();
    if (!(text = formatMarkdown(text))) return;
    const data = loadData();
    if (editingId) {
      const note = data.active.find((item) => item.id === editingId);
      if (note) { note.content = text; note.type = currentType; showToast("已修改"); }
      _performCancel();
    } else {
      data.active.unshift({ id: Date.now(), type: currentType, content: text, created_at: new Date().toISOString() });
      document.getElementById("inputArea").value = "";
      showToast("已保存到手机");
      updateButtonLayout();
      updateWordCount();
      if (window.refreshAllScrollbars) window.refreshAllScrollbars();
    }
    saveData(data);
  }

  function autoSaveBeforeUpdate() {
    const input = document.getElementById("inputArea");
    let text = input.value.trim();
    if (!(text = formatMarkdown(text))) return;
    const data = loadData();
    if (editingId) {
      const note = data.active.find((item) => item.id === editingId);
      if (note) { note.content = text; note.type = currentType; }
    } else {
      data.active.unshift({ id: Date.now(), type: currentType, content: text, created_at: new Date().toISOString() });
    }
    saveData(data);
    input.value = "";
  }

  function updateWordCount() {
    const input = document.getElementById("inputArea");
    document.getElementById("wordCountBar").innerText = "字数: " + input.value.length;
  }

  function startEdit(id) {
    if (document.getElementById("contextMask").classList.contains("active")) return;
    const note = loadData().active.find((item) => item.id === id);
    if (!note) return;
    editingId = id;
    originalContent = note.content;
    const input = document.getElementById("inputArea");
    input.value = note.content;
    activateEditorViewport();
    setMode(note.type);
    document.getElementById("btnSave").innerText = "保存修改";
    updateButtonLayout();
    updateWordCount();
    void document.getElementById("editorWrapper").offsetHeight;
    input.scrollTop = input.scrollHeight;
    try { input.focus({ preventScroll: true }); } catch (error) { input.focus(); }
    requestAnimationFrame(() => {
      input.scrollTop = input.scrollHeight;
      if (window.refreshAllScrollbars) window.refreshAllScrollbars();
    });
  }

  function cancelEdit() {
    const value = document.getElementById("inputArea").value;
    const dirty = editingId ? value !== originalContent : value.trim().length > 0;
    if (dirty) showConfirm("取消编辑", "确定要放弃当前的修改吗？\n未保存的内容将丢失。", _performCancel);
    else _performCancel();
  }

  function _performCancel() {
    editingId = null;
    originalContent = "";
    document.getElementById("inputArea").value = "";
    setMode(currentType);
    updateButtonLayout();
    updateWordCount();
    if (window.refreshAllScrollbars) window.refreshAllScrollbars();
  }

  function updateButtonLayout() {
    const input = document.getElementById("inputArea");
    const showEditTools = input.value.length > 0 || editingId !== null;
    const btnSave = document.getElementById("btnSave");
    const btnCancel = document.getElementById("btnCancel");
    const btnSync = document.getElementById("btnSync");
    const btnMore = document.getElementById("btnMore");
    btnSave.style.display = showEditTools ? "" : "none";
    btnCancel.style.display = showEditTools ? "block" : "none";
    btnSync.style.display = showEditTools ? "none" : "";
    if (btnMore) btnMore.style.display = showEditTools ? "none" : "";
    if (!showEditTools) {
      const count = loadData().active.length;
      btnSync.innerText = count ? `导出 (${count})` : "导出";
      btnSync.classList.toggle("disabled", !count);
    }
    if (window.updateLifeboatDangerState) window.updateLifeboatDangerState();
  }