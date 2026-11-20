import {mkdirSync,writeFileSync} from 'node:fs';
import app from '../dist/index.js';
const dir=new URL('../public/',import.meta.url);
mkdirSync(dir,{recursive:true});
const config="<script src=\"./config.js\"></script><script>const backend=(window.TRAM_TOAN_CONFIG?.apiBase||\"\").replaceAll(String.fromCharCode(92),\"\");const originalFetch=window.fetch.bind(window);window.fetch=(input,options)=>{if(typeof input===\"string\"&&input.startsWith(\"/api/\")){if(!backend)return Promise.resolve(new Response(JSON.stringify({error:\"Chưa cấu hình máy chủ API trong config.js.\"}),{status:503,headers:{\"Content-Type\":\"application/json\"}}));input=backend+input;options={...options,credentials:\"include\"}}return originalFetch(input,options)};document.addEventListener(\"DOMContentLoaded\",()=>{for(const a of document.querySelectorAll(\"a\")){const href=a.getAttribute(\"href\")||\"\";if(href.startsWith(\"/auth/\")){if(backend)a.href=backend+href;else a.onclick=e=>{e.preventDefault();alert(\"Chưa cấu hình máy chủ đăng nhập.\")}}}});</script>";
const routes=[['/','index.html'],['/dang-nhap','dang-nhap.html'],['/lop-hoc','lop-hoc.html']];
for(const [route,file] of routes){
 const response=await app.fetch(new Request('https://local.invalid'+route),{});
 let html=await response.text();
 html=html.replace(/href="\/lop-hoc([^"]*)"/g,'href="./lop-hoc.html$1"')
 .replace(/href="\/dang-nhap([^"]*)"/g,'href="./dang-nhap.html$1"')
 .replace(/href="\/(#[^"]*)?"/g,(_,hash)=>'href="./index.html'+(hash||'')+'"')
 .replaceAll("location.replace('/lop-hoc#registrations')","location.replace('./lop-hoc.html#registrations')")
 .replaceAll("location.pathname==='/'","location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')")
 .replace('</title>','</title>'+config);
 if(route==='/dang-nhap')html=html.replace('<!-- LOGIN_OPTIONS -->','<a class="primary" href="/auth/google?return_to=%2Flop-hoc">Đăng nhập bằng Google</a><a href="/auth/google?return_to=%2Flop-hoc%3Fmode%3Dregister">Đăng ký học sinh</a>');
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1]);
 writeFileSync(new URL(file,dir),html);
}
writeFileSync(new URL('config.js',dir),'window.TRAM_TOAN_CONFIG = { apiBase: "" };\n');
writeFileSync(new URL('.nojekyll',dir),'');
