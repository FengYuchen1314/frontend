# HeroUI 迁移范围与验收清单

盘点基线：Frontend `eb8f1790ec080787091e4c00cdaf05cdaf7b04e4`。本文只记录下一阶段的改造范围，不表示 HeroUI 已经安装、页面已迁移，或该版本已完成浏览器验收。

范围以 [router](../src/app/router/router.tsx)、[路由常量](../src/shared/constants/routes.ts)、[弹窗注册表](../src/shared/_modals/modal-registry.ts) 和实际调用点为准：**30 个实际页面入口、55 个注册弹窗/抽屉/窗口**，另含 404、错误兜底、动态弹窗和页面内受控弹层。注册项数量不等于所有弹层数量。

## 1. 改造边界

- 保留 `app / pages / widgets / features / entities / shared` 分层、现有 URL、API 契约及功能入口。工作流、草稿、校验及序列化从大型 UI 组件拆到相应 `features/*/model`；不要用一个新的全局 store 承载所有页面状态。
- 服务端数据由 React Query 管理，界面偏好由 Zustand 管理，认证和 token 保持单一真源。保留请求取消、会话代次、迟到响应/回调隔离及退出清理，不能在新组件里另存一份 token。
- 使用 HeroUI v3 的原生组合方式。可以沉淀业务组件，但不制作接收原 Mantine props 的兼容壳。只换导航、主题或外层卡片，内部继续使用旧页，不算该页迁移完成。
- 最终移除全部 `@mantine/*`、`@kastov/mantine-react-table-open`、`@kastov/mantine-datatable` 及其样式、主题 override、CSS variables/mixins 和专用构建配置。通知、进度条、Spotlight、日期、轮播、代码高亮、Dropzone、图表、hooks 和 form 也在范围内，不只替换 `@mantine/core`。
- 表格可使用 TanStack headless；不能为了换库删掉现有交互。表单方向为 React Hook Form + Zod，具体包版本及 HeroUI 控件接线在实施前单独核查，本文不声称已验证兼容性。
- 保留 Monaco、WASM 校验、Xterm、WebAuthn、SSH Vault 的加密/存储核心和现有虚拟化、拖放能力；重写其 UI 绑定、挂载/卸载和异步生命周期。`@mantine/charts` 必须迁走，但不能因此删掉图表和钻取功能。
- 保留二次开发已有的服务器类型、创建协议限制与外部导入、面板供给 Agent 文件、更新入口、Mieru 入口映射、共享 443/SNI、反向代理、域名校验和拓扑配置流程。所有伪装域名禁止使用 Cloudflare CDN；界面迁移不放宽这个约束，也不把候选/未验证域名显示成已验证。
- 客户端验收以 Clash Verge/Mihomo 为主。现有其他导入/编辑/预览入口不会在 UI 换库时擅自删除；AnyTLS + ShadowTLS 不得以关闭加密换取演示通过。

## 2. 全部页面

下表源路径相对仓库根目录。入口文件指 router 实际导入的页面/connector，不是要求把所有逻辑留在该文件。

| 编号 | URL / 页面                                                                         | 实际入口文件                                                                                           | 必须保留的职责                                                                                                               |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| P01  | `/auth/login` · `LoginPage`                                                        | `src/pages/auth/login/login.page.tsx`                                                                  | 密码、Passkey、OAuth 入口；首次注册分支；服务端认证方式开关；品牌与服务器不可用状态。注册复用此页，不新造 `/auth/register`。 |
| P02  | `/oauth2/callback/:provider` · `Oauth2CallbackPage`                                | `src/pages/auth/oauth2-callback/oauth2-callback.page.tsx`                                              | OAuth 回调、成功/失败反馈与认证后跳转。保持它在 AuthGuard 外的现有路由关系。                                                 |
| P03  | `/dashboard/home` · `HomePageConnector`                                            | `src/pages/dashboard/home/connectors/home.page.connector.tsx`                                          | 仪表盘指标、趋势、运行时信息、截图复制、首次声明及加载/错误状态。                                                            |
| P04  | `/dashboard/open/:entity/:id` · `OpenEntityPage`                                   | `src/pages/dashboard/open-entity/open-entity.page.tsx`                                                 | 实体深链校验，分流到页面或弹窗；无效输入和关闭弹窗后的返回地址。                                                             |
| P05  | `/dashboard/management/users` · `UsersPageConnector`                               | `src/pages/dashboard/users/ui/connectors/users.page.connector.tsx`                                     | 用户指标、完整服务端表格、筛选模板、跨页选择、全部/所选批量操作、用户创建和编辑。                                            |
| P06  | `/dashboard/management/hosts` · `HostsPageConnector`                               | `src/pages/dashboard/hosts/ui/connectors/hosts.page.connector.tsx`                                     | Host 卡片/表格、标签、搜索、排序、多选和批量、创建/编辑、配置关联、Spotlight。                                               |
| P07  | `/dashboard/management/topology` · `TopologyPageConnector`                         | `src/pages/dashboard/topology/topology.page.connector.tsx`                                             | 资源拖放、连线、链式代理/负载均衡、顺序和自动布局、草稿、冲突、验证、预览、保存/删除及格式能力提示。                         |
| P08  | `/dashboard/management/nodes` · `NodesPageConnector`                               | `src/pages/dashboard/nodes/ui/connectors/nodes.page.connector.tsx`                                     | 服务器卡片/表格、实时用量、标签、多选、重排/批量操作、创建/导入、Node Integrations 和 SSH 条件入口。                         |
| P09  | `/dashboard/management/stats/nodes` · `StatisticNodesConnector`                    | `src/pages/dashboard/statistic-nodes/connectors/statistic-nodes.connector.tsx`                         | 节点统计、日期筛选、sparkline、柱状图与钻取。                                                                                |
| P10  | `/dashboard/management/subscription-settings` · `SubscriptionSettingsConnector`    | `src/pages/dashboard/subscription-settings/connectors/subscription-settings.page.connector.tsx`        | General、Remarks、Additional Response Headers 三个页签；订阅附加项、HWID、自定义备注与响应头编辑。                           |
| P11  | `/dashboard/management/config-profiles` · `ConfigProfilesPageConnector`            | `src/pages/dashboard/config-profiles/connectors/config-profiles.page.connector.tsx`                    | 配置列表、搜索/标签、网格排序、创建/删除、入站/活跃节点关系、Spotlight。                                                     |
| P12  | `/dashboard/management/config-profiles/:uuid` · `ConfigProfileByUuidPageConnector` | `src/pages/dashboard/config-profiles/connectors/config-profile-by-uuid.page.connector.tsx`             | Monaco 配置编辑、运行时对应校验、片段/帮助/工具、保存、离开保护和应用配置提示。保留 Mieru 与 Xray/加密 AnyTLS 的校验分流。   |
| P13  | `/dashboard/management/internal-squads` · `InternalSquadsPageConnector`            | `src/pages/dashboard/internal-squads/connectors/internal-squads.page.connector.tsx`                    | 内组网格、排序、搜索/标签、创建/复制/删除、成员操作、入站绑定、用量和可用节点。                                              |
| P14  | `/dashboard/management/external-squads` · `ExternalSquadsPageConnector`            | `src/pages/dashboard/external-squads/connectors/external-squads.page.connector.tsx`                    | 外组网格、排序、搜索/标签、创建/复制/删除及完整七页签设置。                                                                  |
| P15  | `/dashboard/management/metrics/nodes` · `NodesMetricsPageConnector`                | `src/pages/dashboard/nodes-metrics/ui/connectors/nodes-metrics.page.connector.tsx`                     | 节点指标、刷新与虚拟化指标卡片；不能替换成静态占位数据。                                                                     |
| P16  | `/dashboard/management/response-rules` · `ResponseRulesPageConnector`              | `src/pages/dashboard/response-rules/connectors/response-rules.page.connector.tsx`                      | 响应规则编辑、排序/匹配、模板选择、调试、保存、未保存保护及高级功能警告。                                                    |
| P17  | `/dashboard/management/settings` · `RemnawaveSettingsConnector`                    | `src/pages/dashboard/remnawave-settings/connectors/remnawave-settings.page.connector.tsx`              | 认证方式、API token/权限、品牌、后端工具、实验功能、Passkey 管理。                                                           |
| P18  | `/dashboard/management/plugins` · `NodePluginsBasePageConnector`                   | `src/pages/dashboard/node-plugins/ui/connectors/node-plugins-base-page.connector.tsx`                  | 插件列表、搜索/标签、创建/删除、排序、活跃节点和执行入口。                                                                   |
| P19  | `/dashboard/management/plugins/:uuid` · `NodePluginEditorPageConnector`            | `src/pages/dashboard/node-plugins/ui/connectors/node-plugin-editor-page.connector.tsx`                 | 插件编辑、保存/验证、未保存保护及相关执行动作。                                                                              |
| P20  | `/dashboard/tools/hwid-inspector` · `HwidInspectorPageConnector`                   | `src/pages/dashboard/hwid-inspector/ui/connectors/hwid-inspector.page.connector.tsx`                   | HWID 指标、排行榜、平台/应用明细、完整服务端表格和移动端提示。                                                               |
| P21  | `/dashboard/tools/srh-inspector` · `SrhInspectorPageConnector`                     | `src/pages/dashboard/srh-inspector/ui/connectors/srh-inspector.page.connector.tsx`                     | 订阅请求指标、完整服务端表格和移动端提示。                                                                                   |
| P22  | `/dashboard/tools/torrent-blocker-reports` · `TorrentBlockerReportsPageConnector`  | `src/pages/dashboard/torrent-blocker-reports/ui/connectors/torrent-blocker-reports.page.connector.tsx` | 报告统计、节点过滤、完整服务端表格、原始报告查看及清理确认。                                                                 |
| P23  | `/dashboard/tools/sessions-explorer` · `SessionsExplorerPageConnector`             | `src/pages/dashboard/sessions-explorer/ui/connectors/sessions-explorer.page.connector.tsx`             | 会话扫描、进度、结果、失败/重试、节点卡片和分组虚拟列表。                                                                    |
| P24  | `/dashboard/tools/http-stats` · `HttpStatsPageConnector`                           | `src/pages/dashboard/http-stats/ui/connectors/http-stats.page.connector.tsx`                           | HTTP 统计展示与表格交互、加载/刷新/错误状态。                                                                                |
| P25  | `/dashboard/tools/quick-open` · `QuickOpenPage`                                    | `src/pages/dashboard/quick-open/quick-open.page.tsx`                                                   | 八类实体 ID 校验、Enter/按钮打开、复制深链及错误反馈。                                                                       |
| P26  | `/dashboard/templates/:type` · `TemplateBasePageConnector`                         | `src/pages/dashboard/templates/ui/connectors/template-base-page.connector.tsx`                         | 按类型的订阅模板列表、创建/下载/导入、标签、网格/排序与 Spotlight。                                                          |
| P27  | `/dashboard/templates/:type/:uuid` · `TemplateEditorPageConnector`                 | `src/pages/dashboard/templates/ui/connectors/template-editor-page.connector.tsx`                       | 类型对应编辑、模板变量/格式提示、保存与编辑器工作流。                                                                        |
| P28  | `/dashboard/subpage` · `SubpageConfigBasePageConnector`                            | `src/pages/dashboard/subpage-config/ui/connectors/subpage-config-base-page.connector.tsx`              | 订阅页配置列表、创建/删除、排序、搜索/标签与 Spotlight。                                                                     |
| P29  | `/dashboard/subpage/:uuid` · `SubpageConfigEditorPageConnector`                    | `src/pages/dashboard/subpage-config/ui/connectors/subpage-config-editor-page.connector.tsx`            | 订阅页可视化编辑、平台/应用/按钮/区块/多语言文本编辑、导入、校验、保存与预览。                                               |
| P30  | `/dashboard/crm/infra-billing` · `InfraBillingPageConnector`                       | `src/pages/dashboard/crm/infra-billing/connectors/infra-billing.page.connector.tsx`                    | 供应商、账单节点、付款记录、到期时间与统计；桌面多列和移动端完整流程。                                                       |

补充路由和布局范围：

- `*` 使用 `src/pages/errors/4xx-error/not-found.component.tsx`；顶层错误边界使用 `src/pages/errors/5xx-error/server-error.component.tsx`，后者不是独立 `/500` 路由。
- 保留四个重定向：`/ → /dashboard`、`/auth → /auth/login`、`/dashboard → /dashboard/home`、`/dashboard/management → /dashboard/management/users`。
- `/dashboard/tools`、`/dashboard/templates`、`/dashboard/crm` 只是分组容器，没有独立 index 页面；插件和订阅页配置有真实 index 页面。不通过虚增壳页面改变盘点口径。
- `src/app.tsx` 的认证、Query、国际化、方向、移动端、主题、通知、连接状态和 Suspense 关系，以及 `src/app/layouts` 的两种仪表盘布局、桌面/移动导航、页头、更新/版本信息、快捷启动器都在范围内。
- 深链目标以 `src/shared/_modals/open-entity-targets.ts` 为准：user、host、node、internal-squad、external-squad 打开弹窗；config-profile、node-plugin、subpage-config 跳转页面。

## 3. 全部 55 个注册弹窗

注册表通过 `NiceModal.register` 无条件注册下列全部项目。入口是否被功能开关隐藏，不影响迁移范围。源文件列统一相对 `src/shared/_modals/`；键名及当前实际路径保留原样，文件名中的 modal/drawer 不代表实际只读或展现形式。

| 编号 | 注册键                                              | 实际组件文件                                                                                        | 功能责任                                                                                                                |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| M01  | `helpDrawer`                                        | `universal/help-drawer/help-drawer.shared.tsx`                                                      | 按语言加载 Markdown 帮助，英语回退、加载和错误反馈。                                                                    |
| M02  | `renameModal`                                       | `universal/rename-drawer/rename.drawer.tsx`                                                         | 配置、内外组、插件、Passkey、订阅页配置、模板的重命名与校验。                                                           |
| M03  | `editTagsModal`                                     | `universal/edit-tags-modal/edit-tags.modal.tsx`                                                     | 多类实体标签编辑、已有标签建议、转大写、去重和校验。                                                                    |
| M04  | `createModal`                                       | `universal/create-modal/create.modal.tsx`                                                           | 通过 `createFrom` 分流模板、外组、配置、内组、插件、订阅页配置六类创建表单。                                            |
| M05  | `jsonEditorModal`                                   | `universal/json-editor-modal/json-editor.modal.tsx`                                                 | Monaco JSON 编辑、schema/文档/示例、校验、全屏、返回保存结果。                                                          |
| M06  | `base64EditorModal`                                 | `universal/base64-editor-modal/base64-editor.modal.tsx`                                             | Base64 原文/编码双栏同步，JSON/YAML/text 模式和合法性检查。                                                             |
| M07  | `quickLinksModal`                                   | `universal/quick-links-modal/quick-links.modal.tsx`                                                 | 快捷弹窗、路由、HTTPS 外链的添加/排序/删除与偏好保存。                                                                  |
| M08  | `users_viewUserModal`                               | `users/view-user-modal/view-user.modal.tsx`                                                         | 加载并编辑用户；状态切换、删除、流量重置、订阅吊销与关联视图。不是只读窗口。                                            |
| M09  | `users_detailedUserInfoDrawer`                      | `users/detailed-user-info-drawer/detailed-user-info.drawer.tsx`                                     | 用户身份、流量、连接/订阅信息、时间戳。                                                                                 |
| M10  | `users_userAccessibleNodesModal`                    | `users/user-accessible-nodes-modal/user-accessible-nodes.modal.widget.tsx`                          | 加载并展示指定用户可访问的节点。                                                                                        |
| M11  | `users_createUserModal`                             | `users/create-user-modal/create-user.modal.tsx`                                                     | 用户创建，共享用户表单及内外组/标签选择。                                                                               |
| M12  | `users_userUsageModal`                              | `users/user-usage-modal/user-usage.modal.tsx`                                                       | 日期范围、用量 sparkline/柱状图与明细。                                                                                 |
| M13  | `users_userTorrentBlockerReportsModal`              | `users/user-torrent-blocker-reports/user-torrent-blocker-reports.drawer.tsx`                        | 用户报告分页/虚拟列表及原始 JSON 查看。                                                                                 |
| M14  | `users_connectionKeysDrawer`                        | `users/connection-keys-drawer/connection-keys.drawer.tsx`                                           | 连接密钥、原始订阅、复制、单项密钥二维码和原始订阅弹层。                                                                |
| M15  | `users_subscriptionQrCodeModal`                     | `users/subscription-qr-code-modal/subscription-qr-code.modal.tsx`                                   | 标有用户名的订阅 URL 二维码。                                                                                           |
| M16  | `users_userSubscriptionRequestsModal`               | `users/user-subscription-requests-modal/user-subscription-requests.modal.tsx`                       | 用户订阅请求历史，桌面表格和响应式列表。                                                                                |
| M17  | `users_userHwidDevicesModal`                        | `users/user-hwid-devices-modal/user-hwid-devices.modal.tsx`                                         | HWID 设备列表、删除单台/全部及嵌套确认。                                                                                |
| M18  | `users_userActiveSessionDrawer`                     | `users/user-active-sessions/user-active-session.drawer.tsx`                                         | 跨节点查询用户会话，进度/失败/结果，按 IP、节点或全部断开。                                                             |
| M19  | `users_bulkManyUsersActionsModal`                   | `users/bulk-many-users-actions/bulk-many-users-actions.modal.tsx`                                   | 仅所选用户：延期、重置流量、吊销、删除、分配内组。                                                                      |
| M20  | `users_bulkManyUsersUpdateModal`                    | `users/bulk-many-users-update/bulk-many-users-update.modal.tsx`                                     | 仅所选用户的状态、配额/重置策略、到期、描述/联系方式、标签、HWID 限额、外组更新。                                       |
| M21  | `users_bulkAllUsersActionsModal`                    | `users/bulk-all-users-actions/bulk-all-users-actions.modal.tsx`                                     | 全部用户延期/流量重置及按状态删除子工作流。                                                                             |
| M22  | `users_bulkAllUsersUpdateModal`                     | `users/bulk-all-users-update/bulk-all-users-update.modal.tsx`                                       | 全部用户的可批量字段更新；不能退化为当前页用户。                                                                        |
| M23  | `nodes_createNodeModal`                             | `nodes/create-node-modal/create-node.modal.tsx`                                                     | 按 `creationMode` 创建/导入；连接 → 核心/配置/安装引导 → 创建状态，多步骤保留草稿。                                     |
| M24  | `nodes_editNodeModal`                               | `nodes/edit-node-modal/edit-node.modal.tsx`                                                         | 加载/编辑节点、共享节点表单；包含按服务器类型显示的反向代理设置。                                                       |
| M25  | `nodes_nodeUsageStatsDrawer`                        | `nodes/node-usage-stats/node-usage-stats.drawer.tsx`                                                | 单节点日期范围内的用户用量、用户解析和图表。                                                                            |
| M26  | `nodes_nodesUsageStatsModal`                        | `nodes/nodes-usage-stats/nodes-usage-stats.modal.tsx`                                               | 多节点日期范围内的用户用量、用户解析和图表。                                                                            |
| M27  | `nodes_linkedHostsDrawer`                           | `nodes/linked-hosts-drawer/linked-hosts.drawer.tsx`                                                 | 节点关联 Host 卡片及操作入口。                                                                                          |
| M28  | `nodes_nodeActiveSessionsDrawer`                    | `nodes/node-active-sessions-drawer/node-active-sessions.drawer.tsx`                                 | 节点活跃用户和 IP/session 统计、进度、失败、刷新及虚拟列表。                                                            |
| M29  | `nodes_nodesConfigProfilesDrawer`                   | `nodes/nodes-config-profiles-drawer/nodes-config-profiles.drawer.tsx`                               | 从一个配置中选择多个入站，返回配置 UUID/入站 ID；保留受管创建协议和服务器类型过滤。                                     |
| M30  | `nodes_nodeInboundsHostsDrawer`                     | `nodes/node-inbounds-hosts-drawer/node-inbounds-hosts.drawer.tsx`                                   | 节点 → 活跃配置 → 入站 → Host 关系树。                                                                                  |
| M31  | `nodes_nodeGeocheckModal`                           | `nodes/node-geocheck-modal/node-geocheck.modal.tsx`                                                 | 默认源/IP/网卡选择、地理检查任务、轮询、结果/失败和重试。                                                               |
| M32  | `nodes_nodeSshTerminal`                             | `nodes/node-ssh-terminal/node-ssh-terminal.window.tsx`                                              | 自定义 SSH 窗口、连接/会话标签、密钥导入、主机指纹、连接配置、命令片段、Vault 各屏及实例冲突；不是普通 Modal 内容替换。 |
| M33  | `internalSquads_internalSquadsInboundsDrawer`       | `internal-squads/internal-squads-inbounds-drawer/internal-squads-inbounds.drawer.tsx`               | 内组入站分配，分组/平铺模式、搜索/选择/保存。                                                                           |
| M34  | `internalSquads_internalSquadAccessibleNodesDrawer` | `internal-squads/internal-squad-accessible-nodes-drawer/internal-squad-accessible-nodes.drawer.tsx` | 内组可访问节点列表。                                                                                                    |
| M35  | `internalSquads_internalSquadsUsageDrawer`          | `internal-squads/internal-squads-usage-drawer/internal-squads-usage.drawer.tsx`                     | 内组日期范围用量、分页及统计口径说明弹层。                                                                              |
| M36  | `externalSquads_externalSquadsDrawer`               | `external-squads/external-squads-drawer/external-squads.drawer.tsx`                                 | 七个页签：模板、设置、Host、响应头、HWID、自定义备注、订阅页配置及覆盖开关。                                            |
| M37  | `configProfiles_activeNodesModal`                   | `config-profiles/active-nodes-modal/active-nodes.modal.tsx`                                         | 使用指定配置的节点、国家、名称和 UUID 复制。                                                                            |
| M38  | `configProfiles_configProfileInboundsDrawer`        | `config-profiles/config-profile-inbounds-drawer/config-profile-inbounds.drawer.widget.tsx`          | 入站及活跃内组关系树、原始入站查看。                                                                                    |
| M39  | `nodePlugins_nodePluginExecutorDrawer`              | `node-plugins/node-plugin-executor/node-plugin-executor.drawer.tsx`                                 | 选择命令/配置/在线目标节点，执行 block IPs、unblock IPs、recreate tables。                                              |
| M40  | `nodeIntegrations_nodeIntegrationsModal`            | `node-integrations/node-integrations-modal/node-integrations.modal.tsx`                             | Node Integration 列表、刷新、创建/编辑/删除入口。                                                                       |
| M41  | `nodeIntegrations_nodeIntegrationEditorModal`       | `node-integrations/node-integration-editor-modal/node-integration-editor.modal.tsx`                 | 名称、描述、JSON 配置编辑；已有项保存后决定立即应用/重启或稍后处理。                                                    |
| M42  | `infraBilling_viewInfraProviderModal`               | `infra-billing/view-infra-provider-modal/view-infra-provider.modal.tsx`                             | 编辑供应商名称、登录 URL、favicon URL。不是只读详情。                                                                   |
| M43  | `infraBilling_createInfraProviderModal`             | `infra-billing/create-infra-provider-modal/create-infra-provider.modal.tsx`                         | 创建供应商及 URL 字段校验。                                                                                             |
| M44  | `infraBilling_createInfraBillingNodeModal`          | `infra-billing/create-infra-billing-node-modal/create-infra-billing-node.modal.tsx`                 | 供应商、下次账单日期与节点关联；选择已有节点或填写独立名称。                                                            |
| M45  | `infraBilling_createInfraBillingRecordModal`        | `infra-billing/create-infra-billing-record-modal/create-infra-billing-record.modal.tsx`             | 供应商付款金额、账单日期与记录创建。                                                                                    |
| M46  | `infraBilling_updateBillingDateModal`               | `infra-billing/update-billing-date-modal/update-billing-date.modal.tsx`                             | 单个或多个账单节点的下次账单日期更新。                                                                                  |
| M47  | `hosts_createHostDrawer`                            | `hosts/create-host-drawer/create-host.modal.tsx`                                                    | Host 创建、共享字段及节点/配置/入站/模板/内组/标签数据。                                                                |
| M48  | `hosts_editHostDrawer`                              | `hosts/edit-host-modal/edit-host.modal.tsx`                                                         | 加载并编辑 Host，字段、覆盖值及关联配置完整保留。                                                                       |
| M49  | `hosts_editManyHostsDrawer`                         | `hosts/edit-many-hosts-drawer/edit-many-hosts.drawer.tsx`                                           | 共享 Host 表单批量编辑、变更确认和指定 UUID 集合更新。                                                                  |
| M50  | `hosts_hostMapperModal`                             | `hosts/host-mapper-modal/host-mapper.modal.tsx`                                                     | 按入站 schema 编辑 mapper JSON：`xrayJson`、`mihomo`、`base64`，返回父表单。                                            |
| M51  | `hosts_hostsConfigProfilesDrawer`                   | `hosts/hosts-config-profiles-drawer/hosts-config-profiles.drawer.widget.tsx`                        | 只选一个入站及所属配置，返回父 Host 表单；不同于 M29 的多选。                                                           |
| M52  | `sharedLists_sharedListsModal`                      | `shared-lists/shared-lists-modal/shared-lists.modal.tsx`                                            | Shared List 列表、刷新、创建/编辑/删除。                                                                                |
| M53  | `sharedLists_sharedListEditorModal`                 | `shared-lists/shared-list-editor-modal/shared-list-editor.modal.tsx`                                | 命名 JSON 列表、schema 校验，保存后选择立即同步节点或稍后处理。                                                         |
| M54  | `snippets_snippetsModal`                            | `snippets/snippets-modal/snippets.modal.tsx`                                                        | 配置片段列表、刷新及创建/编辑/删除子工作流。                                                                            |
| M55  | `rwSettings_passkeysDrawer`                         | `remnawave-settings/passkeys-drawer/passkeys.drawer.tsx`                                            | Passkey 列表、WebAuthn 注册、重命名/删除、注册失败反馈。                                                                |

## 4. 注册表之外的弹层

基线存在 **89 处** `modals.open/openConfirmModal/openContextModal` 调用，分布在 70 个 TS/TSX 文件：52 处 `open`、37 处 `openConfirmModal`、0 处 `openContextModal`。这是调用点数，不是 89 个独立弹窗，也不能与 55 项相加当成窗口总数。复核命令：

```powershell
rg -n 'modals\.(open|openConfirmModal|openContextModal)\(' src -g '*.tsx' -g '*.ts'
```

还必须扫描 `<Modal>`、`<Drawer>` 和自定义窗口。比如多语言编辑器 `src/widgets/dashboard/subpage-configs/subpage-config-editor/editor-components/localized-text-editor.component.tsx` 使用页面自身状态控制弹窗，不会出现在上述调用统计里。

| 必须随业务组迁移的动态界面                                                                     | 源码定位（相对 `src/`）                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API token 创建/显示、认证/品牌校验错误、Passkey 注册错误                                       | `widgets/remnawave-settings/api-tokens-card/`、`authentification-settings-card/`、`branding-settings-card/`；M55。                                                                                                                              |
| 用户删除/吊销/流量重置、按状态删除、批量延期、HWID 单台/全部删除、表格视图模板保存             | `features/ui/dashboard/users/`、`features/dashboard/users/users-table-templates/`；M17、M19、M21。                                                                                                                                              |
| 节点多选更新/批量动作、单个/全部重启、删除；Host 批量动作/编辑确认/删除                        | `features/dashboard/nodes/multi-select-nodes/`、`features/ui/dashboard/nodes/`、`features/dashboard/hosts/multi-select-hosts/`、`features/ui/dashboard/hosts/delete-host/`。                                                                    |
| 原始 JSON、用户/节点元数据、Host mux/遮罩/socket 配置、配置/入站查看、原始订阅及单项连接二维码 | `shared/ui/forms/`、`widgets/dashboard/hosts/host-card/`、`widgets/dashboard/config-profiles/`、`shared/ui/config-profiles/`；M13、M14、M38。                                                                                                   |
| 流量图表钻取、HWID 平台/应用明细、会话条件/用量口径说明                                        | `widgets/dashboard/users/user-usage-statistic/`、`widgets/dashboard/nodes-statistic/`、`widgets/dashboard/hwid-inspector/`；M18、M28、M35。                                                                                                     |
| 配置编辑保存/计算配置提示、密钥生成器、未保存离开保护、规则调试器、插件活跃节点和编辑离开保护  | `features/dashboard/config-profiles/config-editor-actions/`、`widgets/dashboard/config-profiles/`、`features/dashboard/response-rules/response-rules-editor-actions/`、`widgets/dashboard/response-rules/`、`widgets/dashboard/node-plugins/`。 |
| 立即应用/稍后应用、片段创建/编辑/删除                                                          | `shared/_modals/universal/apply-to-nodes-modal/apply-to-nodes.modal.tsx`（已导出但未注册）、`widgets/dashboard/config-profiles/snippets/use-snippet-actions.tsx`；M41、M53、M54。                                                               |
| 订阅页导入、保存结果、校验错误、区块/应用/多语言编辑；订阅备注校验                             | `pages/dashboard/subpage-config/ui/components/`、`widgets/dashboard/subpage-configs/subpage-config-editor/`、`widgets/dashboard/subscription-settings/settings/cards/`；M36。                                                                   |
| 模板变量、模板下载/导入选择器；各实体删除、克隆、组成员确认                                    | `shared/ui/popovers/template-info-popover/`、`shared/ui/load-templates/`、各业务 grid 和 action hook。                                                                                                                                          |
| 账单删除、报告清理、拓扑删除/丢弃草稿                                                          | `widgets/dashboard/infra-billing/`、`widgets/dashboard/torrent-blocker-reports/`、`pages/dashboard/topology/topology.page.connector.tsx`。                                                                                                      |
| Runtime、版本、更新确认、Recap、Prime 信息                                                     | `pages/dashboard/home/components/home.page.tsx`、`shared/ui/header-buttons/`、`shared/ui/sidebar/build-info-modal.tsx`。                                                                                                                        |

此表是迁移归属索引，不是对动态调用逐项验收的替代。每组开工时从调用点建立实例清单，记录打开、提交、取消、关闭重开、嵌套弹层及卸载后的结果。

## 5. 不能丢失的状态和条件

### 功能开关与偏好

依据 `src/entities/dashboard/view-preferences-store/`，`viewPreferencesStore` 当前为 version 2，四个实验功能默认均为 `false`：

| 开关                | 实际影响                                                  | 验收                                                                  |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `legacyLayoutStyle` | `app/layouts/dashboard/main-layout/layout.tsx` 的布局选择 | 两种布局的相同路由/动作都可到达；兼容旧 `layoutStyle` 偏好迁移。      |
| `quickLauncher`     | `shared/ui/quick-launcher/quick-launcher.tsx`             | 开/关、位置/列数、快捷项排序/持久化/删除、路由/弹窗/外链三类入口。    |
| `nodeIntegrations`  | 节点表、批量编辑、节点表单与页头 Integration 入口         | 默认隐藏与开启后完整 M40/M41 流程都验证，不以默认关闭作为删功能理由。 |
| `sshTerminal`       | 节点 SSH 动作及快捷启动项                                 | 开关同时约束快捷配置与显示；保留当前节点 SSH 动作在移动端隐藏的行为。 |

另保留 nodes/hosts 卡片与表格模式、activeTag、sectionActiveTags、快捷链接清洗、旧版本偏好迁移。服务端认证配置独立于以上本机实验开关：密码/注册/Passkey/OAuth 可用性与 Passkey 管理禁用态必须按服务端配置生效。

### 完整表格契约

| 范围                                  | 数据/选择语义                                                                                                                                  | UI 与偏好要求                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户表                                | 服务端分页、筛选、筛选模式、排序；`start/size/filters/filterModes/sorting` 不变；稳定用户 ID、当前页全选与跨页已选集合；全部用户与所选用户分开 | 列固定/顺序/宽度/可见性、筛选器、密度、全屏、清除/重置；保留筛选模板。空值筛选清理、数值范围及标签/status 选项不得改语义。选择后暂停自动刷新等现有行为需保留或明确验证等价方案。 |
| HWID / SRH / Torrent Reports          | 各自服务端分页/过滤模式/排序及指标/明细；不能先取一页再在浏览器筛选伪装成全量结果                                                              | 保留列交互、分页与重置、密度/全屏、错误/加载/空状态；保留报告原文与清理动作。                                                                                                    |
| Hosts / Nodes DataTable               | 现有客户端筛选/排序；Host viewPosition 顺序、卡片/表格联动选择、批量操作和重排                                                                 | 首尾列固定、拖列、调宽、显隐、各项独立重置；卡片视图仍可使用，不强制只剩表格。                                                                                                   |
| 用户弹窗明细、排行榜、HTTP 统计、账单 | 各自日期范围/分页/下钻/响应式行为                                                                                                              | 不因未使用同一表格库而漏迁；日期、货币/流量/零值显示、移动端替代表达保持正确。                                                                                                   |

当前持久化键/版本应成为偏好迁移测试输入，而非全部清空：`x-rmnw-users-table` v13、`x-rmnw-hwid-inspector-table` v2、`x-rmnw-srh-inspector-table` v3、`x-rmnw-tb-reports-table` v3、`x-rmnw-users-table-templates` v1；Nodes/Hosts 列缓存分别是 `nodes-datatable-nodes-v8`、`hosts-datatable-hosts-v5`。源头为 `src/shared/lib/mrt-table-store/`、对应 `entities/dashboard/*/*-store` 和两个 DataTable widget。

注意：当前通用持久化 store 没有保存全部瞬时表格状态；密度/全屏与过滤 mode 不应被误写成已全部持久化。迁移需要逐项约定恢复范围，验证旧键、损坏值、未知列、新版本和 reset，不能把库内部类型继续暴露成业务模型。

### 高风险组件生命周期

| 边界            | 必须保留/重写的行为                                                                                                                | 验证重点                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 表单草稿        | 同一实体远端刷新不能覆盖本地编辑；实体切换正确初始化；保存失败保留草稿；显式 reset/discard 才覆盖；多步与嵌套编辑同步返回          | 连续输入、清空/零值、快速切换、409、保存中关闭、关闭重开、页签切换、慢响应。生命周期要求不是“现状全部已通过”的声明。                                     |
| 虚拟列表/网格   | 入站平铺/分组、用户内组、简单内组、移动账单，以及节点/Host picker、HWID/报告、会话、排行榜、拖放网格、指标 masonry                 | 真实高度链、非零 viewport、滚动到底、选择不丢、长标签/分组头、搜索后定位、父弹窗动画、resize、分页追加；不退化成全量渲染。                               |
| Monaco + WASM   | 配置/模板/规则/插件/JSON 编辑器模型、schema、语言、主题、校验运行时与异步结果归属                                                  | 首次加载/失败重试、连续编辑、切换实体、关闭重开、model/listener/worker 释放、错误定位和草稿不回退。                                                      |
| 拓扑与 NodeEdge | 拓扑拖放/按钮替代、连线、回环/同服务器回链禁止、负载均衡、格式限制、版本冲突；反代独立保存/应用/重载                               | 跨服务器链和多入口汇聚、拒绝无效图、预览与真实保存读回；409 后草稿保留；保存不冒充已应用，离线 Agent 不冒充成功。                                        |
| SSH/Xterm/Vault | `src/shared/_modals/nodes/node-ssh-terminal/` 全部窗口/标签/连接界面；`src/entities/ssh-vault/` 的密钥、连接、片段、PIN、备份/恢复 | 真实 IndexedDB、锁定/退出/切换会话、解锁迟到、错误 PIN、导入/备份、主机指纹确认、resize/focus、断线/重连、标签关闭；不把密钥放入持久化 UI prefs 或日志。 |
| Passkey         | 登录和管理注册两条真实 WebAuthn 流程，不只 HTTP 表单                                                                               | 用户取消、认证器等待时卸载/退出、旧 challenge、迟到结果、正常成功；保留单一 auth 真源。                                                                  |
| 图表与实时视图  | 日期/时区、指标单位、空值/零值、tooltip/legend、点击钻取、轮询进度/错误                                                            | 时间范围切换、移动端、暗/亮主题、卸载取消轮询/订阅，不用静态图冒充实时数据。                                                                             |

虚拟列表涉及的现有实现不止先前修复的五类；可用 `rg -n 'Virtuoso|GroupedVirtuoso|VirtuosoGrid|VirtuosoMasonry' src -g '*.tsx'` 补齐调用者。先前 SSR/CSS 高度探针只证明布局，不能代替本阶段真实挂载后的滚动/选择测试。

## 6. 按业务边界分组实施

下面是工作边界与交付门槛，不是工期承诺，也不是新的简化产品方案。每一组必须同时迁移页面、相关注册/动态弹层、业务模型及回归；共享组件迁完不能提前把调用页面标为完成。

| 组                            | 范围                                                                                                   | 交付门槛                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| G0 基础设施与导航             | `app`、布局、主题/方向/响应式、通知/进度/连接状态、通用弹层与输入；P01/P02/P04/P25、404/error、M01–M07 | 既有路由/认证/深链工作；HeroUI 原生基础交互和焦点恢复；会话隔离回归保持通过。M04 的六类表单仍须在各业务组验收。 |
| G1 用户与检测表格             | P05/P20/P21/P22/P24，M08–M22，表格模型/偏好和用户相关动态动作                                          | 完整表格契约、跨页选择、全部/所选权限范围、用户编辑/嵌套明细，真实多页数据验收。                                |
| G2 服务器与 Host              | P06/P08，M23/M24/M27/M29–M31/M40/M41/M47–M51；NodeEdge 与更新/安装相关界面                             | 三种服务器创建规则、外部导入、Mieru 映射、配置选择差异、反代草稿/冲突/应用、卡片/表格与批量功能完整。           |
| G3 配置、组和发布内容         | P10–P14/P16/P18/P19/P26–P29，M33–M39/M52–M54，六类通用创建内容                                         | 编辑器/可视化编辑、七页签外组、共享列表/片段、应用选择、模板导入/变量/规则调试、未保存保护均可用。              |
| G4 拓扑                       | P07 与相关动态确认/预览                                                                                | 真正拖放/连线/负载均衡、键盘替代、无效图拒绝、版本冲突、保存重载和 Mihomo 输出契约验证。不能仅展示示例画布。    |
| G5 SSH 与认证设置             | M32/M55，P17 的认证、API token、实验开关，以及 Vault 全部子屏                                          | 真实浏览器 Vault 生命周期与终端交互、WebAuthn 登录/管理、token 权限/显示、条件入口，秘密不进入 UI 偏好或日志。  |
| G6 统计、会话、账单与剩余设置 | P03/P09/P15/P23/P30，M25/M26/M28/M42–M46，P17 品牌/工具及所有剩余动态信息弹层                          | 图表/钻取、实时进度、桌面/移动账单、功能开关和后台动作均验收；不会因“辅助页”降级成只读占位。                    |
| G7 收尾与全量回归             | 所有 P/M 行、动态调用、受控弹层、样式/依赖/构建配置                                                    | 每项有实际证据；删除全部 Mantine 和两种表格依赖；旧偏好迁移、生产编译、精确镜像浏览器回归通过。                 |

## 7. 完成判定

每个 P/M 项至少记录：实现变更、测试数据和前置开关、正常路径、失败/取消路径、关闭重开/离开行为、桌面/移动覆盖、证据所用前后端 SHA/镜像。纯 UI 的错误/帮助页按适用项验收。以下门槛不能用截图、AST 形状检查或类型检查单独替代：

1. **覆盖率口径**：30 个实际页面、55 个注册项全部逐行签收；通用创建六分支、动态弹层和页面内受控弹层另有实例清单。无空按钮、假数据或旧 Mantine 子树冒充已迁移。
2. **表格和草稿**：用超过一页的数据验证筛选模式/排序/跨页选择、当前页全选与全部用户动作差异、偏好恢复、列控制、密度/全屏；同实体 refetch、409、失败保存和取消不丢本地编辑。
3. **叠层和无障碍**：Tab/Shift+Tab、Esc、遮罩关闭、焦点回到触发者、嵌套确认、弹窗内下拉/日期/编辑器/拖放可用；固定 ENTRY/EXIT 不产生错误 disabled 祖先语义。移动 viewport、安全区、RTL 与暗/亮主题不裁切主要操作。
4. **真实运行时**：虚拟滚动、Monaco/WASM、Xterm、IndexedDB、WebAuthn、图表钻取和轮询分别验证。纯模型测试证明数据逻辑，SSR/CSS 证明布局，实际浏览器证明挂载后的操作；三者不能互相冒充。
5. **协议和原始需求**：受管创建只呈现允许组合，外部导入仍可编辑/编排；专线/Mieru、家宽/SOCKS 与风险提示正确；共享 443、唯一 SNI、反代、域名 Cloudflare 排除及验证状态不受换库影响。Mihomo 输出检查和真实客户端流量测试分开记录。
6. **安全边界**：退出/重新登录后旧请求、旧 mutation、旧认证器或 Vault 解锁结果不能污染新会话；令牌/私钥/解密内容不写入一般 Zustand 持久化、通知或调试输出。使用隔离测试数据，不读取用户现有密钥库来凑覆盖。
7. **依赖与编译**：检查 package、lockfile、所有源码、CSS、主题、PostCSS/Vite 配置和生产入口，Mantine 及两种 Mantine table 的运行时/构建依赖为零；文档中的历史名称不算依赖。全仓 lint、测试、TypeScript 和 GitHub Actions 应用编译通过。
8. **部署证据**：应用继续只在 GitHub Actions 编译，在 `185.99.135.224` 上用精确配对镜像与隔离数据做浏览器回归。域名大陆探测使用另行授权的 `42.192.61.137`；页面显示正确不等于网络已验证。文档和测试结果注明已通过、失败、未覆盖，不用“可打开”概括端到端完成。

实施前的 bug 检查点见 [会话、密钥库及列表回归修复](session-and-vault-bugfix-checkpoint.md)，既有浏览器证据见 [配对面板验收记录](paired-panel-ui-acceptance.md)。这些是迁移需要保持的基线，不自动为新 UI 提供验收结论。本文未修改业务代码、依赖或构建配置。
