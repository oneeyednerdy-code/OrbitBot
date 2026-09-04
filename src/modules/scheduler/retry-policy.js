export const MAX_QUEUE_ATTEMPTS=5;

export function queueRetryDecision(attempts){
  const normalized=Math.max(1,Number(attempts)||1);
  return normalized>=MAX_QUEUE_ATTEMPTS
    ? {retry:false,delaySeconds:0}
    : {retry:true,delaySeconds:Math.min(300,10*2**Math.max(0,normalized-1))};
}
