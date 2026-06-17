/* ============ DATA ============ */
const SUBJECTS = {
  science:{icon:"🔬",label:"Science",qs:window.SCIENCE_QUESTIONS||[],desc:"Physics, Chemistry, Biology"},
  history:{icon:"📜",label:"History",qs:window.HISTORY_QUESTIONS||[],desc:"Indian & World History"},
  geography:{icon:"🌍",label:"Geography",qs:window.GEOGRAPHY_QUESTIONS||[],desc:"Maps, Climate, Landforms"},
  economics:{icon:"💰",label:"Economics",qs:window.ECONOMICS_QUESTIONS||[],desc:"Economy, Finance, Budget"},
  polity:{icon:"🏛️",label:"Polity",qs:window.POLITY_QUESTIONS||[],desc:"Politics, Governance"},
  gk:{icon:"🧠",label:"General Knowledge",qs:window.GK_QUESTIONS||[],desc:"Mixed GK & Current Affairs"},
};

const STORE = {
  progress:'rituquiz_progress',
  wrong:'rituquiz_wrong',
  bookmarks:'rituquiz_bookmarks',
  leaderboard:'rituquiz_lb',
  daily:'rituquiz_daily',
  lastSession:'rituquiz_lastSession',
  gamification:'rituquiz_gamification',
};

/* Migrate old daily format */
(function migrateDaily(){
  const d=load(STORE.daily);
  if(d&&d.completed!==undefined&&d.loginStreak===undefined){
    save(STORE.daily,{date:d.date,loginStreak:0,maxStreak:0,coins:0,lastLoginDate:'',dailyChallengeDone:d.completed||false,surpriseQuizDone:false,qotdAnswered:false,qotdQuestion:null,rewardClaimed:false,streakClaimed7:false,streakClaimed30:false});
  }
})();

function load(k){try{return JSON.parse(localStorage.getItem(k))||null}catch{return null}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}

/* ============ STATE ============ */
let quizQuestions=[],quizIndex=0,quizScore=0,quizCorrect=0,quizWrong=0,quizAnswered=false;
let quizTimer=null,quizTimeLeft=15,quizTotalTimer=null,quizTotalTimeLeft=60,quizLives=1;
let quizSubject=null,quizMode=null; /* 'practice','daily','wrong','bookmark','dailyChallenge','surprise','timed','survival','rapidfire','marathon','lucky' */
const TIMER_SEC=15;

/* ============ DOM REFS ============ */
const $=(id)=>document.getElementById(id);
const pages=document.querySelectorAll('.page');
const navItems=document.querySelectorAll('.nav-item');

/* ============ NAVIGATION ============ */
function showPage(id){
  pages.forEach(p=>p.classList.remove('active'));
  const page=document.getElementById(id);
  if(page){page.classList.add('active');}
  navItems.forEach(n=>{
    n.classList.toggle('active',n.dataset.page===id);
  });
  document.querySelector('.bottom-nav').style.display='flex';
  if(id==='pageQuiz') document.querySelector('.bottom-nav').style.display='none';
}

navItems.forEach(n=>n.addEventListener('click',()=>{
  const id=n.dataset.page;
  if(id==='pageQuiz') return;
  showPage(id);
  if(id==='pageHome') refreshHome();
  if(id==='pageSubjects') renderSubjects();
  if(id==='pageLeaderboard') renderLeaderboard();
  if(id==='pageProgress') renderProgress();
  if(id==='pageWrong') renderWrong();
  if(id==='pageBookmarks') renderBookmarks();
}));

/* ============ HOME ============ */
function refreshHome(){
  initDaily();
  const p=load(STORE.progress)||{};
  let totC=0,totW=0;
  Object.values(p).forEach(s=>{totC+=s.correct||0;totW+=s.wrong||0;});
  const bms=load(STORE.bookmarks)||[];
  const d=getDaily();

  $('statTotalQ').textContent=totC+totW;
  $('statCorrect').textContent=totC;
  $('statCoins').textContent=d.coins||0;
  $('statBookmarks').textContent=bms.length;

  /* Profile card */
  renderProfileCard(getGami());
  updateSmartLearning();

  /* Welcome message */
  $('welcomeSub').innerHTML='रोज़ अभ्यास, पक्की सफलता';
  if(d.loginStreak>0){
    $('welcomeSub').innerHTML+=`<br><span style="font-size:0.75rem;color:var(--gold);font-weight:600;">🔥 ${d.loginStreak}-day streak!</span>`;
  }

  const contBtn=$('continueBtn');
  const last=load(STORE.lastSession);
  if(last&&last.questions&&last.questions.length>0){
    contBtn.style.display='flex';
    $('continueSub').textContent=`${last.subject||''} • Q ${(last.index||0)+1}/${last.questions.length}`;
  }else{contBtn.style.display='none';}

  /* Today's Rank */
  updateRankDisplay();

  const grid=$('homeSubjectGrid');
  grid.innerHTML='';
  Object.entries(SUBJECTS).forEach(([k,v])=>{
    const c=document.createElement('button');
    c.className='home-subj-card';
    const sp=p[k]||{};
    const done=(sp.correct||0)+(sp.wrong||0);
    const totalQ=v.qs?v.qs.length:0;
    c.innerHTML=`<span class="subj-icon">${v.icon}</span><span class="subj-name">${v.label}</span><span class="subj-stat">${done>0?done+' done':totalQ+' Q'}</span>`;
    c.addEventListener('click',()=>startQuiz(k));
    grid.appendChild(c);
  });
}

/* ============ DAILY SYSTEM ============ */
function getDaily(){return load(STORE.daily)||{date:'',loginStreak:0,maxStreak:0,coins:0,lastLoginDate:'',dailyChallengeDone:false,surpriseQuizDone:false,qotdAnswered:false,qotdQuestion:null,rewardClaimed:false,streakClaimed7:false,streakClaimed30:false,todayAnswered:0,todayCorrect:0,yesterdayAnswered:0,yesterdayCorrect:0,virtualRankCity:5000,virtualRankIndia:50000,lastRankCity:5000,lastRankIndia:50000};}

function addCoins(amount){
  const d=getDaily();
  d.coins=(d.coins||0)+amount;
  save(STORE.daily,d);
  updateDailyUI();
}

function initDaily(){
  const d=getDaily();
  const today=new Date().toDateString();
  const yesterday=new Date(Date.now()-86400000).toDateString();

    if(d.date!==today){
    d.dailyChallengeDone=false;
    d.surpriseQuizDone=false;
    d.qotdAnswered=false;
    d.rewardClaimed=false;
    d.date=today;

    /* Persist yesterday's counters before reset */
    d.yesterdayAnswered=d.todayAnswered||0;
    d.yesterdayCorrect=d.todayCorrect||0;
    d.lastRankCity=d.virtualRankCity||5000;
    d.lastRankIndia=d.virtualRankIndia||50000;
    d.todayAnswered=0;
    d.todayCorrect=0;

    /* Virtual rank calculation */
    const g=getGami();
    const total=g.totalAnswered||0;
    const totalCorrect=g.totalCorrect||0;
    const acc=total>0?totalCorrect/total:0.5;
    /* Higher accuracy + more questions = better rank */
    d.virtualRankCity=Math.max(1,Math.round(10000-(total*2)-(acc*5000)));
    d.virtualRankIndia=Math.max(1,Math.round(50000-(total*5)-(acc*30000)));

    /* Streak logic */
    if(d.lastLoginDate===yesterday){
      d.loginStreak=(d.loginStreak||0)+1;
    }else if(d.lastLoginDate!==today){
      d.loginStreak=1;
    }
    d.lastLoginDate=today;
    if(d.loginStreak>(d.maxStreak||0))d.maxStreak=d.loginStreak;
    setTimeout(()=>checkAchievements(getGami()),100);
  }

  /* Virtual rank calculation (always update) */
  const gRank=getGami();
  const totalG=gRank.totalAnswered||0;
  const totalCorrectG=gRank.totalCorrect||0;
  const accG=totalG>0?totalCorrectG/totalG:0.5;
  d.virtualRankCity=Math.max(1,Math.round(10000-(totalG*2)-(accG*5000)));
  d.virtualRankIndia=Math.max(1,Math.round(50000-(totalG*5)-(accG*30000)));

  /* Pick QOTD — only on new day or if missing */
  if(d.date!==today||!d.qotdQuestion){
    let pool=[];
    Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
    const q=shuffle(pool)[0];
    d.qotdQuestion={q:q.q,a:q.a,c:q.c,d:q.d,subject:Object.keys(SUBJECTS).find(k=>SUBJECTS[k].qs.includes(q))};
  }

  save(STORE.daily,d);
  updateDailyUI();
}

function claimReward(){
  const d=getDaily();
  if(d.rewardClaimed){alert('Already claimed today!');return;}
  d.rewardClaimed=true;
  d.coins=(d.coins||0)+10;
  save(STORE.daily,d);
  addXp(5);
  updateDailyUI();
  $('claimRewardBtn').textContent='Claimed ✓';
  $('claimRewardBtn').disabled=true;
  showCoinEffect(10);
}

function showCoinEffect(amount){
  const el=document.createElement('div');
  el.textContent=`+${amount} 🪙`;
  el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2rem;font-weight:900;color:#f7971e;z-index:999;pointer-events:none;animation:fbIn 0.6s ease forwards;text-shadow:0 2px 10px rgba(247,151,30,0.5);';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1000);
}

function updateDailyUI(){
  const d=getDaily();
  $('coinDisplay').textContent=`🪙 ${d.coins||0}`;
  $('streakDisplay').textContent=`🔥 ${d.loginStreak||0}`;

  /* Stats */
  $('statCoins').textContent=d.coins||0;

  /* Streak bar */
  const pct=Math.min(100,((d.loginStreak||0)/30)*100);
  $('streakFill').style.width=`${pct}%`;
  $('currentStreak').textContent=d.loginStreak||0;
  $('maxStreak').textContent=d.maxStreak||0;

  /* Reward */
  if(d.rewardClaimed){
    $('claimRewardBtn').textContent='Claimed ✓';
    $('claimRewardBtn').disabled=true;
    $('rewardSub').textContent='Come back tomorrow';
  }else{
    $('claimRewardBtn').textContent='Claim';
    $('claimRewardBtn').disabled=false;
    $('rewardSub').textContent='Claim +10 🪙';
  }

  /* Daily Challenge */
  if(d.dailyChallengeDone){
    $('dailyChallengeBtn').textContent='Done ✓';
    $('dailyChallengeBtn').disabled=true;
    $('dailyChallengeSub').textContent='Completed today';
  }else{
    $('dailyChallengeBtn').textContent='Start';
    $('dailyChallengeBtn').disabled=false;
    $('dailyChallengeSub').textContent='+5 🪙 per correct answer';
  }

  /* Surprise Quiz */
  if(d.surpriseQuizDone){
    $('surpriseBtn').textContent='Done ✓';
    $('surpriseBtn').disabled=true;
    $('surpriseSub').textContent='Completed today';
  }else{
    $('surpriseBtn').textContent='Play';
    $('surpriseBtn').disabled=false;
    $('surpriseSub').textContent='5 random questions +20 🪙 bonus';
  }

  /* QOTD */
  renderQOTD(d);
}

function updateRankDisplay(){
  const d=getDaily();
  const todayQ=d.todayAnswered||0;
  const todayC=d.todayCorrect||0;
  const acc=todayQ>0?Math.round((todayC/todayQ)*100):0;
  $('todayAnswered').textContent=todayQ;
  $('todayCorrectPct').textContent=acc+'%';

  /* Rank vs yesterday */
  const curCity=d.virtualRankCity||5000;
  const curIndia=d.virtualRankIndia||50000;
  const prevCity=d.lastRankCity||5000;
  const prevIndia=d.lastRankIndia||50000;
  const cityDiff=prevCity-curCity;
  const indiaDiff=prevIndia-curIndia;
  const avgDiff=Math.round((cityDiff+indiaDiff)/2);
  if(avgDiff>0)$('todayRankChange').textContent=`⬆️ +${avgDiff}`;
  else if(avgDiff<0)$('todayRankChange').textContent=`⬇️ ${avgDiff}`;
  else $('todayRankChange').textContent=`➡️ 0`;

  $('cityRank').textContent='# '+curCity.toLocaleString();
  $('indiaRank').textContent='# '+curIndia.toLocaleString();
}

function renderQOTD(d){
  const q=d.qotdQuestion;
  if(!q){$('qotdQuestion').textContent='Loading...';return;}
  $('qotdQuestion').textContent=q.q;
  const opts=$('qotdOptions');
  opts.innerHTML='';
  if(d.qotdAnswered){
    opts.innerHTML='<div style="text-align:center;color:var(--text3);padding:8px;font-size:0.85rem;">✓ Answered</div>';
    return;
  }
  q.a.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.className='option-btn';
    btn.textContent=`${i+1}. ${opt}`;
    btn.addEventListener('click',()=>answerQOTD(i));
    opts.appendChild(btn);
  });
}

function answerQOTD(index){
  const d=getDaily();
  if(d.qotdAnswered)return;
  const q=d.qotdQuestion;
  if(!q)return;
  d.qotdAnswered=true;
  const correct=index===q.c;
  if(correct){d.coins=(d.coins||0)+15;showCoinEffect(15);addXp(15);}
  save(STORE.daily,d);

  const opts=$('qotdOptions');
  opts.querySelectorAll('.option-btn').forEach((btn,i)=>{
    btn.disabled=true;
    if(i===q.c)btn.classList.add('correct');
    if(i===index&&!correct)btn.classList.add('wrong');
  });

  const fb=$('qotdFeedback');
  fb.style.display='flex';
  $('qotdFbIcon').textContent=correct?'✅':'❌';
  $('qotdFbText').textContent=correct?'Correct! +15 🪙':`Correct: ${q.a[q.c]}`;
  updateDailyUI();
  refreshHome();
}

function startDailyChallenge(){
  const d=getDaily();
  if(d.dailyChallengeDone){alert('Daily challenge already completed!');return;}
  let pool=[];
  Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,10);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='dailyChallenge';
  showPage('pageQuiz');renderQuestion();
}

function startSurpriseQuiz(){
  const d=getDaily();
  if(d.surpriseQuizDone){alert('Surprise quiz already completed!');return;}
  let pool=[];
  Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,5);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='surprise';
  showPage('pageQuiz');renderQuestion();
}

/* Daily button listeners */
$('claimRewardBtn').addEventListener('click',claimReward);
$('dailyChallengeBtn').addEventListener('click',startDailyChallenge);
$('surpriseBtn').addEventListener('click',startSurpriseQuiz);

/* ============ GAMIFICATION ============ */
const LEVELS=[
  {min:0,title:'Beginner',icon:'🌱'},
  {min:100,title:'Learner',icon:'📖'},
  {min:300,title:'Scholar',icon:'🎓'},
  {min:600,title:'Knowledgeable',icon:'🧠'},
  {min:1000,title:'Expert',icon:'⚡'},
  {min:1500,title:'Advanced Expert',icon:'🔥'},
  {min:2500,title:'Master',icon:'👑'},
  {min:4000,title:'Grandmaster',icon:'💎'},
  {min:6000,title:'Legend',icon:'🌟'},
  {min:10000,title:'Ultimate',icon:'🚀'},
];

const ACHIEVEMENTS=[
  {id:'first_quiz',label:'First Steps',icon:'🎯',desc:'Complete your first quiz'},
  {id:'q100',label:'Curious Mind',icon:'📚',desc:'Answer 100 questions'},
  {id:'q500',label:'Bookworm',icon:'📖',desc:'Answer 500 questions'},
  {id:'q1000',label:'Knowledge Seeker',icon:'🧠',desc:'Answer 1000 questions'},
  {id:'c100',label:'Sharpshooter',icon:'🎯',desc:'Get 100 correct'},
  {id:'c500',label:'Accuracy King',icon:'🎯',desc:'Get 500 correct'},
  {id:'streak7',label:'Streaker',icon:'🔥',desc:'7-day login streak'},
  {id:'streak30',label:'Dedicated',icon:'🔥',desc:'30-day login streak'},
  {id:'bookmark10',label:'Collector',icon:'⭐',desc:'Bookmark 10 questions'},
  {id:'explorer',label:'Explorer',icon:'🗺️',desc:'Try all 6 subjects'},
  {id:'perfect',label:'Perfect Score',icon:'💯',desc:'Get 100% on a quiz'},
  {id:'coins100',label:'Saver',icon:'💰',desc:'Earn 100 coins'},
];

const THEMES=[
  {id:'default',label:'Default Dark',price:0,swatch:'#0f0c29'},
  {id:'ocean',label:'Ocean Blue',price:50,swatch:'#0c2233'},
  {id:'forest',label:'Forest Green',price:100,swatch:'#0a2e1a'},
  {id:'sunset',label:'Sunset Orange',price:150,swatch:'#2a0c0c'},
  {id:'midnight',label:'Midnight Black',price:200,swatch:'#05050f'},
  {id:'royal',label:'Royal Gold',price:500,swatch:'#1a0c2e'},
];

function getGami(){return load(STORE.gamification)||{xp:0,achievements:[],unlockedThemes:['default'],activeTheme:'default',quizCount:0,totalAnswered:0,totalCorrect:0,subjectTried:{}};}

function calcLevel(xp){
  let lvl=0;
  for(let i=LEVELS.length-1;i>=0;i--){if(xp>=LEVELS[i].min){lvl=i;break;}}
  return lvl;
}

function getLevelXpInfo(xp){
  const lvl=calcLevel(xp);
  const currentMin=LEVELS[lvl].min;
  const nextMin=LEVELS[lvl+1]?LEVELS[lvl+1].min:currentMin;
  const currentXp=xp-currentMin;
  const needed=nextMin-currentMin;
  return {level:lvl+1,title:LEVELS[lvl].title,icon:LEVELS[lvl].icon,currentXp,needed,progress:needed>0?Math.min(100,(currentXp/needed)*100):100};
}

function addXp(amount){
  const g=getGami();
  const oldLvl=calcLevel(g.xp);
  g.xp=(g.xp||0)+amount;
  const newLvl=calcLevel(g.xp);
  save(STORE.gamification,g);
  if(newLvl>oldLvl){setTimeout(()=>{showCoinEffect(0);const el=document.createElement('div');el.textContent=`⬆ Level Up! ${LEVELS[newLvl].icon} ${LEVELS[newLvl].title}`;el.style.cssText='position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);font-size:1.4rem;font-weight:900;color:var(--gold);z-index:999;pointer-events:none;animation:fbIn 0.8s ease forwards;text-shadow:0 2px 20px rgba(247,151,30,0.6);text-align:center;';document.body.appendChild(el);setTimeout(()=>el.remove(),2000);},300);}
  checkAchievements(g);
  renderProfileCard(g);
}

function checkAchievements(g){
  const d=getDaily();
  const p=load(STORE.progress)||{};
  let totalA=0,totalC=0;
  Object.values(p).forEach(s=>{totalA+=s.total||0;totalC+=s.correct||0;});
  const bms=load(STORE.bookmarks)||[];
  const subjectsTried=Object.keys(p).filter(k=>k!=='mixed'&&(p[k].total||0)>0).length;
  const earned=new Set(g.achievements||[]);
  let newOne=null;

  const checks=[
    {id:'first_quiz',check:g.quizCount>=1},
    {id:'q100',check:totalA>=100},{id:'q500',check:totalA>=500},{id:'q1000',check:totalA>=1000},
    {id:'c100',check:totalC>=100},{id:'c500',check:totalC>=500},
    {id:'streak7',check:(d.maxStreak||0)>=7},{id:'streak30',check:(d.maxStreak||0)>=30},
    {id:'bookmark10',check:bms.length>=10},
    {id:'explorer',check:subjectsTried>=6},
    {id:'coins100',check:(d.coins||0)>=100},
  ];

  checks.forEach(({id,check})=>{
    if(check&&!earned.has(id)){
      earned.add(id);g.achievements=[...earned];
      if(!newOne)newOne=ACHIEVEMENTS.find(a=>a.id===id);
    }
  });

  save(STORE.gamification,g);
  if(newOne){setTimeout(()=>{showCoinEffect(0);const el=document.createElement('div');el.innerHTML=`🏆 Achievement Unlocked!<br>${newOne.icon} ${newOne.label}`;el.style.cssText='position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);font-size:1.2rem;font-weight:900;color:#fff;z-index:999;pointer-events:none;animation:fbIn 0.8s ease forwards;text-shadow:0 2px 20px rgba(247,151,30,0.6);text-align:center;background:rgba(247,151,30,0.15);padding:16px 24px;border-radius:16px;border:1px solid rgba(247,151,30,0.3);';document.body.appendChild(el);setTimeout(()=>el.remove(),2500);},300);}
}

function renderProfileCard(g){
  if(!g)g=getGami();
  const xpInfo=getLevelXpInfo(g.xp);
  $('profileLevelBadge').textContent=xpInfo.level;
  $('profileLevelTitle').textContent=`${xpInfo.icon} ${xpInfo.title}`;
  $('profileXpLabel').textContent=`${g.xp} / ${LEVELS[Math.min(xpInfo.level,LEVELS.length-1)].min+(xpInfo.needed||1)-1} XP`;
  $('xpBarFill').style.width=`${xpInfo.progress}%`;

  const badges=$('profileBadges');
  badges.innerHTML='';
  const earned=new Set(g.achievements||[]);
  ACHIEVEMENTS.forEach(a=>{
    const isEarned=earned.has(a.id);
    const el=document.createElement('span');
    el.className=`profile-badge${isEarned?' earned':''}`;
    el.innerHTML=`<span class="badge-icon">${a.icon}</span> ${a.label}`;
    el.title=a.desc;
    badges.appendChild(el);
  });
}

function applyTheme(themeId){
  const g=getGami();
  const app=document.getElementById('app');
  app.className=app.className.replace(/theme-\w+/g,'').trim();
  if(themeId!=='default')app.classList.add(`theme-${themeId}`);
  g.activeTheme=themeId;
  save(STORE.gamification,g);
  renderThemeShop();
}

function renderThemeShop(){
  const g=getGami();
  const d=getDaily();
  const unlocked=new Set(g.unlockedThemes||['default']);
  const list=$('themeList');
  list.innerHTML='';
  THEMES.forEach(t=>{
    const isUnlocked=unlocked.has(t.id);
    const isActive=g.activeTheme===t.id;
    const div=document.createElement('div');
    div.className=`theme-item${isActive?' active':''}`;
    div.innerHTML=`<div class="theme-swatch" style="background:${t.swatch}"></div>
      <div class="theme-info"><span class="theme-name">${t.label}</span><span class="theme-status">${isUnlocked?isActive?'Active':'Owned':t.price>0?`🪙 ${t.price}`:'Free'}</span></div>`;
    if(isActive){
      const btn=document.createElement('button');
      btn.className='theme-action active';btn.textContent='✓ Active';
      div.appendChild(btn);
    }else if(isUnlocked){
      const btn=document.createElement('button');
      btn.className='theme-action use';btn.textContent='Use';
      btn.addEventListener('click',()=>{applyTheme(t.id);renderThemeShop();});
      div.appendChild(btn);
    }else if(t.price===0){
      const btn=document.createElement('button');
      btn.className='theme-action use';btn.textContent='Unlock';
      btn.addEventListener('click',()=>{g.unlockedThemes=g.unlockedThemes||['default'];g.unlockedThemes.push(t.id);save(STORE.gamification,g);renderThemeShop();});
      div.appendChild(btn);
    }else{
      const canBuy=(d.coins||0)>=t.price;
      const btn=document.createElement('button');
      btn.className='theme-action buy';btn.textContent=`🪙 ${t.price}`;
      btn.disabled=!canBuy;
      btn.style.opacity=canBuy?'1':'0.4';
      btn.addEventListener('click',()=>{
        if((d.coins||0)<t.price){alert('Not enough coins!');return;}
        d.coins-=t.price;
        g.unlockedThemes=g.unlockedThemes||['default'];g.unlockedThemes.push(t.id);
        save(STORE.daily,d);save(STORE.gamification,g);
        renderThemeShop();updateDailyUI();
      });
      div.appendChild(btn);
    }
    list.appendChild(div);
  });
}

$('themeShopBtn').addEventListener('click',()=>{$('themeOverlay').style.display='flex';renderThemeShop();});
$('themeCloseBtn').addEventListener('click',()=>$('themeOverlay').style.display='none');

$('continueBtn').addEventListener('click',()=>{
  const last=load(STORE.lastSession);
  if(!last||!last.questions||!last.questions.length){alert('No session to continue.');return;}
  quizQuestions=last.questions;quizIndex=last.index||0;
  quizScore=last.score||0;quizCorrect=last.correct||0;quizWrong=last.wrong||0;
  quizSubject=last.subject;quizMode='practice';
  showPage('pageQuiz');renderQuestion();
});

/* ============ SUBJECTS PAGE ============ */
function renderSubjects(){
  const list=$('subjectList');
  const p=load(STORE.progress)||{};
  list.innerHTML='';
  Object.entries(SUBJECTS).forEach(([k,v])=>{
    const c=document.createElement('button');
    c.className='subj-list-card';
    const sp=p[k]||{};
    const done=(sp.correct||0)+(sp.wrong||0);
    const totalQ=v.qs?v.qs.length:0;
    c.innerHTML=`<span class="subj-icon">${v.icon}</span>
      <div class="subj-info"><span class="subj-name">${v.label}</span><span class="subj-desc">${v.desc} • ${done}/${totalQ} done</span></div>
      <span class="subj-arrow">→</span>`;
    c.addEventListener('click',()=>startQuiz(k));
    list.appendChild(c);
  });
}

/* ============ OVERLAY ============ */
let overlayMode='practice',overlaySubject=null,overlayCount=10;

function showOverlay(title,desc,count,mode,subject){
  overlayMode=mode;overlaySubject=subject||null;overlayCount=count||10;
  $('overlayTitle').textContent=title;
  $('overlayDesc').textContent=desc;
  document.querySelectorAll('.qcount-btn').forEach(b=>{
    b.classList.toggle('active',parseInt(b.dataset.count)===count);
  });
  $('quizOverlay').style.display='flex';
}

$('overlayCloseBtn').addEventListener('click',()=>$('quizOverlay').style.display='none');
document.querySelectorAll('.qcount-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.qcount-btn').forEach(bb=>bb.classList.remove('active'));
    b.classList.add('active');
    overlayCount=parseInt(b.dataset.count);
  });
});

$('overlayStartBtn').addEventListener('click',()=>{
  $('quizOverlay').style.display='none';
  if(overlayMode==='daily') startDailyQuiz();
  else if(overlayMode==='practice') startPracticeQuiz();
  else if(overlayMode==='wrong') startWrongQuiz();
  else if(overlayMode==='bookmark') startBookmarkQuiz();
});

function startQuiz(subject){
  overlaySubject=subject;
  const total=SUBJECTS[subject].qs.length;
  showOverlay(`📚 ${SUBJECTS[subject].label} Quiz`,`${total.toLocaleString()} questions available`,50,'practice',subject);
}

function startPracticeQuiz(){
  const subj=overlaySubject;
  if(!subj||!SUBJECTS[subj]){alert('Select a subject');return;}
  let pool=[...SUBJECTS[subj].qs];
  pool=shuffle(pool);
  const count=overlayCount===0?pool.length:Math.min(overlayCount,pool.length);
  quizQuestions=pool.slice(0,count);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=subj;quizMode='practice';
  showPage('pageQuiz');renderQuestion();
}

function startDailyQuiz(){
  let pool=[];
  Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  const count=Math.min(overlayCount,pool.length);
  quizQuestions=pool.slice(0,count);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='daily';
  showPage('pageQuiz');renderQuestion();
}

function startWrongQuiz(){
  const wrongs=load(STORE.wrong)||[];
  if(!wrongs.length){alert('No wrong questions to review.');return;}
  let pool=wrongs.map(w=>({
    q:w.q,a:w.a,c:w.c,d:w.d,subject:w.subject
  }));
  pool=shuffle(pool);
  const count=overlayCount===0?pool.length:Math.min(overlayCount,pool.length);
  quizQuestions=pool.slice(0,count);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='wrong';
  showPage('pageQuiz');renderQuestion();
}

function startBookmarkQuiz(){
  const bms=load(STORE.bookmarks)||[];
  if(!bms.length){alert('No bookmarked questions.');return;}
  let pool=bms.map(b=>({
    q:b.q,a:b.a,c:b.c,d:b.d,subject:b.subject
  }));
  pool=shuffle(pool);
  const count=overlayCount===0?pool.length:Math.min(overlayCount,pool.length);
  quizQuestions=pool.slice(0,count);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='bookmark';
  showPage('pageQuiz');renderQuestion();
}

/* ============ FUN MODES ============ */
function startTimedQuiz(){
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,30);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='timed';
  showPage('pageQuiz');renderQuestion();
}

function startSurvivalQuiz(){
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,50);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;quizLives=1;
  quizSubject=null;quizMode='survival';
  showPage('pageQuiz');renderQuestion();
}

function startRapidFire(){
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,20);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='rapidfire';
  showPage('pageQuiz');renderQuestion();
}

function startMarathon(){
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,100);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='marathon';
  showPage('pageQuiz');renderQuestion();
}

function startLuckyQuiz(){
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  const count=5+Math.floor(Math.random()*11); /* 5-15 questions */
  quizQuestions=pool.slice(0,count);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='lucky';
  showPage('pageQuiz');renderQuestion();
}

/* ============ QUIZ ENGINE ============ */
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
  return arr;
}

function renderQuestion(){
  if(quizIndex>=quizQuestions.length){
    if(quizMode==='timed'||quizMode==='rapidfire'){clearInterval(quizTotalTimer);}
    showQuizResult();return;
  }
  const q=quizQuestions[quizIndex];
  const subj=q.subject||quizSubject;
  $('quizSubjectBadge').textContent=subj&&SUBJECTS[subj]?SUBJECTS[subj].label:'Mixed';
  const db=$('quizDifficultyBadge');
  db.textContent=q.d||'Easy';
  db.className='quiz-difficulty-badge '+(q.d||'easy').toLowerCase();

  $('quizCounter').textContent=`${quizIndex+1}/${quizQuestions.length}`;
  $('quizProgressFill').style.width=`${(quizIndex/quizQuestions.length)*100}%`;
  $('quizQNum').textContent=`Question ${quizIndex+1}`;
  $('quizQuestionText').textContent=q.q;

  /* Mode badge */
  const mb=$('quizModeBadge');
  if(quizMode==='timed')mb.textContent='⏱️ 1 Minute Quiz';
  else if(quizMode==='survival')mb.textContent='💀 Survival Mode';
  else if(quizMode==='rapidfire')mb.textContent='🔥 Rapid Fire';
  else if(quizMode==='marathon')mb.textContent='🏃 Marathon';
  else if(quizMode==='lucky')mb.textContent='🍀 Lucky Quiz';
  else mb.textContent='';

  /* Lives for survival */
  const lv=$('quizLives');
  if(quizMode==='survival')lv.textContent='❤️'.repeat(quizLives);
  else lv.textContent='';

  const opts=$('quizOptions');
  opts.innerHTML='';
  q.a.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.className='option-btn';btn.textContent=`${i+1}. ${opt}`;
    btn.dataset.index=i;
    btn.addEventListener('click',()=>selectOption(i));
    opts.appendChild(btn);
  });

  $('quizFeedback').style.display='none';
  $('quizFbIcon').textContent='';
  $('quizFbText').textContent='';
  $('quizFbExplain').textContent='';
  $('quizNextBtn').style.display='none';

  /* Bookmark state */
  const bms=load(STORE.bookmarks)||[];
  const isBm=bms.some(b=>b.q===q.q);
  $('bookmarkBtn').textContent=isBm?'★ Bookmarked':'☆ Bookmark';
  $('bookmarkBtn').classList.toggle('active',isBm);

  $('quizScore').textContent=quizScore;
  $('quizCorrect').textContent=quizCorrect;
  $('quizWrong').textContent=quizWrong;

  quizAnswered=false;
  startTimer();
}

$('bookmarkBtn').addEventListener('click',()=>{
  const q=quizQuestions[quizIndex];
  if(!q)return;
  let bms=load(STORE.bookmarks)||[];
  const idx=bms.findIndex(b=>b.q===q.q);
  if(idx>=0){bms.splice(idx,1);$('bookmarkBtn').textContent='☆ Bookmark';$('bookmarkBtn').classList.remove('active');}
  else{
    bms.push({q:q.q,a:q.a,c:q.c,d:q.d,subject:q.subject||quizSubject});
    $('bookmarkBtn').textContent='★ Bookmarked';$('bookmarkBtn').classList.add('active');
  }
  save(STORE.bookmarks,bms);
});

function selectOption(index){
  if(quizAnswered)return;
  quizAnswered=true;
  clearInterval(quizTimer);
  const q=quizQuestions[quizIndex];
  const btns=$('quizOptions').querySelectorAll('.option-btn');
  btns.forEach((btn,i)=>{
    btn.disabled=true;
    if(i===q.c)btn.classList.add('correct');
    if(i===index&&index!==q.c)btn.classList.add('wrong');
  });
  const isCorrect=index===q.c;
  if(isCorrect){quizScore++;quizCorrect++;addXp(10);}
  else{quizWrong++;
    /* Survival mode: game over on first wrong */
    if(quizMode==='survival'){
      clearInterval(quizTotalTimer);
      showQuizResult();
      return;
    }
    /* Save wrong */
    let wrongs=load(STORE.wrong)||[];
    if(!wrongs.some(w=>w.q===q.q)){
      wrongs.push({q:q.q,a:q.a,c:q.c,d:q.d,subject:q.subject||quizSubject,yourAnswer:index});
      if(wrongs.length>500)wrongs=wrongs.slice(-500);
      save(STORE.wrong,wrongs);
    }
  }
  $('quizScore').textContent=quizScore;
  $('quizCorrect').textContent=quizCorrect;
  $('quizWrong').textContent=quizWrong;

  const fb=$('quizFeedback');
  fb.style.display='flex';
  if(isCorrect){
    $('quizFbIcon').textContent='✅';
    $('quizFbText').textContent='Correct! Well done!';
  }else{
    $('quizFbIcon').textContent='❌';
    $('quizFbText').textContent=`Correct: ${q.a[q.c]}`;
  }
  if(q.e)$('quizFbExplain').textContent=q.e;

  /* Timed modes: auto-advance */
  if(quizMode==='timed'||quizMode==='rapidfire'){
    setTimeout(goToNext,600);
  }else{
    $('quizNextBtn').style.display='block';
  }
}

function handleTimeout(){
  if(quizAnswered)return;
  quizAnswered=true;clearInterval(quizTimer);quizWrong++;
  const q=quizQuestions[quizIndex];
  const btns=$('quizOptions').querySelectorAll('.option-btn');
  btns.forEach((btn,i)=>{btn.disabled=true;if(i===q.c)btn.classList.add('correct');});
  $('quizScore').textContent=quizScore;
  $('quizCorrect').textContent=quizCorrect;
  $('quizWrong').textContent=quizWrong;

  if(quizMode==='survival'){showQuizResult();return;}

  let wrongs=load(STORE.wrong)||[];
  if(!wrongs.some(w=>w.q===q.q)){
    wrongs.push({q:q.q,a:q.a,c:q.c,d:q.d,subject:q.subject||quizSubject,yourAnswer:-1});
    if(wrongs.length>500)wrongs=wrongs.slice(-500);
    save(STORE.wrong,wrongs);
  }

  const fb=$('quizFeedback');
  fb.style.display='flex';
  $('quizFbIcon').textContent='⏰';
  $('quizFbText').textContent=`Time! Correct: ${q.a[q.c]}`;
  if(q.e)$('quizFbExplain').textContent=q.e;
  $('quizNextBtn').style.display='block';
}

function startTimer(){
  clearInterval(quizTimer);clearInterval(quizTotalTimer);
  if(quizMode==='timed'||quizMode==='rapidfire'){
    /* Total timer mode */
    quizTotalTimeLeft=60;
    $('quizTimerFill').style.width='100%';
    $('quizTimerFill').className='timer-track-fill';
    $('quizTimerText').textContent=`${quizTotalTimeLeft}s`;
    quizTotalTimer=setInterval(()=>{
      quizTotalTimeLeft--;
      $('quizTimerText').textContent=`${quizTotalTimeLeft}s`;
      const pct=(quizTotalTimeLeft/60)*100;
      $('quizTimerFill').style.width=`${pct}%`;
      $('quizTimerFill').className='timer-track-fill';
      if(quizTotalTimeLeft<=5)$('quizTimerFill').classList.add('danger');
      else if(quizTotalTimeLeft<=15)$('quizTimerFill').classList.add('warning');
      if(quizTotalTimeLeft<=0){clearInterval(quizTotalTimer);showQuizResult();}
    },1000);
  }else{
    quizTimeLeft=TIMER_SEC;
    $('quizTimerFill').style.width='100%';
    $('quizTimerFill').className='timer-track-fill';
    $('quizTimerText').textContent=`${quizTimeLeft}s`;
    quizTimer=setInterval(()=>{
      quizTimeLeft--;
      $('quizTimerText').textContent=`${quizTimeLeft}s`;
      const pct=(quizTimeLeft/TIMER_SEC)*100;
      $('quizTimerFill').style.width=`${pct}%`;
      $('quizTimerFill').className='timer-track-fill';
      if(quizTimeLeft<=5)$('quizTimerFill').classList.add('danger');
      else if(quizTimeLeft<=8)$('quizTimerFill').classList.add('warning');
      if(quizTimeLeft<=0){clearInterval(quizTimer);handleTimeout();}
    },1000);
  }
}

$('quizNextBtn').addEventListener('click',goToNext);
$('quizBackBtn').addEventListener('click',()=>{
  clearInterval(quizTimer);clearInterval(quizTotalTimer);
  showPage('pageHome');refreshHome();
});

function goToNext(){
  quizIndex++;
  if(quizIndex>=quizQuestions.length){showQuizResult();}
  else{renderQuestion();}
}

function showQuizResult(){
  clearInterval(quizTimer);clearInterval(quizTotalTimer);
  saveProgress();
  saveSession(null);

  /* Daily quiz completion — coin rewards */
  const d=getDaily();
  if(quizMode==='dailyChallenge'){
    d.dailyChallengeDone=true;
    const earned=quizCorrect*5;
    d.coins=(d.coins||0)+earned;
    save(STORE.daily,d);
    addXp(50);
    setTimeout(()=>showCoinEffect(earned),500);
  }else if(quizMode==='surprise'){
    d.surpriseQuizDone=true;
    d.coins=(d.coins||0)+20;
    save(STORE.daily,d);
    addXp(30);
    setTimeout(()=>showCoinEffect(20),500);
  }else if(quizMode==='timed'||quizMode==='rapidfire'){
    addXp(quizCorrect*2);
  }else if(quizMode==='marathon'){
    addXp(quizCorrect*3);
  }else if(quizMode==='survival'){
    addXp(quizCorrect*5);
  }else if(quizMode==='lucky'){
    addXp(quizCorrect*2);
  }

  /* Gamification stats */
  const g=getGami();
  g.quizCount=(g.quizCount||0)+1;
  g.totalAnswered=(g.totalAnswered||0)+quizCorrect+quizWrong;
  g.totalCorrect=(g.totalCorrect||0)+quizCorrect;
  if(quizSubject)g.subjectTried=g.subjectTried||{};
  if(quizSubject&&SUBJECTS[quizSubject])g.subjectTried[quizSubject]=true;
  if(quizCorrect===quizQuestions.length&&quizQuestions.length>0){g.achievements=g.achievements||[];if(!g.achievements.includes('perfect')){g.achievements.push('perfect');save(STORE.gamification,g);setTimeout(()=>{showCoinEffect(0);const el=document.createElement('div');el.innerHTML='🏆 Achievement Unlocked!<br>💯 Perfect Score!';el.style.cssText='position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);font-size:1.2rem;font-weight:900;color:#fff;z-index:999;pointer-events:none;animation:fbIn 0.8s ease forwards;text-shadow:0 2px 20px rgba(247,151,30,0.6);text-align:center;background:rgba(247,151,30,0.15);padding:16px 24px;border-radius:16px;border:1px solid rgba(247,151,30,0.3);';document.body.appendChild(el);setTimeout(()=>el.remove(),2500);},300);}}
  save(STORE.gamification,g);
  checkAchievements(g);

  /* Today's counters */
  const dd=getDaily();
  dd.todayAnswered=(dd.todayAnswered||0)+quizCorrect+quizWrong;
  dd.todayCorrect=(dd.todayCorrect||0)+quizCorrect;
  save(STORE.daily,dd);

  showPage('pageHome');
  refreshHome();

  const pct=quizQuestions.length?Math.round((quizScore/quizQuestions.length)*100):0;
  let msg,title;
  if(quizMode==='timed'){
    title='⏱️ 1 Minute Quiz Complete!';
    msg=`You answered ${quizCorrect} out of ${quizCorrect+quizWrong} questions correctly!`;
  }else if(quizMode==='survival'){
    title='💀 Survival Mode Over!';
    msg=`You got ${quizCorrect} questions right before your first mistake!`;
  }else if(quizMode==='rapidfire'){
    title='🔥 Rapid Fire Complete!';
    if(pct>=90)msg='🌟 Incredible speed!';
    else if(pct>=70)msg='👏 Great pace!';
    else msg='💪 Keep practicing!';
  }else if(quizMode==='marathon'){
    title='🏃 Marathon Complete!';
    if(pct>=90)msg='🌟 Legendary endurance!';
    else if(pct>=70)msg='👏 Strong finish!';
    else msg='💪 Keep going!';
  }else if(quizMode==='lucky'){
    title='🍀 Lucky Quiz Complete!';
    if(pct>=90)msg='🌟 Lucky genius!';
    else if(pct>=70)msg='👏 Nice!';
    else msg='📚 Better luck next time!';
  }else{
    title='🎯 Quiz Complete!';
    if(pct>=90)msg='🌟 Outstanding!';
    else if(pct>=70)msg='👏 Great job!';
    else if(pct>=50)msg='💪 Good effort!';
    else msg='📚 Keep practicing!';
  }
  let extra='';
  if(quizMode==='dailyChallenge')extra=`\n🪙 Earned: ${quizCorrect*5} coins`;
  else if(quizMode==='surprise')extra='\n🪙 Bonus: +20 coins';

  alert(`${title}\n\nScore: ${quizScore}/${quizQuestions.length} (${pct}%)\nCorrect: ${quizCorrect}\nWrong: ${quizWrong}${extra}\n\n${msg}`);

  setTimeout(()=>{
    if(quizMode==='practice'||quizMode==='dailyChallenge'||quizMode==='surprise'||quizMode==='lucky'||quizMode==='marathon'||quizMode==='timed'||quizMode==='rapidfire'||quizMode==='survival'){
      if(confirm('📤 Share your score with friends?'))shareScore();
      setTimeout(()=>{
        if(confirm('👥 Challenge a friend to beat your score?'))openChallenge();
      },100);
    }
  },200);
}

/* ============ PROGRESS ============ */
function saveProgress(){
  const p=load(STORE.progress)||{};
  const subj=quizSubject||'mixed';
  if(!p[subj])p[subj]={correct:0,wrong:0,total:0};
  p[subj].correct+=quizCorrect;
  p[subj].wrong+=quizWrong;
  p[subj].total+=quizCorrect+quizWrong;
  save(STORE.progress,p);
}

function saveSession(data){
  if(data){
    save(STORE.lastSession,{
      questions:quizQuestions,index:quizIndex,
      score:quizScore,correct:quizCorrect,wrong:quizWrong,
      subject:quizSubject
    });
  }else{save(STORE.lastSession,null);}
}

/* Auto-save session on each answer */
const origGo=goToNext;
function saveSessionOnNext(){saveSession(true);origGo.call(this);}
$('quizNextBtn').removeEventListener('click',goToNext);
$('quizNextBtn').addEventListener('click',saveSessionOnNext);

function renderProgress(){
  const p=load(STORE.progress)||{};
  let totalC=0,totalW=0;
  Object.entries(SUBJECTS).forEach(([k])=>{
    const sp=p[k]||{};totalC+=sp.correct||0;totalW+=sp.wrong||0;
  });
  const total=totalC+totalW;
  const pct=total>0?Math.round((totalC/total)*100):0;
  $('progressSummary').innerHTML=`<div class="progress-card">
    <div class="big-num">${pct}%</div>
    <div class="big-lbl">${totalC}/${total} correct overall</div>
  </div>`;

  const list=$('progressSubjects');
  list.innerHTML='';
  Object.entries(SUBJECTS).forEach(([k,v])=>{
    const sp=p[k]||{};
    const c=sp.correct||0,w=sp.wrong||0,t=c+w;
    const pp=t>0?Math.round((c/t)*100):0;
    const div=document.createElement('div');
    div.className='prog-subj';
    div.innerHTML=`<div class="prog-subj-header">
      <span class="prog-subj-name">${v.icon} ${v.label}</span>
      <span class="prog-subj-pct">${t>0?pp+'%':'—'}</span>
    </div>
    <div class="prog-bar"><div class="prog-bar-fill" style="width:${pp}%"></div></div>
    <div class="prog-subj-stats"><span>✅ ${c}</span><span>❌ ${w}</span><span>📊 ${t}</span></div>`;
    list.appendChild(div);
  });
}

$('resetProgressBtn').addEventListener('click',()=>{
  if(confirm('Reset all progress data?')){save(STORE.progress,{});renderProgress();refreshHome();}
});

/* ============ WRONG QUESTIONS ============ */
function renderWrong(){
  const wrongs=load(STORE.wrong)||[];
  $('wrongCount').textContent=wrongs.length;
  const list=$('wrongList');
  if(!wrongs.length){list.innerHTML='<div class="empty-state">No wrong questions yet</div>';$('clearWrongBtn').style.display='none';return;}
  $('clearWrongBtn').style.display='block';
  list.innerHTML='';
  wrongs.forEach((w,i)=>{
    const div=document.createElement('div');
    div.className='wrong-item';
    const subjLabel=w.subject&&SUBJECTS[w.subject]?SUBJECTS[w.subject].label:'';
    div.innerHTML=`<div class="wrong-q">${i+1}. ${w.q}</div>
      <div class="wrong-answer">❌ Your: ${w.yourAnswer>=0?w.a[w.yourAnswer]:'Time out'}</div>
      <div class="wrong-correct">✅ Correct: ${w.a[w.c]}</div>
      <div class="wrong-meta">${subjLabel?`<span>${subjLabel}</span>`:''}<span>${w.d||'Easy'}</span></div>`;
    list.appendChild(div);
  });
  /* Add start button */
  const btn=document.createElement('button');
  btn.className='btn-sm';btn.textContent='Practice Wrong Questions';
  btn.style.marginTop='12px';
  btn.addEventListener('click',()=>showOverlay('❌ Wrong Questions',`${wrongs.length} questions to review`,10,'wrong'));
  list.appendChild(btn);
}

$('clearWrongBtn').addEventListener('click',()=>{
  if(confirm('Clear all wrong questions?')){save(STORE.wrong,[]);renderWrong();}
});

/* ============ BOOKMARKS ============ */
function renderBookmarks(){
  const bms=load(STORE.bookmarks)||[];
  $('bookmarkCount').textContent=bms.length;
  const list=$('bookmarkList');
  if(!bms.length){list.innerHTML='<div class="empty-state">No bookmarked questions</div>';return;}
  list.innerHTML='';
  bms.forEach((b,i)=>{
    const div=document.createElement('div');
    div.className='bm-item';
    const subjLabel=b.subject&&SUBJECTS[b.subject]?SUBJECTS[b.subject].label:'';
    div.innerHTML=`<div class="bm-q">${i+1}. ${b.q}</div>
      <div class="wrong-correct">✅ ${b.a[b.c]}</div>
      <div class="bm-meta">${subjLabel?`<span>${subjLabel}</span>`:''}<span>${b.d||'Easy'}</span>
      <button class="bm-del" data-idx="${i}" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.75rem;font-family:inherit;">Remove</button></div>`;
    list.appendChild(div);
  });
  list.querySelectorAll('.bm-del').forEach(btn=>{
    btn.addEventListener('click',()=>{
      let bms2=load(STORE.bookmarks)||[];
      bms2.splice(parseInt(btn.dataset.idx),1);
      save(STORE.bookmarks,bms2);
      renderBookmarks();
      refreshHome();
    });
  });
  const startBtn=document.createElement('button');
  startBtn.className='btn-sm';startBtn.textContent='Practice Bookmarks';
  startBtn.style.marginTop='12px';
  startBtn.addEventListener('click',()=>showOverlay('⭐ Bookmarks',`${bms.length} bookmarked questions`,10,'bookmark'));
  list.appendChild(startBtn);
}

/* ============ LEADERBOARD ============ */
let lbFilter='all';

function getWeekId(d){
  const date=new Date(d);
  const start=new Date(date.getFullYear(),0,1);
  const days=Math.floor((date-start)/86400000);
  return `${date.getFullYear()}-W${Math.ceil((days+start.getDay()+1)/7)}`;
}

function renderLeaderboard(){
  const lb=load(STORE.leaderboard)||[];
  const college=$('lbCollegeInput').value.trim();
  const city=$('lbCityInput').value.trim();
  const list=$('lbList');
  if(!lb.length){list.innerHTML='<div class="empty-state">No scores yet. Complete a quiz and save!</div>';return;}

  let filtered=[...lb];
  if(lbFilter==='weekly'){
    const thisWeek=getWeekId(new Date().toISOString());
    filtered=filtered.filter(e=>getWeekId(e.date)===thisWeek);
  }else if(lbFilter==='college'&&college){
    filtered=filtered.filter(e=>e.college&&e.college.toLowerCase()===college.toLowerCase());
  }else if(lbFilter==='city'&&city){
    filtered=filtered.filter(e=>e.city&&e.city.toLowerCase()===city.toLowerCase());
  }

  if(!filtered.length){list.innerHTML='<div class="empty-state">No entries for this filter</div>';return;}
  const sorted=filtered.sort((a,b)=>b.score-a.score||a.total-b.total);
  list.innerHTML='';
  sorted.forEach((entry,i)=>{
    const div=document.createElement('div');
    div.className='lb-item';
    const rank=i+1;
    let medal='';
    if(rank===1)medal='🥇';
    else if(rank===2)medal='🥈';
    else if(rank===3)medal='🥉';
    else medal=`#${rank}`;
    const loc=[];
    if(entry.college)loc.push(entry.college);
    if(entry.city)loc.push(entry.city);
    div.innerHTML=`<span class="lb-rank">${medal}</span>
      <span class="lb-name">${entry.name||'Anonymous'}${loc.length?'<br><span style="font-size:0.65rem;color:var(--text3)">'+loc.join(' • ')+'</span>':''}</span>
      <span class="lb-score">${entry.score}/${entry.total}</span>`;
    list.appendChild(div);
  });
}

$('lbSaveBtn').addEventListener('click',()=>{
  const name=$('lbNameInput').value.trim()||'Anonymous';
  const college=$('lbCollegeInput').value.trim();
  const city=$('lbCityInput').value.trim();
  const lb=load(STORE.leaderboard)||[];
  lb.push({name,college,city,score:quizScore,total:quizQuestions.length,date:new Date().toISOString()});
  save(STORE.leaderboard,lb);
  $('lbNameInput').value='';
  $('lbCollegeInput').value='';
  $('lbCityInput').value='';
  renderLeaderboard();
});

document.querySelectorAll('.lb-filter').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.lb-filter').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    lbFilter=btn.dataset.filter;
    renderLeaderboard();
  });
});

/* ============ FRIEND CHALLENGE ============ */
function generateChallengeCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='RITU-';
  for(let i=0;i<4;i++)code+=chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function openChallenge(){
  const overlay=$('challengeOverlay');
  const box=$('challengeCodeBox');
  const code=$('challengeCode');
  const codeVal=generateChallengeCode();
  code.textContent=codeVal;
  box.style.display='block';
  $('challengeDesc').textContent='Share this code with a friend!';
  $('challengeResult').innerHTML='';
  $('challengeInput').value='';

  /* Store challenge score */
  const chal={code:codeVal,score:quizScore,total:quizQuestions.length,subject:quizSubject,mode:quizMode,name:$('lbNameInput').value.trim()||'Anonymous',date:Date.now()};
  const challenges=load('rituquiz_challenges')||[];
  challenges.push(chal);
  if(challenges.length>50)challenges.splice(0,challenges.length-50);
  save('rituquiz_challenges',challenges);

  overlay.style.display='flex';
}

$('shareChallengeBtn').addEventListener('click',()=>{
  const code=$('challengeCode').textContent;
  const text=`🎯 RituQuiz Challenge!\n\n${$('lbNameInput').value.trim()||'Someone'} scored ${quizScore}/${quizQuestions.length} in RituQuiz!\n\nCan you beat my score?\nUse code: ${code}\n\n"Practice Today, Crack Tomorrow" — RituQuiz`;
  if(navigator.share){navigator.share({title:'RituQuiz Challenge',text}).catch(()=>{});}
  else{prompt('Copy & share this challenge:',text);}
});

$('acceptChallengeBtn').addEventListener('click',()=>{
  const input=$('challengeInput').value.trim().toUpperCase();
  const challenges=load('rituquiz_challenges')||[];
  const chal=challenges.find(c=>c.code===input);
  const res=$('challengeResult');
  if(!chal){res.innerHTML='<span style="color:var(--red)">❌ Invalid code</span>';return;}
  res.innerHTML=`<span style="color:var(--green)">✅ Beat <strong>${chal.name}</strong>'s score of ${chal.score}/${chal.total}!</span>
    <button class="btn-sm" style="margin-top:8px" id="acceptPlayBtn">Play & Beat Them!</button>`;
  document.getElementById('acceptPlayBtn')?.addEventListener('click',()=>{
    let pool=[];
    Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
    pool=shuffle(pool);
    quizQuestions=pool.slice(0,chal.total);
    quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
    quizSubject=null;quizMode='practice';
    $('challengeOverlay').style.display='none';
    showPage('pageQuiz');renderQuestion();
  });
});

$('challengeCloseBtn').addEventListener('click',()=>$('challengeOverlay').style.display='none');

/* ============ SHARE SCORE ============ */
function shareScore(){
  const pct=Math.round((quizScore/quizQuestions.length)*100);
  const lines=[
    `🎯 RituQuiz Result`,
    ``,
    `Score: ${quizScore}/${quizQuestions.length} (${pct}%)`,
    `✅ Correct: ${quizCorrect}`,
    `❌ Wrong: ${quizWrong}`,
    ``,
    `📚 Subject: ${quizSubject&&SUBJECTS[quizSubject]?SUBJECTS[quizSubject].label:'Mixed'}`,
    ``,
    `"Practice Today, Crack Tomorrow" — RituQuiz`,
  ];
  const text=lines.join('\n');
  if(navigator.share){navigator.share({title:'RituQuiz Score',text}).catch(()=>{});}
  else{prompt('Copy & share your result:',text);}
}

/* ============ REFERRAL SYSTEM ============ */
function getReferral(){
  let ref=load('rituquiz_referral');
  if(!ref){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code='RITUREF-';
    for(let i=0;i<4;i++)code+=chars[Math.floor(Math.random()*chars.length)];
    ref={code,redeemed:[]};
    save('rituquiz_referral',ref);
  }
  return ref;
}

function openReferral(){
  const ref=getReferral();
  $('referralCode').textContent=ref.code;
  $('referralResult').innerHTML='';
  $('referralInput').value='';
  $('referralOverlay').style.display='flex';
}

$('shareReferralBtn').addEventListener('click',()=>{
  const code=$('referralCode').textContent;
  const text=`🔗 Join me on RituQuiz! Use my referral code: ${code}\n\n"Practice Today, Crack Tomorrow" — Download now!`;
  if(navigator.share){navigator.share({title:'RituQuiz Referral',text}).catch(()=>{});}
  else{prompt('Copy & share your referral code:',text);}
});

$('redeemReferralBtn').addEventListener('click',()=>{
  const input=$('referralInput').value.trim().toUpperCase();
  if(!input||!input.startsWith('RITUREF-')){$('referralResult').innerHTML='<span style="color:var(--red)">❌ Invalid code</span>';return;}
  const myRef=getReferral();
  if(input===myRef.code){$('referralResult').innerHTML='<span style="color:var(--red)">❌ Cannot use your own code</span>';return;}
  if((myRef.redeemed||[]).includes(input)){$('referralResult').innerHTML='<span style="color:var(--red)">❌ Code already redeemed</span>';return;}
  myRef.redeemed=myRef.redeemed||[];
  myRef.redeemed.push(input);
  save('rituquiz_referral',myRef);
  const d=getDaily();
  d.coins=(d.coins||0)+10;
  save(STORE.daily,d);
  $('referralResult').innerHTML='<span style="color:var(--green)">✅ +10 🪙 earned! Invite more friends!</span>';
  updateDailyUI();refreshHome();
});

$('referralCloseBtn').addEventListener('click',()=>$('referralOverlay').style.display='none');
$('referralHomeBtn').addEventListener('click',openReferral);

/* ============ BATTLE MODE ============ */
const BATTLE_STORE='rituquiz_battles';

function getBattles(){return load(BATTLE_STORE)||{};}

function generateBattleCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='BAT-';
  for(let i=0;i<4;i++)code+=chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function createBattle(){
  const overlay=$('battleOverlay');
  const box=$('battleCodeBox');
  const code=$('battleCode');
  const codeVal=generateBattleCode();
  code.textContent=codeVal;
  box.style.display='block';
  $('battleCreateDesc').textContent='Battle created! Share the code with your friend!';
  $('battleResult').innerHTML='';
  $('battleInput').value='';

  /* Pick 10 fixed questions */
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  const questions=pool.slice(0,10);

  /* Store battle */
  const battles=getBattles();
  battles[codeVal]={
    code:codeVal,
    questions:questions.map(q=>({q:q.q,a:q.a,c:q.c,d:q.d,subject:Object.keys(SUBJECTS).find(k=>SUBJECTS[k].qs.includes(q))})),
    total:10,
    player1:{name:$('lbNameInput').value.trim()||'Anonymous',score:0,correct:0,finished:false},
    player2:null,
    winner:null,
    created:Date.now()
  };
  /* Clean old battles (keep max 20) */
  const keys=Object.keys(battles);
  if(keys.length>20){const toDelete=keys.sort((a,b)=>battles[a].created-battles[b].created).slice(0,keys.length-20);toDelete.forEach(k=>delete battles[k]);}
  save(BATTLE_STORE,battles);

  overlay.style.display='flex';

  /* Player 1 starts playing immediately */
  setTimeout(()=>{
    if(confirm('⚔️ Battle Created! Play now?')){
      window.__battleCode=codeVal;
      quizQuestions=battles[codeVal].questions;
      quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
      quizSubject=null;quizMode='practice';
      overlay.style.display='none';
      showPage('pageQuiz');renderQuestion();
    }
  },300);
}

/* After quiz ends, check if it was a battle and update score */
function finishBattle(code,correct,wrong){
  const battles=getBattles();
  if(!battles[code])return;
  const b=battles[code];
  b.player1.score=correct;b.player1.correct=correct;b.player1.finished=true;
  save(BATTLE_STORE,battles);
}

function acceptBattle(){
  const input=$('battleInput').value.trim().toUpperCase();
  const battles=getBattles();
  const b=battles[input];
  const res=$('battleResult');
  if(!b){res.innerHTML='<span style="color:var(--red)">❌ Invalid battle code</span>';return;}
  if(b.player2){res.innerHTML='<span style="color:var(--red)">❌ This battle is already accepted</span>';return;}

  /* Start battle as Player 2 */
  if(confirm(`⚔️ Battle found! Beat ${b.player1.name}'s score of ${b.player1.score}/${b.total}?`)){
    b.player2={name:$('lbNameInput').value.trim()||'Anonymous',score:0,correct:0,finished:false};
    save(BATTLE_STORE,battles);

    quizQuestions=b.questions;
    quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
    quizSubject=null;quizMode='practice';
    /* Tag this session for battle result */
    window.__battleCode=input;
    $('battleOverlay').style.display='none';
    showPage('pageQuiz');renderQuestion();
  }
}

/* Wrapper for showQuizResult to save & display battle results */
const origShowResult=showQuizResult;
showQuizResult=function(){
  const bc=window.__battleCode;
  if(bc){
    const battles=getBattles();
    if(battles[bc]){
      if(!battles[bc].player1.finished){
        battles[bc].player1.score=quizCorrect;battles[bc].player1.correct=quizCorrect;battles[bc].player1.finished=true;
      }else if(battles[bc].player2&&!battles[bc].player2.finished){
        battles[bc].player2.score=quizCorrect;battles[bc].player2.correct=quizCorrect;battles[bc].player2.finished=true;
        if(battles[bc].player1.score>battles[bc].player2.score)battles[bc].winner='player1';
        else if(battles[bc].player2.score>battles[bc].player1.score)battles[bc].winner='player2';
        else battles[bc].winner='tie';
      }
      save(BATTLE_STORE,battles);
    }
  }
  origShowResult.call(this);
  if(bc){
    setTimeout(()=>{
      const battles=getBattles();
      const b=battles[bc];
      if(b&&b.player1&&b.player2&&b.player1.finished&&b.player2.finished){
        let winnerMsg;
        if(b.winner==='player1')winnerMsg=`🏆 ${b.player1.name} wins the battle!`;
        else if(b.winner==='player2')winnerMsg=`🏆 ${b.player2.name} wins the battle!`;
        else winnerMsg=`🤝 It's a tie!`;
        alert(`⚔️ Battle Result!\n\n${b.player1.name}: ${b.player1.score}/${b.total}\n${b.player2.name}: ${b.player2.score}/${b.total}\n\n${winnerMsg}`);
        if(b.winner&&b.winner!=='tie'){
          const g=getGami();
          g.achievements=g.achievements||[];
          if(!g.achievements.includes('battle')){
            g.achievements.push('battle');
            save(STORE.gamification,g);
            addXp(50);
            const d=getDaily();d.coins=(d.coins||0)+20;save(STORE.daily,d);
            showCoinEffect(20);
            alert(`🏆 Battle Champion Achievement Unlocked!\n+50 XP • +20 🪙`);
          }else{
            addXp(25);const d=getDaily();d.coins=(d.coins||0)+10;save(STORE.daily,d);showCoinEffect(10);
            alert(`✅ You won the battle!\n+25 XP • +10 🪙`);
          }
        }
      }
      window.__battleCode=null;
    },600);
  }else{
    window.__battleCode=null;
  }
};

function openBattle(){
  $('battleOverlay').style.display='flex';
  $('battleCodeBox').style.display='none';
  $('battleCreateDesc').textContent='Create a battle or enter a friend\'s code!';
  $('battleResult').innerHTML='';
  $('battleInput').value='';
}

$('createBattleBtn').addEventListener('click',createBattle);
$('acceptBattleBtn').addEventListener('click',acceptBattle);
$('shareBattleBtn').addEventListener('click',()=>{
  const code=$('battleCode').textContent;
  const text=`⚔️ RituQuiz Battle! Join my battle with code: ${code}\n\n"Practice Today, Crack Tomorrow" — RituQuiz`;
  if(navigator.share){navigator.share({title:'RituQuiz Battle',text}).catch(()=>{});}
  else{prompt('Share this battle code:',text);}
});
$('battleCloseBtn').addEventListener('click',()=>$('battleOverlay').style.display='none');
$('battleHomeBtn').addEventListener('click',openBattle);

/* ============ SMART LEARNING ============ */
const SR_STORE='rituquiz_spaced';

function getSrData(){return load(SR_STORE)||{};}

function updateSrData(q,subject,correct){
  const sr=getSrData();
  const key=q.q.substring(0,40); /* Use question prefix as key */
  if(!sr[key])sr[key]={q:q.q,a:q.a,c:q.c,d:q.d,subject,correct:0,wrong:0,lastSeen:0,interval:1,ease:2.5};
  const rec=sr[key];
  if(correct){rec.correct++;rec.ease=Math.min(2.5,rec.ease+0.15);}
  else{rec.wrong++;rec.ease=Math.max(1.3,rec.ease-0.3);}
  rec.interval=correct?Math.round(rec.interval*rec.ease):1;
  rec.lastSeen=Date.now();
  save(SR_STORE,sr);
}

function getDueQuestions(){
  const sr=getSrData();
  const now=Date.now();
  const due=[];
  Object.values(sr).forEach(rec=>{
    const nextReview=rec.lastSeen+(rec.interval*3600000); /* hours to ms */
    if(nextReview<=now&&rec.wrong>0)due.push(rec);
  });
  return due.sort((a,b)=>a.lastSeen-b.lastSeen).slice(0,20);
}

function startPersonalizedQuiz(){
  const p=load(STORE.progress)||{};
  /* Calculate accuracy per subject */
  const accs=[];
  Object.entries(SUBJECTS).forEach(([k,v])=>{
    const sp=p[k]||{};
    const total=(sp.correct||0)+(sp.wrong||0);
    if(total>0){
      const acc=sp.correct/total;
      accs.push({key:k,label:v.label,icon:v.icon,acc,total});
    }
  });
  if(!accs.length){
    /* No data — pick random subjects */
    accs.push({key:'science',label:'Science',icon:'🔬',acc:0.5,total:0});
    accs.push({key:'history',label:'History',icon:'📜',acc:0.5,total:0});
  }

  /* Weight subjects: lower accuracy = higher weight */
  const weights=accs.map(a=>({key:a.key,weight:Math.max(1,Math.round((1-a.acc)*10))}));
  const totalWeight=weights.reduce((s,w)=>s+w.weight,0);
  let pool=[];
  for(let i=0;i<5;i++){ /* Pick 5 weighted subjects */
    let r=Math.random()*totalWeight;
    for(const w of weights){
      r-=w.weight;
      if(r<=0){pool=pool.concat(SUBJECTS[w.key].qs);break;}
    }
  }
  pool=shuffle(pool);
  const count=Math.min(15,pool.length);
  quizQuestions=pool.slice(0,count);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='practice';
  showPage('pageQuiz');renderQuestion();
}

function startSpacedRepetition(){
  const due=getDueQuestions();
  if(!due.length&&Object.keys(getSrData()).length===0){
    /* No data yet — take from wrong questions */
    const wrongs=load(STORE.wrong)||[];
    if(wrongs.length){startWrongQuiz();return;}
    alert('Answer some questions first to build your spaced repetition profile!');
    return;
  }
  if(!due.length){alert('🎉 No questions due for review! Check back later.');return;}
  quizQuestions=due.map(d=>({q:d.q,a:d.a,c:d.c,d:d.d,subject:d.subject}));
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='practice';
  showPage('pageQuiz');renderQuestion();
}

function updateSmartLearning(){
  const p=load(STORE.progress)||{};

  /* Weak Topics */
  const box=$('weakTopicsList');
  const entries=[];
  Object.entries(SUBJECTS).forEach(([k,v])=>{
    const sp=p[k]||{};
    const total=(sp.correct||0)+(sp.wrong||0);
    if(total>0){
      const acc=Math.round((sp.correct/total)*100);
      entries.push({key:k,label:v.label,icon:v.icon,acc,total});
    }
  });
  entries.sort((a,b)=>a.acc-b.acc);

  if(entries.length){
    $('weakTopicsSub').textContent='Practice your weakest areas';
    box.innerHTML=entries.slice(0,4).map(e=>{
      const barColor=e.acc<40?'var(--red)':e.acc<70?'var(--gold)':'var(--green)';
      return `<div class="weak-topic-item">
        <span class="weak-topic-icon">${e.icon}</span>
        <span class="weak-topic-name">${e.label}</span>
        <div class="weak-topic-bar"><div class="weak-topic-fill" style="width:${e.acc}%;background:${barColor}"></div></div>
        <span class="weak-topic-pct">${e.acc}%</span>
      </div>`;
    }).join('');
    $('weakTopicsBox').style.display='block';
  }else{
    $('weakTopicsBox').style.display='none';
  }

  /* Personalized quiz availability */
  if(entries.length){
    $('personalizedSub').textContent=`${entries.length} subjects analyzed`;
  }else{
    $('personalizedSub').textContent='Take quizzes to get personalized picks';
  }

  /* Spaced Repetition */
  const due=getDueQuestions();
  if(due.length){
    $('spacedSub').textContent=`${due.length} questions due for review`;
    $('spacedBtn').disabled=false;$('spacedBtn').textContent='Review';
  }else{
    const sr=Object.keys(getSrData()).length;
    if(sr>0){$('spacedSub').textContent='All caught up!';$('spacedBtn').textContent='OK';$('spacedBtn').disabled=false;}
    else{$('spacedSub').textContent='Answer questions to start';$('spacedBtn').disabled=true;$('spacedBtn').textContent='—';}
  }

  /* Revision Reminder */
  const last=load(STORE.lastSession);
  const daily=getDaily();
  const today=new Date().toDateString();
  const lastActive=daily.lastLoginDate;
  const reminder=$('revisionReminder');
  if(lastActive&&lastActive!==today){
    reminder.style.display='flex';
    $('revisionSub').textContent='You haven\'t practiced today';
    $('revisionBtn').textContent='Go';
  }else{
    reminder.style.display='none';
  }
}

/* Smart Learning button listeners */
$('personalizedBtn').addEventListener('click',startPersonalizedQuiz);
$('spacedBtn').addEventListener('click',startSpacedRepetition);
$('revisionBtn').addEventListener('click',()=>{
  showPage('pageHome');refreshHome();
  /* Start a quick 10-question quiz from all subjects */
  let pool=[];Object.values(SUBJECTS).forEach(v=>{pool=pool.concat(v.qs);});
  pool=shuffle(pool);
  quizQuestions=pool.slice(0,10);
  quizIndex=0;quizScore=0;quizCorrect=0;quizWrong=0;
  quizSubject=null;quizMode='practice';
  showPage('pageQuiz');renderQuestion();
});

/* Fun Mode button listeners */
$('mode1minBtn').addEventListener('click',startTimedQuiz);
$('modeSurvivalBtn').addEventListener('click',startSurvivalQuiz);
$('modeRapidBtn').addEventListener('click',startRapidFire);
$('modeMarathonBtn').addEventListener('click',startMarathon);
$('modeLuckyBtn').addEventListener('click',startLuckyQuiz);

/* Hook into selectOption to update spaced repetition */
const origSelect=selectOption;
selectOption=function(index){
  const wasCorrect=(index===quizQuestions[quizIndex].c);
  origSelect.call(this,index);
  if(quizQuestions[quizIndex])updateSrData(quizQuestions[quizIndex],quizSubject||'mixed',wasCorrect);
};

/* ============ INIT ============ */
showPage('pageHome');
refreshHome();
renderSubjects();
renderLeaderboard();
renderProgress();
renderWrong();
renderBookmarks();
