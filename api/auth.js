const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64url = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
function sessionKey(env){
 return crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function signValue(env,value){
 const data=base64url(encoder.encode(JSON.stringify(value)));
 const signature=await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(data));
 return data+'.'+base64url(new Uint8Array(signature));
}
async function readCookie(request,env,name,kind){
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return null;
 const token=request.headers.get('Cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1);
 if(!token||token.length>4096)return null;
 try{
   const [data,signature,extra]=token.split('.');
   if(extra!==undefined||!await crypto.subtle.verify('HMAC',await sessionKey(env),unbase64url(signature),encoder.encode(data)))return null;
   const payload=JSON.parse(decoder.decode(unbase64url(data)));
   return payload.kind===kind&&payload.exp>Date.now()?payload:null;
 }catch{return null}
}
function cookie(name,value,age,url){
 return name+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(url.protocol==='https:'?'; Secure':'');
}
function redirect(location,cookies=[]){
 const headers=new Headers({Location:location,'Cache-Control':'no-store'});
 for(const entry of cookies)headers.append('Set-Cookie',entry);
 return new Response(null,{status:303,headers});
}
function localReturn(value){
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return '/lop-hoc';
 const origin='https://local.invalid';
 const target=new URL(value,origin);
 return target.origin===origin&&!target.pathname.startsWith('//')?target.pathname+target.search+target.hash:'/lop-hoc';
}
async function classUser(request,env){
 const session=await readCookie(request,env,'toan6_session','session');
 if(!session)return null;
 return {email:session.email,teacher:teacherEmails(env).includes(session.email)};
}
async function authRoute(request,env,url){
 const failure=(message,status)=>new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 if(request.method!=='GET')return failure('Phương thức không hợp lệ.',405);
 const next=localReturn(url.searchParams.get('return_to'));
 if(url.pathname==='/auth/logout')return redirect(next,[cookie('toan6_session','',0,url),cookie('toan6_oauth','',0,url)]);
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||env.SESSION_SECRET?.length<32||!env.SESSION_SECRET)return failure('Chưa cấu hình Google OAuth. Xem README.md trong mã nguồn.',503);
 const callback=new URL('/auth/callback',env.APP_ORIGIN||url.origin);
 if(callback.origin!==url.origin)return failure('Tên miền đăng nhập không khớp APP_ORIGIN.',400);
 if(url.pathname==='/auth/google'){
   const state=randomToken(),verifier=randomToken();
   const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
   const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback.href,response_type:'code',scope:'openid email',state,prompt:'select_account',code_challenge:challenge,code_challenge_method:'S256'});
   const signed=await signValue(env,{kind:'oauth',state,verifier,next,exp:Date.now()+600000});
   return redirect(target.href,[cookie('toan6_oauth',signed,600,url)]);
 }
 const pending=await readCookie(request,env,'toan6_oauth','oauth');
 const code=url.searchParams.get('code');
 if(!pending||url.searchParams.get('state')!==pending.state||!code)return failure('Phiên đăng nhập đã hết hạn hoặc bị hủy. Quay lại /dang-nhap để thử lại.',400);
 try{
   const token=await fetch('https://oauth2.googleapis.com/token',{
     method:'POST',signal:AbortSignal.timeout(8000),
     body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:callback.href,code,code_verifier:pending.verifier,grant_type:'authorization_code'})
   });
   if(!token.ok)return failure('Google không xác nhận được lần đăng nhập này.',502);
   const {access_token}=await token.json();
   if(typeof access_token!=='string'||!access_token)return failure('Google chưa cấp quyền đăng nhập.',502);
   const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(8000)});
   if(!response.ok)return failure('Không đọc được tài khoản Google.',502);
   const profile=await response.json();
   if(profile.email_verified!==true||typeof profile.email!=='string')return failure('Google chưa xác minh email của tài khoản này.',403);
   const session=await signValue(env,{kind:'session',email:profile.email.trim().toLowerCase(),exp:Date.now()+28800000});
   return redirect(localReturn(pending.next),[cookie('toan6_session',session,28800,url),cookie('toan6_oauth','',0,url)]);
 }catch{return failure('Không kết nối được Google. Hãy thử lại.',502)}
}


function teacherEmails(env){
 return [...new Set((env.TEACHER_EMAILS||env.TEACHER_EMAIL||'').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean))];
}
function localLoginAvailable(env,url){
 return ['localhost','127.0.0.1'].includes(url.hostname)&&!!env.LOCAL_TEACHER_HASHES&&env.SESSION_SECRET?.length>=32;
}
function loginPage(env,url){
 const form=localLoginAvailable(env,url)?`<form method="post" action="/auth/local"><h2>Giáo viên trên máy này</h2><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Đăng nhập</button></form>`:'';
 const next=url.searchParams.get('mode')==='register'?'/lop-hoc?mode=register':'/lop-hoc';
 const google=env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET?
   '<p><a href="/auth/google?return_to='+encodeURIComponent(next)+'">Đăng nhập bằng Google</a><a href="/auth/google?return_to=%2Flop-hoc%3Fmode%3Dregister">Đăng ký học sinh</a></p>':'<p>Đăng nhập Google đang chờ cấu hình.</p>';
 return new Response(LOGIN_PAGE.replace('<!-- LOGIN_OPTIONS -->',form+google),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
async function localLogin(request,env,url){
 if(!localLoginAvailable(env,url))return new Response('Không tìm thấy trang.',{status:404});
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return new Response('Yêu cầu không hợp lệ.',{status:403});
 const form=await request.formData().catch(()=>null);
 const email=String(form?.get('email')||'').trim().toLowerCase();
 const password=String(form?.get('password')||'');
 const hashes=JSON.parse(env.LOCAL_TEACHER_HASHES);
 if(!teacherEmails(env).includes(email)||!hashes[email]||password.length>150||
    !await crypto.subtle.verify('HMAC',await sessionKey(env),unbase64url(hashes[email]),encoder.encode(email+'\n'+password))){
   return new Response('Email hoặc mật khẩu chưa đúng. Quay lại trang đăng nhập để thử lại.',{status:401,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
 }
 const session=await signValue(env,{kind:'session',email,exp:Date.now()+28800000});
 return redirect('/lop-hoc#registrations',[cookie('toan6_session',session,28800,url)]);
}

