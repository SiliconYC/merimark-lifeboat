import {
  openDatabase,
  getAllEntries,
  getMeta,
  saveEntry,
  deleteEntry,
  markCurrentRevisionExported,
  saveDraft,
  loadDraft,
  clearDraft,
  clearAllData,
  requestPersistentStorage,
} from "./db.js";

const APP_VERSION = "1.0.0";
const FORMAT_MAGIC = "MeriMark Lifeboat";
const FORMAT_VERSION = 1;
const TYPES = new Set(["日记", "任务", "便条"]);

const state = {
  type: "日记",
  editingId: null,
  originalContent: "",
  entries: [],
  revision: 0,
  exportedRevision: 0,
  clearCode: null,
  draftTimer: null,
};

const $ = (id) => document.getElementById(id);
const el = {
  storageStatus: $("storageStatus"),
  offlineStatus: $("offlineStatus"),
  exportStatus: $("exportStatus"),
  modeSwitch: $("modeSwitch"),
  input: $("inputArea"),
  editingLabel: $("editingLabel"),
  wordCount: $("wordCount"),
  save: $("btnSave"),
  cancel: $("btnCancel"),
  copy: $("btnCopyJson"),
  download: $("btnDownloadJson"),
  clear: $("btnClearAll"),
  total: $("totalCountBadge"),
  exportHint: $("exportHint"),
  listTitle: $("listTitle"),
  listStats: $("listStats"),
  entryList: $("entryList"),
  empty: $("emptyState"),
  appVersion: $("appVersion"),
  toastStack: $("toastStack"),
  confirmModal: $("confirmModal"),
  confirmTitle: $("confirmTitle"),
  confirmMessage: $("confirmMessage"),
  confirmCancel: $("confirmCancel"),
  confirmOk: $("confirmOk"),
  clearCodeModal: $("clearCodeModal"),
  clearCodeDisplay: $("clearCodeDisplay"),
  clearCodeInput: $("clearCodeInput"),
  clearCodeCancel: $("clearCodeCancel"),
  clearCodeOk: $("clearCodeOk"),
  manualModal: $("manualExportModal"),
  manualText: $("manualExportText"),
  manualClose: $("manualExportClose"),
  manualRetry: $("manualExportRetry"),
  manualMarked: $("manualExportMarked"),
};

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  el.toastStack.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function randomCode() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(100 + (n[0] % 900));
}

function placeholder(type) {
  return {
    日记: "记录今天发生的…",
    任务: "首行为任务标题，下面记录任务详情…",
    便条: "记录临时备忘内容…",
  }[type] || "写点什么…";
}

function saveLabel() {
  if (state.editingId) return "保存修改";
  return { 日记: "保存日记", 任务: "保存任务", 便条: "保存便条" }[state.type];
}

function updateWordCount() {
  el.wordCount.textContent = `${el.input.value.length} 字`;
}

function timeLabel(value) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value || "";
  }
}

function setType(type) {
  if (!TYPES.has(type)) return;
  state.type = type;
  for (const button of el.modeSwitch.querySelectorAll(".mode-option")) {
    const active = button.dataset.type === type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  el.input.placeholder = placeholder(type);
  el.listTitle.textContent = type;
  el.save.textContent = saveLabel();
  render();
  scheduleDraft();
}

async function refresh() {
  state.entries = await getAllEntries();
  state.revision = Number(await getMeta("current_revision", 0)) || 0;
  state.exportedRevision = Number(await getMeta("last_exported_revision", 0)) || 0;
  render();
}

function render() {
  const counts = { 日记: 0, 任务: 0, 便条: 0 };
  let chars = 0;
  for (const item of state.entries) {
    if (counts[item.type] !== undefined) counts[item.type] += 1;
    chars += (item.content || "").length;
  }

  el.listStats.textContent = `日记 ${counts.日记} · 任务 ${counts.任务} · 便条 ${counts.便条} · ${chars} 字`;
  el.total.textContent = `${state.entries.length} 条`;
  el.copy.disabled = !state.entries.length;
  el.download.disabled = !state.entries.length;
  el.clear.disabled = !state.entries.length;

  const exported = state.revision === state.exportedRevision;
  el.exportStatus.classList.toggle("ok", exported && state.entries.length > 0);
  el.exportStatus.classList.toggle("warning", !exported || !state.entries.length);
  if (!state.entries.length) {
    el.exportStatus.textContent = "尚无数据";
    el.exportHint.textContent = "有内容后即可导出。重复导出是安全的。";
  } else if (exported) {
    el.exportStatus.textContent = "当前内容已导出过";
    el.exportHint.textContent = "当前内容至少成功导出过一次；这不代表 PC 端已经导入成功。";
  } else {
    el.exportStatus.textContent = "有未导出的变更";
    el.exportHint.textContent = "上次导出后内容发生过变化，建议尽快重新复制全部 JSON。";
  }

  el.entryList.replaceChildren();
  const visible = state.entries.filter((item) => item.type === state.type);
  for (const item of visible) {
    const card = document.createElement("article");
    card.className = "entry-card";
    if (item.id === state.editingId) card.classList.add("is-editing");

    const top = document.createElement("div");
    top.className = "entry-topline";
    const time = document.createElement("span");
    time.className = "entry-time";
    time.textContent = timeLabel(item.created_at);
    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-button";
    edit.textContent = "编辑";
    edit.addEventListener("click", () => beginEdit(item.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button delete";
    remove.textContent = "删除";
    remove.addEventListener("click", () => removeEntry(item.id));

    actions.append(edit, remove);
    top.append(time, actions);

    const content = document.createElement("div");
    content.className = "entry-content";
    const raw = item.content || "";
    content.textContent = raw.length > 360 ? raw.slice(0, 360) : raw;
    if (raw.length > 360) content.classList.add("truncated");
    card.append(top, content);
    el.entryList.appendChild(card);
  }

  el.empty.hidden = visible.length !== 0;
  el.cancel.classList.toggle("hidden", !state.editingId);
  el.editingLabel.textContent = state.editingId ? "正在编辑已保存条目" : "新建条目";
  el.save.textContent = saveLabel();
}

function confirmDialog(title, message, { danger = false, label = "确定" } = {}) {
  el.confirmTitle.textContent = title;
  el.confirmMessage.textContent = message;
  el.confirmOk.textContent = label;
  el.confirmOk.className = danger ? "button danger" : "button primary";
  el.confirmModal.hidden = false;
  return new Promise((resolve) => {
    const done = (answer) => {
      el.confirmModal.hidden = true;
      el.confirmOk.onclick = null;
      el.confirmCancel.onclick = null;
      resolve(answer);
    };
    el.confirmOk.onclick = () => done(true);
    el.confirmCancel.onclick = () => done(false);
  });
}

async function saveCurrent() {
  const content = el.input.value.trim();
  if (!content) {
    toast("内容为空，没有保存");
    el.input.focus();
    return;
  }
  const now = new Date().toISOString();
  let item;
  if (state.editingId) {
    const old = state.entries.find((entry) => entry.id === state.editingId);
    if (!old) return toast("原条目已不存在");
    item = { ...old, type: state.type, content, updated_at: now };
  } else {
    item = { id: uuid(), type: state.type, content, created_at: now, updated_at: now };
  }
  try {
    await saveEntry(item);
    await clearDraft();
    state.editingId = null;
    state.originalContent = "";
    el.input.value = "";
    updateWordCount();
    await refresh();
    toast("已保存到本机");
  } catch (error) {
    console.error(error);
    toast("保存失败，请不要关闭页面");
  }
}

async function beginEdit(id) {
  const item = state.entries.find((entry) => entry.id === id);
  if (!item) return;
  if (el.input.value.trim() && !state.editingId) {
    const ok = await confirmDialog("替换当前草稿？", "编辑已保存条目会覆盖输入框中尚未保存的草稿。确定继续吗？");
    if (!ok) return;
  }
  state.editingId = id;
  state.originalContent = item.content || "";
  el.input.value = item.content || "";
  setType(item.type);
  updateWordCount();
  await persistDraft();
  el.input.focus();
  el.input.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function cancelEdit() {
  const dirty = state.editingId ? el.input.value !== state.originalContent : Boolean(el.input.value.trim());
  if (dirty) {
    const ok = await confirmDialog("放弃当前编辑？", "输入框中的未保存修改会被清除。已经保存到列表里的条目不会受影响。");
    if (!ok) return;
  }
  state.editingId = null;
  state.originalContent = "";
  el.input.value = "";
  await clearDraft();
  updateWordCount();
  render();
}

async function removeEntry(id) {
  const ok = await confirmDialog("删除这条记录？", "该条记录会从救生圈本地存储中永久删除。删除前请确认它不再需要。", { danger: true, label: "删除" });
  if (!ok) return;
  try {
    await deleteEntry(id);
    if (state.editingId === id) {
      state.editingId = null;
      state.originalContent = "";
      el.input.value = "";
      await clearDraft();
    }
    updateWordCount();
    await refresh();
    toast("已删除");
  } catch (error) {
    console.error(error);
    toast("删除失败");
  }
}

function exportObject() {
  const entries = [...state.entries]
    .sort((a, b) => (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0))
    .map((item) => ({
      ID: item.id,
      类型: item.type,
      创建时间: item.created_at,
      修改时间: item.updated_at || item.created_at,
      内容: item.content,
    }));
  return {
    格式: FORMAT_MAGIC,
    格式版本: FORMAT_VERSION,
    应用: "MeriMark",
    用途: "应急救生圈灾备导出",
    导出时间: new Date().toISOString(),
    当前修订: state.revision,
    条目数量: entries.length,
    条目: entries,
  };
}

function exportText() {
  return JSON.stringify(exportObject(), null, 2);
}

async function copyFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  return ok;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn("Clipboard API failed", error);
    }
  }
  return copyFallback(text);
}

async function markExported() {
  await markCurrentRevisionExported();
  state.exportedRevision = state.revision;
  render();
}

async function copyAll() {
  if (!state.entries.length) return toast("没有可导出的条目");
  const text = exportText();
  if (await copyText(text)) {
    await markExported();
    toast(`已复制 ${state.entries.length} 条记录的 JSON`);
    return;
  }
  el.manualText.value = text;
  el.manualModal.hidden = false;
  setTimeout(() => { el.manualText.focus(); el.manualText.select(); }, 0);
}

async function downloadAll() {
  if (!state.entries.length) return toast("没有可导出的条目");
  const blob = new Blob([exportText()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `merimark-lifeboat-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await markExported();
  toast("已生成 JSON 文件");
}

async function beginClear() {
  if (!state.entries.length) return;
  const ok = await confirmDialog(
    "进入清空流程？",
    "这不是“同步”按钮。救生圈无法知道 PC 端是否已经成功导入。\n\n只有在你人工确认数据已经安全保存后，才继续下一步。",
    { danger: true, label: "继续清空" }
  );
  if (!ok) return;
  state.clearCode = randomCode();
  el.clearCodeDisplay.textContent = state.clearCode;
  el.clearCodeInput.value = "";
  el.clearCodeModal.hidden = false;
  setTimeout(() => el.clearCodeInput.focus(), 0);
}

async function finishClear() {
  if (el.clearCodeInput.value.trim() !== state.clearCode) {
    toast("三位数字不正确");
    el.clearCodeInput.focus();
    el.clearCodeInput.select();
    return;
  }
  try {
    await clearAllData();
    state.clearCode = null;
    state.editingId = null;
    state.originalContent = "";
    el.clearCodeModal.hidden = true;
    el.input.value = "";
    updateWordCount();
    await refresh();
    toast("本机救生圈数据已清空");
  } catch (error) {
    console.error(error);
    toast("清空失败，请保留当前页面");
  }
}

function scheduleDraft() {
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(() => persistDraft().catch(console.warn), 450);
}

async function persistDraft() {
  if (!el.input.value) return clearDraft();
  await saveDraft({
    type: state.type,
    content: el.input.value,
    editingId: state.editingId,
    savedAt: new Date().toISOString(),
  });
}

async function restoreDraft() {
  const draft = await loadDraft();
  if (!draft?.content) return;
  state.type = TYPES.has(draft.type) ? draft.type : "日记";
  state.editingId = null;
  state.originalContent = "";
  if (draft.editingId) {
    const old = state.entries.find((item) => item.id === draft.editingId);
    if (old) {
      state.editingId = old.id;
      state.originalContent = old.content || "";
    }
  }
  el.input.value = draft.content;
  setType(state.type);
  updateWordCount();
  toast("已恢复上次未结束的输入");
}

async function storageStatus() {
  const result = await requestPersistentStorage();
  if (result.persisted) {
    el.storageStatus.textContent = "本机存储 · 已获持久化保护";
    el.storageStatus.classList.add("ok");
  } else if (result.supported) {
    el.storageStatus.textContent = "本机存储 · 浏览器最佳努力保存";
  } else {
    el.storageStatus.textContent = "本机存储 · 持久化 API 不可用";
  }
}

async function registerWorker() {
  if (!("serviceWorker" in navigator)) {
    el.offlineStatus.textContent = "当前浏览器不支持离线缓存";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    el.offlineStatus.textContent = "离线外壳已就绪";
    el.offlineStatus.classList.add("ok");
    if (registration.waiting) toast("新版本已缓存；完全关闭后再次打开即可启用");
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast("发现新版本；不会打断当前记录，下次完全关闭后启用");
        }
      });
    });
  } catch (error) {
    console.warn("Service Worker registration failed", error);
    el.offlineStatus.textContent = "离线缓存尚未就绪";
  }
}

function bind() {
  el.modeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest(".mode-option");
    if (button) setType(button.dataset.type);
  });
  el.input.addEventListener("input", () => { updateWordCount(); scheduleDraft(); });
  el.save.addEventListener("click", saveCurrent);
  el.cancel.addEventListener("click", cancelEdit);
  el.copy.addEventListener("click", copyAll);
  el.download.addEventListener("click", downloadAll);
  el.clear.addEventListener("click", beginClear);

  el.clearCodeCancel.addEventListener("click", () => {
    state.clearCode = null;
    el.clearCodeInput.value = "";
    el.clearCodeModal.hidden = true;
  });
  el.clearCodeOk.addEventListener("click", finishClear);
  el.clearCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") finishClear(); });

  el.manualClose.addEventListener("click", () => { el.manualModal.hidden = true; });
  el.manualRetry.addEventListener("click", async () => {
    if (!(await copyText(el.manualText.value))) return toast("仍无法调用剪贴板，请手动复制");
    await markExported();
    el.manualModal.hidden = true;
    toast("已复制 JSON");
  });
  el.manualMarked.addEventListener("click", async () => {
    await markExported();
    el.manualModal.hidden = true;
    toast("已记录为手动导出");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(state.draftTimer);
      persistDraft().catch(console.warn);
    }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(state.draftTimer);
    persistDraft().catch(() => {});
  });
}

async function init() {
  el.appVersion.textContent = `v${APP_VERSION}`;
  bind();
  try {
    await openDatabase();
    await refresh();
    await restoreDraft();
  } catch (error) {
    console.error("IndexedDB initialization failed", error);
    el.storageStatus.textContent = "本机数据库初始化失败";
    toast("本机数据库无法打开，请勿开始记录");
    el.save.disabled = true;
    el.copy.disabled = true;
    el.download.disabled = true;
    el.clear.disabled = true;
    return;
  }
  setType(state.type);
  updateWordCount();
  storageStatus().catch(console.warn);
  registerWorker().catch(console.warn);
}

init();
