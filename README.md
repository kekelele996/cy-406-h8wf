# 合同模板在线编辑器

面向法律从业者和企业法务的本地化合同起草工作台，支持模板管理、变量替换、条款复用、版本保存与差异对比。

## 功能列表

- 模板库：按合同分类、标签和关键词检索，支持创建、编辑、复制、删除模板。
- 模板编辑器：使用 TipTap 富文本编辑合同正文，右侧维护变量，底部条款库可插入复用条款。
- 模板版本：模板每次保存正文都会生成独立的不可变版本，修改模板不影响已创建的实例。
- 合同实例：创建时锁定当时的模板版本（正文与变量），实例页标注所用版本，旧实例始终显示原内容。
- 套用最新模板：实例可一键升级到模板最新版；新版缺少必填变量或已有填写对不上时会阻止切换并列出具体变量，条件满足才替换正文，替换前自动备份当前内容。
- 版本历史：为合同实例保存版本，左右双栏高亮对比内容差异，并标注各版本所用的模板版本。
- 条款库：按分类管理违约、争议解决、付款、知识产权等常用条款。
- 本地持久化：通过 IndexedDB 保存全部数据，并支持 JSON 导入导出。
- Undo/Redo：模板编辑器集成 Ctrl+Z / Ctrl+Y，并在状态管理中维护模板历史栈。

## 快速启动

```bash
cd frontend
npm install
npm run dev
```

开发服务器端口为 `28312`，访问 `http://localhost:28312`。

构建与预览：

```bash
npm run build
npm run preview
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| UI 组件 | Arco Design |
| 状态管理 | Zustand |
| 富文本编辑 | TipTap |
| 本地数据库 | IndexedDB + idb |
| 差异对比 | diff |
| 路由 | React Router |

## 目录结构

```text
frontend/src/
├── api/           # IndexedDB 数据访问入口
├── stores/        # template.ts, templateVersion.ts, clause.ts, instance.ts, version.ts
├── types/         # Template / TemplateVersion / Clause / ContractInstance / Version / enums
├── components/
│   ├── common/    # TemplateCard, RichEditor, VariableForm, CategoryFilter, VersionDiff
│   ├── editor/    # 变量面板、条款抽屉、条款编辑器、编辑器工具栏
│   └── preview/   # 合同预览组件
├── hooks/         # useIndexedDB, useHistory, useVariableReplace
├── pages/         # TemplateList, TemplateEditor, InstanceEditor, VersionCompare, ClauseList
├── router/        # 路由和应用布局
├── styles/        # 全局样式
└── utils/         # db, diff, export, seed, templateApply（套用校验）
```

## License

MIT
