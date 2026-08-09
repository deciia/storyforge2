# StoryForge2 · 故事熔炉（Hermes 可控版）

> AI 辅助小说创作工作台，带本地可编程后端。本地优先、提示词全透明，让作者与 AI Agent 都能掌控从灵感、设定、大纲到正文、审校、导出的一整条创作链路。

本项目是基于 [yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge) v3.9.1 的派生项目（MIT License）。感谢原作者 yuanbw2025 的开源贡献——StoryForge 强大的纯前端创作能力与完善的设定体系全部来自上游。本项目的增量在于本地后端控制层：外部 AI Agent（如 Hermes）可通过 REST API + Python SDK 完整读写写作项目。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-brown)
![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-orange)
![Express](https://img.shields.io/badge/Express-SQLite-green)
![TipTap](https://img.shields.io/badge/TipTap-Editor-purple)
![PWA](https://img.shields.io/badge/PWA-Offline-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 目录

- [项目定位](#项目定位)
- [后端控制层（本 fork 增量）](#后端控制层本-fork-增量)
- [上游功能（继承自 StoryForge v3.9.1）](#上游功能继承自-storyforge-v391)
- [数据与安全边界](#数据与安全边界)
- [快速启动](#快速启动)
- [开发与验证](#开发与验证)
- [开发路线图](#开发路线图)
- [文档入口](#文档入口)
- [License](#license)

---

## 项目定位

StoryForge2 不是"一键生成完本小说"的黑箱工具，而是给作者和 AI Agent 使用的 AI 创作工坊：

| 目标 | StoryForge2 的做法 |
|---|---|
| 作者掌控创作 | 所有 AI 输出都经过预览、编辑、采纳；AI 是助手，不直接替作者定稿（上游能力） |
| 提示词可见可改 | 每个 AI 功能背后的 System Prompt、User Template、参数和示例都能查看与克隆（上游能力） |
| 长篇设定不散 | 世界观、角色、大纲、伏笔、状态、物品、事实、故事线都进入结构化本地数据库（上游能力） |
| 资料能反哺写作 | 项目参考、历史资料、文风学习、场景考证可进入后续 AI 上下文（上游能力） |
| Agent 可编程控制 | 本地 SQLite 后端暴露 REST API + Python SDK，外部 Agent 可读写项目、章节、角色与全部 58 张表（本 fork 增量，已实测） |
| 数据本地优先 | 前端数据在浏览器 IndexedDB；后端数据在本机 SQLite，均不上传任何云端 |

---

## 后端控制层（本 fork 增量）

本项目相对上游的核心增量：一个 Express + better-sqlite3 本地后端，把前端 Dexie/IndexedDB 的全部数据模型镜像为 SQLite 表，并提供给外部 Agent 编程访问。**以下内容全部经过本 fork 实测验证**。

### 数据模型

- 58 张表，对齐前端 Dexie schema 的活动表集合（`src/lib/db/ensure-schema.ts` 的 `REQUIRED_TABLES`）。
- 通用行结构：已知列（如 `name`、`type`、`projectId`）+ `data` JSON bag（任意附加字段自动存取）。
- 表结构定义见 `backend/db/schema.js`，路由见 `backend/routes/`。

### REST API（端口 8765）

| 端点 | 说明 |
|---|---|
| `GET /api/health` | 健康检查，返回表清单 |
| `GET/POST /api/:table` | 通用 CRUD 列表 / 创建（58 张表全部可用） |
| `GET/PUT/DELETE /api/:table/:id` | 通用 CRUD 单条读写删除 |
| `GET /api/projects/:id/context` | 项目上下文（章节元数据、角色、世界观等，供 AI 装配） |
| `GET /api/projects/:id/export` | 项目全量导出（含章节正文与所有子表） |
| `POST /api/projects/import` | 事务性重建项目（自动重映射外键 ID） |
| `DELETE /api/projects/:id/cascade` | 级联删除项目及全部关联数据 |
| `DELETE /api/chapters/cascade` | 批量删除章节及关联数据 |

### Python SDK

```python
import hermes_client as sf2

# 项目
projects = sf2.list('projects')
p = sf2.create('projects', {'name': '新项目', 'genre': 'kehuan'})
ctx = sf2.context(p['id'])      # 项目上下文
dump = sf2.export(p['id'])      # 全量导出

# 章节与任意表
ch = sf2.create('chapters', {'projectId': p['id'], 'title': '第一章'})
sf2.update_chapter_content(ch['id'], '正文……')
row = sf2.get('chapters', ch['id'])

# 通用 CRUD（58 表）
sf2.list('characters', project=p['id'])
sf2.update('characters', cid, {'name': '新名字'})
sf2.delete('characters', cid)
```

另有命令行工具 `backend/sf2.py`：`python sf2.py projects list`、`python sf2.py chapters get 1` 等。

### 已验证的修复与闭环

- **PUT 数据丢失修复**：partial PUT 不再覆盖 `data` JSON bag（已回归验证）。
- **import 闭环**：export → import → 新项目章节/角色/正文完整保留（已实测）。
- **级联删除**：项目与全部关联数据级联清理（已实测）。

---

## 上游功能（继承自 StoryForge v3.9.1）

以下能力全部继承自上游 StoryForge v3.9.1 前端。本 fork 已对代码做过架构审计（数据模型、stores、路由），但**未在本 fork 逐项端到端复测**——它们与上游一致，作为上游能力如实列出，不作为本 fork 的验证声明。

### 从灵感到项目

- 首页管理所有小说项目，支持新建、删除、从本地文件夹恢复。
- 项目概况维护名称、简介、流派、目标字数、写作状态与多世界开关。
- 灵感反推支持把短梗、片段、想法反推为故事核心、世界观、角色、大纲等可采纳结构。
- 项目参考支持故事参考、风格参考、历史资料，以及上传后的多维分析。

### 设定库

- 多世界总览：管理世界组、世界关系、主世界和跨世界结构。
- 真实与幻想：按维度声明哪些内容取自真实、哪些允许架空改造。
- 世界观：世界起源、自然环境、人文环境、历史年表、世界地图。
- 故事设计：一句话故事、故事概念、主题、核心冲突、故事模式、主线、复线。
- 角色设计：角色生成、主要角色、次要角色、NPC、路人、关系网。

### 创作区

- 创作规则：写作风格、叙事视角、基调、禁忌、一致性规则和参考作品注入。
- 大纲：卷/章树、AI 生成卷纲、章节展开、章节预览。
- 角色驱动：根据人物动机、关系和弧光反推剧情推进。
- 故事线：主线/支线、阶段卡、进度和 AI 生成。
- 章节：章节列表、TipTap 正文编辑、自动保存、续写、润色、扩写、去 AI 味、审校、便签。
- 伏笔：伏笔类型、埋设/呼应/回收状态、紧急度、看板和 AI 建议。
- 文风学习：从已写章节与作者确认的改前/改后短样本提取画像，持续反哺后续生成。
- 重要地点：地点树、标签、层级关系和地点资料。
- 状态表：角色、地点、物品、势力等状态卡和事件时间线。
- 物品栏：追踪物品获得、持有、转移、消耗等账本。
- 事实库：章节正文中抽取的时序事实候选，确认/否决后用于长期一致性。
- 故事年表：按章节和剧情时间记录全局事件。
- 场景考证：结合世界观、历史年表和规则检查具体场景细节。

### 提示词库与工作流

- 模板管理：系统模板、用户模板、参数、示例/反例、实时预览。
- 题材包：历史、仙侠、言情、现实主义、悬疑推理等风格可热切换。
- PromptRunPanel：运行时调参、临时改 prompt、流式输出、采纳、标记好/坏示例。
- 工作流：把多个 AI 步骤串起来，支持从故事核心到世界观、角色、大纲、章节的自动编排和写回。

### 导入、导出与备份

- 文档解析：上传或粘贴文本，分块解析为当前项目设定或项目参考。
- 大文档流水线：Blob 持久化、断点续跑、暂停/取消、日志追踪、角色去重合并。
- 数据管理：JSON 完整备份、Markdown/TXT/HTML 导出、本地文件夹自动备份。
- 版本历史：自动快照与手动快照，恢复时创建新项目，避免覆盖当前稿件。
- 消耗统计：按项目或全局查看 AI 调用次数、token 和估算费用。

### 架构设计（继承自上游）

前端沿用上游的分层设计，UI 只表达用户意图和确认；AI 读、AI 写与表生命周期分别收口到三个注册表（`CONTEXT_SOURCES`、`FIELD_REGISTRY` + `ADOPTION_SCHEMAS`、`PROJECT_TABLES`），不允许面板各自形成平行管线。完整设计见上游文档 [docs/MASTER-BLUEPRINT.md](./docs/MASTER-BLUEPRINT.md) 与 [CLAUDE.md](./CLAUDE.md)。

---

## 数据与安全边界

前端是纯浏览器应用，后端是本机服务，均不设云端账号。

| 数据/动作 | 去向 |
|---|---|
| 前端项目数据 | 浏览器 IndexedDB |
| 后端项目数据 | 本机 SQLite（`backend/storyforge.db`，已 gitignore） |
| AI API Key | 前端默认 sessionStorage；用户显式"记住本机"才写 localStorage |
| AI 生成 | 会把相关上下文发送到用户配置的 AI 服务 |
| 本地文件夹备份 | 通过浏览器 File System Access API 写入用户授权的本地目录 |

> ⚠️ 安全说明：后端当前监听 `0.0.0.0:8765`（开发期默认，未指定 host），不带鉴权，仅用于本机开发。**不要在没有鉴权与反向代理的情况下把 8765 端口暴露到网络**。收紧监听地址（绑定 `127.0.0.1`）已列入[开发路线图](#开发路线图)。

---

## 快速启动

### 前端（继承自上游，未在本 fork 复测）

```bash
git clone https://github.com/deciia/storyforge2.git
cd storyforge2
npm install
npm run dev
```

打开：http://localhost:1111/storyforge/

### 后端（本 fork 增量，已实测）

```bash
cd backend
npm install
node server.js        # 监听 0.0.0.0:8765
```

健康检查：`curl http://localhost:8765/api/health`

---

## 开发与验证

### 本 fork 已实测的验证

```bash
cd backend
node test-crud.js          # CRUD 闭环（已入库，自带端口隔离，不影响开发实例）
curl http://localhost:8765/api/health   # 健康检查
```

> 开发机上的 `test_import.py` / `test_p1_regression.py` / `test_write_path.py` 等 Python 验证脚本含本地绝对路径与本地项目 ID，**未入库**（见 .gitignore），clone 后无法直接运行——它们只证明控制层在开发机上验证通过。测试脚本可移植化已列入[开发路线图](#开发路线图)。

### 上游继承的 npm scripts（未在本 fork 复测）

```bash
npm run dev
npm run build
npm run test
npm run test:coverage
npm run check:required-tables
npm run check:ai-manual
npm run check:architecture
npm run ci
```

这些脚本来自上游 v3.9.1，功能与上游一致。涉及数据表、AI 读写、导出导入、删除、迁移时遵守 [CLAUDE.md](./CLAUDE.md) 的三注册表规则。

---

## 开发路线图

以下功能已确定方向但**尚未实现**，按优先级排列：

- [ ] **测试脚本可移植化**：把 `test_import.py` / `test_p1_regression.py` / `test_write_path.py` 中的本地绝对路径与项目 ID 改为环境无关（自动探测 DB 路径/端口），使 clone 后可直接运行
- [ ] **前端端到端验证**：在本 fork 首次实测 `npm install && npm run dev`，创建测试项目走通创作流程，确认前端与上游一致
- [ ] **自动 schema 同步（generate_schema.py）**：从 `src/lib/db/schema.ts`（Dexie 权威 schema）自动生成 `backend/db/schema.js`，消除上游升级时手动同步 58 张表的漂移风险（核心思路已确认）
- [ ] **SF2_ARCHITECTURE.md**：前端架构审计文档（已完成 30+ 目录 / 40+ stores / 48 个 Dexie 版本调研，文档待落盘）
- [ ] **后端监听收紧**：`server.js` 绑定 `127.0.0.1`（当前 `0.0.0.0` 无鉴权，生产暴露前必须处理）
- [ ] **IndexedDB → SQLite 数据迁移工具**：当前 import 走 export JSON 闭环，直接迁移浏览器存量数据的工具未做
- [ ] **前后端数据打通**：前端从后端 SQLite 读写（当前前后端数据独立，前端仍用 IndexedDB）

---

## 文档入口

| 文档 | 用途 |
|---|---|
| [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md) | 面向用户的完整功能说明书（上游） |
| [docs/MASTER-BLUEPRINT.md](./docs/MASTER-BLUEPRINT.md) | 重构施工蓝图与架构权威（上游） |
| [CLAUDE.md](./CLAUDE.md) | 开发者接手项目必须遵守的规则（上游） |
| [AGENTS.md](./AGENTS.md) | 编码 Agent 默认入口（上游） |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录（上游） |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献指南（上游） |
| [SECURITY.md](./SECURITY.md) | 漏洞报告与安全政策（上游） |

---

## License

本项目基于 [yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge) 派生，沿用上游 [MIT License](./LICENSE)。感谢原作者 yuanbw2025 的开源贡献。你可以自由使用、复制、修改、分发和商用本项目代码；请保留原始版权与许可声明。
