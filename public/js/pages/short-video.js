import { $, api, escapeHtml, state } from '../core.js';
import { renderError } from './common.js';

const targetLabels={youtube:'YouTube Shorts',tiktok:'TikTok',instagram:'Instagram Reels'};
let uploadedMedia=null;
let uploadedSignature='';

export async function renderShortVideo(){
  const guildId=state.guildId;
  $('#content').innerHTML='<div class="eyebrow">PUBLISHING</div><h1 class="page-title">Short-Form Video</h1><p class="page-intro">Upload one vertical video, choose YouTube Shorts, TikTok, or Instagram Reels, then post now or schedule it.</p><div id="shortVideoBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/short-video`);
    if(state.guildId!==guildId||state.page!=='short-video'||!$('#shortVideoBody'))return;
    const connections=new Map((data.connections||[]).map(item=>[item.platform,item]));
    const targets=(data.targets||[]).map(platform=>{const connection=connections.get(platform);const ready=Boolean(connection&&connection.status==='connected');return `<label class="check span-6"><input class="svTarget" type="checkbox" value="${escapeHtml(platform)}" ${ready?'':'disabled'}>${targetLabels[platform]||platform}${ready?'':' · connect first'}</label>`}).join('');
    const maxBytes=Number(data.max_upload_bytes||95_000_000);
    const uploadHelp=data.upload_enabled?`Choose an MP4, MOV, or WebM up to ${formatBytes(maxBytes)}. Orbit stores it for the queue and removes unused uploads after the retention window.`:'Direct uploads need the R2 STORAGE binding. You can still use a public HTTPS video URL below.';
    const posts=(data.posts||[]).map(post=>{const postTargets=JSONSafe(post.targets_json).join(', ');const source=post.media_key?'uploaded video':'linked video';return `<div class="notice"><strong>${escapeHtml(post.status)}</strong> · ${escapeHtml(postTargets)} · ${source}<br><span class="small">${new Date(Number(post.scheduled_for)).toLocaleString()} · ${escapeHtml(post.caption)}</span>${post.last_error?`<br><span class="small error-text">${escapeHtml(post.last_error)}</span>`:''}<div class="button-row">${['scheduled','queued','failed','partial'].includes(post.status)?`<button class="btn ghost svAction" data-id="${post.id}" data-action="send_now">Post Now</button>`:''}${['scheduled','queued'].includes(post.status)?`<button class="btn ghost svAction" data-id="${post.id}" data-action="cancel">Cancel</button>`:''}<button class="btn ghost svAction" data-id="${post.id}" data-action="delete">Delete</button></div></div>`}).join('');
    $('#shortVideoBody').outerHTML=`<div class="grid"><section class="card span-7"><h2>Create video post</h2><p class="small">Select a file for direct upload, or use a public HTTPS URL. Orbit keeps provider credentials server-side and sends the queued video to each selected platform.</p><div class="field"><label for="svFile">Upload video file</label><input id="svFile" type="file" accept="video/mp4,video/quicktime,video/webm" ${data.upload_enabled?'':'disabled'}><div id="svUploadInfo" class="small">${escapeHtml(uploadHelp)}</div></div><div class="field"><label for="svMediaUrl">Public video URL <span class="small">(optional fallback)</span></label><input id="svMediaUrl" type="url" placeholder="https://cdn.example.com/my-short.mp4"><div class="small">Use the URL only when you are not uploading a file. TikTok and Instagram still need a public HTTPS media address when the post runs.</div></div><div class="field"><label for="svCaption">Caption / title</label><textarea id="svCaption" rows="5" maxlength="2200" placeholder="Write the caption once; Orbit sends the platform-appropriate version."></textarea><div id="svCaptionCount" class="small">0 / 2,200</div></div><div class="field"><label>Platforms</label><div class="grid compact-checks">${targets}</div></div><div class="form-grid"><div class="field"><label for="svYoutubePrivacy">YouTube visibility</label><select id="svYoutubePrivacy"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div><div class="field"><label for="svTikTokPrivacy">TikTok privacy</label><select id="svTikTokPrivacy"><option value="">Choose when posting to TikTok…</option><option value="PUBLIC_TO_EVERYONE">Public</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="SELF_ONLY">Only me</option></select></div></div><div class="small">TikTok privacy choices are checked against the connected creator account at publish time.</div><div class="grid compact-checks"><label class="check span-4"><input id="svComment" type="checkbox">Allow TikTok comments</label><label class="check span-4"><input id="svDuet" type="checkbox">Allow Duets</label><label class="check span-4"><input id="svStitch" type="checkbox">Allow Stitches</label></div><div class="field"><label for="svWhen">Schedule time (optional)</label><input id="svWhen" type="datetime-local"></div><div class="button-row"><button id="svPostNow" class="btn" type="button">Post Video Now</button><button id="svSchedule" class="btn secondary" type="button">Schedule Video</button><a class="btn ghost" href="#connections" data-page="connections">Manage API Logins</a></div><div id="svStatus" class="notice hidden" aria-live="polite"></div></section><section class="card span-5"><h2>Video queue</h2>${posts||'<div class="empty">No short-form video posts yet.</div>'}</section></div>`;
    $('#svCaption').addEventListener('input',updateCaptionCount);updateCaptionCount();
    $('#svFile')?.addEventListener('change',handleFileChange);
    $('#svPostNow').onclick=()=>createVideoPost(false);$('#svSchedule').onclick=()=>createVideoPost(true);
    document.querySelectorAll('.svAction').forEach(button=>button.onclick=()=>videoAction(button.dataset.id,button.dataset.action));
  }catch(error){if(state.guildId===guildId&&state.page==='short-video')renderError(`Short-Form Video failed (${error.message}).`)}
}

function updateCaptionCount(){const count=Array.from($('#svCaption')?.value||'').length;const el=$('#svCaptionCount');if(el){el.textContent=`${count} / 2,200`;el.className=`small${count>2200?' error-text':''}`}}

function handleFileChange(){
  uploadedMedia=null;uploadedSignature='';
  const file=$('#svFile')?.files?.[0];const info=$('#svUploadInfo');
  if(file&&info)info.textContent=`${file.name} · ${formatBytes(file.size)} ready to upload.`;
}

async function createVideoPost(schedule){
  const targets=[...document.querySelectorAll('.svTarget:checked')].map(input=>input.value),raw=$('#svWhen').value,file=$('#svFile')?.files?.[0],url=$('#svMediaUrl').value.trim();
  if(schedule&&!raw)return showStatus('Choose a future date and time before scheduling.',true);
  const scheduledFor=schedule?new Date(raw).getTime():Date.now();
  if(!Number.isFinite(scheduledFor)||scheduledFor<Date.now()-60_000)return showStatus('Choose a valid current or future time.',true);
  if(!targets.length)return showStatus('Choose at least one connected platform.',true);
  if(!file&&!url)return showStatus('Choose a video file or provide a public HTTPS video URL.',true);
  try{
    const status=$('#svStatus');status.className='notice';status.textContent=file?'Uploading video…':schedule?'Scheduling video…':'Posting video…';
    let mediaId=null;
    if(file){
      const signature=`${file.name}:${file.size}:${file.lastModified}`;
      if(!uploadedMedia||uploadedSignature!==signature){uploadedMedia=await uploadVideo(file);uploadedSignature=signature}
      mediaId=uploadedMedia.media_id;
    }
    await api(`/api/guilds/${state.guildId}/short-video`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'create',media_id:mediaId,media_url:mediaId?'':url,caption:$('#svCaption').value,targets,scheduled_for:scheduledFor,youtube_privacy_status:$('#svYoutubePrivacy').value,tiktok_privacy_level:$('#svTikTokPrivacy').value,tiktok_allow_comment:$('#svComment').checked,tiktok_allow_duet:$('#svDuet').checked,tiktok_allow_stitch:$('#svStitch').checked})});
    uploadedMedia=null;uploadedSignature='';showStatus(schedule?'Video scheduled.':'Video queued for posting.',false);setTimeout(()=>{if(state.page==='short-video')renderShortVideo()},400)
  }catch(error){showStatus(error.payload?.detail||`Could not save video post (${error.message}).`,true)}
}

async function uploadVideo(file){
  return api(`/api/guilds/${state.guildId}/short-video-upload`,{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-orbit-file-name':encodeURIComponent(file.name)},body:file});
}

async function videoAction(id,action){if(action==='delete'&&!confirm('Delete this video post and its destination history?'))return;try{await api(`/api/guilds/${state.guildId}/short-video`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'action',id:Number(id),action})});renderShortVideo()}catch(error){showStatus(error.payload?.detail||`Could not update video post (${error.message}).`,true)}}
function showStatus(message,error){const el=$('#svStatus');if(el){el.className=`notice${error?' error':' success'}`;el.textContent=message}}
function formatBytes(value){const bytes=Number(value||0);if(bytes>=1_000_000_000)return `${(bytes/1_000_000_000).toFixed(1)} GB`;if(bytes>=1_000_000)return `${Math.round(bytes/1_000_000)} MB`;return `${Math.round(bytes/1_000)} KB`}
function JSONSafe(value){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch{return []}}
