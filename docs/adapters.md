# 新增网站适配器

现有实现只支持 YouTube。下面是贡献流程，不代表扩展已支持任何其他网站。先读 [Adapter 接口](architecture.md#adapter)。

## 1. 定义来源范围

写清楚要处理的路由、内容类型与排除区域。单独列出播放器、广告、私信、编辑器和当前详情主内容的处理方式。默认不要触碰不在需求范围内的数据。

为来源选择稳定 ID，例如 `example`。来源 ID 会进入内容身份和缓存；变更相当于新增来源。

## 2. 隔离网站代码

建议目录：

```text
src/adapters/example/
  urls.ts       # 纯 URL 解析和页面上下文，可做非 UI 单元测试
  index.ts      # DOM 选择器、提取、范围与注册
  styles.css    # 可选的网站专属样式
```

参考 `src/adapters/youtube/`。在 `index.ts` 中调用 从 `src/core/adapters.ts` 导入的 `registry.register()`，实现 matches、getContext、collect、extract 和 isInScope。

- matches 校验协议和完整主机名。
- context.key 只包含会改变内容集合的路由参数；播放时间等无关变化不要重置页面。
- collect 返回不嵌套、可恢复的单条容器。共享视图追加自己的占位符，不移除原始内容。
- extract 只返回 `{source,id,type,title,author,text}`。没有稳定身份或正文/标题时返回 null，不能猜数据。
- 站点导航事件和需要观察的属性放进适配器；共享 `content.ts` 不增加网站选择器或来源分支。
- 不导入网络 provider，不读取 storage，不自行决定隐藏。

## 3. 显式接入加载与权限

新增精确的 `host_permissions` 和独立 `content_scripts` 条目；只对该网站注入其适配器。不要通配所有网站。

TypeScript 使用显式 ES 模块导入。当前 `content.ts` 导入 YouTube 适配器，由 esbuild 打包成独立的 `dist/src/content.js`。增加来源时，建立独立入口只导入该来源的适配器、复用共享运行层，并加入打包入口及 manifest；不要把所有来源一起注入每个网站。CSS 顺序：共享 content.css → 来源 styles.css。

各页面使用自己的注册表和唯一匹配项。代码随扩展本地打包，不下载远端脚本。

## 4. 验证与提交

运行 `npm run check`、`npm test`、`npm run package`。为 URL 解析、标准数据兼容性等非 UI 行为添加有意义的测试。

不要写 UI 单元测试；在 `docs/manual-verification.md` 中增加具体操作和预期结果，覆盖新旧两个来源：首次加载、无限滚动、卡片复用、无刷新跳转、查看已隐藏内容、关闭保护、失败放行和页面范围隔离。由用户实际验收后才能标记完成。

PR 说明权限和发送字段的变化。检查产品默认规则是否适用于新来源；不要偷偷改掉用户已经编辑的规则。
