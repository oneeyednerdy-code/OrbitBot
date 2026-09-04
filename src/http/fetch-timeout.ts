export async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=15_000):Promise<Response>{
  const controller=new AbortController(),upstreamSignal=init.signal;
  const abort=()=>controller.abort(upstreamSignal?.reason);
  upstreamSignal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort('request_timeout'),timeoutMs);
  try{return await fetch(input,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);upstreamSignal?.removeEventListener('abort',abort);}
}
