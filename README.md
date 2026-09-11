# merimark-lifeboat

MeriMark PWA 的应急救生圈，仅在主 PWA 无法使用时启用。

## 设计边界

- 这是纯静态 PWA，没有后端、账户、登录、同步 API 或远程数据库。
- 日记、便条、任务只存入当前浏览器的 IndexedDB。
- 不尝试访问 MeriMark PC、局域网地址、项目 ID 或千云 ID。
- 数据离开手机的主要通道是“复制全部 JSON”；`.json` 下载只作为备用出口。
- “已经导出”只表示本机曾成功复制/生成过当前修订的数据，不表示 PC 端已经导入成功。
- 清空全部数据必须经历两次确认，第二次需要输入随机三位数字。
- Service Worker 采用保守更新策略：不强制 `skipWaiting()`，避免在应急记录过程中被新版本打断。

## PWA 安装

GitHub Pages 测试站：

`https://siliconyc.github.io/merimark-lifeboat/`

在 iPhone Safari 中打开后，使用“分享 → 添加到主屏幕”。

建议在主 MeriMark 一切正常时就预先安装，并至少在线打开一次，确保离线外壳已经缓存。

## 导出协议 v1

```json
{
  "格式": "MeriMark Lifeboat",
  "格式版本": 1,
  "应用": "MeriMark",
  "用途": "应急救生圈灾备导出",
  "导出时间": "2026-09-11T13:00:00.000Z",
  "当前修订": 3,
  "条目数量": 1,
  "条目": [
    {
      "ID": "xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx",
      "类型": "日记",
      "创建时间": "2026-09-11T12:00:00.000Z",
      "修改时间": "2026-09-11T12:00:00.000Z",
      "内容": "……"
    }
  ]
}
```

PC 端导入器应首先验证 `格式` 与 `格式版本`，再按 `ID` 做幂等去重。

## 分支流程

- `dev`：开发与 GitHub Pages 测试。
- `main`：验收后的稳定版本。

当前 Pages 在开发阶段应指向 `dev / (root)`；验收后再切换到 `main / (root)`。
