import { $,api,escapeHtml,state } from '../core.js';
import { renderError } from './common.js';

let editingId=null;
let questionSeed=0;

export async function renderApplications(){
  editingId=null;
  $('#content').innerHTML='<div class="eyebrow">COMMUNITY</div><h1 class="page-title">Applications & Appeals</h1><p class="page-intro">Build structured forms for applications, appeals, beta programs, reports, or staff intake, then post them directly into Discord.</p><div id="apps" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${state.guildId}/applications`);
    const channels=(state.bundle?.channels||[]).filter(channel=>[0,5].includes(Number(channel.type)));
    $('#apps').outerHTML=`<div id="applicationNotice"></div><div class="grid"><section class="card span-5"><div class="section-heading"><div><h2 id="formEditorTitle">Create form</h2><div class="small">Add up to 10 questions. Discord displays questions 1–5 first; forms with 6–10 questions continue to a second page.</div></div></div><label>Name<input id="apName" placeholder="NerdLove Mod Application"></label><label>Description<textarea id="apDesc"></textarea></label><div class="section-heading"><div><h2>Questions</h2><div id="questionCount" class="small">0 / 10</div></div><button id="addQuestion" class="btn secondary" type="button">+ Add Question</button></div><div id="questionBuilder" class="question-builder"></div><div class="button-row"><button id="apSave" class="btn">Create Form</button><button id="apCancel" class="btn ghost hidden" type="button">Cancel Edit</button></div></section><section class="card span-7"><h2>Forms</h2>${data.forms.length?data.forms.map(form=>formCard(form,channels)).join(''):'<div class="empty">No forms yet.</div>'}<h2>Pending submissions</h2>${pendingMarkup(data.submissions)}</section></div>`;
    addQuestion('');
    $('#addQuestion').onclick=()=>addQuestion('');
    $('#apSave').onclick=saveForm;
    $('#apCancel').onclick=()=>resetEditor();
    document.querySelectorAll('.apEdit').forEach(button=>button.onclick=()=>startEdit(data.forms.find(x=>String(x.id)===button.dataset.id)));
    document.querySelectorAll('.apDel').forEach(button=>button.onclick=()=>deleteForm(button.dataset.id));
    document.querySelectorAll('.apReview').forEach(button=>button.onclick=()=>review(button.dataset.id,button.dataset.status));
    document.querySelectorAll('.apPanelToggle').forEach(button=>button.onclick=()=>togglePanelEditor(button.dataset.id));
    document.querySelectorAll('.apPanelSave').forEach(button=>button.onclick=()=>savePanel(button.dataset.id));
    document.querySelectorAll('.apPanelDelete').forEach(button=>button.onclick=()=>deletePanel(button.dataset.id));
  }catch(e){renderError(`Applications failed (${friendly(e)}).`)}
}

function formCard(form,channels){
  const questions=parseFields(form.fields_json);
  const posted=Boolean(form.panel_channel_id&&form.panel_message_id);
  const postedChannel=channels.find(channel=>String(channel.id)===String(form.panel_channel_id||''));
  const panelTitle=form.panel_title||form.name||'';
  const panelDescription=form.panel_description??form.description??'';
  const panelButton=form.panel_button_label||defaultButtonLabel(form.name);
  const options=channels.map(channel=>`<option value="${channel.id}" ${String(channel.id)===String(form.panel_channel_id||'')?'selected':''}>#${escapeHtml(channel.name)}</option>`).join('');
  return `<div class="notice application-form-row"><div><strong>${escapeHtml(form.name)}</strong><br><span class="small">${escapeHtml(form.description||'No description')} · ${questions.length} question${questions.length===1?'':'s'}</span><br><span class="small">${posted?`Panel posted${postedChannel?` in #${escapeHtml(postedChannel.name)}`:''}.`:'Panel not posted to Discord yet.'}</span></div><div class="button-row"><button class="btn secondary apPanelToggle" type="button" data-id="${form.id}">${posted?'Manage Panel':'Post to Channel'}</button><button class="btn secondary apEdit" type="button" data-id="${form.id}">Edit</button><button class="btn ghost apDel" type="button" data-id="${form.id}">Remove</button></div><div id="apPanelEditor-${form.id}" class="panel-editor hidden" style="margin-top:12px;width:100%"><div class="notice"><strong>Discord panel</strong><div class="small">This is the message members click to open the form inside Discord.</div><label>Post to channel<select id="apPanelChannel-${form.id}"><option value="">Select a channel…</option>${options}</select></label><label>Panel title<input id="apPanelTitle-${form.id}" maxlength="120" value="${escapeHtml(panelTitle)}"></label><label>Panel description<textarea id="apPanelDescription-${form.id}" maxlength="1600">${escapeHtml(panelDescription)}</textarea></label><label>Button label<input id="apPanelButton-${form.id}" maxlength="80" value="${escapeHtml(panelButton)}"></label><div class="button-row"><button class="btn apPanelSave" type="button" data-id="${form.id}">${posted?'Update Panel':'Post to Channel'}</button>${posted?`<button class="btn ghost apPanelDelete" type="button" data-id="${form.id}">Delete Panel</button>`:''}</div></div></div></div>`;
}

function pendingMarkup(submissions){
  const pending=submissions.filter(x=>x.status==='pending');
  return pending.length?pending.map(x=>`<div class="notice"><strong>Submission #${x.id}</strong>${x.user_id?` · <span class="small">Discord user ${escapeHtml(x.user_id)}</span>`:''}<br><span class="small">${escapeHtml(answerSummary(x.answers_json))}</span><div class="button-row"><button class="btn secondary apReview" data-id="${x.id}" data-status="approved">Approve</button><button class="btn ghost apReview" data-id="${x.id}" data-status="denied">Deny</button></div></div>`).join(''):'<div class="empty">Nothing waiting for review.</div>';
}

function answerSummary(raw){
  try{const answers=JSON.parse(raw||'{}');return Object.values(answers).map((value,index)=>`Q${index+1}: ${String(value)}`).join(' · ').slice(0,700)||'No answers recorded.';}catch{return String(raw||'No answers recorded.').slice(0,700)}
}

function togglePanelEditor(id){
  const editor=$(`#apPanelEditor-${id}`);
  if(editor)editor.classList.toggle('hidden');
}

async function savePanel(id){
  const channelId=$(`#apPanelChannel-${id}`)?.value||'';
  if(!channelId)return notice('Choose the Discord channel where Orbit should post this form.','error');
  const button=document.querySelector(`.apPanelSave[data-id="${id}"]`);
  if(button){button.disabled=true;button.textContent='Posting…';}
  try{
    const result=await api(`/api/guilds/${state.guildId}/applications`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'post_panel',id:Number(id),channel_id:channelId,panel_title:$(`#apPanelTitle-${id}`)?.value||'',panel_description:$(`#apPanelDescription-${id}`)?.value||'',panel_button_label:$(`#apPanelButton-${id}`)?.value||''})});
    notice(result.mode==='updated'?'Discord panel updated.':result.mode==='repaired'?'The missing Discord panel was reposted.':'Form posted to Discord.');
    renderApplications();
  }catch(e){notice(`Could not post the form panel: ${friendly(e)}.`,'error');if(button){button.disabled=false;button.textContent='Post to Channel';}}
}

async function deletePanel(id){
  if(!confirm('Delete this form panel from Discord? The saved form and existing submissions will stay in Orbit.'))return;
  try{await api(`/api/guilds/${state.guildId}/applications`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'delete_panel',id:Number(id)})});notice('Discord panel deleted.');renderApplications();}
  catch(e){notice(`Could not delete the Discord panel: ${friendly(e)}.`,'error')}
}

function addQuestion(label=''){
  const builder=$('#questionBuilder');
  if(!builder||builder.children.length>=10)return;
  questionSeed++;
  const row=document.createElement('div');
  row.className='question-row';row.dataset.questionId=String(questionSeed);
  row.innerHTML=`<div class="question-number">${builder.children.length+1}</div><input class="apQuestion" maxlength="240" placeholder="Question ${builder.children.length+1}" value="${escapeHtml(label)}"><button class="btn ghost questionRemove" type="button">Remove</button>`;
  row.querySelector('.questionRemove').onclick=()=>{row.remove();renumberQuestions();};
  builder.appendChild(row);renumberQuestions();
}
function renumberQuestions(){
  const rows=[...document.querySelectorAll('.question-row')];
  rows.forEach((row,index)=>{row.querySelector('.question-number').textContent=String(index+1);row.querySelector('.apQuestion').placeholder=`Question ${index+1}`;});
  if($('#questionCount'))$('#questionCount').textContent=`${rows.length} / 10`;
  if($('#addQuestion'))$('#addQuestion').disabled=rows.length>=10;
}
function collectQuestions(){return [...document.querySelectorAll('.apQuestion')].map(x=>x.value.trim()).filter(Boolean).slice(0,10).map((label,index)=>({id:`q${index+1}`,label,type:'text'}));}

async function saveForm(){
  const name=$('#apName').value.trim();
  const fields=collectQuestions();
  if(!name)return notice('Give the form a name.','error');
  if(!fields.length)return notice('Add at least one question.','error');
  if(fields.length>10)return notice('Forms can have up to 10 questions.','error');
  const button=$('#apSave');button.disabled=true;button.textContent=editingId?'Saving…':'Creating…';
  try{
    await api(`/api/guilds/${state.guildId}/applications`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:editingId?'update_form':'create_form',id:editingId,name,description:$('#apDesc').value,fields})});
    renderApplications();
  }catch(e){notice(`Could not save form: ${friendly(e)}.`,'error');button.disabled=false;button.textContent=editingId?'Save Changes':'Create Form';}
}
function startEdit(form){
  if(!form)return;
  editingId=Number(form.id);$('#formEditorTitle').textContent='Edit form';$('#apSave').textContent='Save Changes';$('#apCancel').classList.remove('hidden');$('#apName').value=form.name||'';$('#apDesc').value=form.description||'';
  $('#questionBuilder').innerHTML='';const fields=parseFields(form.fields_json);(fields.length?fields:[{label:''}]).slice(0,10).forEach(q=>addQuestion(q.label||''));
  $('#apName').focus();window.scrollTo({top:0,behavior:'smooth'});
}
function resetEditor(){editingId=null;$('#formEditorTitle').textContent='Create form';$('#apSave').textContent='Create Form';$('#apCancel').classList.add('hidden');$('#apName').value='';$('#apDesc').value='';$('#questionBuilder').innerHTML='';addQuestion('');notice('');}
async function deleteForm(id){if(!confirm('Remove this application/appeal form? Orbit will also remove its Discord panel if one is posted. Existing submission records stay in Orbit.'))return;try{await api(`/api/guilds/${state.guildId}/applications?id=${encodeURIComponent(id)}`,{method:'DELETE'});renderApplications();}catch(e){notice(`Could not remove form: ${friendly(e)}.`,'error')}}
async function review(id,status){try{await api(`/api/guilds/${state.guildId}/applications`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'review',id:+id,status})});renderApplications();}catch(e){notice(`Review failed: ${friendly(e)}.`,'error')}}
function parseFields(raw){try{const value=JSON.parse(raw||'[]');return Array.isArray(value)?value.slice(0,10):[]}catch{return []}}
function defaultButtonLabel(name){return /appeal/i.test(String(name||''))?'Submit Appeal':/application|apply|mod/i.test(String(name||''))?'Apply Now':'Open Form'}
function friendly(e){return e?.payload?.detail||e?.message||'Unknown error'}
function notice(text,type='success'){const el=$('#applicationNotice');if(el)el.innerHTML=text?`<div class="notice ${type}">${escapeHtml(text)}</div>`:''}
