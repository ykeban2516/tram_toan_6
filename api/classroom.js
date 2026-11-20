const classHeaders = {'cache-control':'private, no-store'};
const classJson = (data,status=200)=>Response.json(data,{status,headers:classHeaders});
async function notifyRegistration(env,url){
 if(!env.RESEND_API_KEY||!env.REGISTRATION_MAIL_FROM)return;
 try{
   const response=await fetch('https://api.resend.com/emails',{
     method:'POST',
     headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
     signal:AbortSignal.timeout(4000),
     body:JSON.stringify({
       from:env.REGISTRATION_MAIL_FROM,
       to:env.REGISTRATION_MAIL_TO ? [env.REGISTRATION_MAIL_TO.trim()] : teacherEmails(env),
       subject:'Trạm Toán 6 có đăng ký mới',
       text:'Có học sinh vừa gửi đăng ký. Đăng nhập với tài khoản giáo viên và bấm Chấp nhận để cấp quyền vào lớp.\n\n'+new URL('/lop-hoc#registrations',url).href
     })
   });
   if(!response.ok)console.warn('Registration notification rejected',response.status);
 }catch{console.warn('Registration notification unavailable')}
}
async function classroom(request,env,url){
 const user=await classUser(request,env);
 const db=env.DB;
 if(url.pathname==='/lop-hoc')return new Response(CLASS_PAGE,{headers:{...classHeaders,'content-type':'text/html; charset=utf-8'}});
 if(!user)return classJson({error:'Bạn cần đăng nhập.'},401);
 if(!db||!teacherEmails(env).length)return classJson({error:'Lớp học đang chờ cấu hình.'},503);
 if(request.method==='GET'&&url.pathname==='/api/class/session')return classJson({user});
 const query=(sql,...args)=>db.prepare(sql).bind(...args);
 const list=async(sql,...args)=>(await query(sql,...args).all()).results;
 const enrolled=async email=>query('SELECT email,name,active,phone,pending FROM students WHERE email=?',email).first();
 const profile=await enrolled(user.email);
 if(url.pathname==='/api/class/registration'&&!user.teacher){
   if(request.method==='GET')return classJson({email:user.email,profile});
   if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return classJson({error:'Yêu cầu không hợp lệ.'},403);
   const raw=await request.text();
   if(raw.length>4000)return classJson({error:'Nội dung quá dài.'},413);
   let form;
   try{form=JSON.parse(raw)}catch{return classJson({error:'Nội dung không hợp lệ.'},400)}
   const name=typeof form?.name==='string'?form.name.trim():'';
   const phone=typeof form?.phone==='string'?form.phone.trim().replace(/[ .()-]/g,''):'';
   if(!name||name.length>80||!/^\+?\d{9,15}$/.test(phone))return classJson({error:'Kiểm tra lại họ tên và số điện thoại.'},400);
   const result=await query('INSERT INTO students(email,name,active,phone,pending) VALUES (?,?,0,?,1) ON CONFLICT(email) DO NOTHING',user.email,name,phone).run();
   if(!result.meta.changes)return classJson({error:'Email này đã có hồ sơ lớp học.'},409);
   await notifyRegistration(env,url);
   return classJson({ok:true},201);
 }
 if(!user.teacher&&!profile?.active)return classJson({error:'Email này chưa được giáo viên cấp quyền vào lớp.'},403);
 if(url.pathname==='/api/class/original/history')return originalHistory(request,url,user,query,list);
 if(url.pathname==='/api/class/insights'&&request.method==='GET'&&user.teacher){const student=url.searchParams.get('student');if(!student||!(await enrolled(student)))return classJson({error:'Không tìm thấy học sinh.'},404);return classJson(await studentInsights(list,student));}
 if(url.pathname.startsWith('/api/class/online/'))return onlineExam(request,url,user,query,list,enrolled);
 if(request.method==='GET'){
   if(url.pathname==='/api/class'){
     return classJson({user,topics:CLASS_TOPICS.map(t=>t[0]),students:user.teacher?await list('SELECT email,name,active,phone,pending FROM students ORDER BY name'):[]});
   }
   if(url.pathname==='/api/class/records'){
     const email=user.teacher?url.searchParams.get('student'):user.email;
     if(!email||!(await enrolled(email)))return classJson({error:'Không tìm thấy học sinh.'},404);
     return classJson({
       assignments:await list('SELECT a.id,a.title,a.topic,r.score,r.total FROM assignments a LEFT JOIN results r ON r.assignment_id=a.id WHERE a.student=? ORDER BY a.created DESC',email),
       scores:await list('SELECT topic,score,total,created FROM results WHERE student=? ORDER BY created DESC LIMIT 100',email),
       messages:await list('SELECT role,body,created FROM messages WHERE student=? ORDER BY created DESC LIMIT 100',email)
     });
   }
   if(url.pathname==='/api/class/questions'&&!user.teacher){
     const assignment=url.searchParams.get('assignment');
     const row=assignment?await query('SELECT topic FROM assignments WHERE id=? AND student=?',assignment,user.email).first():null;
     const topic=assignment?row?.topic:Number(url.searchParams.get('topic'));
     if(!Number.isInteger(topic)||!CLASS_TOPICS[topic])return classJson({error:'Không tìm thấy đề.'},404);
     return classJson({topic,questions:CLASS_TOPICS[topic][4].map(([prompt,...options])=>({prompt,options:options.slice(0,4).sort((a,b)=>a.localeCompare(b,'vi'))}))});
   }
   return classJson({error:'Không tìm thấy mục này.'},404);
 }
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return classJson({error:'Yêu cầu không hợp lệ.'},403);
 const raw=await request.text();
 if(raw.length>12000)return classJson({error:'Nội dung quá dài.'},413);
 let body;
 try{body=JSON.parse(raw)}catch{return classJson({error:'Nội dung không hợp lệ.'},400)}
 if(!body||typeof body!=='object')return classJson({error:'Nội dung không hợp lệ.'},400);
 const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
 const email=user.teacher?clean(body.student,254).toLowerCase():user.email;
 const route=url.pathname;
 if(route==='/api/class/student'&&user.teacher){
   const name=clean(body.name,80);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email===user.email||!name)return classJson({error:'Kiểm tra lại tên và email học sinh.'},400);
   await query('INSERT INTO students(email,name,active) VALUES (?,?,1) ON CONFLICT(email) DO UPDATE SET name=excluded.name,active=1,pending=0',email,name).run();
   return classJson({ok:true});
 }
 if(!email||!(await enrolled(email)))return classJson({error:'Không tìm thấy học sinh.'},404);
 if(route==='/api/class/access'&&user.teacher){
   await query('UPDATE students SET active=?,pending=0 WHERE email=?',body.active===true?1:0,email).run();
 }else if(route==='/api/class/assignment'&&user.teacher){
   const title=clean(body.title,120);
   if(!title||!Number.isInteger(body.topic)||!CLASS_TOPICS[body.topic])return classJson({error:'Nhập tiêu đề và chọn chủ đề.'},400);
   await query('INSERT INTO assignments(id,student,title,topic) VALUES (?,?,?,?)',crypto.randomUUID(),email,title,body.topic).run();
 }else if(route==='/api/class/message'){
   const message=clean(body.message,2000);
   if(!message)return classJson({error:'Nhập lời nhắn.'},400);
   await query('INSERT INTO messages(student,role,body) VALUES (?,?,?)',email,user.teacher?'teacher':'student',message).run();
 }else if(route==='/api/class/submit'&&!user.teacher){
   const assignment=clean(body.assignment,50);
   const row=assignment?await query('SELECT topic FROM assignments WHERE id=? AND student=?',assignment,email).first():null;
   const topic=assignment?row?.topic:body.topic;
   const questions=Number.isInteger(topic)?CLASS_TOPICS[topic]?.[4]:null;
   if(!questions||!Array.isArray(body.answers)||body.answers.length!==questions.length||!questions.every((q,i)=>q.slice(1,5).includes(body.answers[i])))return classJson({error:'Hãy trả lời tất cả câu hỏi.'},400);
   const score=questions.filter((q,i)=>q[1]===body.answers[i]).length;
   const result=await query('INSERT INTO results(student,assignment_id,topic,score,total) VALUES (?,?,?,?,?) ON CONFLICT(assignment_id) DO NOTHING',email,assignment||null,topic,score,questions.length).run();
   if(!result.meta.changes)return classJson({error:'Bài này đã được nộp.'},409);
   return classJson({score,total:questions.length,review:questions.map(q=>({answer:q[1],solution:q[5]}))});
 }else return classJson({error:'Bạn không có quyền thực hiện thao tác này.'},403);
 return classJson({ok:true});
}







