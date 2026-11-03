export type Note = {
  term: string;
  meaning: string;
  definition: string;
  french: string;
  context: string;
  ipa?: string;
  kind?: "person" | "background";
  aliases?: string[];
};
export type Article = {
  id: string;
  title: string;
  intro: string;
  body: string;
  created: number;
  analysis?: { notes: Note[] };
  status: "unread" | "reading" | "done";
  position: number;
  personalNotes: string;
  updated?: number;
};
function str(v: unknown, name: string, max: number, optional = false) {
  if (v === undefined && optional) return "";
  if (typeof v !== "string" || v.length > max)
    throw Error(`${name}必须是文本，且不能超过 ${max} 字符。`);
  return v;
}
export function normalize(v: any): Article {
  if (!v || typeof v !== "object") throw Error("文章必须是 JSON 对象。");
  const body = str(v.body, "正文", 200000);
  if (!body.trim()) throw Error("正文不能为空。");
  let analysis: Article["analysis"];
  if (v.analysis !== undefined) {
    const a = v.analysis;
    if (!a || !Array.isArray(a.notes) || a.notes.length > 500)
      throw Error("analysis.notes 必须是词汇数组，最多 500 条。");
    analysis = {
      notes: a.notes.flatMap((n: any) => {
        const term = str(n?.term, "词汇原文", 300);
        const person = n.kind === "person";
        if (n.kind !== undefined && !person && n.kind !== "background")
          throw Error("不支持的注释类型。");
        let aliases: string[] = [];
        if (person) {
          if (!Array.isArray(n.aliases) || n.aliases.length > 100)
            throw Error("人物 aliases 必须为最多 100 项的数组。");
          aliases = [
            ...new Set<string>(
              n.aliases.map((x: unknown) => str(x, "人物别称", 300)),
            ),
          ];
          if (aliases.some((x) => !x.trim())) throw Error("人物别称不能为空。");
        }
        const original = body + " " + (v.intro || "") + " " + (v.title || "");
        if (
          !term.trim() ||
          ![term, ...aliases].some((x) =>
            original.toLowerCase().includes(x.toLowerCase()),
          )
        )
          throw Error(`词条「${term}」及其别称未出现在原文中。`);
        if (
          ![term, ...aliases].some((x) =>
            new RegExp(termPattern(x), "iu").test(original),
          )
        )
          return [];
        return [
          {
            term,
            ...(person
              ? { kind: "person" as const, aliases }
              : n.kind === "background"
                ? { kind: "background" as const }
                : {}),
            meaning: str(n.meaning, "中文释义", 5000),
            definition: str(n.definition, "英文定义", 5000, true),
            french: str(n.french, "法语对应表达", 5000, true),
            context: str(n.context, "语境补充", 5000, true),
            ipa: str(n.ipa, "音标", 300, true),
          },
        ];
      }),
    };
  }
  const status = v.status ?? statusForPosition(v.position ?? 0);
  if (!["unread", "reading", "done"].includes(status))
    throw Error("阅读状态无效。");
  if (
    v.position !== undefined &&
    (typeof v.position !== "number" ||
      !Number.isFinite(v.position) ||
      v.position < 0 ||
      v.position > 1)
  )
    throw Error("阅读位置应在 0 到 1 之间。");
  return {
    id: typeof v.id === "string" && /^[a-f0-9-]{36}$/.test(v.id) ? v.id : "",
    title: str(v.title, "标题", 300, true),
    intro: str(v.intro, "序言", 20000, true),
    body,
    created:
      typeof v.created === "number" &&
      Number.isFinite(v.created) &&
      v.created >= 0 &&
      v.created < 8640000000000000
        ? v.created
        : Date.now(),
    analysis,
    status: status as Article["status"],
    position: v.position ?? 0,
    personalNotes: str(v.personalNotes, "个人笔记", 50000, true),
    updated: typeof v.updated === "number" ? v.updated : undefined,
  };
}
export function parseImport(v: any) {
  if (v?.schemaVersion !== undefined && v.schemaVersion !== 1)
    throw Error("不支持此文件版本，请使用 schemaVersion: 1。");
  const rows = Array.isArray(v?.articles) ? v.articles : [v];
  if (rows.length < 1 || rows.length > 200)
    throw Error("每次请导入 1–200 篇文章。");
  return rows.map(normalize);
}
export const sample = {
  schemaVersion: 1,
  title: "A new perspective",
  intro: "",
  body: "Reading offers a new perspective.",
  analysis: {
    notes: [
      {
        term: "perspective",
        ipa: "/pərˈspektɪv/",
        meaning: "视角；看待事物的方式",
        definition: "A particular way of considering something.",
        french: "un point de vue（阳性）",
        context: "这里指阅读带来的理解角度。",
      },
    ],
  },
};
export const prompt = `请根据我提供的文章生成可下载的 UTF-8 .json 文件。使用 schemaVersion: 1，基本结构如下：
${JSON.stringify(sample, null, 2)}

保留标题、序言、正文及原有段落。title 和 intro 可为空。删去图注、摄影署名、图片来源、广告、订阅提示和导航，但保留正文中对图片的讨论。无法确定是否属于正文时保留原文。

根据可访问的历史对话、我问过的表达和阅读反馈选择需要解释的词汇。缺少依据时，按本文难度和本次额外要求选择。

按首次出现顺序排列 analysis.notes。同一词条只列一次，匹配完整单词或短语，保留文中实际拼写和屈折形式。例如 demanding 中的 din 不算一次出现。不要给仅作为其他单词一部分的字符串建卡。

普通词条省略 kind。term 使用原文中的词或短语，meaning 写中文释义，definition 写英文定义，french 写法语对应表达，context 用中文说明该词在此处的意思。单词提供 ipa，短语可省略。

专业术语（kind 为 "background"）：默认使用普通词卡。只有同时满足以下两点才标为专业术语：
1. 原文中的完整词或短语是某一领域对特定概念、制度、机制、方法或量的约定称谓，通常是名词或名词短语。
2. 作者在此处确实使用了该领域的专门含义。能简明指出它属于哪个领域、具体指什么；仅凭文章主题或词汇难度不能判定。

按原句区分义项。例如，化学中的 “coordination number”（配位数）可标为专业术语；“coordination between teams” 中的 “coordination” 是普通词。政治报道中，“electoral college” 指特定选举制度时可标为专业术语；“hammering” 表示猛烈批评、“pocketbook issues” 表示与个人经济状况相关的议题时，都用普通词卡。
历史事件名、机构名、政策标题或缩写本身都不足以判为术语。若只是需要补充背景，在普通词卡的 context 中说明即可。难以确定专门义时省略 kind；一篇文章可以没有专业术语。若确属术语，term 取原文中的完整表达，meaning 解释其专门含义，context 说明它在本文中的作用，同一术语只建一张卡。

公众人物注释规则：设 kind 为 "person"，以全名作为 term。aliases 列出文中实际出现且能明确指认该人的全名、姓、名、昵称等称呼，各称呼共用一张卡。meaning 和 definition 简述身份，context 说明此人与文中事件的关系。ipa 和 french 可为空。不要臆测身份或把有歧义的别称分给多个人。

正文和注释只写纯文本。不要插入颜色、HTML、Markdown 围栏或编号，网站会自动为三类注释配色和编号。`;

export function generationPrompt(extra: string) {
  const request = extra.trim();
  return request ? prompt + "\n\n本次额外要求：\n" + request : prompt;
}

export function statusForPosition(position: number): Article["status"] {
  return position <= 0 ? "unread" : position >= 1 ? "done" : "reading";
}

export function progressPercent(position: number) {
  if (position <= 0 || position >= 1) return position <= 0 ? 0 : 100;
  return Math.max(1, Math.min(99, Math.round(position * 100)));
}

export function compareArticles(a: Article, b: Article, order: string) {
  switch (order) {
    case "updated-desc":
      return (b.updated ?? b.created) - (a.updated ?? a.created);
    case "updated-asc":
      return (a.updated ?? a.created) - (b.updated ?? b.created);
    case "desc":
      return b.created - a.created;
    default:
      return a.created - b.created;
  }
}

export function cachedProgress(
  a: Article,
  local?: { position: number; updated: number; status?: Article["status"] },
) {
  if (
    !local ||
    !Number.isFinite(local.position) ||
    !Number.isFinite(local.updated) ||
    local.updated < (a.updated ?? 0)
  )
    return a;
  const position = Math.max(0, Math.min(1, local.position));
  return {
    ...a,
    position,
    updated: local.updated,
    status:
      local.status ??
      (position === a.position ? a.status : statusForPosition(position)),
  };
}

function termPattern(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = "[\\p{Script=Latin}\\p{M}\\p{N}_]";
  const left = new RegExp("^" + word, "u").test(term)
    ? "(?<!" + word + ")"
    : "";
  const right = new RegExp(word + "$", "u").test(term)
    ? "(?!" + word + ")"
    : "";
  return left + escaped + right;
}

export function annotatedParts(text: string, notes: Note[]) {
  const entries = notes
    .flatMap((note, index) =>
      [note.term, ...(note.aliases ?? [])]
        .filter(Boolean)
        .map((term) => ({ term, index })),
    )
    .sort((a, b) => b.term.length - a.term.length);
  if (!entries.length) return [{ text, index: -1 }];
  const pattern = new RegExp(
    entries.map((e) => "(" + termPattern(e.term) + ")").join("|"),
    "giu",
  );
  const result: { text: string; index: number }[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index!;
    if (at > start) result.push({ text: text.slice(start, at), index: -1 });
    const group = match.findIndex(
      (value, index) => index > 0 && value !== undefined,
    );
    const entry = entries[group - 1];
    result.push({ text: match[0], index: entry.index });
    start = at + match[0].length;
  }
  if (start < text.length) result.push({ text: text.slice(start), index: -1 });
  return result;
}
