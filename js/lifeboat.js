  function buildLifeboatExport() {
    const data = loadData();
    return {
      format: "MeriMark Lifeboat",
      version: 1,
      exported_at: new Date().toISOString(),
      entries: data.active
    };
  }

  async function exportAll() {
    const data = loadData();
    if (!data.active.length) {
      showToast("没有可导出的记录");
      return;
    }
    const text = JSON.stringify(buildLifeboatExport(), null, 2);
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (error) {
        console.warn("Clipboard API failed, falling back to execCommand", error);
      }
    }
    if (!copied) {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try { copied = document.execCommand("copy"); } catch (error) { copied = false; }
      textArea.remove();
    }
    showToast(copied ? `已复制 ${data.active.length} 条记录` : "复制失败，请稍后重试");
  }

  function isLifeboatDataEmpty(data) {
    const active = Array.isArray(data && data.active) ? data.active : [];
    const recycle = Array.isArray(data && data.recycle) ? data.recycle : [];
    return active.length === 0 && recycle.length === 0;
  }

  function updateLifeboatDangerState() {
    const clearButton = document.getElementById("btnClearAll");
    const importButton = document.getElementById("btnImportBackup");
    const data = loadData();
    const hasContent = !isLifeboatDataEmpty(data);

    if (clearButton) {
      clearButton.disabled = !hasContent;
      clearButton.setAttribute("aria-disabled", hasContent ? "false" : "true");
    }
    if (importButton) {
      importButton.disabled = hasContent;
      importButton.setAttribute("aria-disabled", hasContent ? "true" : "false");
      importButton.title = hasContent ? "当前已有本地数据，禁止覆盖导入" : "";
    }
  }
  window.updateLifeboatDangerState = updateLifeboatDangerState;

  function setImportBackupStatus(message, kind) {
    const status = document.getElementById("importBackupStatus");
    if (!status) return;
    status.textContent = message || "";
    status.classList.remove("error", "ok");
    if (kind) status.classList.add(kind);
  }

  function validateLifeboatBackup(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      return { ok: false, error: "JSON 无法解析，请确认粘贴了完整的导出内容。" };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "备份顶层格式不正确。" };
    }
    if (parsed.format !== "MeriMark Lifeboat") {
      return { ok: false, error: "这不是 MeriMark Lifeboat 导出的备份。" };
    }
    if (parsed.version !== 1) {
      return { ok: false, error: "备份版本不受支持；当前只接受 version: 1。" };
    }
    if (!Array.isArray(parsed.entries)) {
      return { ok: false, error: "备份缺少 entries 数组。" };
    }
    if (parsed.entries.length === 0) {
      return { ok: false, error: "备份中没有可恢复的记录。" };
    }

    const allowedTypes = new Set(["日记", "任务", "便条"]);
    const seenIds = new Set();
    const entries = [];

    for (let index = 0; index < parsed.entries.length; index++) {
      const item = parsed.entries[index];
      const label = `第 ${index + 1} 条记录`;

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: `${label}不是有效对象。` };
      }
      if (!Number.isSafeInteger(item.id) || item.id <= 0) {
        return { ok: false, error: `${label}的 id 无效。` };
      }
      if (seenIds.has(item.id)) {
        return { ok: false, error: `${label}与前面的记录 id 重复。` };
      }
      if (!allowedTypes.has(item.type)) {
        return { ok: false, error: `${label}的类型无效。` };
      }
      if (typeof item.content !== "string" || item.content.trim().length === 0) {
        return { ok: false, error: `${label}的正文为空或格式无效。` };
      }
      if (typeof item.created_at !== "string" || Number.isNaN(Date.parse(item.created_at))) {
        return { ok: false, error: `${label}的创建时间无效。` };
      }

      seenIds.add(item.id);
      entries.push({
        id: item.id,
        type: item.type,
        content: item.content,
        created_at: item.created_at
      });
    }

    return { ok: true, entries };
  }

  function showImportBackup() {
    const data = loadData();
    if (!isLifeboatDataEmpty(data)) {
      showToast("当前已有本地数据，为避免覆盖已禁止导入");
      updateLifeboatDangerState();
      return;
    }

    hideLifeboatMenu();
    const modal = document.getElementById("importBackupModal");
    const textarea = document.getElementById("importBackupTextarea");
    if (!modal || !textarea) return;

    textarea.value = "";
    setImportBackupStatus("", null);
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => textarea.focus(), 120);
  }

  function hideImportBackup() {
    const modal = document.getElementById("importBackupModal");
    const textarea = document.getElementById("importBackupTextarea");
    if (textarea) textarea.blur();
    if (modal) {
      modal.classList.remove("active");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function performImportBackup(entries) {
    const current = loadData();
    if (!isLifeboatDataEmpty(current)) {
      showToast("导入已取消：当前本地数据不再为空");
      updateLifeboatDangerState();
      return;
    }

    const restored = {
      active: entries.map((item) => ({ ...item })),
      recycle: []
    };

    saveData(restored);
    updateButtonLayout();
    updateWordCount();
    updateLifeboatDangerState();
    if (window.refreshAllScrollbars) window.refreshAllScrollbars();
    showToast(`已恢复 ${restored.active.length} 条记录`);
  }

  function prepareImportBackup() {
    const textarea = document.getElementById("importBackupTextarea");
    if (!textarea) return;

    if (!isLifeboatDataEmpty(loadData())) {
      setImportBackupStatus("当前已有本地数据，不能覆盖导入。", "error");
      updateLifeboatDangerState();
      return;
    }

    const rawText = textarea.value.trim();
    if (!rawText) {
      setImportBackupStatus("请先粘贴 Safari 中导出的 JSON。", "error");
      return;
    }

    const validation = validateLifeboatBackup(rawText);
    if (!validation.ok) {
      setImportBackupStatus(validation.error, "error");
      return;
    }

    setImportBackupStatus(`校验通过：${validation.entries.length} 条记录。`, "ok");
    hideImportBackup();
    showConfirm(
      "确认恢复备份",
      `即将向当前空的救生圈恢复 ${validation.entries.length} 条记录。\n恢复前会再次确认本地仍为空，不会覆盖已有数据。`,
      () => performImportBackup(validation.entries),
      showImportBackup
    );
  }

  function showLifeboatMenu() {
    updateLifeboatDangerState();
    const mask = document.getElementById("lifeboatMenuMask");
    const menu = document.getElementById("lifeboatMenu");
    if (!mask || !menu) return;
    mask.classList.add("active");
    menu.classList.add("active");
    menu.setAttribute("aria-hidden", "false");
  }

  function hideLifeboatMenu() {
    const mask = document.getElementById("lifeboatMenuMask");
    const menu = document.getElementById("lifeboatMenu");
    if (mask) mask.classList.remove("active");
    if (menu) {
      menu.classList.remove("active");
      menu.setAttribute("aria-hidden", "true");
    }
  }

  function performLifeboatClear() {
    localStorage.setItem("daily_notes_cache", JSON.stringify({ active: [], recycle: [] }));
    if (editingId !== null || document.getElementById("inputArea").value) _performCancel();
    renderList();
    updateLifeboatDangerState();
    showToast("救生圈数据已清空");
  }

  function clearAllLifeboatData() {
    const data = loadData();
    if (!data.active.length) {
      updateLifeboatDangerState();
      return;
    }

    hideLifeboatMenu();
    showConfirm(
      "清空全部记录",
      "这会永久删除救生圈中保存的全部内容。\n请先确认已经完成导出。",
      () => {
        const randomArray = new Uint32Array(1);
        crypto.getRandomValues(randomArray);
        const code = String(100 + (randomArray[0] % 900));
        showCodeConfirm(
          "最后确认",
          "这是不可撤销操作。请输入下面的三位确认码。",
          code,
          performLifeboatClear
        );
      }
    );
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideLifeboatMenu();
      hideImportBackup();
    }
  });

  updateLifeboatDangerState();
