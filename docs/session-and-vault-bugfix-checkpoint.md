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
- 最新 Frontend `eb8f1790ec080787091e4c00cdaf05cdaf7b04e4` 的 [CI](https://github.com/FengYuchen1314/frontend/actions/runs/33976780218) 已成功：日志确认 53 + 73 = 126 项测试全部通过，同时通过类型检查、全仓 lint 和应用编译。Actions 已验证前端 lockfile 固定的 tsx 4.23.13。
- Backend `c5b9d397` 的 [CI](https://github.com/FengYuchen1314/backend/actions/runs/33975968368) 已通过真实 PostgreSQL 并发替换、回滚、应用编译和依赖注入检查。
- 指定上述精确前后端 SHA 的 [配套镜像任务](https://github.com/FengYuchen1314/backend/actions/runs/33976781168) 汇总时仍在构建/发布镜像，后端验证与前端编译已完成。该任务结果不能替代 VPS 界面验收；当前隔离面板仍是此前已验收版本，尚未升级到这批修复。

本机测试使用已安装的 Backend tsx 4.21.0；应用只在 GitHub Actions 编译。本次按用户要求总结并上传，未继续开发、安装 HeroUI 或部署 VPS。后续先确认精确配对镜像，备份并保留隔离面板数据后做浏览器验收，再进入完整前端逻辑重写与 HeroUI 迁移。

完整改造范围见 [HeroUI 迁移范围与验收清单](heroui-migration-scope.md)，该清单不是迁移完成报告。

## 后续补充修复（2026-09-06）

`eb8f1790` 的配套镜像已成功并完成部分真实浏览器检查，见 [镜像与浏览器记录](bugfix-browser-acceptance.md)。下列新改动不混入该版本证据：

- AuthProvider 直接从现有 token store 派生认证状态，删除 7 处手动 setter 接线。注销统一清理 token、业务 store 和 Query/Mutation 缓存，增加同步重入保护；保留客户端初始化、SSR/hydration 隔离及密码、注册、OAuth、Passkey 工作流。
- 内部组入站草稿按实体和打开周期隔离；同组 refetch 不覆盖已编辑选择，空选择也保留。分组和平铺共用草稿，失败保存不丢输入，旧保存成功不能关闭后来打开或继续编辑的抽屉。
- Vault DB 改为等事务 `complete` 才报告成功；reset 跨六个 store 原子清空但保留 schema，避免不可取消的延迟删库。恢复在一个事务中替换全部加密记录，失败回滚并保留旧设备 key；blocked 升级明确失败并取消迟到升级。原加密算法、参数及备份格式不变。
- 默认回归共 166 项通过：基础/表单/列表 64 项，加上会话、认证、Vault、Passkey 102 项。新增认证 19 项、入站草稿 11 项、Vault 持久化 10 项。全仓 TypeScript 和 lint 已通过。

Vault 持久化使用固定 fake-indexeddb 6.2.5；认证和草稿测试执行真实 hook、生产事件逻辑或 SSR，不冒充浏览器端到端测试。补充修复已提交为 `3d369d5bea04768a165b176e9999702eec82fd6c`，其 [Actions](https://github.com/FengYuchen1314/frontend/actions/runs/33978702245) 已成功通过 166 项测试、类型检查、全仓 lint 和编译；新镜像部署及真实浏览器验证尚未完成。后续 HeroUI 改动另见 [G0 代码检查点](heroui-g0-checkpoint.md)。
