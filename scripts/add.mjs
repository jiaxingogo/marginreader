import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {model} from './model.mjs';
const files=process.argv.slice(2);if(!files.length)throw Error('用法：npm run add -- /路径/分析文件.json 或备份.json');
await mkdir('articles',{recursive:true});
for(const file of files){const rows=model.parseImport(JSON.parse(await readFile(file,'utf8')));for(const a of rows){const h=createHash('sha256').update(a.title+'\0'+a.intro+'\0'+a.body).digest('hex');a.id||=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;a.personalNotes='';a.position=0;a.status='unread';a.updated=Date.now();const path='articles/'+a.id+'.json';try{await writeFile(path,JSON.stringify({schemaVersion:1,...a},null,2)+'\n',{flag:'wx'});console.log('Added '+path)}catch(e){if(e.code==='EEXIST')console.log('Skipped existing '+path);else throw e}}}
