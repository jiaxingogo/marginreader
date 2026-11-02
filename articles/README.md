# 文章分析文件

每篇文章一个 UTF-8 JSON 文件，全部放在这个目录；不要手工创建 index.json。
可直接放入 GPT 生成的 JSON，或执行 `npm run add -- /路径/文章.json`。
然后`git add articles/`
`git commit -m "Add new reading articles`
`git push origin main`

完整备份必须用 `npm run add -- /路径/备份.json` 拆分。

放入这里并 push 的文章会随 GitHub Pages 公开发布。
不要把私人笔记、账号凭据或未准备公开的文章提交到仓库。
构建会生成文章目录和独立页面；文件名可以更改，文章 ID 应保持不变。
