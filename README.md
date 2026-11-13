# Miniblog

一个只把数据存在浏览器里的小型动态发布页。纯 HTML + CSS + JavaScript，无框架、无构建、无后端。

## 功能

- **发布**：输入文字点击发布，空内容不可提交，单条上限 280 字
- **时间线**：按发布时间倒序展示，最新的一条在最上面
- **持久化**：内容写入 LocalStorage，刷新或重开浏览器后仍保留
- **自适应**：跟随系统浅色 / 深色主题，移动端单列布局

不含账号体系、点赞、评论、删除，完全最小可用。

## 目录

```text
miniblog/
├── index.html    # 页面结构
├── styles.css    # 全部样式（含深色模式与动效降级）
├── app.js        # 发布、渲染、存储逻辑
├── README.md
├── .gitignore
└── .nojekyll     # GitHub Pages 跳过 Jekyll 处理
```

## 本地运行

直接双击 `index.html` 即可，无需服务器。也可以起一个本地静态服务：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000>。

## 数据结构

LocalStorage 键名 `miniblog.posts.v1`，值为数组，每项：

```json
{
  "id": "b1c2...",
  "content": "文本内容",
  "createdAt": 1762938000000
}
```

- `id`：`crypto.randomUUID()`，降级为时间戳 + 随机串
- `createdAt`：毫秒时间戳，用于倒序排列
- 读取时会做清洗：丢弃非法项，缺失字段补默认值，超长文本截断
- 当前只有一个本地身份 `Guest`，展示为 `@guest`，头像取首字母

## 实现要点

- 渲染使用 `textContent` 写入内容，配合 `white-space: pre-wrap` 保留换行，天然规避 HTML 注入
- 写入失败（隐私模式、配额满）时回滚内存中的新条目并提示，不会出现「界面上有、刷新后消失」
- 首次使用写入探针检测 LocalStorage 可用性，不可用时直接禁用发布
- 新发布采用增量插入而非整表重绘，避免已有条目重复播放进入动画

## 部署

代码托管在 GitHub，`main` 分支根目录即站点根目录，通过 GitHub Pages 提供静态访问。

## 许可

仅供学习与个人演示使用。页面不包含任何第三方平台的名称、图标或标识。
