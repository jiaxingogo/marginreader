import {mkdir,readdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {model} from './model.mjs';
await rm('public/articles',{recursive:true,force:true});await mkdir('public/articles',{recursive:true});
const index=[],ids=new Set();
for(const file of (await readdir('articles')).filter(x=>x.endsWith('.json')).sort()){
 const raw=JSON.parse(await readFile('articles/'+file,'utf8'));
 if(raw.articles)throw Error(file+': 请先用 npm run add 拆分备份，每个文件只保存一篇文章。');
 const a=model.normalize(raw);const hash=createHash('sha256').update(a.title+'\0'+a.intro+'\0'+a.body).digest('hex');
 a.id||=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
 if(ids.has(a.id))throw Error('重复文章 ID：'+file);ids.add(a.id);
 let modified=(await stat('articles/'+file)).mtimeMs;
 try{const seconds=Number(execFileSync('git',['log','-1','--format=%ct','--','articles/'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());if(seconds>0)modified=seconds*1000}catch{}
 if(raw.created===undefined)a.created=modified;
 a.updated=Math.max(a.updated||0,modified);
 // Reading records belong to each browser, never publish them with article content.
 a.position=0;a.status='unread';a.personalNotes='';
 await writeFile('public/articles/'+a.id+'.json',JSON.stringify({schemaVersion:1,...a},null,2)+'\n');index.push({id:a.id,file:'articles/'+a.id+'.json'});
}
await writeFile('public/articles/index.json',JSON.stringify(index,null,2)+'\n');console.log('Prepared '+index.length+' repository articles.');
