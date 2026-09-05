# 会话、密钥库及列表回归修复

更新：2026-09-06。此记录是 bug 修复检查点，不是 HeroUI 迁移完成报告，也不表示已完成 VPS 界面验收。

## 已复现并修复

- 拓扑的创建、修改、删除、验证和预览，以及 NodeEdge 的保存/应用，原先绕过通用 mutation helper。延迟派发可能用后来登录的凭据发送旧操作，迟到成功回调也可能重新填入旧缓存。现在每次调用独立捕获会话代次，派发、解析、各层回调和最终 Promise 结果均受保护；void 参数、DTO、409 冲突和正常成功行为保留。
- 拓扑、边缘设置和账单查询透传取消信号，并在异步响应解析后再次检查所属会话。NodeEdge 重新载入额外拦截取消 refetch 返回的旧缓存快照。Vault evaluation 同样保持完整异步响应边界。
- SSH Vault 进行中的解锁、PIN、创建、备份恢复及读取，原先可能在注销或锁定后重新发布密钥或明文。现在使用 Vault、密钥和会话代次检查；会话变更同步锁定，reset 立即清除内存密钥，持久化写入串行，临时原始密钥在失效或完成后清零。没有改动 AES、OPRF、PBKDF2 算法或参数。
- Passkey 登录原先只保护单个 HTTP 请求，认证器等待期间切换会话后仍可能提交旧 assertion；options 查询失败时也可能复用缓存挑战。现在保护整个 options → authenticator → verify 流程，只在流程仍有效时提交 token。卸载和会话切换令旧流程失效，普通用户取消仍显示原有提示。不会通过全局取消方法误伤其他组件的认证器请求；卸载后原生提示可能仍存在，但迟到结果不能提交。
- 平铺入站列表的 Checkbox.Group 会插入额外 `role=group` 包装层，原百分比高度链在该处断开，使 Virtuoso 视口为 0。新增局部 CSS 补齐高度链，保留 Checkbox.Group 语义、选择逻辑和虚拟化。

## 验证和证据边界

- 默认 `npm test` 包含 53 项原有/表单/列表测试，以及 73 项会话、真实 hook、Vault 和 Passkey 流程测试，共 126 项；本轮本地分组验证均通过。前端全仓 lint 和 TypeScript 已通过，CI 改为检查全仓 lint。
- Vault 的 12 项回归使用真实加密和内存 IndexedDB 替身，不读取用户密钥库。覆盖正常创建、PIN、SSH 密钥、连接配置、片段及备份恢复往返，并验证并发错误 PIN 仍遵守三次限制。真实浏览器 IndexedDB 生命周期验收尚未完成；原 DB 层删除错误处理、多步骤恢复的非原子性不在本轮改动内。
- Passkey 的 10 项测试执行生产事件处理逻辑及独立流程，不冒充真实硬件认证器验收。
- 主任务通过浏览器打开独立 React/Mantine/Virtuoso SSR + 真实 CSS 探针：平铺列表旧结构视口为 0px，生产 CSS 修复后为 342px；分组、用户内组、简单内组和账单结构视口分别为 360、182、184、360px，内容均超出视口。该证据只证明浏览器布局，不证明完整 hydration、选择、滚动或分页交互。
- 手动布局探针：在仓库根目录执行 `node src/shared/utils/virtualized-height-runtime.fixture.mjs`，通过页面所示的本地地址查看结果，完成后停止该专用进程。探针不构建应用。
- 上一检查点 Frontend `1d1839d0` 的 [CI](https://github.com/FengYuchen1314/frontend/actions/runs/33975968362) 已通过；Backend `c5b9d397` 的 [CI](https://github.com/FengYuchen1314/backend/actions/runs/33975968368) 已通过真实 PostgreSQL 并发替换、回滚、应用编译和依赖注入检查。这些结果不能代替本轮新增前端修复的 Actions 和 VPS 验收。

本机测试使用已安装的 Backend tsx 4.21.0；Frontend 锁定的 tsx 4.23.13 由 Actions 安装验证。应用继续只在 GitHub Actions 编译。下一步是取得本轮前端检查和精确前后端配对镜像，保留隔离面板数据后做浏览器验收，再进入完整前端逻辑重写与 HeroUI 迁移。
