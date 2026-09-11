  function resetModalCodeField() {
    const codeField = document.getElementById("modalCodeField");
    const codeInput = document.getElementById("modalCodeInput");
    const confirmButton = document.getElementById("modalBtnConfirm");
    if (codeField) codeField.hidden = true;
    if (codeInput) {
      codeInput.value = "";
      codeInput.classList.remove("code-match");
      codeInput.oninput = null;
      codeInput.onkeydown = null;
    }
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.classList.remove("modal-btn-danger");
    }
  }

  function showConfirm(title, message, onConfirm, onCancel) {
    const modal = document.getElementById("customModal");
    const confirmButton = document.getElementById("modalBtnConfirm");
    const cancelButton = document.getElementById("modalBtnCancel");
    resetModalCodeField();
    cancelButton.style.display = "block";
    confirmButton.innerText = "确定";
    document.getElementById("modalTitle").innerText = title;
    document.getElementById("modalMessage").innerText = message;
    updateConfirmBtnColor(confirmButton);
    confirmButton.onclick = () => { hideModal(); if (onConfirm) onConfirm(); };
    cancelButton.onclick = () => { hideModal(); if (onCancel) onCancel(); };
    modal.classList.add("active");
  }

  function showCodeConfirm(title, message, code, onConfirm, onCancel) {
    const modal = document.getElementById("customModal");
    const codeField = document.getElementById("modalCodeField");
    const codeValue = document.getElementById("modalCodeValue");
    const codeInput = document.getElementById("modalCodeInput");
    const confirmButton = document.getElementById("modalBtnConfirm");
    const cancelButton = document.getElementById("modalBtnCancel");

    resetModalCodeField();
    document.getElementById("modalTitle").innerText = title;
    document.getElementById("modalMessage").innerText = message;
    codeValue.innerText = code;
    codeField.hidden = false;
    cancelButton.style.display = "block";
    confirmButton.innerText = "永久清除";
    confirmButton.disabled = true;
    confirmButton.classList.add("modal-btn-danger");
    confirmButton.style.backgroundColor = "";

    const refreshState = () => {
      codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 3);
      const matched = codeInput.value === code;
      confirmButton.disabled = !matched;
      codeInput.classList.toggle("code-match", matched);
    };

    codeInput.oninput = refreshState;
    codeInput.onkeydown = (event) => {
      if (event.key === "Enter" && !confirmButton.disabled) {
        event.preventDefault();
        confirmButton.click();
      }
    };
    confirmButton.onclick = () => {
      if (confirmButton.disabled) return;
      hideModal();
      if (onConfirm) onConfirm();
    };
    cancelButton.onclick = () => { hideModal(); if (onCancel) onCancel(); };

    modal.classList.add("active");
    setTimeout(() => codeInput.focus(), 120);
  }

  function updateConfirmBtnColor(button) {
    const colors = { "便条": "var(--color-note)", "任务": "var(--color-task)", "日记": "var(--color-diary)" };
    button.style.backgroundColor = colors[currentType] || colors["日记"];
  }

  function hideModal() {
    document.getElementById("customModal").classList.remove("active");
    resetModalCodeField();
  }

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
