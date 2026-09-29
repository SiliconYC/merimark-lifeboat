(function setupDraftSafety() {
  const DRAFT_STORAGE_KEY = "daily_notes_drafts_v1";
  const baseRenderList = renderList;
  const baseIsLifeboatDataEmpty = isLifeboatDataEmpty;
  const basePerformLifeboatClear = performLifeboatClear;

  function emptyDraftState() {
    return { newDraft: null, edits: {}, activeSession: null };
  }

  function loadDraftState() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return emptyDraftState();
      const parsed = JSON.parse(raw);
      return {
        newDraft: parsed && parsed.newDraft && typeof parsed.newDraft === "object" ? parsed.newDraft : null,
        edits: parsed && parsed.edits && typeof parsed.edits === "object" ? parsed.edits : {},
        activeSession: parsed && parsed.activeSession && typeof parsed.activeSession === "object" ? parsed.activeSession : null,
      };
    } catch (error) {
      console.warn("草稿状态读取失败，已按空草稿处理：", error);
      return emptyDraftState();
    }
  }

  function saveDraftState(state) {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      newDraft: state.newDraft || null,
      edits: state.edits || {},
      activeSession: state.activeSession || null,
    }));
  }

  function getSavedNote(id) {
    return loadData().active.find((item) => item.id === id) || null;
  }

  function hasPendingDrafts() {
    const state = loadDraftState();
    return Boolean(state.newDraft) || Object.keys(state.edits || {}).length > 0;
  }
  window.hasPendingDrafts = hasPendingDrafts;

  function persistCurrentSession() {
    const input = document.getElementById("inputArea");
    if (!input) return;

    const state = loadDraftState();
    const now = new Date().toISOString();

    if (editingId !== null) {
      const note = getSavedNote(editingId);
      if (!note) {
        delete state.edits[String(editingId)];
        if (state.activeSession && state.activeSession.kind === "edit" && state.activeSession.id === editingId) {
          state.activeSession = null;
        }
        saveDraftState(state);
        return;
      }

      const changed = input.value !== note.content || currentType !== note.type;
      if (changed) {
        state.edits[String(editingId)] = {
          id: editingId,
          type: currentType,
          content: input.value,
          updated_at: now,
        };
        state.activeSession = { kind: "edit", id: editingId };
      } else {
        delete state.edits[String(editingId)];
        if (state.activeSession && state.activeSession.kind === "edit" && state.activeSession.id === editingId) {
          state.activeSession = null;
        }
      }
      saveDraftState(state);
      return;
    }

    if (input.value.length > 0) {
      const existing = state.newDraft;
      state.newDraft = {
        type: currentType,
        content: input.value,
        created_at: existing && existing.created_at ? existing.created_at : now,
        updated_at: now,
      };
      state.activeSession = { kind: "new" };
    } else if (state.activeSession && state.activeSession.kind === "new") {
      state.newDraft = null;
      state.activeSession = null;
    }
    saveDraftState(state);
  }

  function refreshEditorUi() {
    updateButtonLayout();
    updateWordCount();
    if (window.refreshAllScrollbars) window.refreshAllScrollbars();
  }

  function clearEditorVisual() {
    editingId = null;
    originalContent = "";
    document.getElementById("inputArea").value = "";
    setMode(currentType);
    refreshEditorUi();
  }

  function startNewDraft(skipPersist) {
    if (!skipPersist) persistCurrentSession();

    const state = loadDraftState();
    const draft = state.newDraft;
    if (!draft) {
      editingId = null;
      originalContent = "";
      document.getElementById("inputArea").value = "";
      state.activeSession = null;
      saveDraftState(state);
      setMode(currentType);
      refreshEditorUi();
      return;
    }

    editingId = null;
    originalContent = "";
    const input = document.getElementById("inputArea");
    input.value = typeof draft.content === "string" ? draft.content : "";
    state.activeSession = { kind: "new" };
    saveDraftState(state);
    activateEditorViewport();
    setMode(draft.type || "日记");
    refreshEditorUi();
    void document.getElementById("editorWrapper").offsetHeight;
    input.scrollTop = input.scrollHeight;
    try { input.focus({ preventScroll: true }); } catch (error) { input.focus(); }
    requestAnimationFrame(() => {
      input.scrollTop = input.scrollHeight;
      if (window.refreshAllScrollbars) window.refreshAllScrollbars();
    });
  }
  window.startNewDraft = startNewDraft;

  startEdit = function draftSafeStartEdit(id, skipPersist) {
    if (document.getElementById("contextMask").classList.contains("active")) return;
    if (!skipPersist) persistCurrentSession();

    const note = getSavedNote(id);
    if (!note) return;

    const state = loadDraftState();
    const draft = state.edits[String(id)] || null;
    editingId = id;
    originalContent = note.content;

    const input = document.getElementById("inputArea");
    input.value = draft && typeof draft.content === "string" ? draft.content : note.content;

    if (draft) state.activeSession = { kind: "edit", id: id };
    else state.activeSession = null;
    saveDraftState(state);

    activateEditorViewport();
    setMode(draft && draft.type ? draft.type : note.type);
    document.getElementById("btnSave").innerText = "保存修改";
    refreshEditorUi();
    void document.getElementById("editorWrapper").offsetHeight;
    input.scrollTop = input.scrollHeight;
    try { input.focus({ preventScroll: true }); } catch (error) { input.focus(); }
    requestAnimationFrame(() => {
      input.scrollTop = input.scrollHeight;
      if (window.refreshAllScrollbars) window.refreshAllScrollbars();
    });
  };

  saveNote = function draftSafeSaveNote() {
    const input = document.getElementById("inputArea");
    let text = input.value.trim();
    if (!(text = formatMarkdown(text))) return;

    const data = loadData();
    const state = loadDraftState();

    if (editingId !== null) {
      const savedId = editingId;
      const note = data.active.find((item) => item.id === savedId);
      if (!note) return;

      note.content = text;
      note.type = currentType;
      delete state.edits[String(savedId)];
      state.activeSession = null;
      saveDraftState(state);

      editingId = null;
      originalContent = "";
      input.value = "";
      saveData(data);
      showToast("已修改");

      const latestState = loadDraftState();
      if (latestState.newDraft) startNewDraft(true);
      else {
        setMode(currentType);
        refreshEditorUi();
      }
      return;
    }

    const createdAt = state.newDraft && state.newDraft.created_at
      ? state.newDraft.created_at
      : new Date().toISOString();

    data.active.unshift({
      id: Date.now(),
      type: currentType,
      content: text,
      created_at: createdAt,
    });

    state.newDraft = null;
    state.activeSession = null;
    saveDraftState(state);

    input.value = "";
    saveData(data);
    showToast("已保存到手机");
    refreshEditorUi();
  };

  cancelEdit = function draftSafeCancelEdit() {
    const value = document.getElementById("inputArea").value;
    let dirty = value.trim().length > 0;

    if (editingId !== null) {
      const note = getSavedNote(editingId);
      dirty = !note || value !== note.content || currentType !== note.type;
    }

    if (dirty) {
      showConfirm("取消编辑", "确定要放弃当前的修改吗？\n未保存的内容将丢失。", _performCancel);
    } else {
      _performCancel();
    }
  };

  _performCancel = function draftSafePerformCancel() {
    const state = loadDraftState();
    const wasEditing = editingId !== null;

    if (editingId !== null) {
      delete state.edits[String(editingId)];
    } else {
      state.newDraft = null;
    }
    state.activeSession = null;
    saveDraftState(state);

    editingId = null;
    originalContent = "";
    document.getElementById("inputArea").value = "";

    if (wasEditing && state.newDraft) {
      startNewDraft(true);
      return;
    }

    setMode(currentType);
    refreshEditorUi();
  };

  deleteNote = function draftSafeDeleteNote(event, id) {
    event.stopPropagation();
    showConfirm("删除确认", "确定要删除这条记录吗？\n删除后无法恢复。", () => {
      if (id === editingId) _performCancel();

      const state = loadDraftState();
      delete state.edits[String(id)];
      if (state.activeSession && state.activeSession.kind === "edit" && state.activeSession.id === id) {
        state.activeSession = null;
      }
      saveDraftState(state);

      const data = loadData();
      data.active = data.active.filter((note) => note.id !== id);
      saveData(data);
    });
  };

  function discardNewDraft(event) {
    if (event) event.stopPropagation();
    showConfirm("删除草稿", "确定要删除这条未保存草稿吗？\n删除后无法恢复。", () => {
      const state = loadDraftState();
      state.newDraft = null;
      if (state.activeSession && state.activeSession.kind === "new") state.activeSession = null;
      saveDraftState(state);

      if (editingId === null) {
        originalContent = "";
        document.getElementById("inputArea").value = "";
        setMode(currentType);
        refreshEditorUi();
      } else {
        renderList();
      }
    });
  }
  window.discardNewDraft = discardNewDraft;

  function getTimeLabel(createdAt) {
    try {
      const created = new Date(createdAt);
      const today = new Date();
      const isToday = created.getDate() === today.getDate()
        && created.getMonth() === today.getMonth()
        && created.getFullYear() === today.getFullYear();
      return isToday
        ? String(created.getHours()).padStart(2, "0") + ":" + String(created.getMinutes()).padStart(2, "0")
        : (created.getMonth() + 1) + "-" + created.getDate();
    } catch (error) {
      return "";
    }
  }

  renderList = function draftSafeRenderList() {
    baseRenderList();

    const state = loadDraftState();
    const list = document.getElementById("noteList");
    if (!list) return;

    Object.keys(state.edits || {}).forEach((id) => {
      const item = list.querySelector('li[data-id="' + id + '"]');
      if (!item) return;
      item.setAttribute("data-has-draft", "true");
      item.title = "存在未保存修改";
      const content = item.querySelector("div");
      if (content && !content.querySelector(".draft-safety-badge")) {
        const badge = document.createElement("span");
        badge.className = "draft-safety-badge";
        badge.textContent = "【未保存】";
        content.insertBefore(badge, content.firstChild);
      }
    });

    const draft = state.newDraft;
    if (!draft || draft.type !== currentType) {
      if (window.refreshAllScrollbars) window.refreshAllScrollbars();
      return;
    }

    const li = document.createElement("li");
    li.setAttribute("data-type", draft.type);
    li.setAttribute("data-id", "draft-new");
    li.setAttribute("data-has-draft", "true");
    if (state.activeSession && state.activeSession.kind === "new" && editingId === null) {
      li.classList.add("editing");
    }
    li.onclick = () => startNewDraft(false);

    const body = document.createElement("div");
    const time = document.createElement("strong");
    time.textContent = "[" + getTimeLabel(draft.created_at) + "] ";
    const badge = document.createElement("span");
    badge.className = "draft-safety-badge";
    badge.textContent = "【草稿】";
    const preview = document.createTextNode(
      String(draft.content || "").replace(/\n/g, " ").substring(0, 50)
    );
    body.appendChild(time);
    body.appendChild(badge);
    body.appendChild(preview);

    const del = document.createElement("button");
    del.className = "btn-del";
    del.textContent = "✕";
    del.onclick = discardNewDraft;

    li.appendChild(body);
    li.appendChild(del);
    list.insertBefore(li, list.firstChild);

    if (window.refreshAllScrollbars) window.refreshAllScrollbars();
  };

  isLifeboatDataEmpty = function draftAwareLifeboatEmpty(data) {
    return baseIsLifeboatDataEmpty(data) && !hasPendingDrafts();
  };

  performLifeboatClear = function draftAwareClearAll() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    basePerformLifeboatClear();
  };

  const input = document.getElementById("inputArea");
  input.addEventListener("input", persistCurrentSession);
  window.addEventListener("pagehide", persistCurrentSession);
  window.addEventListener("beforeunload", persistCurrentSession);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistCurrentSession();
  });

  document.getElementById("modeSwitch").addEventListener("click", (event) => {
    if (!event.target.classList.contains("mode-option")) return;
    setTimeout(() => {
      persistCurrentSession();
      renderList();
    }, 0);
  });

  function restorePendingDraft() {
    const state = loadDraftState();

    if (state.activeSession && state.activeSession.kind === "new" && state.newDraft) {
      startNewDraft(true);
      return;
    }

    if (state.activeSession && state.activeSession.kind === "edit") {
      const id = Number(state.activeSession.id);
      if (Number.isSafeInteger(id) && state.edits[String(id)] && getSavedNote(id)) {
        startEdit(id, true);
        return;
      }
    }

    if (state.newDraft) {
      startNewDraft(true);
      return;
    }

    const pendingEdits = Object.values(state.edits || {})
      .filter((item) => item && Number.isSafeInteger(Number(item.id)) && getSavedNote(Number(item.id)))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

    if (pendingEdits.length) {
      startEdit(Number(pendingEdits[0].id), true);
      return;
    }

    renderList();
    if (window.updateLifeboatDangerState) window.updateLifeboatDangerState();
  }

  restorePendingDraft();
})();