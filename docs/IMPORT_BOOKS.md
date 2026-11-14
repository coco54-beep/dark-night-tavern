# 导入自己的小说

## 方式一：游戏内导入（推荐）

首页 →「导入 TXT」：

- 文件 ≤ 5 MB，正文 ≤ 500,000 字符，UTF-8
- 可选「生成全书概要」「生成故事圣经」或「直接开始」
- 故事圣经按 4 万字分段并行分析；50 万字大约需要几分钟
- 书只保存在本机，不会上传到服务器

这是开源版的主要用法，不需要改代码。

## 方式二：作为“内置书”加载

适合超过 50 万字符、或希望像内置书目一样启动更快的情况。

1. 选一个只含小写字母的 ID，例如 `novel_mybook`。引擎只识别 `novel_` 开头且后面全是小写字母的 ID。
2. 把 TXT 转成 JSON，放到 `worlds_data/novel_mybook.json`：

```powershell
node -e "const fs=require('fs');const t=fs.readFileSync('mybook.txt','utf8');fs.writeFileSync('worlds_data/novel_mybook.json',JSON.stringify({text:t}))"
```

3. 在 `worlds-index.js` 的 `BUILTIN_WORLDS` 里加一条：

```js
{ id:"novel_mybook", name:"我的书", title:"我的书", author:"佚名", complete:true }
```

4. 重启 `node serve.js`，刷新页面。

可选：同目录放 `novel_mybook.bible.json`，引擎会自动读取。字段示例：

```json
{
  "summary": "全书概要",
  "ending": "现有文本的结局或未完成状态",
  "anchors": ["必须始终成立的事实"],
  "themes": ["主题"],
  "tone": "文风",
  "characters": [{"name":"人物","gender":"男","age":30,"identity":"身份","personality":"性格","voice":"语气","goal":"动机","status":"关系状态","attitude":"对玩家态度","knows":"所知"}],
  "relationships": [{"a":"人物A","b":"人物B","relation":"关系","aff":50,"desire":0}],
  "foreshadowing": ["伏笔"],
  "timeline": ["关键事件"]
}
```

没有圣经也能玩，只是长书的连续性会弱一些。

## 版权

只导入你拥有权利或已获授权使用的文本。不要提交、打包或公开分发受版权保护的小说、由此生成的圣经或含书的 APK。
