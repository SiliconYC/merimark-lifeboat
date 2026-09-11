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

  function updateLifeboatDangerState() {
    const clearButton = document.getElementById("btnClearAll");
    if (!clearButton) return;
    const hasContent = loadData().active.length > 0;
    clearButton.disabled = !hasContent;
    clearButton.setAttribute("aria-disabled", hasContent ? "false" : "true");
  }
  window.updateLifeboatDangerState = updateLifeboatDangerState;

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
        const input = window.prompt(`第二次确认：请输入随机数字 ${code}`);
        if (input === null) return;
        if (input.trim() !== code) {
          showToast("数字不匹配，未清除");
          return;
        }
        localStorage.setItem("daily_notes_cache", JSON.stringify({ active: [], recycle: [] }));
        if (editingId !== null || document.getElementById("inputArea").value) _performCancel();
        renderList();
        updateLifeboatDangerState();
        showToast("救生圈数据已清空");
      }
    );
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideLifeboatMenu();
  });

  updateLifeboatDangerState();
