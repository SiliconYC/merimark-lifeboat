  function cleanVoicePunctuation(text) {
    if (!text) return "";
    let result = text;
    result = result.replace(/(^|[^\n])\n[ \t\u3000]*[。\.]{1,2}(?![。\.])/g, "$1\n\n");
    result = result.replace(/^[ \t\u3000]*[。\.]{1,2}(?![。\.])/gm, "");
    result = result.replace(/^([ \t]*(?:[-*+]|\d+\.|#{1,6}))[ \t]*[。\.]{1,2}[ \t]*(?![。\.])/gm, "$1 ");
    result = result.replace(/^([ \t]*>[ \t]*\[![a-zA-Z]+\])[ \t]*[。\.]{1,2}[ \t]*(?![。\.])/gm, "$1 ");
    result = result.replace(/([:：])([ \t\u3000]*)[。]{1,2}(?![。])/g, "$1$2");
    result = result.replace(/^([ \t]*#{1,6}[ \t]+.*?[^。\. \t\r\n])[。\.]{1,2}[ \t]*$/gm, "$1");
    result = result.replace(/([（\(][ \t]*)[。]{1,2}[ \t]*(?![。])(?=[^）\)]*[^ \t\n。）\)])/g, "$1");
    result = result.replace(/([（\(][^（\)\(\)]*?)[。]{1,2}([）\)])/g, "$1$2");
    return result.replace(/(^|[^。\.])([。\.]{2})(?![。\.])/g, (match, prefix, points) => prefix + points[0]);
  }

  function isHeadingLine(line) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("#")) return false;
    let count = 0;
    for (const char of trimmed) {
      if (char === "#") count++;
      else break;
    }
    return count >= 1 && count <= 6 && (trimmed.length === count || /^[ \t]/.test(trimmed[count]));
  }

  function isListItemLine(line) {
    const trimmed = line.trimStart();
    return /^[-*+]\s+/.test(trimmed) || /^[-*+]\t/.test(trimmed) || /^\d+\.\s+/.test(trimmed);
  }

  function isBlockquoteLine(line) { return /^\s*>/.test(line); }
  function isTableLine(line) { return /^\s*\|.*\|\s*$/.test(line); }

  function formatMarkdown(rawText) {
    if (!rawText) return "";
    const rawLines = cleanVoicePunctuation(rawText).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const nodes = [];
    let codeLines = null;
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        if (codeLines) {
          codeLines.push(line);
          nodes.push({ type: "code", lines: codeLines });
          codeLines = null;
        } else {
          codeLines = [line];
        }
      } else if (codeLines) {
        codeLines.push(line);
      } else if (!trimmed) {
        nodes.push({ type: "empty", lines: [""] });
      } else {
        const type = isHeadingLine(line) ? "heading" : isListItemLine(line) ? "list" :
          isBlockquoteLine(line) ? "quote" : isTableLine(line) ? "table" : "text";
        nodes.push({ type, lines: [line.trimEnd()] });
      }
    }
    if (codeLines) nodes.push({ type: "code", lines: codeLines });

    const resultLines = [];
    for (let index = 0; index < nodes.length; index++) {
      const current = nodes[index];
      if (current.type === "empty") { resultLines.push(""); continue; }
      if (resultLines.length && resultLines[resultLines.length - 1] !== "") {
        const previous = nodes.slice(0, index).reverse().find((node) => node.type !== "empty");
        const blockTypes = new Set(["heading", "code", "list", "quote", "table"]);
        const needGap = previous && (current.type === "text" && previous.type === "text" ||
          blockTypes.has(current.type) && current.type !== previous.type ||
          blockTypes.has(previous.type) && current.type !== previous.type);
        if (needGap) resultLines.push("");
      }
      resultLines.push(...current.lines);
    }
    return resultLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  (function setupScrollLock() {
    const noteList = document.getElementById("noteList");
    let touchStartY = 0;
    document.addEventListener("touchstart", (event) => { touchStartY = event.touches[0].clientY; }, { passive: true });
    const isAtBoundary = (element, deltaY) => {
      const atTop = element.scrollTop <= 0;
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
      return atTop && deltaY > 0 || atBottom && deltaY < 0;
    };
    document.addEventListener("touchmove", (event) => {
      const deltaY = event.touches[0].clientY - touchStartY;
      const target = event.target;
      if (document.activeElement === ta && ta.selectionStart !== ta.selectionEnd) return;
      if (ta.contains(target)) { if (isAtBoundary(ta, deltaY)) event.preventDefault(); return; }
      if (noteList && noteList.contains(target)) { if (isAtBoundary(noteList, deltaY)) event.preventDefault(); return; }
      event.preventDefault();
    }, { passive: false });
  })();

  function updateScrollIndicator(targetElement, scrollbarElement) {
    if (!targetElement || !scrollbarElement) return;
    const thumb = scrollbarElement.firstElementChild;
    if (!thumb) return;

    const scrollHeight = targetElement.scrollHeight;
    const clientHeight = targetElement.clientHeight;
    const scrollTop = targetElement.scrollTop;

    if (scrollHeight <= clientHeight + 2) {
      scrollbarElement.classList.remove("has-scroll");
      return;
    }

    scrollbarElement.classList.add("has-scroll");
    const trackHeight = scrollbarElement.clientHeight;
    const thumbHeight = Math.max(20, Math.round((clientHeight / scrollHeight) * trackHeight));
    const maxScroll = scrollHeight - clientHeight;
    const maxTop = trackHeight - thumbHeight;
    const top = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * maxTop) : 0;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }

  function setupScrollbarBinding(targetElement, scrollbarElement) {
    if (!targetElement || !scrollbarElement) return;
    let stopTimer = null;

    const onScroll = () => {
      updateScrollIndicator(targetElement, scrollbarElement);
      scrollbarElement.classList.add("is-scrolling");
      if (stopTimer !== null) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        scrollbarElement.classList.remove("is-scrolling");
      }, 500);
    };

    targetElement.addEventListener("scroll", onScroll, { passive: true });
    return () => updateScrollIndicator(targetElement, scrollbarElement);
  }

  const syncEditorScrollbar = setupScrollbarBinding(
    document.getElementById("inputArea"),
    document.getElementById("editorScrollbar")
  );

  const syncListScrollbar = setupScrollbarBinding(
    document.getElementById("noteList"),
    document.getElementById("listScrollbar")
  );

  window.refreshAllScrollbars = () => {
    requestAnimationFrame(() => {
      if (syncEditorScrollbar) syncEditorScrollbar();
      if (syncListScrollbar) syncListScrollbar();
    });
  };

  let shouldFollowTextEnd = false;

  ta.addEventListener("beforeinput", () => {
    const caretAtEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
    const distanceFromBottom = ta.scrollHeight - ta.scrollTop - ta.clientHeight;
    shouldFollowTextEnd = caretAtEnd && distanceFromBottom < 50;
  });

  ta.addEventListener("input", () => {
    if (shouldFollowTextEnd) {
      requestAnimationFrame(() => { ta.scrollTop = ta.scrollHeight; });
    }
    shouldFollowTextEnd = false;
    updateButtonLayout();
    updateWordCount();
    window.refreshAllScrollbars();
  });

  window.addEventListener("resize", window.refreshAllScrollbars, { passive: true });

  document.getElementById("statDiary").onclick = () => setMode("日记");
  document.getElementById("statTask").onclick = () => setMode("任务");
  document.getElementById("statNote").onclick = () => setMode("便条");
