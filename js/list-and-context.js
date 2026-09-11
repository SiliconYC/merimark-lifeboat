  function deleteNote(event, id) {
    event.stopPropagation();
    showConfirm("删除确认", "确定要删除这条记录吗？\n删除后无法恢复。", () => {
      if (id === editingId) _performCancel();
      const data = loadData();
      data.active = data.active.filter((note) => note.id !== id);
      saveData(data);
    });
  }

  function actionDuplicate() {
    if (!contextTargetId) return;
    const data = loadData();
    const sourceNote = data.active.find((note) => note.id === contextTargetId);
    if (!sourceNote) return;
    const newId = Date.now();
    data.active.unshift({ id: newId, type: sourceNote.type, content: sourceNote.content, created_at: new Date().toISOString() });
    saveData(data);
    hideContextMenu();
    showToast("已创建副本");
    startEdit(newId);
  }

  function actionCopyClipboard() {
    if (!contextTargetId) return;
    const sourceNote = loadData().active.find((note) => note.id === contextTargetId);
    if (!sourceNote || !sourceNote.content) { hideContextMenu(); showToast("内容为空"); return; }
    const text = sourceNote.content;
    navigator.clipboard.writeText(text).then(() => {
      hideContextMenu();
      showToast("已复制");
    }).catch((error) => {
      console.error("Clipboard API failed", error);
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      hideContextMenu();
      showToast("已复制");
    });
  }

  function showContextMenu(liElement, id) {
    if (navigator.vibrate) navigator.vibrate(50);
    contextTargetId = id;
    const rect = liElement.getBoundingClientRect();
    const menu = document.getElementById("contextMenu");
    menu.style.display = "flex";
    const menuWidth = 190;
    const menuHeight = 100;
    let top = rect.top - menuHeight;
    const left = rect.left + rect.width / 2 - menuWidth / 2;
    if (top < 60) {
      top = rect.bottom + 12;
      menu.classList.add("pointing-up");
    } else {
      top = rect.top - menuHeight + 10;
      menu.classList.remove("pointing-up");
    }
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    menu.style.display = "";
    document.getElementById("contextMask").classList.add("active");
    liElement.classList.add("highlight-on-mask");
    menu.classList.add("active");
  }

  function hideContextMenu() {
    document.getElementById("contextMask").classList.remove("active");
    document.getElementById("contextMenu").classList.remove("active");
    document.querySelectorAll("li.highlight-on-mask").forEach((element) => element.classList.remove("highlight-on-mask"));
    contextTargetId = null;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast-notification toast-animate-in";
    toast.innerText = message;
    toast.addEventListener("animationend", (event) => {
      if (event.animationName === "toast-enter") {
        toast.style.opacity = 1;
        toast.style.transform = "translate(-50%, 0)";
      }
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove("toast-animate-in");
      void toast.offsetWidth;
      toast.classList.add("toast-animate-out");
      setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 500);
    }, 2000);
  }

  function renderList() {
    const data = loadData();
    const list = document.getElementById("noteList");
    list.innerHTML = "";
    const counts = { "日记": 0, "便条": 0, "任务": 0 };
    const totalChars = data.active.reduce((total, note) => {
      if (note.content) total += note.content.length;
      if (counts[note.type] !== undefined) counts[note.type]++;
      return total;
    }, 0);
    document.getElementById("statDiary").innerText = "日记: " + counts["日记"];
    document.getElementById("statNote").innerText = "便条: " + counts["便条"];
    document.getElementById("statTask").innerText = "任务: " + counts["任务"];
    document.getElementById("statTotalChars").innerText = totalChars + "字";
    ["statDiary", "statNote", "statTask"].forEach((id) => document.getElementById(id).className = "");
    const highlightId = { "日记": "statDiary", "便条": "statNote", "任务": "statTask" }[currentType];
    if (highlightId) document.getElementById(highlightId).className = "highlight-" + { "statDiary": "diary", "statNote": "note", "statTask": "task" }[highlightId];

    data.active.filter((note) => note.type === currentType).forEach((note) => {
      const li = document.createElement("li");
      li.setAttribute("data-type", note.type);
      li.setAttribute("data-id", note.id);
      if (note.id === editingId) li.classList.add("editing");
      li.addEventListener("touchstart", () => {
        isScrolling = false;
        longPressTimer = setTimeout(() => { if (!isScrolling) showContextMenu(li, note.id); }, 600);
      });
      li.addEventListener("touchmove", () => { isScrolling = true; clearTimeout(longPressTimer); });
      li.addEventListener("touchend", () => clearTimeout(longPressTimer));
      li.addEventListener("contextmenu", (event) => { event.preventDefault(); return false; });
      li.onclick = () => startEdit(note.id);
      const preview = note.content.replace(/\n/g, " ").substring(0, 50);
      let timeLabel = "";
      try {
        const created = new Date(note.created_at);
        const today = new Date();
        const isToday = created.getDate() === today.getDate() && created.getMonth() === today.getMonth();
        timeLabel = isToday ? `${String(created.getHours()).padStart(2, "0")}:${String(created.getMinutes()).padStart(2, "0")}` : `${created.getMonth() + 1}-${created.getDate()}`;
      } catch (error) { console.warn("无法格式化条目时间", error); }
      li.innerHTML = `<div><strong>[${timeLabel}]</strong> ${preview}</div><button class="btn-del" onclick="deleteNote(event, ${note.id})">✕</button>`;
      list.appendChild(li);
    });
    updateButtonLayout();
    if (window.refreshAllScrollbars) window.refreshAllScrollbars();
  }
