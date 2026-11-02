import {Article,normalize,parseImport} from './reading';
export const BASE=import.meta.env.BASE_URL;
type RecordValue={id:string,article?:Article,deleted?:boolean};
let dbPromise:Promise<IDBDatabase>|undefined;
function database(){return dbPromise??=new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('margin-reader:'+BASE,1);req.onupgradeneeded=()=>req.result.createObjectStore('articles',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('无法打开本地存储。请允许浏览器保存网站数据。'))})}
async function localRows(){const db=await database();return new Promise<RecordValue[]>((resolve,reject)=>{const r=db.transaction('articles').objectStore('articles').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function write(row:RecordValue){const db=await database();return new Promise<void>((resolve,reject)=>{const t=db.transaction('articles','readwrite');t.objectStore('articles').put(row);t.oncomplete=()=>resolve();t.onerror=()=>reject(Error('保存失败：本地存储空间不足或被浏览器禁用。请导出备份。'));t.onabort=()=>reject(t.error)})}
let repository:Promise<Article[]>|undefined;
async function repoArticles(){return repository??=(async()=>{const r=await fetch(BASE+'articles/index.json');if(!r.ok)throw Error('文章目录载入失败，请刷新重试。');const files: {id:string,file:string}[]=await r.json();return Promise.all(files.map(async f=>{const r=await fetch(BASE+f.file);if(!r.ok)throw Error('文章载入失败：'+f.file);return normalize(await r.json())}))})().catch(e=>{repository=undefined;throw e})}
async function all(){const [repo,local]=await Promise.all([repoArticles(),localRows()]);const map=new Map(repo.map(a=>[a.id,a]));for(const row of local){if(row.deleted)map.delete(row.id);else if(row.article){const file=map.get(row.id);map.set(row.id,file?{...file,position:row.article.position,status:row.article.status,personalNotes:row.article.personalNotes,updated:Math.max(file.updated||file.created,row.article.updated||row.article.created)}:row.article)}}return [...map.values()]}
async function identity(a:Article){if(a.id)return a.id;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.title+'\0'+a.intro+'\0'+a.body));const h=Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`}
export async function storageApi(method='GET',data?:any):Promise<any>{
 if(method==='GET')return {articles:await all()};
 if(method==='POST'){let imported=0,skipped=0;const existing=new Set((await all()).map(a=>a.id));for(const a of parseImport(data)){a.id=await identity(a);if(existing.has(a.id)){skipped++;continue}a.updated=Date.now();await write({id:a.id,article:a});existing.add(a.id);imported++}return {imported,skipped}}
 if(method==='DELETE'){await write({id:data.id,deleted:true});return {ok:true}}
 const a=(await all()).find(a=>a.id===data.id);if(!a)throw Error('文章不存在。');const article=normalize({...a,position:data.position??a.position,status:data.status??a.status,personalNotes:data.personalNotes??a.personalNotes,updated:Date.now()});await write({id:a.id,article});return {article};
}
