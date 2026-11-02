import {readFile,mkdir,writeFile} from 'node:fs/promises';
const html=await readFile('dist/index.html','utf8');const index=JSON.parse(await readFile('dist/articles/index.json','utf8'));
for(const path of ['import',...index.map(x=>'read/'+x.id)]){await mkdir('dist/'+path,{recursive:true});await writeFile('dist/'+path+'/index.html',html)}
const base=process.env.BASE_PATH||'/';
await writeFile('dist/404.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页边 · Margin Reader</title><p>正在打开阅读页面…</p><script>const base='+JSON.stringify(base)+';if(location.pathname.startsWith(base)){location.replace(base+"?route="+encodeURIComponent(location.pathname.slice(base.length)))}else{document.querySelector("p").textContent="未找到此页面。"}</script></html>');
await writeFile('dist/.nojekyll','');console.log('Generated clean URL pages and fallback.');
