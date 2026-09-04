export const ENGAGEMENT_FREQUENCIES = ['daily','weekly','biweekly','monthly'];

export function questionKey(value){
  return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase().replace(/[?!.]+$/,'').trim();
}

export function parseQuestionText(value){
  const seen=new Set();
  const questions=[];
  String(value||'').split(/\r?\n/).forEach((line,index)=>{
    const question=line.trim();
    const key=questionKey(question);
    if(!question||!key||seen.has(key))return;
    if(question.length>1950)throw new Error(`Question on line ${index+1} is too long for Discord.`);
    seen.add(key);questions.push({question_text:question,question_key:key,line_number:index+1});
  });
  return questions;
}

export function validEngagementFrequency(value){return ENGAGEMENT_FREQUENCIES.includes(String(value||''));}
