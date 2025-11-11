// FocusMate - Password Login (Option B) - Offline site
const KEY_USERS = 'focusmate_users'; // stores { username: passwordHash }
const KEY_DATA = 'focusmate_data';   // stores { username: [entries] }
const KEY_SESSION = 'focusmate_session'; // sessionStorage key for current user (so must login each session)

function qs(id){ return document.getElementById(id); }
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function readJSON(key, def){ const r = localStorage.getItem(key); return r?JSON.parse(r):def; }
function saveSession(user){ sessionStorage.setItem(KEY_SESSION, user); }
function clearSession(){ sessionStorage.removeItem(KEY_SESSION); }
function currentSession(){ return sessionStorage.getItem(KEY_SESSION); }

// Simple SHA-256 hash using SubtleCrypto (returns hex)
async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return hex;
}

window.addEventListener('DOMContentLoaded', ()=>{
  // Update nav login text based on session (do NOT auto-login from previous session as per Option B)
  const navLogin = qs('navLogin');
  const sessionUser = currentSession();
  if(navLogin) navLogin.innerText = sessionUser ? sessionUser : 'Login';

  // LOGIN PAGE
  if(qs('loginBtn')){
    const usernameInput = qs('username');
    const passwordInput = qs('password');
    const loginBtn = qs('loginBtn');
    const createBtn = qs('createBtn');
    const logoutBtn = qs('logoutBtn');
    const displayName = qs('displayName');
    const welcomeBox = qs('welcomeBox');
    const loginBox = qs('loginBox');
    const toProgress = qs('toProgress');

    function showWelcomeIfSession(){
      const user = currentSession();
      if(user){
        displayName.innerText = user;
        loginBox.style.display = 'none';
        welcomeBox.style.display = 'block';
      } else {
        loginBox.style.display = 'block';
        welcomeBox.style.display = 'none';
      }
    }
    showWelcomeIfSession();

    loginBtn.addEventListener('click', async ()=>{
      const u = usernameInput.value.trim();
      const p = passwordInput.value;
      if(!u || !p){ alert('Enter username and password'); return; }
      const users = readJSON(KEY_USERS, {});
      if(!users[u]){ alert('Account not found. Create account first.'); return; }
      const hash = await sha256Hex(p);
      if(hash !== users[u]){ alert('Incorrect password'); return; }
      // successful login -> create session only (so must login each new session)
      saveSession(u);
      if(navLogin) navLogin.innerText = u;
      showWelcomeIfSession();
    });

    createBtn.addEventListener('click', async ()=>{
      const u = usernameInput.value.trim();
      const p = passwordInput.value;
      if(!u || !p){ alert('Enter username and password to create account'); return; }
      const users = readJSON(KEY_USERS, {});
      if(users[u]){ alert('Username already exists. Choose another.'); return; }
      const hash = await sha256Hex(p);
      users[u] = hash;
      saveJSON(KEY_USERS, users);
      // ensure data store
      const db = readJSON(KEY_DATA, {});
      if(!db[u]) db[u] = [];
      saveJSON(KEY_DATA, db);
      alert('Account created. Now click Login to start session.');
    });

    logoutBtn.addEventListener('click', ()=>{
      clearSession();
      if(navLogin) navLogin.innerText = 'Login';
      showWelcomeIfSession();
    });

    toProgress && toProgress.addEventListener('click', ()=>{ window.location.href = 'progress.html'; });
  }

  // PROGRESS PAGE
  if(qs('saveEntry')){
    const subj = qs('subj'), minutes = qs('minutes'), focusLevel = qs('focusLevel');
    const mistakes = qs('mistakes'), remark = qs('remark');
    const saveEntry = qs('saveEntry'), autoRemark = qs('autoRemark');
    const entriesTableBody = document.querySelector('#entriesTable tbody');
    const progressChart = qs('progressChart');
    const sideUser = qs('sideUser'), statDays = qs('statDays'), statAvg = qs('statAvg');
    const addSample = qs('addSample'), exportData = qs('exportData');

    function ensureUserData(user){
      const db = readJSON(KEY_DATA, {});
      if(!db[user]) db[user] = [];
      saveJSON(KEY_DATA, db);
    }
    function currentUser(){ return currentSession(); }
    function readEntries(){ const db = readJSON(KEY_DATA, {}); const u = currentUser(); return (u && db[u])?db[u]:[]; }
    function writeEntries(arr){ const db = readJSON(KEY_DATA, {}); const u = currentUser(); if(!u) return false; db[u] = arr; saveJSON(KEY_DATA, db); return true; }
    function addEntry(entry){ const arr = readEntries(); arr.push(entry); return writeEntries(arr); }

    function renderTable(){
      const arr = readEntries();
      entriesTableBody.innerHTML = '';
      if(!arr.length){ entriesTableBody.innerHTML = '<tr><td colspan="8">No entries yet.</td></tr>'; return; }
      arr.slice().reverse().forEach((e, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>'+ new Date(e.date).toLocaleString() +'</td>' +
                       '<td>'+ escapeHtml(e.subject) +'</td>' +
                       '<td>'+ e.minutes +'</td>' +
                       '<td>'+ e.focus +'</td>' +
                       '<td>'+ escapeHtml(e.mistakes || '') +'</td>' +
                       '<td>'+ escapeHtml(e.remark || '') +'</td>' +
                       '<td>'+ escapeHtml(e.suggestion || '') +'</td>' +
                       '<td class="actions"><button class="btn" data-idx="'+(arr.length-1-idx)+'" onclick="window.focusmate.editEntry(event)">Edit</button> <button class="btn ghost" data-idx="'+(arr.length-1-idx)+'" onclick="window.focusmate.deleteEntry(event)">Delete</button></td>';
        entriesTableBody.appendChild(tr);
      });
      updateStats();
    }

    function updateStats(){
      const arr = readEntries();
      statDays.innerText = Math.max(0, new Set(arr.map(a=>new Date(a.date).toDateString())).size);
      const avg = arr.length ? Math.round(arr.reduce((s,it)=>s+Number(it.focus),0)/arr.length) : 0;
      statAvg.innerText = avg;
    }

    function drawChart(){
      const canvas = progressChart;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const data = aggregateMonthlyFocus();
      const padding = 30;
      const w = canvas.width - padding*2;
      const h = canvas.height - padding*2;
      ctx.strokeStyle = '#eef6ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0;i<=5;i++){ const y = padding + i*(h/5); ctx.moveTo(padding,y); ctx.lineTo(padding + w, y); }
      ctx.stroke();
      const max = 10;
      const step = w / Math.max(1, data.length-1);
      const points = data.map((d,i)=>{ const x = padding + i*step; const y = d.value === null ? null : padding + ((max - d.value)/max)*h; return {x,y,v:d.value}; });
      ctx.beginPath(); ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2.5;
      let started=false;
      points.forEach(p=>{ if(p.y===null){ started=false; return; } if(!started){ ctx.moveTo(p.x,p.y); started=true; } else ctx.lineTo(p.x,p.y); });
      ctx.stroke();
      ctx.fillStyle='#113366'; points.forEach(p=>{ if(p.y!==null){ ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); } });
      ctx.fillStyle='#64748b'; ctx.font='11px Arial'; data.forEach((d,i)=>{ if(i%3===0) ctx.fillText(d.day, padding + i*step -6, padding + h + 16); });
    }

    function aggregateMonthlyFocus(){
      const arr = readEntries();
      const now = new Date();
      const month = now.getMonth(); const year = now.getFullYear();
      const groups = {};
      for(const e of arr){
        const d = new Date(e.date);
        if(d.getMonth()!==month || d.getFullYear()!==year) continue;
        const key = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
        if(!groups[key]) groups[key]=[]; groups[key].push(e);
      }
      const daysInMonth = new Date(year, month+1, 0).getDate();
      const result = [];
      for(let day=1; day<=daysInMonth; day++){
        const key = year+'-'+(month+1)+'-'+day;
        const list = groups[key]||[];
        const avg = list.length ? Math.round(list.reduce((s,it)=>s+Number(it.focus),0)/list.length) : null;
        result.push({day, value: avg});
      }
      return result;
    }

    function escapeHtml(str){ if(!str) return ''; return str.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]); }

    // Simple suggestion generator using mistakes + focus + minutes
    function makeSuggestion(entry){
      const parts = [];
      const focus = Number(entry.focus || 0);
      const mins = Number(entry.minutes || 0);
      if(focus >= 8) parts.push('Great focus — keep this up.');
      else if(focus >=5) parts.push('Decent focus — try reducing small distractions.');
      else parts.push('Low focus — try Pomodoro 25/5 or remove phone distractions.');
      if(mins < 30) parts.push('Short session — aim for 30–60 minutes for deeper study.');
      if(entry.mistakes && entry.mistakes.toLowerCase().includes('concept')) parts.push('Review underlying concepts; try concept maps.');
      if(entry.mistakes && entry.mistakes.toLowerCase().includes('calculation')) parts.push('Practice more calculation drills to improve speed.');
      if(parts.length===0) parts.push('Keep refining your study pattern.');
      return parts.join(' ');
    }

    // public edit/delete handlers
    window.focusmate = window.focusmate || {};
    window.focusmate.editEntry = function(e){
      const idx = Number(e.target.getAttribute('data-idx'));
      const arr = readEntries();
      const entry = arr[idx];
      const newSubj = prompt('Edit subject', entry.subject) || entry.subject;
      const newMin = prompt('Minutes', entry.minutes) || entry.minutes;
      const newFocus = prompt('Focus (0-10)', entry.focus) || entry.focus;
      const newMist = prompt('Mistakes', entry.mistakes || '') || entry.mistakes || '';
      const newRemark = prompt('Remark', entry.remark || '') || entry.remark || '';
      entry.subject=newSubj; entry.minutes=Number(newMin); entry.focus=Number(newFocus); entry.mistakes=newMist; entry.remark=newRemark;
      entry.suggestion = makeSuggestion(entry);
      writeEntries(arr); renderTable(); drawChart();
    };
    window.focusmate.deleteEntry = function(e){
      if(!confirm('Delete this entry?')) return;
      const idx = Number(e.target.getAttribute('data-idx'));
      const arr = readEntries();
      arr.splice(idx,1);
      writeEntries(arr); renderTable(); drawChart();
    };

    // handlers
    saveEntry.addEventListener('click', ()=>{
      const user = currentUser();
      if(!user){ alert('You must login this session to save entries.'); return; }
      const entry = { subject: subj.value || 'General', minutes: Number(minutes.value)||0, focus: Number(focusLevel.value)||0, mistakes: mistakes.value||'', remark: remark.value||'', date: new Date().toISOString() };
      entry.suggestion = makeSuggestion(entry);
      addEntry(entry);
      subj.value=''; minutes.value=''; focusLevel.value=7; mistakes.value=''; remark.value='';
      renderTable(); drawChart();
    });

    autoRemark.addEventListener('click', ()=>{
      const temp = { subject: subj.value||'General', minutes: Number(minutes.value)||0, focus: Number(focusLevel.value)||0, mistakes: mistakes.value||'', remark: remark.value||'' };
      alert('Suggestion:\n\n' + makeSuggestion(temp));
    });

    addSample.addEventListener('click', ()=>{
      const u = currentUser();
      if(!u){ alert('Login first.'); return; }
      const sample = { subject:'Physics - Kinematics', minutes:50, focus:8, mistakes:'Some concept gaps', remark:'Solved examples', date:new Date().toISOString() };
      sample.suggestion = makeSuggestion(sample);
      addEntry(sample); renderTable(); drawChart();
    });

    exportData.addEventListener('click', ()=>{
      const u = currentUser();
      if(!u){ alert('Login first.'); return; }
      const arr = readEntries();
      const rows = [['date','subject','minutes','focus','mistakes','remark','suggestion']].concat(arr.map(a=>[a.date,a.subject,a.minutes,a.focus,a.mistakes,a.remark,a.suggestion]));
      const csv = rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'focusmate_'+u+'.csv'; a.click(); URL.revokeObjectURL(url);
    });

    // init view
    const u = currentUser();
    sideUser.innerText = u ? 'User: '+u : 'Not logged in';
    if(u) ensureUserData(u);
    renderTable(); drawChart();
    window.addEventListener('resize', drawChart);
  }

});
