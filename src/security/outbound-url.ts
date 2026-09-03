const forbiddenNames=['localhost','localhost.localdomain','metadata.google.internal','metadata.internal'];

export function publicHttpsUrl(value:unknown):URL|null{
  try{
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.username||url.password||!url.hostname)return null;
    const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(forbiddenNames.includes(host)||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.home.arpa'))return null;
    if(isPrivateIpv4(host)||isPrivateIpv6(host))return null;
    return url;
  }catch{return null;}
}

function isPrivateIpv4(host:string):boolean{
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))return false;
  const parts=host.split('.').map(Number);if(parts.some(part=>part<0||part>255))return true;
  const [a,b]=parts;return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}

function isPrivateIpv6(host:string):boolean{const compact=host.toLowerCase();return compact==='::1'||compact==='::'||compact.startsWith('fc')||compact.startsWith('fd')||compact.startsWith('fe8')||compact.startsWith('fe9')||compact.startsWith('fea')||compact.startsWith('feb')}
