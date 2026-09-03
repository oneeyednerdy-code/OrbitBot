import { api, escapeHtml, state } from './core.js';

export function gatewayControlsMarkup(gateway={state:'idle'}){
  if(gateway?.state!=='halted')return `<button class="btn secondary" type="button" data-gateway-start>Start Discord Gateway</button><div class="notice hidden" data-gateway-result></div>`;
  const reason=String(gateway.halt_reason||'unknown');
  if(reason!=='disallowed_intents')return `<div class="notice error"><strong>Gateway halted safely: ${escapeHtml(reason)}</strong><br><span class="small">Review Diagnostics and correct the Discord configuration before retrying.</span></div>`;
  const owner=Boolean(state.bundle?.guild?.owner);
  return `<div class="notice error gateway-recovery"><strong>Discord rejected Orbit’s privileged intents.</strong><p>In the Discord Developer Portal, open OrbitBot → Bot → Privileged Gateway Intents. Enable <strong>Server Members Intent</strong> and <strong>Message Content Intent</strong>, then save.</p><a class="btn ghost" href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">Open Discord Developer Portal</a>${owner?`<div class="field"><label for="gatewayRetryConfirm">Type <code>RETRY GATEWAY</code></label><input id="gatewayRetryConfirm" data-gateway-confirm autocomplete="off"></div><label class="check safety-ack"><input type="checkbox" data-gateway-ack> I enabled and saved both required intents in Discord.</label><button class="btn" type="button" data-gateway-retry disabled>Retry Gateway Safely</button>`:'<div class="small">Only the Discord server owner can clear this terminal safety halt.</div>'}<div class="notice hidden" data-gateway-result></div></div>`;
}

export function wireGatewayControls(root,gateway={state:'idle'},onSuccess=()=>{}){
  if(!root)return;
  const result=root.querySelector('[data-gateway-result]');
  root.querySelector('[data-gateway-start]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Starting…';
    try{const data=await callGateway(false,gateway);showResult(result,`Gateway state: ${data.state||'starting'}.`,false);onSuccess(data)}
    catch(error){const data=error.payload||{};if(data.halt_reason==='disallowed_intents'){root.innerHTML=gatewayControlsMarkup(data);wireGatewayControls(root,data,onSuccess)}else showResult(result,data.detail||`Gateway did not start: ${error.message}`,true)}
    finally{if(button.isConnected){button.disabled=false;button.textContent='Start Discord Gateway'}}
  });
  const confirm=root.querySelector('[data-gateway-confirm]'),ack=root.querySelector('[data-gateway-ack]'),retry=root.querySelector('[data-gateway-retry]');
  const update=()=>{if(retry)retry.disabled=confirm?.value!=='RETRY GATEWAY'||!ack?.checked};confirm?.addEventListener('input',update);ack?.addEventListener('change',update);update();
  retry?.addEventListener('click',async()=>{
    retry.disabled=true;retry.textContent='Retrying safely…';
    try{const data=await callGateway(true,gateway);showResult(result,`Gateway state: ${data.state||'starting'}. Orbit retained its IDENTIFY budget protection.`,false);onSuccess(data)}
    catch(error){const data=error.payload||{},seconds=data.retry_after_ms?Math.ceil(Number(data.retry_after_ms)/1000):0;showResult(result,seconds?`Safe retry is cooling down. Try again in ${seconds} seconds.`:(data.detail||`Gateway retry failed: ${error.message}`),true);retry.disabled=false;retry.textContent='Retry Gateway Safely'}
  });
}

async function callGateway(force,gateway){return api(`/api/guilds/${state.guildId}/start-gateway`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(force?{force:true,acknowledged:true,confirmation:'RETRY GATEWAY',previous_halt_reason:gateway?.halt_reason||null}:{})})}
function showResult(node,text,error){if(!node)return;node.className=`notice ${error?'error':'success'}`;node.textContent=text}
