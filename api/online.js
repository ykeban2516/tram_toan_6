function normalizeExamAnswer(value) {
  return value.trim().normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,'').replace(/,/g,'.').replace(/−/g,'-');
}
function readExamQuestions(input) {
  if(!Array.isArray(input)||!input.length||input.length>40)return null;
  const questions=[];
  for(const row of input){
    const prompt=typeof row?.prompt==='string'?row.prompt.trim():'';
    if(!prompt||prompt.length>2500)return null;
    if(row.type==='image'){questions.push({type:'image',prompt});continue}
    const answer=typeof row.answer==='string'?row.answer.trim():'';
    if(!answer||answer.length>150)return null;
    if(row.type==='short'){questions.push({type:'short',prompt,answer});continue}
    const options=Array.isArray(row.options)?row.options.map(value=>typeof value==='string'?value.trim():''):[];
    if(row.type!=='choice'||options.length!==4||options.some(value=>!value||value.length>600)||!['A','B','C','D'].includes(answer))return null;
    questions.push({type:'choice',prompt,answer,options});
  }
  return questions;
}
function validExamImage(value){
 if(typeof value!=='string'||value.length>230000)return false;
 return /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value);
}
async function onlineExam(request,url,user,query,list,enrolled){
 const path=url.pathname.slice('/api/class/online'.length);
 const teacher=user.teacher;
 const error=(message,status=400)=>classJson({error:message},status);
 const getAssignment=(id,student)=>query('SELECT a.id,a.student,e.title,e.questions FROM online_assignments a JOIN online_exams e ON e.id=a.exam WHERE a.id=? AND a.student=?',id,student).first();
 const getSubmission=id=>query('SELECT answers,auto_score,manual_score,created FROM online_submissions WHERE assignment=?',id).first();
 if(request.method==='GET'){
   if(path==='/list'){
     const student=teacher?url.searchParams.get('student'):user.email;
     return classJson({
       exams:teacher?await list('SELECT id,title FROM online_exams ORDER BY created DESC'):[],
       assignments:student?await list('SELECT a.id,e.title,s.auto_score,s.manual_score FROM online_assignments a JOIN online_exams e ON e.id=a.exam LEFT JOIN online_submissions s ON s.assignment=a.id WHERE a.student=? ORDER BY a.created DESC',student):[]
     });
   }
   if(path==='/paper'){
     const id=url.searchParams.get('id');
     const row=await getAssignment(id,teacher?url.searchParams.get('student'):user.email);
     if(!row)return error('Không tìm thấy đề.',404);
     const submission=await getSubmission(id);
     const questions=JSON.parse(row.questions);
     return classJson({title:row.title,questions:questions.map(({answer,...q})=>teacher&&submission?{...q,answer}:q),submission:submission?{...submission,answers:JSON.parse(submission.answers)}:null});
   }
   return error('Không tìm thấy mục này.',404);
 }
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return error('Yêu cầu không hợp lệ.',403);
 const raw=await request.text();
 if(raw.length>850000)return error('Bài nộp vượt dung lượng.',413);
 let body;
 try{body=JSON.parse(raw)}catch{return error('Nội dung không hợp lệ.')}
 if(!body||typeof body!=='object')return error('Nội dung không hợp lệ.');
 if(path==='/create'&&teacher){
   const title=typeof body.title==='string'?body.title.trim():'';
   const questions=readExamQuestions(body.questions);
   if(!title||title.length>120||!questions)return error('Kiểm tra tên đề, loại câu và đáp án.');
   const id=crypto.randomUUID();
   await query('INSERT INTO online_exams(id,title,questions) VALUES (?,?,?)',id,title,JSON.stringify(questions)).run();
   return classJson({id},201);
 }
 if(path==='/assign'&&teacher){
   if(typeof body.student!=='string'||typeof body.exam!=='string'||!(await enrolled(body.student))?.active||!(await query('SELECT id FROM online_exams WHERE id=?',body.exam).first()))return error('Chọn đề và học sinh đang hoạt động.');
   await query('INSERT INTO online_assignments(id,exam,student) VALUES (?,?,?) ON CONFLICT(exam,student) DO NOTHING',crypto.randomUUID(),body.exam,body.student).run();
   return classJson({ok:true});
 }
 if(typeof body.id!=='string'||(teacher&&typeof body.student!=='string'))return error('Thiếu thông tin bài làm.');
 const row=await getAssignment(body.id,teacher?body.student:user.email);
 if(!row)return error('Không tìm thấy đề.',404);
 const questions=JSON.parse(row.questions);
 const photoCount=questions.filter(q=>q.type==='image').length;
 if(path==='/submit'&&!teacher){
   if(!Array.isArray(body.answers)||body.answers.length!==questions.length)return error('Bài làm không hợp lệ.');
   const answers=body.answers;
   if(answers.some((value,i)=>typeof value!=='string'||(questions[i].type==='image'?value!==''&&!validExamImage(value):value.length>150)))return error('Kiểm tra lại đáp án và ảnh bài làm.');
   const auto=questions.filter((q,i)=>q.type!=='image'&&answers[i]&&normalizeExamAnswer(q.answer)===normalizeExamAnswer(answers[i])).length;
   const needsReview=questions.some((q,i)=>q.type==='image'&&answers[i]);
   const result=await query('INSERT INTO online_submissions(assignment,answers,auto_score,manual_score) VALUES (?,?,?,?) ON CONFLICT(assignment) DO NOTHING',body.id,JSON.stringify(answers),auto,needsReview?null:0).run();
   if(!result.meta.changes)return error('Bài này đã được nộp.',409);
   return classJson({auto_score:auto,manual_score:needsReview?null:0,total:questions.length});
 }
 if(path==='/grade'&&teacher){
   const result=await getSubmission(body.id);
   if(!result||typeof body.score!=='number'||!Number.isFinite(body.score)||body.score<0||body.score>photoCount)return error('Điểm tự luận phải nằm trong khoảng 0 đến '+photoCount+'.');
   await query('UPDATE online_submissions SET manual_score=? WHERE assignment=?',body.score,body.id).run();
   return classJson({ok:true});
 }
 return error('Bạn không có quyền thực hiện thao tác này.',403);
}
