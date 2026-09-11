  function showConfirm(title, message, onConfirm, onCancel) {
    const modal = document.getElementById("customModal");
    const confirmButton = document.getElementById("modalBtnConfirm");
    const cancelButton = document.getElementById("modalBtnCancel");
    cancelButton.style.display = "block";
    confirmButton.innerText = "确定";
    document.getElementById("modalTitle").innerText = title;
    document.getElementById("modalMessage").innerText = message;
    updateConfirmBtnColor(confirmButton);
    confirmButton.onclick = () => { hideModal(); if (onConfirm) onConfirm(); };
    cancelButton.onclick = () => { hideModal(); if (onCancel) onCancel(); };
    modal.classList.add("active");
  }

  function updateConfirmBtnColor(button) {
    const colors = { "便条": "var(--color-note)", "任务": "var(--color-task)", "日记": "var(--color-diary)" };
    button.style.backgroundColor = colors[currentType] || colors["日记"];
  }

  function hideModal() { document.getElementById("customModal").classList.remove("active"); }

  function showLogModal(title, logText) {
    document.getElementById("logModalTitle").innerText = title;
    document.getElementById("logModalTextarea").value = logText;
    document.getElementById("logModal").classList.add("active");
  }

  function hideLogModal() { document.getElementById("logModal").classList.remove("active"); }

  function copyLog() {
    const textarea = document.getElementById("logModalTextarea");
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    try {
      document.execCommand("copy");
      showToast("日志已复制");
    } catch (error) {
      console.warn("日志复制失败", error);
      showToast("复制失败，请手动长按日志进行复制");
    }
  }

  setMode("日记");
  updateButtonLayout();
  updateWordCount();
