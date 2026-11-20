import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/^\uFEFF/,'');
const home=read('pages/home/index.html');
const topics=runInNewContext(home.match(/const topics=(\[[\s\S]*?\]);\s*const get=/)[1]);
const nav=read('pages/shared/navigation.html');
const withNav=html=>html.replace('</html>',()=>nav+'</html>');
const classroom=withNav(read('pages/classroom/index.html').replace('<script>',()=>read('pages/classroom/online.html')+read('pages/classroom/original.html')+'<script>'));
const modules=['api/index.js','api/auth.js','api/classroom.js','api/online.js','api/original.js'];
const constants={PAGE:withNav(home),CLASS_TOPICS:topics,CLASS_PAGE:classroom,LOGIN_PAGE:read('pages/login/index.html')};
const output=modules.map(read).concat(Object.entries(constants).map(([key,value])=>'const '+key+' = '+JSON.stringify(value)+';')).join('\n');
mkdirSync(new URL('../dist/',import.meta.url),{recursive:true});
writeFileSync(new URL('../dist/index.js',import.meta.url),output);

