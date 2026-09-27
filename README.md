# Universal Code Copy · 万能代码复制

一个 userscript：给任意网页上的代码加复制按钮。支持 Tampermonkey / Violentmonkey / ScriptCat。

安装：新建脚本，粘贴 [`universal-copy-button.user.js`](./universal-copy-button.user.js)，或者用管理器直接打开该文件的 raw 链接。

## 交互

| 操作 | 效果 |
| --- | --- |
| 鼠标悬停代码块 | 块的右边缘出现一个按钮，**高度跟着光标走**。鼠标横着移过去就能点到，块再长也不用往上找右上角 |
| 靠近按钮 | 离得远时按钮半透明，靠近后变清晰 |
| 悬停行内代码 | 代码右上角出现一个 16px 小角标，不挡正文 |
| **Alt + 点击**任意代码 | 鼠标不用移动，直接复制（对自带复制按钮的代码块也有效） |
| 复制成功 | 按钮变成绿色 ✓ 并显示“N 行”，代码块上划过一道光 |
| 触屏 | 点一下代码，按钮会出现在点按的位置 |

## 适配

- **各类代码**：`pre`、`pre > code`、带语法高亮的代码（highlight.js / Prism / Shiki 等）、行内 `code` / `samp` / `tt`，以及显示为块级的 `code`
- **小块、挤在一起的代码块**：按钮自动缩小，并在块内垂直居中，不会压到相邻的块
- **复制干净的文本**：去掉行号（包括 Hexo / Pygments 的表格行号）、`user-select:none` 的装饰（如 `$` 提示符）和零宽字符；按块级元素和 `<br>` 还原换行，空行保留
- **自带复制按钮的不重复添加**：会检测代码块本身和紧贴它的容器，比如 GitHub 的 `clipboard-copy`，ChatGPT / Claude / Gemini / DeepSeek 等网站的 Copy 按钮。检测不会扩展到整条 AI 回复
- **SPA / 流式输出**：用全局事件委托实现，不需要 MutationObserver，也不修改页面 DOM
- **样式隔离**：界面放在 Shadow DOM 里，使用 Constructable Stylesheet，不受页面 CSP 和样式影响；颜色按代码块背景自动切换深色 / 浅色
- 编辑器区域（Monaco、CodeMirror、Ace、textarea、contenteditable）不处理
