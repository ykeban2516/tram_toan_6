async function originalPdf(request,url){
 const path=url.searchParams.get('path')||'';
 if(!articlePath.test(path)||!path.includes('toan-6'))return new Response('Invalid source',{status:400});
 const article=await source(path);
 const links=Array.from(article.matchAll(/https:\/\/thcs\.toanmath\.com\/thcs-pdf\/[a-z0-9-]+\.pdf/gi),match=>match[0]);
 const name=path.split('/').pop().replace(/\.html$/,'');
 const pdf=links.find(link=>link.endsWith('/'+name+'.pdf')) || links[0];
 if(!pdf)return new Response('Không tìm thấy PDF của đề.',{status:404});
 const response=await fetch(pdf,{redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok||Number(response.headers.get('content-length'))>12000000)return new Response('PDF unavailable',{status:502});
 const reader=response.body.getReader();
 const chunks=[];
 let size=0;
 while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>12000000){await reader.cancel();return new Response('PDF quá lớn.',{status:413})}
   chunks.push(value);
 }
 const body=new Blob(chunks,{type:'application/pdf'});
 return new Response(body,{headers:{'content-type':'application/pdf','x-content-type-options':'nosniff','cache-control':'private, max-age=1800'}});
}
async function originalHistory(request,url,user,query,list){
 if(user.teacher)return classJson({error:'Mục này dành cho học sinh.'},403);
 if(request.method==='GET'){
   return classJson({attempts:await list('SELECT path,score,total,created FROM original_attempts WHERE student=? ORDER BY id DESC LIMIT 300',user.email)});
 }
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))return classJson({error:'Yêu cầu không hợp lệ.'},403);
 let attempt;
 try{attempt=JSON.parse(await request.text())}catch{return classJson({error:'Dữ liệu không hợp lệ.'},400)}
 const {path,score,total,answers,evidence}=attempt||{};
 if(!Array.isArray(answers)||answers.length>40||answers.some(a=>typeof a!=='string'||(a.length>150&&!validExamImage(a)))||JSON.stringify(answers).length>800000)return classJson({error:'Bài nộp vượt dung lượng hoặc không hợp lệ.'},400);
 if(typeof path!=='string'||!articlePath.test(path)||!path.includes('toan-6')||!Number.isInteger(total)||total<0||total>40||!Number.isInteger(score)||score<0||score>total)return classJson({error:'Kết quả không hợp lệ.'},400);
 if(!Array.isArray(evidence)||evidence.length!==total||evidence.filter(q=>q?.correct===true).length!==score||evidence.some(q=>typeof q?.prompt!=='string'||q.prompt.length>2500||typeof q.correct!=='boolean'||!['choice','short'].includes(q.type)))return classJson({error:'Thiếu dữ liệu phân loại câu hỏi.'},400);
 const skills=evidence.map(q=>({topic:examSkill(q),correct:q.correct}));
 await query('INSERT INTO original_attempts(student,path,score,total,answers) VALUES (?,?,?,?,?)',user.email,path,score,total,JSON.stringify({answers,skills})).run();
 return classJson({ok:true},201);
}

function examSkill(q){
 const rules=[
  [/ước chung|ƯCLN|bội chung|BCNN|chia hết|lũy thừa/iu,'Số tự nhiên và chia hết'],
  [/số nguyên|nhiệt độ|số âm/iu,'Số nguyên'],
  [/phân số|quy đồng|rút gọn|\d+\s*\/\s*\d+/iu,'Phân số'],
  [/phần trăm|giảm giá|thập phân|%/iu,'Số thập phân và phần trăm'],
  [/hình |diện tích|chu vi|góc|tam giác|đối xứng/iu,'Hình học'],
  [/xác suất|thống kê|biểu đồ|tần số/iu,'Thống kê và xác suất']
 ];
 return rules.find(([pattern])=>pattern.test(q.prompt))?.[1]||
   (q.type==='choice'?'Trắc nghiệm tổng hợp':'Điền đáp án tổng hợp');
}
async function studentInsights(list,email){
 const groups=new Map();
 const record=(topic,correct,total)=>{
   if(!total)return;
   const row=groups.get(topic)||{topic,correct:0,total:0};
   row.correct+=correct;row.total+=total;groups.set(topic,row);
 };
 const results=await list('SELECT topic,score,total FROM results WHERE student=? ORDER BY id DESC LIMIT 100',email);
 for(const row of results)if(CLASS_TOPICS[row.topic])record(CLASS_TOPICS[row.topic][0],row.score,row.total);
 const papers=await list('SELECT e.title,e.questions,s.answers,s.auto_score,s.manual_score,s.created FROM online_submissions s JOIN online_assignments a ON a.id=s.assignment JOIN online_exams e ON e.id=a.exam WHERE a.student=? ORDER BY s.created DESC LIMIT 30',email);
 const assignments=papers.map(row=>{
   const questions=JSON.parse(row.questions),answers=JSON.parse(row.answers),misses=new Set();
   questions.forEach((q,i)=>{
     if(q.type==='image')return;
     const topic=examSkill(q),correct=normalizeExamAnswer(q.answer)===normalizeExamAnswer(answers[i]||'');
     record(topic,Number(correct),1);
     if(!correct)misses.add(topic);
   });
   return {title:row.title,created:row.created,score:row.auto_score+(row.manual_score??0),total:questions.length,pending:row.manual_score===null,misses:[...misses]};
 });
 const originals=await list('SELECT path,score,total,created,answers FROM original_attempts WHERE student=? ORDER BY id DESC LIMIT 30',email);
 const selfPractice=originals.map(row=>{
   const skills=JSON.parse(row.answers).skills||[];
   const misses=[...new Set(skills.filter(q=>!q.correct).map(q=>q.topic))];
   return {path:row.path,score:row.score,total:row.total,created:row.created,misses};
 });
 return {selfPractice,topics:[...groups.values()].sort((a,b)=>a.correct/a.total-b.correct/b.total||b.total-a.total),assignments};
}


