export type Note={term:string,meaning:string,definition:string,french:string,context:string,ipa?:string,kind?:'person',aliases?:string[]};
export type Article={id:string,title:string,intro:string,body:string,created:number,analysis?:{translation:string,notes:Note[]},status:'unread'|'reading'|'done',position:number,personalNotes:string,updated?:number};
function str(v:unknown,name:string,max:number,optional=false){if(v===undefined&&optional)return '';if(typeof v!=='string'||v.length>max)throw Error(`${name}必须是文本，且不能超过 ${max} 字符。`);return v;}
export function normalize(v:any):Article {if(!v||typeof v!=='object')throw Error('文章必须是 JSON 对象。');const body=str(v.body,'正文',200000);if(!body.trim())throw Error('正文不能为空。');let analysis:Article['analysis'];if(v.analysis!==undefined){const a=v.analysis;if(!a||!Array.isArray(a.notes)||a.notes.length>500)throw Error('analysis.notes 必须是词汇数组，最多 500 条。');analysis={translation:str(a.translation,'译文',200000),notes:a.notes.map((n:any)=>{const term=str(n?.term,'词汇原文',300);const person=n.kind==='person';if(n.kind!==undefined&&!person)throw Error('不支持的注释类型。');let aliases:string[]=[];if(person){if(!Array.isArray(n.aliases)||n.aliases.length>100)throw Error('人物 aliases 必须为最多 100 项的数组。');aliases=[...new Set<string>(n.aliases.map((x:unknown)=>str(x,'人物别称',300)))];if(aliases.some(x=>!x.trim()))throw Error('人物别称不能为空。');}const original=body+' '+(v.intro||'')+' '+(v.title||'');if(!term.trim()||![term,...aliases].some(x=>original.toLowerCase().includes(x.toLowerCase())))throw Error(`词条「${term}」及其别称未出现在原文中。`);return {term,...(person?{kind:'person' as const,aliases}:{}),meaning:str(n.meaning,'中文释义',5000),definition:str(n.definition,'英文定义',5000,true),french:str(n.french,'法语对应表达',5000,true),context:str(n.context,'语境补充',5000,true),ipa:str(n.ipa,'音标',300,true)}})}}const status=v.status??'unread';if(!['unread','reading','done'].includes(status))throw Error('阅读状态无效。');if(v.position!==undefined&&(typeof v.position!=='number'||!Number.isFinite(v.position)||v.position<0||v.position>1))throw Error('阅读位置应在 0 到 1 之间。');return {id:typeof v.id==='string'&&/^[a-f0-9-]{36}$/.test(v.id)?v.id:'',title:str(v.title,'标题',300,true),intro:str(v.intro,'序言',20000,true),body,created:typeof v.created==='number'&&Number.isFinite(v.created)&&v.created>=0&&v.created<8640000000000000?v.created:Date.now(),analysis,status:status as Article['status'],position:v.position??0,personalNotes:str(v.personalNotes,'个人笔记',50000,true),updated:typeof v.updated==='number'?v.updated:undefined};}
export function parseImport(v:any){if(v?.schemaVersion!==undefined&&v.schemaVersion!==1)throw Error('不支持此文件版本，请使用 schemaVersion: 1。');const rows=Array.isArray(v?.articles)?v.articles:[v];if(rows.length<1||rows.length>200)throw Error('每次请导入 1–200 篇文章。');return rows.map(normalize);}
export const sample={schemaVersion:1,title:'A new perspective',intro:'',body:'Reading offers a new perspective.',analysis:{translation:'阅读提供了一个新的视角。',notes:[{term:'perspective',ipa:'/pərˈspektɪv/',meaning:'视角；看待事物的方式',definition:'A particular way of considering something.',french:'un point de vue（阳性）',context:'这里指阅读带来的理解角度。'}]}};
export const prompt=`请将我提供的文章制作成可下载的 UTF-8 JSON 分析文件，文件名使用 .json。仅使用以下结构（schemaVersion 必须为 1）：\n${JSON.stringify(sample,null,2)}\n生成文件前，删去图注、图片说明、摄影署名、图片来源或版权标记，以及广告、订阅提示、分享按钮文字、导航和相关推荐等与文章纯文本阅读无关的内容；这些被删除的内容也不应出现在译文或词汇注释中。保留文章标题、序言和正文及其原有段落，不删减或重写正文；正文中对图片的实质性讨论仍应保留，无法确定是否属于正文的内容不要擅自删除。title、intro 可以为空字符串。analysis.translation 完整翻译清理后保留的序言和正文，保留段落。根据你能访问的之前的对话，包括我使用的语言、曾询问的词汇和表达及阅读反馈，审慎评估我的语言水平，以此推测本文中我可能不理解、应当解释的词汇和表达，并结合已知阅读偏好选择注释。该评估仅作为选词依据，不视为正式语言测试结果；若无法访问历史对话或证据不足，不要假装知道我的水平，应依据当前对话和本次额外要求选择词汇与表达。普通词条的 term 必须逐字出现在 body 或 intro 中；同一词条只列一次。人物词条遵循下方规则，允许全名不直接出现在原文中。单词提供音标，短语无需音标。meaning 用中文，definition 用英文，french 提供法语对应表达，context 用简洁中文说明当前语境。不要把 Markdown 代码围栏写入文件。

公众人物注释规则：
- 为文章中的公众人物添加简要身份介绍和 context（该人物与本文事件的关系），不要臆测身份或未经核实的事实。
- 每个人只建立一张词卡：kind 为 "person"，term 为此人的全名；aliases 数组列出原文实际使用的全名、名、姓、昵称等所有叫法，保留原文拼写。全名即使未出现在原文也可作为 term，但至少一个 aliases 必须出现在 title、intro 或 body 中。
- meaning 用中文简要介绍人物；definition 用英文简要介绍；context 用中文说明本文语境；ipa 和 french 可为空。网站会在解释区自动显示 aliases，卡片标题仅显示全名。
- 全文中同一人物的各种叫法全部指向同一张词卡，不要为姓或昵称另建卡片。不要将同一别称分配给不同人物；有歧义时使用可明确区分人物的较长称呼，不能凭空猜测。
- 人物条目示例：{"kind":"person","term":"John Fitzgerald Kennedy","aliases":["John F. Kennedy","Kennedy","JFK"],"meaning":"约翰·菲茨杰拉德·肯尼迪，美国第35任总统。","definition":"The 35th president of the United States.","french":"","context":"简述此人与本文事件的关系。"}。此示例仅说明字段，不应添加到无关文章中。

渲染风格规范（与本站“连续阅读 · 页边词汇注释”排版示例一致）：
1. 使用浅灰绿色页面背景 #eaece7、暖白纸面 #fffefa、深绿色正文 #202923 和绿色强调 #2c644c；细浅绿分隔线 #dce0d6，圆角纸面。
2. 连续原文位于左栏，编号词汇注释位于右栏；保留原有段落，不按单词或句子拆成卡片。译文完整放在左栏原文之后。
3. 英语原文使用 Georgia / Times New Roman 衬线字体，桌面约 21–25px，行高约 1.9；中文及界面使用易读的无衬线字体。小屏幕适度缩小字号，保持原文和页边注两个独立区域。
4. 原文词汇以浅绿下划式背景 #e0eedb 标识，并用上标编号与页边注一一对应。注释依次呈现词条与音标、中文释义、英文定义、法语对应表达、语境补充；语境补充以较小的灰绿色字直接显示，不折叠、不要求点击展开。
人物标注使用柔和赭色文字 #805b32 和浅米金色下划背景 #f0e2c9，与普通词汇的绿色标注区分；保留编号，点击各种别称均定位同一人物卡片。
5. 阅读窗口的宽高均小于浏览器视口；内部原文与页边注独立滚动。点击原文划线词汇只滚动右侧页边注并突出对应条目，不滚动左侧原文或外层页面。
6. JSON 只保存内容，以上视觉样式由网站统一渲染；不要在正文或词汇字段中插入 HTML、CSS、Markdown 加粗、编号上标或界面代码，也不要添加本站不识别的样式字段。notes 按词汇首次在原文中出现的顺序排列。
`;

export function generationPrompt(extra:string){const request=extra.trim();return request?prompt+"\n\n本次额外要求：\n"+request:prompt;}

// Match longest names first; prevent partial matches inside Latin words.
export function annotatedParts(text:string,notes:Note[]){
 const entries=notes.flatMap((n,index)=>[n.term,...(n.kind==='person'?n.aliases||[]:[])].filter(Boolean).map(term=>({term,index,person:n.kind==='person'}))).sort((a,b)=>b.term.length-a.term.length);
 if(!entries.length)return [{text,index:-1}];
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=entries.map(e=>e.person?'(?<![\\p{Script=Latin}\\p{N}])'+escape(e.term)+'(?![\\p{Script=Latin}\\p{N}])':escape(e.term)).join('|');
 const re=new RegExp(pattern,'giu');const result:{text:string,index:number}[]=[];let start=0;
 for(const match of text.matchAll(re)){const at=match.index!;if(at>start)result.push({text:text.slice(start,at),index:-1});const entry=entries.find(e=>e.term.toLowerCase()===match[0].toLowerCase())!;result.push({text:match[0],index:entry.index});start=at+match[0].length;}
 if(start<text.length)result.push({text:text.slice(start),index:-1});return result;
}
