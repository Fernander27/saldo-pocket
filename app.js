(()=>{
'use strict';
const OLD='saldo-pocket-v1', VAULT='saldo-pocket-secure-v2';
const CATS=['Spesa','Ristoranti','Auto','Trasporti','Shopping','Famiglia','Svago','Altro'];
const $=s=>document.querySelector(s), root=$('#app');
const fmt=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const money=c=>fmt.format(c/100);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseMoney=s=>{const n=Number(String(s||'').trim().replace(',','.'));return Number.isFinite(n)&&n>=0&&n<=1e9?Math.round(n*100):null};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'p_'+Date.now()+'_'+Math.random().toString(36).slice(2);
const encode=a=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.slice(i,i+8192));return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const rand=n=>crypto.getRandomValues(new Uint8Array(n));
const brand='<div class="brand" style="display:flex;align-items:center;gap:4px"><img src="./icon-180.png" alt="" style="width:37px;height:37px"><img src="./wordmark.svg" alt="saldo" style="width:94px;height:auto"><span class="accent">pocket.</span></div>';
let mode=localStorage.getItem(VAULT)?'locked':'setup',state=null,key=null,category='Spesa',source='CONTO',firstPin='',failed=0,lockUntil=0,undo=null,working=false,lastActive=Date.now();
function valid(s){
 return s && Number.isSafeInteger(s.start)&&s.start>=0&&s.start<=1e11
 &&Array.isArray(s.entries)&&Array.isArray(s.history)
 &&s.entries.length<=5000&&s.history.length<=15000
 &&s.entries.concat(s.history).every(e=>Number.isSafeInteger(e.amount)&&e.amount>0&&e.amount<=1e11&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&['CONTO','TEST'].includes(e.source));
}
function initial(){
 let legacy=null;try{legacy=JSON.parse(localStorage.getItem(OLD)||'null')}catch{}
 const e=Array.isArray(legacy?.entries)?legacy.entries.map(x=>({id:String(x.id||uuid()),date:x.date,amount:x.amount,category:String(x.category||'Altro'),source:x.source==='TEST'?'TEST':'CONTO',note:String(x.note||'').slice(0,80)})):[];
 const s={start:Number.isSafeInteger(legacy?.start)?legacy.start:0,created:legacy?.created||today(),entries:e,history:[],margins:{CONTO:null,TEST:null},favorites:['Spesa','Ristoranti','Auto','Shopping'],updatedFromPC:null};
 if(!valid(s))throw Error('I dati precedenti non sono validi. Prima salva una copia e non cancellare Pocket.');
 return s;
}
async function derive(pin,salt){
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(s,k,salt){
 const iv=rand(12),bytes=new TextEncoder().encode(JSON.stringify(s));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,bytes);
 return JSON.stringify({format:'saldo-pocket-v2',salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(ct))});
}
async function store(){
 if(!state||!key)throw Error('Archivio bloccato');
 const env=JSON.parse(localStorage.getItem(VAULT)||'null');
 if(!env||env.format!=='saldo-pocket-v2')throw Error('Archivio cifrato non valido');
 const value=await seal(state,key,decode(env.salt));
 localStorage.setItem(VAULT,value);
 if(localStorage.getItem(VAULT)!==value)throw Error('Impossibile salvare i dati');
}
function header(){return '<header class="top">'+brand+'<span class="day">'+new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'}).format(new Date())+'</span></header>';}
function frame(content){root.innerHTML='<div class="wrap">'+header()+content+'<p class="footer">Dati cifrati su questo dispositivo · Nessuna banca collegata</p></div>';}
function renderLock(){
 const setup=mode==='setup';
 frame('<section class="hero"><div class="tag">PROTEZIONE PERSONALE</div><div class="money" style="font-size:30px">'+(setup?'Proteggi Pocket':'Pocket bloccato')+'</div><p class="sub">'+(setup?'Crea un PIN di 6 cifre. Le spese già presenti saranno conservate e cifrate.':'Inserisci il tuo PIN per visualizzare importi e registrare spese.')+'</p></section><section class="card"><h2>'+(setup?(firstPin?'Conferma il PIN':'Crea il tuo PIN'):'Sblocca SALDO')+'</h2><form id="pin-form"><label class="label">PIN numerico · 6 cifre</label><input class="input" type="password" name="pin" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required autofocus><button class="primary" style="margin-top:14px">'+(setup?'Continua':'Sblocca')+'</button></form><p class="hint" id="status-pin"></p>'+(setup?'<p class="hint">Attenzione: se dimentichi il PIN, non potrai decifrare le spese. Salva regolarmente un backup cifrato.</p>':'<p class="hint">PIN dimenticato? Puoi recuperare i dati solo con un backup di cui conosci il PIN. Non esiste una password di recupero.</p>')+'<button type="button" class="soft" data-action="restore" style="margin-top:8px;width:100%">Ripristina backup cifrato</button><input type="file" id="restore-file" accept=".json,application/json" hidden></section>');
 setTimeout(()=>$('#pin-form input')?.focus(),50);
}
function pending(){return state.entries.reduce((s,e)=>s+e.amount,0)}
function available(ac){
 const n=state.margins?.[ac];return Number.isSafeInteger(n)?n-state.entries.filter(e=>e.source===ac).reduce((v,e)=>v+e.amount,0):null;
}
function showEntry(e,archived=false){return '<div class="entry"><div class="circle">'+(archived?'✓':'−')+'</div><div class="main"><b>'+esc(e.note||e.category)+'</b><span>'+esc(e.date)+' · '+esc(e.category)+' · '+e.source+'</span></div><strong>−'+money(e.amount)+'</strong>'+(archived?'':'<button class="mini-action" data-edit="'+esc(e.id)+'" aria-label="Modifica spesa">✎</button><button class="dangerIcon" data-remove="'+esc(e.id)+'" aria-label="Elimina spesa">×</button>')+'</div>';}
function renderApp(){
 if(mode!=='ready'||!state)return renderLock();
 const remain=state.start-pending(), age=Math.max(0,Math.floor((new Date(today()+'T12:00:00')-new Date(state.created+'T12:00:00'))/86400000));
 const entries=[...state.entries].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
 const acCards=['CONTO','TEST'].map(ac=>'<div class="pocket-account"><span>Margine libero '+ac+'</span><strong>'+(available(ac)===null?'Da aggiornare':money(available(ac)))+'</strong></div>').join('');
 frame('<section class="hero"><div class="tag">MARGINE LIBERO · ULTIMO DATO PC</div><div class="money '+(remain<0?'negative':'')+'">'+money(remain)+'</div><p class="sub">Stima locale: ultimo margine del PC meno le spese Pocket non ancora riportate.</p><div class="rule"></div><div class="stats"><div><span>Ultimo margine PC</span><strong>'+money(state.start)+'</strong></div><div><span>Spese in attesa</span><strong>'+money(pending())+'</strong></div></div></section><section class="account-grid">'+acCards+'</section><div class="pocket-row"><button class="soft" data-action="lock">🔒 Blocca</button><button class="soft" data-action="renew">↻ Aggiorna dal PC</button></div>'+(age>=2?'<div class="warn">⚠️ Ultimo aggiornamento dal PC: '+age+' giorni fa. I margini potrebbero non essere aggiornati.</div>':'')+'<section class="card"><h2>Registra una spesa</h2><div class="label">Spese rapide</div><div class="chips">'+state.favorites.map(c=>'<button class="chip" type="button" data-quick="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</div><form id="expense"><label class="label">Importo (€)</label><input class="input amountInput" type="number" name="amount" inputmode="decimal" min="0.01" max="1000000000" step="0.01" placeholder="0,00" required><div class="label">Categoria</div><div class="chips">'+CATS.map(c=>'<button type="button" data-cat="'+esc(c)+'" class="chip '+(c===category?'active':'')+'">'+esc(c)+'</button>').join('')+'</div><div class="label">Pagato con</div><div class="chips">'+['CONTO','TEST'].map(ac=>'<button type="button" data-source="'+ac+'" class="chip '+(ac===source?'active':'')+'">'+ac+'</button>').join('')+'</div><label class="label">Nota (facoltativa)</label><input class="input" name="note" maxlength="80" placeholder="Es. carburante, pranzo…"><button class="primary" style="margin-top:14px">− Registra spesa</button></form></section><section class="card"><div class="between"><h2>Da riportare sul PC</h2><span class="pill">'+entries.length+'</span></div>'+(entries.length?entries.map(e=>showEntry(e)).join(''):'<div class="empty">Nessuna spesa in attesa</div>')+'<div class="bottomActions"><button class="soft" data-action="export">Esporta per Windows</button><button class="soft" data-action="copy">Copia elenco</button></div>'+(undo?'<button class="soft" data-action="undo" style="margin-top:10px;width:100%">↶ Annulla ultima modifica</button>':'')+'<p class="hint">Dopo aver riportato le spese su Windows, usa “Aggiorna dal PC”: le spese passeranno nello storico, senza sparire.</p></section><section class="card"><h2>Storico e sicurezza</h2><p class="hint">'+state.history.length+' spese già archiviate · nessun dato inviato a server</p><button class="soft" data-action="history">Vedi storico</button><div class="bottomActions"><button class="soft" data-action="backup">Salva backup cifrato</button><button class="soft" data-action="restore">Ripristina backup</button></div><button class="soft" data-action="favorites" style="margin-top:10px;width:100%">Personalizza spese rapide</button><input type="file" id="restore-file" accept=".json,application/json" hidden></section>');
}
function alertStatus(s){const x=$('#status-pin');if(x)x.textContent=s;else alert(s);}
function download(name,str,type='application/json'){
 const blob=new Blob([str],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function exportTransfer(){
 if(!state.entries.length)return alert('Non ci sono spese da esportare.');
 const record={format:'saldo-pocket-transfer-v1',exportedAt:new Date().toISOString(),entries:state.entries.map(e=>({id:e.id,date:e.date,type:'expense',amount_cents:e.amount,amount:e.amount/100,category:e.category,source:e.source,note:e.note}))};
 download('saldo-pocket-per-windows-'+today()+'.json',JSON.stringify(record,null,2));
 alert('File pronto. Conserva questo file in modo privato: contiene importi e note in chiaro. Importalo su Windows solo tramite una funzione compatibile; altrimenti usa “Copia elenco”.');
}
function copyList(){
 const lines=['SALDO Pocket — spese da registrare su SALDO Windows','Data | ID | Categoria | CONTO/TEST | Importo | Nota'];
 state.entries.forEach(e=>lines.push(e.date+' | '+e.id+' | '+e.category+' | '+e.source+' | '+money(e.amount)+' | '+(e.note||'-')));
 const s=lines.join('\n');
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(s).then(()=>alert('Elenco copiato.')).catch(()=>download('saldo-pocket-elenco.txt',s,'text/plain'));
 else download('saldo-pocket-elenco.txt',s,'text/plain');
}
async function saveChange(snapshot){
 try{await store();undo=snapshot;renderApp()}catch(e){state=snapshot;alert('Salvataggio non riuscito: '+e.message);renderApp();}
}
async function editEntry(id){
 const e=state.entries.find(x=>x.id===id);if(!e)return;
 let raw=prompt('Importo in euro:',String(e.amount/100));if(raw===null)return;
 const amount=parseMoney(raw);if(amount===null||amount<=0)return alert('Importo non valido.');
 raw=prompt('Fonte di pagamento: CONTO oppure TEST',e.source);if(raw===null)return;
 const ac=raw.trim().toUpperCase();if(!['CONTO','TEST'].includes(ac))return alert('Scegli CONTO o TEST.');
 raw=prompt('Categoria:',e.category);if(raw===null)return;
 const cat=raw.trim().slice(0,40)||'Altro';
 raw=prompt('Nota:',e.note||'');if(raw===null)return;
 const note=raw.slice(0,80);
 const snapshot=structuredClone(state);Object.assign(e,{amount,source:ac,category:cat,note});
 await saveChange(snapshot);
}
async function renew(){
 if(state.entries.length&&!confirm('Hai importato o registrato su Windows TUTTE le spese in attesa?\n\nConfermando, verranno archiviate su Pocket (non eliminate).'))return;
 const r=prompt('Nuovo Margine libero TOTALE letto da Windows (€):',String(state.start/100));if(r===null)return;
 const total=parseMoney(r);if(total===null)return alert('Importo non valido.');
 function opt(ac){
  const v=state.margins?.[ac];
  const a=prompt('Margine libero '+ac+' letto da Windows (€).\nLascia vuoto se non lo conosci.',v===null||v===undefined?'':String(v/100));
  if(a===null)return undefined;
  if(a.trim()==='')return null;
  return parseMoney(a);
 }
 const conto=opt('CONTO');if(conto===undefined)return;
 const test=opt('TEST');if(test===undefined)return;
 if((conto!==null&&conto<0)||(test!==null&&test<0))return alert('Margine non valido.');
 const snapshot=structuredClone(state);
 state.history.push(...state.entries.map(e=>({...e,archivedAt:new Date().toISOString()})));
 state.history=state.history.slice(-14000);state.entries=[];state.start=total;state.created=today();state.updatedFromPC=new Date().toISOString();state.margins={CONTO:conto,TEST:test};
 await saveChange(snapshot);
 alert('Margini aggiornati e spese archiviate. I saldi restano soltanto su SALDO Windows.');
}
async function showHistory(){
 if(!state.history.length)return alert('Lo storico è vuoto.');
 const rows=[...state.history].reverse().slice(0,150);
 const panel='<section class="card"><div class="between"><h2>Storico archiviato</h2><button class="soft" data-action="back">Indietro</button></div><p class="hint">Ultime 150 spese archiviate. Restano comprese nei backup cifrati.</p>'+rows.map(e=>showEntry(e,true)).join('')+'</section>';
 frame(panel);
}
async function restoreFile(file){
 if(!file||file.size>5e6)return alert('Backup assente o troppo grande.');
 let backup;try{backup=JSON.parse(await file.text())}catch{return alert('File non leggibile.');}
 if(backup?.format!=='saldo-pocket-encrypted-backup-v1'||typeof backup.vault!=='string')return alert('Questo non è un backup cifrato di SALDO Pocket.');
 let env;try{env=JSON.parse(backup.vault)}catch{}
 if(!env||env.format!=='saldo-pocket-v2'||!env.salt||!env.iv||!env.data)return alert('Backup non valido.');
 if(!confirm('ATTENZIONE: il ripristino sostituirà tutti i dati attuali di Pocket. Salva prima un backup dei dati esistenti. Proseguire?'))return;
 localStorage.setItem(VAULT,backup.vault);key=null;state=null;firstPin='';mode='locked';undo=null;renderLock();alert('Backup caricato. Usa il PIN con cui era stato creato.');
}
async function handlePin(pin){
 if(working)return;
 if(!/^\d{6}$/.test(pin))return alertStatus('Il PIN deve contenere esattamente 6 cifre.');
 if(Date.now()<lockUntil)return alertStatus('Troppi tentativi. Riprova fra qualche istante.');
 working=true;try{
  if(mode==='setup'){
   if(!firstPin){firstPin=pin;renderLock();return;}
   if(pin!==firstPin){firstPin='';renderLock();return alertStatus('I PIN non coincidono. Riprova.');}
   const s=initial(),salt=rand(16),k=await derive(pin,salt),enc=await seal(s,k,salt);
   localStorage.setItem(VAULT,enc);if(localStorage.getItem(VAULT)!==enc)throw Error('Memoria non disponibile');
   key=k;state=s;mode='ready';firstPin='';localStorage.removeItem(OLD);renderApp();
  }else{
   const env=JSON.parse(localStorage.getItem(VAULT)||'null');
   if(!env||env.format!=='saldo-pocket-v2')throw Error('Archivio non valido');
   const k=await derive(pin,decode(env.salt));
   const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(env.iv)},k,decode(env.data));
   const s=JSON.parse(new TextDecoder().decode(out));
   if(!valid(s))throw Error('Dati non validi');
   s.margins=s.margins||{CONTO:null,TEST:null};s.favorites=Array.isArray(s.favorites)?s.favorites:['Spesa','Ristoranti','Auto','Shopping'];
   key=k;state=s;mode='ready';failed=0;renderApp();
  }
 }catch(e){
  if(mode==='locked'){failed++;if(failed>=5){lockUntil=Date.now()+30000;failed=0;}alertStatus('PIN non corretto oppure archivio danneggiato. '+(Date.now()<lockUntil?'Riprova fra 30 secondi.':''));}
  else alertStatus('Impossibile inizializzare Pocket: '+e.message);
 }finally{working=false;}
}
function lock(){
 if(mode!=='ready')return;state=null;key=null;undo=null;mode='locked';root.replaceChildren();
 if(document.visibilityState==='visible')renderLock();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){lock();}else if(mode==='locked')renderLock();});
window.addEventListener('pagehide',lock);
['touchstart','pointerdown','keydown'].forEach(t=>document.addEventListener(t,()=>lastActive=Date.now(),{passive:true}));
setInterval(()=>{if(mode==='ready'&&Date.now()-lastActive>10*60*1000)lock();},30000);
document.addEventListener('submit',async ev=>{
 const f=ev.target;if(!['pin-form','expense'].includes(f.id))return;ev.preventDefault();
 if(f.id==='pin-form')return handlePin(String(new FormData(f).get('pin')||''));
 if(mode!=='ready'||!state)return;
 const fd=new FormData(f),amount=parseMoney(fd.get('amount'));if(!amount)return alert('Importo non valido.');
 const snapshot=structuredClone(state);state.entries.push({id:uuid(),date:today(),amount,category,source,note:String(fd.get('note')||'').trim().slice(0,80)});
 await saveChange(snapshot);$('#expense [name="amount"]')?.focus();
});
document.addEventListener('change',async ev=>{if(ev.target.id==='restore-file'){const file=ev.target.files[0];ev.target.value='';await restoreFile(file);}});
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-action],[data-cat],[data-source],[data-quick],[data-edit],[data-remove]');if(!b)return;
 lastActive=Date.now();
 if(b.dataset.cat){category=b.dataset.cat;document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x.dataset.cat===category));return;}
 if(b.dataset.source){source=b.dataset.source;document.querySelectorAll('[data-source]').forEach(x=>x.classList.toggle('active',x.dataset.source===source));return;}
 if(b.dataset.quick){category=b.dataset.quick;document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x.dataset.cat===category));$('#expense [name="amount"]')?.focus();return;}
 if(b.dataset.action==='restore')return $('#restore-file')?.click();
 if(mode!=='ready'||!state)return;
 if(b.dataset.edit)return editEntry(b.dataset.edit);
 if(b.dataset.remove){
  if(!confirm('Eliminare questa spesa?'))return;const snapshot=structuredClone(state);
  state.entries=state.entries.filter(x=>x.id!==b.dataset.remove);return saveChange(snapshot);
 }
 switch(b.dataset.action){
 case 'lock':return lock();
 case 'export':return exportTransfer();
 case 'copy':return copyList();
 case 'backup':return download('saldo-pocket-backup-cifrato-'+today()+'.json',JSON.stringify({format:'saldo-pocket-encrypted-backup-v1',created:new Date().toISOString(),vault:localStorage.getItem(VAULT)}));
 case 'renew':return renew();
 case 'history':return showHistory();
 case 'back':return renderApp();
 case 'undo':if(undo){const snap=structuredClone(state);state=undo;await saveChange(snap);undo=null;renderApp();}return;
 case 'favorites':{
  const v=prompt('Scegli fino a 4 categorie rapide, separate da una virgola:',state.favorites.join(', '));if(v===null)return;
  const fav=[...new Set(v.split(',').map(x=>x.trim()).filter(x=>CATS.includes(x)))].slice(0,4);
  if(!fav.length)return alert('Scegli almeno una categoria valida: '+CATS.join(', '));
  const snapshot=structuredClone(state);state.favorites=fav;return saveChange(snapshot);
 }
 }
});
if(!window.crypto?.subtle){frame('<section class="card"><h2>Protezione non disponibile</h2><p>Per usare Pocket serve Safari aggiornato e una connessione HTTPS. I dati esistenti non sono stati modificati.</p></section>');}
else if(mode==='locked')renderLock();else renderLock();
})();
