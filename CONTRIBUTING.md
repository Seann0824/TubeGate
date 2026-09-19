# 贡献指南

TubeGate 当前支持 YouTube 和 Twitter / X，底层通过 Adapter 接口为未来来源保留扩展点。提交新网站支持前，说明适用页面、提取字段、排除区域和最小权限。

## 本地开发

需要 Node.js 20+。先安装锁定版本的开发依赖；自动检查不需要真实 API Key。源码、构建工具与非 UI 测试都使用严格 TypeScript，扩展没有第三方运行依赖。

```sh
npm ci
npm run check
npm run format:check
npm test
npm run package
```

在 Chrome 中加载 `dist/`。修改后重新打包、重新加载扩展并刷新目标标签页。真实 Jev 检查需要自己的 API Key，并消耗账户用量。

## 分层约束

- 网站选择器、导航事件和页面提取只能放在 `src/adapters/<source>/`。
- 适配器只产出标准 `ContentItem`，不读取 Key、不发 API 请求、不自行判定规则。
- 分类供应商代码放在 `src/providers/`，只产出 `{scores, latencyMs}`。
- 隐藏阈值由 `src/core/decision.ts` 决定，缓存和配额由分类服务负责。
- 新适配器必须使用精确域名权限；不要为了方便申请 `<all_urls>`。
- 保留配置存储键和用户规则。变更存储或消息协议时说明升级路径。

接口见 [架构文档](docs/architecture.md)；接入流程见 [适配器指南](docs/adapters.md)。

## 验证要求

不编写 UI 单元测试。

非 UI 变更使用有意义的测试覆盖：内容协议、URL 范围、配置兼容、供应商响应、缓存隔离、并发、配额和异常放行。测试中的来源与分类器为内存模拟，不代表支持了额外网站。

PR 应包含：解决的问题、实际行为变化、运行过的检查，以及权限/数据流/升级影响。不要提交 `dist/`、密钥、`.env*` 或日志；`.env.example` 可以作为不含凭据的模板提交。

CI 在 Node.js 20 和 22 下执行格式检查、严格类型检查、非 UI 测试与打包。CI 不调用真实 Jev，也不验证真实网站页面。
