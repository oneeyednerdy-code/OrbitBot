/** Return the next calendar occurrence while preserving the configured local time. */
export function nextRun(from,rule,timeZone){
  const zone=validTimeZone(timeZone)?timeZone:'UTC';
  const parts=zonedParts(from,zone);
  let target;
  if(rule==='monthly'){
    const monthIndex=parts.month;
    const year=parts.year+Math.floor(monthIndex/12);
    const month=(monthIndex%12)+1;
    const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
    target={...parts,year,month,day:Math.min(parts.day,lastDay)};
  }else{
    const local=new Date(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second));
    local.setUTCDate(local.getUTCDate()+(rule==='weekly'?7:1));
    target={year:local.getUTCFullYear(),month:local.getUTCMonth()+1,day:local.getUTCDate(),hour:local.getUTCHours(),minute:local.getUTCMinutes(),second:local.getUTCSeconds()};
  }
  return localPartsToUtc(target,zone);
}

function validTimeZone(zone){try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();return true}catch{return false}}
function zonedParts(value,zone){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const get=type=>Number(parts.find(part=>part.type===type)?.value||0);return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')}}
function localPartsToUtc(target,zone){const wanted=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);let guess=wanted;for(let attempt=0;attempt<4;attempt++){const actual=zonedParts(guess,zone),represented=Date.UTC(actual.year,actual.month-1,actual.day,actual.hour,actual.minute,actual.second),adjustment=wanted-represented;if(!adjustment)break;guess+=adjustment;}return guess}
