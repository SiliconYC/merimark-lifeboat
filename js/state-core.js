  let currentType = "日记";
  let editingId = null;
  let originalContent = "";
  let contextTargetId = null;
  let longPressTimer = null;
  let isScrolling = false;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "daily-note-offline-shell-ready") {
        localStorage.setItem("daily_note_offline_shell", "ready");
      }
    });

    window.addEventListener("load", () => {
      if (navigator.onLine) {
        navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
          .then(() => navigator.serviceWorker.ready)
          .then(() => localStorage.setItem("daily_note_offline_shell", "ready"))
          .catch((err) => {
            localStorage.removeItem("daily_note_offline_shell");
            console.warn("Service Worker 注册失败，当前页面继续以本地数据运行：", err);
          });
      }
    });
  }

  const ta = document.getElementById("inputArea");
  let activateEditorViewport = () => {};

  (function setupEditorViewport() {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    let viewportFrame = null;
    let blurTimer = null;
    let caretCenterTimer = null;
    let caretScrollFrame = null;
    let largestViewportHeight = visualViewport ? visualViewport.height : window.innerHeight;

    const stopCaretScroll = () => {
      if (caretCenterTimer !== null) clearTimeout(caretCenterTimer);
      caretCenterTimer = null;
      if (caretScrollFrame !== null) cancelAnimationFrame(caretScrollFrame);
      caretScrollFrame = null;
    };

    const measureCaretLine = () => {
      const computed = getComputedStyle(ta);
      const mirror = document.createElement("div");
      const copiedProperties = [
        "boxSizing", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontFamily", "fontSize",
        "fontStyle", "fontVariant", "fontWeight", "fontStretch", "lineHeight", "letterSpacing",
        "wordSpacing", "textIndent", "textTransform", "textAlign", "direction", "tabSize",
      ];
      copiedProperties.forEach((property) => { mirror.style[property] = computed[property]; });
      Object.assign(mirror.style, {
        position: "fixed",
        left: "-10000px",
        top: "0",
        width: `${ta.getBoundingClientRect().width}px`,
        height: "auto",
        visibility: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: computed.wordBreak,
      });
      mirror.textContent = ta.value.slice(0, ta.selectionEnd);
      const marker = document.createElement("span");
      marker.textContent = "\u200b";
      mirror.appendChild(marker);
      document.body.appendChild(mirror);
      const result = {
        top: marker.offsetTop,
        height: Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.5,
      };
      mirror.remove();
      return result;
    };

    const animateCaretTo = (target) => {
      stopCaretScroll();
      const start = ta.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 1) {
        ta.scrollTop = target;
        return;
      }
      const startedAt = performance.now();
      const duration = 240;
      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        ta.scrollTop = start + distance * eased;
        if (progress < 1) caretScrollFrame = requestAnimationFrame(step);
        else caretScrollFrame = null;
      };
      caretScrollFrame = requestAnimationFrame(step);
    };

    const centerCaretIfNeeded = () => {
      if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) return;
      const caret = measureCaretLine();
      const safeMargin = Math.min(48, Math.max(16, ta.clientHeight * 0.16));
      const visibleStart = ta.scrollTop + safeMargin;
      const visibleEnd = ta.scrollTop + ta.clientHeight - safeMargin;
      if (caret.top >= visibleStart && caret.top + caret.height <= visibleEnd) return;
      const maximum = Math.max(0, ta.scrollHeight - ta.clientHeight);
      const ideal = caret.top + caret.height / 2 - ta.clientHeight / 2;
      animateCaretTo(Math.max(0, Math.min(ideal, maximum)));
    };

    const scheduleCaretCenter = () => {
      if (caretCenterTimer !== null) clearTimeout(caretCenterTimer);
      caretCenterTimer = setTimeout(() => {
        caretCenterTimer = null;
        requestAnimationFrame(() => requestAnimationFrame(centerCaretIfNeeded));
      }, 100);
    };

    const syncViewport = () => {
      viewportFrame = null;
      const height = visualViewport ? visualViewport.height : window.innerHeight;
      largestViewportHeight = Math.max(largestViewportHeight, height);
      const viewportOffset = visualViewport ? visualViewport.offsetTop : 0;
      const pageOffset = visualViewport ? visualViewport.pageTop - window.scrollY : 0;
      const appliedTop = Number.parseFloat(root.style.getPropertyValue("--app-viewport-top")) || 0;
      const bodyTop = document.body.getBoundingClientRect().top;
      const geometryOffset = Math.max(0, appliedTop - bodyTop);
      const top = Math.max(0, viewportOffset || 0, pageOffset || 0, geometryOffset);

      root.style.setProperty("--app-viewport-top", `${Math.round(top)}px`);
      root.style.setProperty("--app-viewport-height", `${Math.round(height)}px`);
      root.classList.toggle("viewport-offset", top >= 1);

      const keyboardVisible = document.activeElement === ta && largestViewportHeight - height > 80;
      root.classList.toggle("keyboard-visible", keyboardVisible);

      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      if (document.activeElement === ta) {
        root.classList.add("editor-focused");
        const caretAtEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
        if (caretAtEnd) {
          requestAnimationFrame(() => {
            if (document.activeElement === ta && ta.selectionStart === ta.value.length) {
              ta.scrollTop = ta.scrollHeight;
            }
          });
        }
        if (largestViewportHeight - height > 80) scheduleCaretCenter();
      }
    };

    const requestViewportSync = () => {
      if (viewportFrame === null) viewportFrame = requestAnimationFrame(syncViewport);
    };

    const enterEditingViewport = () => {
      if (blurTimer !== null) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      root.classList.add("editor-focused");
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      requestViewportSync();
      [60, 180, 360, 600].forEach((delay) => setTimeout(requestViewportSync, delay));
    };

    activateEditorViewport = enterEditingViewport;

    const leaveEditingViewport = () => {
      if (blurTimer !== null) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (document.activeElement === ta) return;
        root.classList.remove("editor-focused", "keyboard-visible");
        requestViewportSync();
      }, 450);
    };

    ta.addEventListener("focus", enterEditingViewport);
    ta.addEventListener("blur", leaveEditingViewport);
    ta.addEventListener("touchstart", stopCaretScroll, { passive: true });
    ta.addEventListener("wheel", stopCaretScroll, { passive: true });
    ta.addEventListener("beforeinput", stopCaretScroll);
    document.addEventListener("selectionchange", () => {
      const height = visualViewport ? visualViewport.height : window.innerHeight;
      if (document.activeElement === ta && largestViewportHeight - height > 80) scheduleCaretCenter();
    });
    window.addEventListener("resize", requestViewportSync, { passive: true });
    window.addEventListener("scroll", requestViewportSync, { passive: true });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        largestViewportHeight = visualViewport ? visualViewport.height : window.innerHeight;
        requestViewportSync();
      }, 300);
    }, { passive: true });
    window.addEventListener("pageshow", requestViewportSync, { passive: true });
    if (visualViewport) {
      visualViewport.addEventListener("resize", requestViewportSync, { passive: true });
      visualViewport.addEventListener("scroll", requestViewportSync, { passive: true });
    }
    syncViewport();
  })();
