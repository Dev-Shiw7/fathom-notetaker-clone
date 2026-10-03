/* eslint-disable */
// @ts-nocheck
/**
 * Behaviour for the landing page, ported from the design reference.
 *
 * The reference drives canvases, a pinned scroll section and a command palette
 * imperatively against fixed ids, so it runs against the opaque markup in
 * markup.ts rather than being re-expressed as React state. initLanding returns
 * a cleanup that stops the animation loop and removes every window listener.
 */
export function initLanding() {
const ac = new AbortController();
let alive = true;
const addEventListener = (type, fn, opts) =>
  window.addEventListener(type, fn, { ...(typeof opts === 'object' ? opts : { capture: !!opts }), signal: ac.signal });
const SANS = getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'system-ui, sans-serif';


/* =====================================================================
   Utilities
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
const mmss=s=>{s=Math.max(0,Math.round(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const hex=h=>[1,3,5].map(i=>parseInt(h.substr(i,2),16));
const mixRgb=(a,b,t)=>`rgb(${a.map((v,i)=>Math.round(lerp(v,b[i],t))).join(',')})`;
const isMac=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'');
$$('#kbdHint,.kbdx').forEach(k=>{k.textContent=isMac?'⌘K':'Ctrl K'});

/* =====================================================================
   The meeting (one dataset drives every component)
   ===================================================================== */
const DUR=58*60+12;
const SP={
  mara:{name:'Mara',c:'#e08a5e'},
  jonah:{name:'Jonah',c:'#88b0a8'},
  priya:{name:'Priya',c:'#cdb98c'},
  theo:{name:'Theo',c:'#cf8f9a'}
};
const ORDER=['mara','jonah','priya','theo'];
const COL=ORDER.map(k=>SP[k].c);
const T=(m,s)=>m*60+s;
const LINES=[
  {t:T(0,41),sp:'mara',x:"Thanks for making time. Let's look at where onboarding loses people."},
  {t:T(2,5),sp:'theo',x:"Short version: forty percent never finish the import step."},
  {t:T(4,30),sp:'jonah',x:"Is that the data talking, or the support tickets?"},
  {t:T(5,12),sp:'theo',x:"Both. The tickets just have better quotes."},
  {t:T(8,24),sp:'mara',x:"The handoff is where the experience starts to wobble.",k:'tension'},
  {t:T(11,40),sp:'mara',x:"People finish the form, then have no idea what happens next."},
  {t:T(13,15),sp:'jonah',x:"What if the first screen shows the decision, not the process?"},
  {t:T(13,58),sp:'mara',x:"Exactly. We can make the next step feel inevitable."},
  {t:T(14,18),sp:'jonah',x:"Then it's settled: show the decision before the process.",k:'decision'},
  {t:T(17,30),sp:'theo',x:"Fine by me, as long as the import API keeps its shape."},
  {t:T(21,10),sp:'priya',x:"Who owns the empty state if an import fails?",k:'question'},
  {t:T(24,45),sp:'jonah',x:"Design, until the first version ships."},
  {t:T(31,30),sp:'theo',x:"If this slips past review, the mid-quarter release won't hold.",k:'risk'},
  {t:T(35,20),sp:'mara',x:"Then we show a prototype Thursday and cut scope if we must."},
  {t:T(41,5),sp:'jonah',x:"I'll write up the metrics we'll watch after launch."},
  {t:T(47,40),sp:'priya',x:"Can we test it with the three accounts that churned in March?"},
  {t:T(52,10),sp:'priya',x:"I'll bring the revised flow to Thursday's review.",k:'action'}
];
const MOMENTS=LINES.filter(l=>l.k);
const KIND={
  tension:{label:'Shift',chip:'Shift detected',meta:'tone changed'},
  decision:{label:'Decision',chip:'Decision captured',meta:'92% confident'},
  question:{label:'Open question',chip:'Question raised',meta:'carried to next room'},
  risk:{label:'Risk',chip:'Risk flagged',meta:'owner notified'},
  action:{label:'Action',chip:'Action found',meta:'owner assigned'}
};
const GLYPH={
  decision:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="currentColor"/></svg>',
  action:'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.8" fill="currentColor"/></svg>',
  risk:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 14.5 13.5h-13z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>',
  question:'<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  tension:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h3l2-5 3 10 2-5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const lineAt=t=>{let r=-1;for(let i=0;i<LINES.length;i++){if(LINES[i].t<=t)r=i;else break}return r};
const words=text=>text.split(' ').map((w,i)=>`<span class="w" style="--i:${i}">${w}</span>`).join(' ');

/* deterministic "audio" so the ribbon is stable between loads */
const N=900, AMP=new Float32Array(N), SPK=new Uint8Array(N);
(function(){
  const mul=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const mk=(seed,period)=>{const r=mul(seed),n=Math.ceil(N/period)+3,a=Array.from({length:n},r);return i=>{const x=i/period,k=Math.floor(x),f=x-k,s=f*f*(3-2*f);return a[k]*(1-s)+a[k+1]*s}};
  const n1=mk(7,9),n2=mk(19,2.2),n3=mk(31,26);
  for(let i=0;i<N;i++){
    const time=i/N*DUR, li=lineAt(time);
    let spk=0,a;
    if(li<0){a=.1+.1*n2(i)}
    else{
      const cur=LINES[li], nxt=LINES[li+1], span=(nxt?nxt.t:DUR)-cur.t, prog=(time-cur.t)/span;
      spk=ORDER.indexOf(cur.sp);
      if(nxt&&prog>.955)spk=ORDER.indexOf(nxt.sp);
      a=.2+.8*(.5*n1(i)+.35*n2(i)+.15*n3(i));
      if(n2(i)<.1)a*=.3;
    }
    AMP[i]=clamp(a,.05,1);SPK[i]=spk;
  }
})();

/* =====================================================================
   One shared animation loop; components only run while visible
   ===================================================================== */
const loops=[];
function addLoop(el,fn){const L={el,fn,vis:false};loops.push(L);new IntersectionObserver(([e])=>{L.vis=e.isIntersecting},{rootMargin:'80px'}).observe(el);return L}
let lastNow=performance.now();
(function frame(now){const dt=Math.min(.05,(now-lastNow)/1000);lastNow=now;for(const L of loops)if(L.vis)L.fn(now/1000,dt);alive&&requestAnimationFrame(frame)})(lastNow);
function canvasFit(cv,onSize){
  const st={w:1,h:1,dpr:1};
  const fit=()=>{const r=cv.getBoundingClientRect();st.dpr=Math.min(devicePixelRatio||1,2);st.w=Math.max(1,r.width);st.h=Math.max(1,r.height);cv.width=Math.round(st.w*st.dpr);cv.height=Math.round(st.h*st.dpr);const c=cv.getContext('2d');c&&c.setTransform(st.dpr,0,0,st.dpr,0,0);onSize&&onSize(st)};
  new ResizeObserver(fit).observe(cv);fit();return st;
}
const rr=(ctx,x,y,w,h,r)=>{ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h)};

/* =====================================================================
   Ribbon: the signature element
   ===================================================================== */
function Ribbon(root,o){
  const cv=$('canvas',root), ctx=cv.getContext('2d'), pinsEl=$('.pins',root), tag=$('.tag',root), hov=$('.hov',root), wrap=$('.cvw',root);
  const st=canvasFit(cv);
  let t=o.start||0, holdUntil=0, lastLine=lineAt(o.start||0), playing=!!o.autoplay&&!reduce, speed=o.speed||30, drag=false, hx=null, lensX=0, lensK=0, lastSec=-1, stopAt=null;
  const barW=o.barW||3, gap=o.gap||2;
  const ping=force=>{const s=Math.floor(t);if(s===lastSec&&!force)return;lastSec=s;
    wrap.setAttribute('aria-valuenow',s);wrap.setAttribute('aria-valuetext',mmss(s));
    pinBtns.forEach(p=>p.el.classList.toggle('near',Math.abs(t-p.m.t)<25));
    o.onTime&&o.onTime(t)};
  const pinBtns=MOMENTS.map(m=>{
    const b=document.createElement('button');b.type='button';b.className='pin';
    b.style.left=(m.t/DUR*100)+'%';b.style.setProperty('--c',SP[m.sp].c);
    b.setAttribute('aria-label',`${KIND[m.k].label} at ${mmss(m.t)}, ${SP[m.sp].name}`);
    b.innerHTML=`<span class="pl">${GLYPH[m.k]}${KIND[m.k].label}</span>`;
    b.addEventListener('click',()=>{seek(m.t);o.onInteract&&o.onInteract()});
    pinsEl.appendChild(b);return{el:b,m};
  });
  function seek(s){t=clamp(s,0,DUR);lastLine=lineAt(t);holdUntil=0;ping(true)}
  const seekX=x=>{t=clamp(x/st.w)*DUR;lastLine=lineAt(t);holdUntil=0;ping()};
  wrap.addEventListener('pointerdown',e=>{drag=true;stopAt=null;try{wrap.setPointerCapture(e.pointerId)}catch(_){}hx=e.clientX-wrap.getBoundingClientRect().left;seekX(hx);o.onInteract&&o.onInteract()});
  wrap.addEventListener('pointermove',e=>{hx=e.clientX-wrap.getBoundingClientRect().left;if(drag)seekX(hx)});
  wrap.addEventListener('pointerleave',()=>{if(!drag)hx=null});
  const end=e=>{drag=false;if(e.pointerType&&e.pointerType!=='mouse')hx=null};
  wrap.addEventListener('pointerup',end);wrap.addEventListener('pointercancel',end);
  wrap.addEventListener('keydown',e=>{
    const k=e.key,big=e.shiftKey?60:10;let used=true;
    if(k==='ArrowRight'||k==='ArrowUp')seek(t+big);else if(k==='ArrowLeft'||k==='ArrowDown')seek(t-big);
    else if(k==='Home')seek(0);else if(k==='End')seek(DUR);
    else if(k===' '||k==='Enter'){api.toggle()}else used=false;
    if(used){e.preventDefault();o.onInteract&&o.onInteract()}
  });
  const dim=hex('#f6efe6');
  function draw(now,dt){
    if(playing&&!drag&&now>=holdUntil){t+=dt*speed;if(o.dwell){const li=lineAt(t);if(li!==lastLine){lastLine=li;if(li>=0)holdUntil=now+o.dwell(LINES[li])}}if(stopAt!=null&&t>=stopAt){t=stopAt;playing=false;stopAt=null;o.onState&&o.onState(false)}if(t>=DUR)t=0;ping()}
    const w=st.w,h=st.h;ctx.clearRect(0,0,w,h);
    const n=Math.max(8,Math.floor(w/(barW+gap))),step=w/n,cy=h/2,maxH=h*.34,px=t/DUR*w;
    const want=hx==null?0:1;lensK+=(want-lensK)*(1-Math.exp(-dt*9));
    if(hx!=null){if(lensK<.03)lensX=hx;else lensX+=(hx-lensX)*(1-Math.exp(-dt*20))}
    const sig2=2*66*66,sig3=2*100*100;
    for(let b=0;b<n;b++){
      const x=b*step+step/2, idx=Math.min(N-1,Math.floor((b+.5)/n*N));
      const d=x-lensX,g=Math.exp(-(d*d)/sig2),f=1+1.25*lensK*g;
      let bh=Math.max(1.5,AMP[idx]*maxH*f);bh=Math.min(bh,h*.5-3);
      ctx.globalAlpha=x<=px?1:.27+.6*lensK*Math.exp(-(d*d)/sig3);
      ctx.fillStyle=COL[SPK[idx]];
      rr(ctx,x-barW/2,cy-bh,barW,bh*2,barW/2);ctx.fill();
    }
    ctx.globalAlpha=1;
    const gr=ctx.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(246,239,230,0)');gr.addColorStop(.18,'rgba(246,239,230,.95)');gr.addColorStop(.82,'rgba(246,239,230,.95)');gr.addColorStop(1,'rgba(246,239,230,0)');
    ctx.fillStyle=gr;ctx.fillRect(px-.75,0,1.5,h);
    if(lensK>.05&&hx!=null){ctx.globalAlpha=.35*lensK;ctx.fillStyle='#f6efe6';ctx.fillRect(lensX-.5,h*.12,1,h*.76);ctx.globalAlpha=1}
    tag.textContent=mmss(t);
    const tw=tag.offsetWidth||48;tag.style.transform=`translateX(${clamp(px-tw/2,0,w-tw)}px)`;
    if(lensK>.05&&hx!=null){
      const ht=clamp(hx/w)*DUR,idx=Math.min(N-1,Math.floor(clamp(hx/w)*N));
      hov.innerHTML=`<span style="color:${COL[SPK[idx]]}">●</span> ${mmss(ht)} · ${SP[ORDER[SPK[idx]]].name}`;
      const hw=hov.offsetWidth||90;hov.style.transform=`translateX(${clamp(lensX-hw/2,0,w-hw)}px)`;hov.style.opacity=lensK;
    }else hov.style.opacity=0;
  }
  addLoop(root,draw);
  const api={seek,get t(){return t},get playing(){return playing},
    play(sp,until){if(sp)speed=sp;playing=true;stopAt=until==null?null:until;o.onState&&o.onState(true)},
    pause(){playing=false;stopAt=null;o.onState&&o.onState(false)},
    toggle(){playing?api.pause():api.play(o.speed)}};
  ping(true);return api;
}

/* =====================================================================
   Silhouette tiles (shared by hero + ask)
   ===================================================================== */
const tile=k=>`<div class="tile" data-sp="${k}" style="--c:${SP[k].c}"><i class="hd"></i><i class="bd"></i><span class="nm"><i class="dt"></i>${SP[k].name}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></div>`;

/* =====================================================================
   Header, menu, nav state
   ===================================================================== */
const hdr=$('#hdr'),sheet=$('#sheet'),burger=$('#burger'),bp=$('#burgerPath');
function setMenu(open){sheet.classList.toggle('open',open);sheet.setAttribute('aria-hidden',!open);burger.setAttribute('aria-expanded',open);burger.setAttribute('aria-label',open?'Close menu':'Open menu');bp.setAttribute('d',open?'M6 6l12 12M18 6 6 18':'M4 8h16M4 16h16');document.documentElement.style.overflow=open?'hidden':''}
burger.addEventListener('click',()=>setMenu(!sheet.classList.contains('open')));
$$('a',sheet).forEach(a=>a.addEventListener('click',()=>setMenu(false)));
const go=sel=>{const el=$(sel);if(el)el.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})};

/* magnetic buttons */
if(fine&&!reduce)$$('[data-mag]').forEach(el=>{
  el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.2}px,${(e.clientY-r.top-r.height/2)*.32}px)`});
  el.addEventListener('pointerleave',()=>{el.style.transform=''});
});

/* spotlight on bento cells */
$$('.cell').forEach(c=>c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')}));

/* =====================================================================
   HERO
   ===================================================================== */
(function hero(){
  const hl=$('#hl');
  $$('.ln',hl).forEach(ln=>{ln.innerHTML=ln.textContent.split(' ').map(w=>`<span class="w">${w}</span>`).join(' ')});
  const ws=$$('.w',hl);
  const caret=document.createElement('span');caret.className='caret';caret.setAttribute('aria-hidden','true');
  if(reduce){ws.forEach(w=>w.classList.add('on'));hl.lastElementChild.appendChild(caret)}
  else ws.forEach((w,i)=>setTimeout(()=>{w.classList.add('on');if(i===ws.length-1)setTimeout(()=>hl.lastElementChild.appendChild(caret),500)},450+i*210));

  const tiles=$('#tiles'),cap=$('#cap'),clock=$('#roomClock'),mc=$('#momCount'),hero=$('#top');
  tiles.innerHTML=ORDER.map(tile).join('');
  const tl=$$('.tile',tiles);
  let li=-2,lastMc=-1;
  function update(t){
    clock.textContent=mmss(t);
    const c=MOMENTS.filter(m=>m.t<=t).length;if(c!==lastMc){mc.textContent=c;lastMc=c}
    const i=lineAt(t);if(i===li)return;li=i;
    if(i<0){tl.forEach(e=>e.classList.remove('on'));cap.innerHTML=`<div class="cap-top">The room is filling up</div><p class="q" style="color:var(--bone3)">Waiting for the first words…</p>`;hero.style.setProperty('--glow','#e08a5e');return}
    const l=LINES[i],sp=SP[l.sp];
    tl.forEach(e=>e.classList.toggle('on',e.dataset.sp===l.sp));
    hero.style.setProperty('--glow',sp.c);
    cap.innerHTML=`<div class="cap-top" style="--c:${sp.c}"><span class="who"><i></i>${sp.name}</span><span class="tnum">${mmss(l.t)}</span>${l.k?`<span class="chip">${GLYPH[l.k]}${KIND[l.k].chip}</span>`:''}</div><p class="q">${words(l.x)}</p>`;
  }
  const pp=$('#heroPP');
  const setPP=on=>{pp.innerHTML=on?'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/></svg>':'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';pp.setAttribute('aria-label',on?'Pause playback':'Play')};
  const rib=Ribbon($('#heroRibbon'),{start:T(5,30),autoplay:true,speed:70,dwell:l=>2.6+l.x.length*.05,onTime:update,onState:setPP});
  setPP(rib.playing);
  pp.addEventListener('click',()=>rib.toggle());
  update(rib.t);
  window.__heroRibbon=rib;
})();

/* =====================================================================
   MOMENTS: scroll-driven transcript collapse
   ===================================================================== */
const distill=(function(){
  const sec=$('#distill'),doc=$('#doc'),phases=$$('#phases p'),meterN=$('#meterN'),meterB=$('#meterB'),count=$('#paperCount');
  const segT=$('#segT'),segD=$('#segD');
  doc.innerHTML=LINES.map(l=>`<div class="row${l.k?' sig':''}" data-k="${l.k||''}" style="--c:${SP[l.sp].c}"><div class="row-in"><span class="rt">${mmss(l.t)}</span><span class="rs"><i></i>${SP[l.sp].name}</span><span class="rx"><span class="rxt">${l.x}</span>${l.k?`<span class="rk">${GLYPH[l.k]}${KIND[l.k].chip} · ${KIND[l.k].meta}</span>`:''}</span></div></div>`).join('');
  const rows=$$('.row',doc).map((el,i)=>({el,inner:$('.row-in',el),sig:!!LINES[i].k,h:60}));
  const non=rows.filter(r=>!r.sig);
  const grey=hex('#6d6257'),ink=hex('#1c1612');
  let S=0,cur=-1,staticMode=reduce;
  function measure(){
    rows.forEach(r=>{if(!r.sig)r.el.style.height='auto'});
    rows.forEach(r=>{r.h=r.el.offsetHeight});
    const total=rows.reduce((a,r)=>a+r.h,0),win=$('.paper-win',sec).clientHeight;
    S=Math.max(0,total-win+30);
  }
  function render(p){
    cur=p;
    const A=clamp(p/.3),cg=clamp((p-.3)/.42),hp=clamp((p-.2)/.2),fin=clamp((p-.74)/.2);
    let k=0;
    rows.forEach(r=>{
      if(r.sig){r.el.style.setProperty('--h',hp.toFixed(3));r.el.style.setProperty('--m',fin.toFixed(3));r.inner.style.color=mixRgb(grey,ink,hp)}
      else{const f=non.length>1?k++/(non.length-1):0,c=ease(clamp((cg-f*.55)/.45));r.el.style.height=(r.h*(1-c)).toFixed(1)+'px';r.el.style.opacity=(1-c*1.15).toFixed(3)}
    });
    doc.style.transform=`translate3d(0,${(-S*A*(1-ease(cg))).toFixed(1)}px,0)`;
    const ph=p<.3?0:p<.74?1:2;phases.forEach((e,i)=>e.classList.toggle('on',i===ph));
    const secs=lerp(DUR,40,ease(cg));meterN.textContent=mmss(secs);meterB.style.transform=`scaleX(${(secs/DUR).toFixed(3)})`;
    count.textContent=cg<.05?'Everything kept':cg>.95?'5 moments, rest searchable':'Finding what mattered…';
    const showMoments=p>.5;segT.setAttribute('aria-pressed',!showMoments);segD.setAttribute('aria-pressed',showMoments);
  }
  function progress(){
    if(staticMode)return cur<0?0:cur;
    const r=sec.getBoundingClientRect(),span=r.height-innerHeight;
    return span>0?clamp(-r.top/span):0;
  }
  function onScroll(){if(!staticMode){const p=progress();if(Math.abs(p-cur)>.0004)render(p)}}
  function jump(toEnd){
    if(staticMode){render(toEnd?1:0);return}
    const top=sec.getBoundingClientRect().top+scrollY,span=sec.offsetHeight-innerHeight;
    scrollTo({top:top+span*(toEnd?.97:.02),behavior:'smooth'});
  }
  segT.addEventListener('click',()=>jump(false));segD.addEventListener('click',()=>jump(true));
  if(staticMode){sec.style.height='auto';$('.pinbox',sec).style.position='relative';$('.pinbox',sec).style.height='auto';$('.pinbox',sec).style.padding='80px 0'}
  measure();render(staticMode?1:progress());
  addEventListener('resize',()=>{measure();render(staticMode?(cur<0?1:cur):progress())});
  document.fonts&&document.fonts.ready.then(()=>{measure();render(staticMode?1:progress())});
  return{onScroll};
})();

/* =====================================================================
   ASK
   ===================================================================== */
const QA=[
  {q:'What did we decide?',kw:['decid','decision','agree','settle','conclu','outcome'],
    a:["You settled on showing the decision before the process. Mara flagged the handoff as the weak point ",{t:T(8,24)},", and Jonah proposed the fix and closed it out ",{t:T(14,18)},"."]},
  {q:'Who owns what next?',kw:['own','next','action','todo','task','who','follow','assign'],
    a:["Priya brings the revised flow to Thursday's review ",{t:T(52,10)},". Jonah writes up the post-launch metrics ",{t:T(41,5)},", and design owns the empty state until version one ships ",{t:T(24,45)},"."]},
  {q:'What could go wrong?',kw:['risk','wrong','slip','release','worr','concern','problem','delay'],
    a:["Theo's concern: if this slips past review, the mid-quarter release won't hold ",{t:T(31,30)},". Mara's fallback is a prototype on Thursday, with scope cut if needed ",{t:T(35,20)},"."]},
  {q:'Where did we lose people?',kw:['lose','lost','drop','import','leak','churn','people','onboard'],
    a:["Forty percent never finish the import step ",{t:T(2,5)},". Mara traced it to confusion about what happens next, not to speed ",{t:T(11,40)},"."]}
];
const FALLBACK={a:["Nothing in this room matches that yet. Try asking about decisions, owners, or risks."]};
const pickQA=q=>{const s=q.toLowerCase();let best=null,bs=0;QA.forEach(x=>{let n=x.kw.filter(k=>s.includes(k)).length;if(s===x.q.toLowerCase())n+=9;if(n>bs){bs=n;best=x}});return best||FALLBACK};

const askAPI=(function(){
  const form=$('#askForm'),input=$('#askIn'),ans=$('#ans'),momentEl=$('#moment'),chips=$('#qchips');
  chips.innerHTML=QA.map((x,i)=>`<button class="qchip" type="button" data-i="${i}">${x.q}</button>`).join('');
  let curLine=-2,rib,runId=0,interacted=false,replayTimer=0;
  function showLine(i,fromT){
    if(i<0)i=0;
    if(i===curLine){$$('.cite',ans).forEach(c=>c.classList.toggle('on',Math.abs(+c.dataset.t-LINES[i].t)<2));return}
    curLine=i;
    const l=LINES[i],sp=SP[l.sp];
    momentEl.innerHTML=`<div class="tile on" style="--c:${sp.c}"><i class="hd"></i><i class="bd"></i><span class="nm"><i class="dt"></i>${sp.name}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>${l.k?`<span class="chip kind">${GLYPH[l.k]}${KIND[l.k].chip}</span>`:''}<span class="ts">${mmss(l.t)}</span></div>
      <p class="q" style="--c:${sp.c}">${words(l.x)}</p>
      <div class="moment-ctl"><button class="mv" type="button" id="mvPrev" aria-label="Previous moment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button><button class="mv" type="button" id="mvNext" aria-label="Next moment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button><button class="link" type="button" id="replay"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>Replay</button><span class="sp"></span><span class="tnum">${mmss(l.t)} · ${sp.name}</span></div>`;
    $('#replay',momentEl).addEventListener('click',()=>replay(i));
    const prevM=[...MOMENTS].reverse().find(m=>m.t<l.t-1),nextM=MOMENTS.find(m=>m.t>l.t+1);
    const bp=$('#mvPrev',momentEl),bn=$('#mvNext',momentEl);
    bp.disabled=!prevM;bn.disabled=!nextM;
    bp.addEventListener('click',()=>{interacted=true;focusMoment(prevM.t)});
    bn.addEventListener('click',()=>{interacted=true;focusMoment(nextM.t)});
    $$('.cite',ans).forEach(c=>c.classList.toggle('on',Math.abs(+c.dataset.t-l.t)<2));
  }
  function replay(i){
    const l=LINES[i],q=$('.q',momentEl);q.classList.remove('kar');void q.offsetWidth;q.classList.add('kar');
    rib.seek(l.t);rib.play(1,l.t+8);
  }
  function focusMoment(s){rib.seek(s);showLine(lineAt(s+1))}
  const sync=t=>{showLine(lineAt(t))};
  rib=Ribbon($('#askRibbon'),{start:T(14,18),autoplay:false,speed:1,barW:3,gap:2,onTime:sync,onInteract:()=>{interacted=true}});
  showLine(lineAt(T(14,19)));

  function cite(s){
    const l=LINES[lineAt(s)]||LINES[0],b=document.createElement('button');
    b.type='button';b.className='cite';b.dataset.t=s;b.style.setProperty('--c',SP[l.sp].c);b.innerHTML=`<i></i>${mmss(s)}`;
    b.setAttribute('aria-label',`Jump to ${mmss(s)}, ${SP[l.sp].name}`);
    b.addEventListener('click',()=>{interacted=true;focusMoment(s)});return b;
  }
  async function run(q){
    const id=++runId,qa=pickQA(q);
    ans.innerHTML='';const p=document.createElement('p');ans.appendChild(p);
    let first=null;
    for(const part of qa.a){
      if(id!==runId)return;
      if(typeof part==='string'){for(const w of part.split(' ')){if(!w)continue;p.append(document.createTextNode(w+' '));if(!reduce)await sleep(26);if(id!==runId)return}}
      else{const c=cite(part.t);p.append(c);if(first==null)first=part.t;if(!reduce)await sleep(120)}
    }
    if(first!=null&&id===runId)focusMoment(first);
  }
  async function typeIn(q){
    const id=++runId;input.value='';
    for(const ch of q){if(id!==runId)return false;input.value+=ch;if(!reduce)await sleep(34)}
    await sleep(reduce?0:260);return id===runId;
  }
  async function ask(q,type){
    if(type){const ok=await typeIn(q);if(!ok)return;runId--}
    else input.value=q;
    run(q);
  }
  form.addEventListener('submit',e=>{e.preventDefault();const q=input.value.trim();if(!q)return;interacted=true;run(q)});
  input.addEventListener('input',()=>{interacted=true});
  chips.addEventListener('click',e=>{const b=e.target.closest('.qchip');if(!b)return;interacted=true;ask(QA[+b.dataset.i].q,false)});
  new IntersectionObserver((es,io)=>{es.forEach(e=>{if(e.isIntersecting){io.disconnect();setTimeout(()=>{if(!interacted)ask(QA[0].q,true)},500)}})},{threshold:.4}).observe($('.console'));
  return{ask,focusMoment,markInteracted:()=>{interacted=true}};
})();

/* =====================================================================
   FEATURES
   ===================================================================== */
/* --- video scene --- */
(function(){
  const svg=$('#scene'),stat=$('#sceneStat'),xs=[110,247,384,521];
  const body=x=>`M${x-56},270 C${x-56},188 ${x-32},152 ${x},152 C${x+32},152 ${x+56},188 ${x+56},270 Z`;
  svg.innerHTML=`<g id="gz"></g>`+ORDER.map((k,i)=>`<g class="person" data-i="${i}" tabindex="0" role="button" aria-label="Give ${SP[k].name} the floor"><path class="b" d="${body(xs[i])}" fill="${SP[k].c}" opacity=".25"/><circle class="h" cx="${xs[i]}" cy="104" r="28" fill="${SP[k].c}" opacity=".35"/><text class="nm" x="${xs[i]}" y="258" >${SP[k].name}</text></g>`).join('')+`<line x1="20" y1="226" x2="620" y2="226" stroke="rgba(240,233,222,.12)" stroke-width="1.5"/>`;
  const gz=$('#gz',svg),ps=$$('.person',svg);
  let sp=0,last=0;
  function set(i){
    sp=i;gz.innerHTML='';
    ps.forEach((g,j)=>{const on=j===i;g.style.transform=on?'translateY(-9px)':'none';$('.b',g).setAttribute('opacity',on?.95:.25);$('.h',g).setAttribute('opacity',on?1:.35);$('.nm',g).style.fill=on?'#1b120d':'#9a8b7f'});
    ORDER.forEach((k,j)=>{if(j===i)return;const x1=xs[j],x2=xs[i],mx=(x1+x2)/2,lift=Math.abs(x1-x2)*.34+26;
      const pa=document.createElementNS('http://www.w3.org/2000/svg','path');pa.setAttribute('class','gaze');pa.setAttribute('d',`M${x1},62 Q${mx},${62-lift} ${x2},${62}`);pa.setAttribute('stroke',SP[ORDER[i]].c);gz.appendChild(pa)});
    stat.style.setProperty('--c',SP[ORDER[i]].c);stat.innerHTML=`<i></i>${SP[ORDER[i]].name} has the floor. Everyone else is looking.`;
  }
  ps.forEach((g,i)=>{const pick=()=>{last=performance.now()+9000;set(i)};g.addEventListener('click',pick);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}})});
  set(1);
  if(!reduce){let acc=0;addLoop(svg,(now,dt)=>{if(performance.now()<last)return;acc+=dt;if(acc>3.2){acc=0;set((sp+1)%4)}})}
})();

/* --- audio lanes --- */
(function(){
  const cv=$('#lanes'),ctx=cv.getContext('2d'),st=canvasFit(cv);
  const SCRIPT=[[0,0,3.6],[1,3.3,6.4],[3,6.8,8.8],[0,8.5,11.6],[2,11.0,13.4],[1,13.8,16.2]],LOOP=17;
  const hist=ORDER.map(()=>[]),env=[0,0,0,0];let acc=0,clk=0,seed=0;
  addLoop(cv,(now,dt)=>{
    const w=st.w,h=st.h,x0=w<420?18:74,bw=3,gp=2,cnt=Math.max(10,Math.floor((w-x0-8)/(bw+gp)));
    if(!reduce)clk=(clk+dt)%LOOP;else clk=1.5;
    const act=ORDER.map((_,i)=>SCRIPT.some(s=>s[0]===i&&clk>=s[1]&&clk<s[2]));
    acc+=dt;
    while(acc>1/40||(reduce&&hist[0].length<cnt)){
      acc=Math.max(0,acc-1/40);
      for(let i=0;i<4;i++){env[i]+=((act[i]?1:0)-env[i])*.22;seed=(seed*16807+11)%2147483647;const r=(seed%1000)/1000;hist[i].push(.05+env[i]*(.25+.75*r));while(hist[i].length>cnt)hist[i].shift()}
      if(reduce&&hist[0].length>=cnt)break;
    }
    ctx.clearRect(0,0,w,h);
    const laneH=h/4;
    for(let i=0;i<4;i++){
      const cy=laneH*(i+.5);
      ctx.globalAlpha=.1;ctx.fillStyle='#f0e9de';ctx.fillRect(x0,cy-.5,w-x0-8,1);
      ctx.globalAlpha=act[i]?1:.7;ctx.fillStyle=COL[i];
      if(w>=420){ctx.beginPath();ctx.arc(14,cy,4,0,7);ctx.fill();ctx.font='500 12px '+SANS;ctx.fillStyle=act[i]?'#f0e9de':'#9a8b7f';ctx.globalAlpha=1;ctx.fillText(SP[ORDER[i]].name,26,cy+4)}
      else{ctx.beginPath();ctx.arc(8,cy,4,0,7);ctx.fill()}
      ctx.fillStyle=COL[i];
      const hs=hist[i],off=cnt-hs.length;
      for(let j=0;j<hs.length;j++){const bh=Math.max(1.2,hs[j]*laneH*.42);ctx.globalAlpha=.35+.65*(j/hs.length);rr(ctx,x0+(j+off)*(bw+gp),cy-bh,bw,bh*2,1.5);ctx.fill()}
    }
    ctx.globalAlpha=1;
    const both=act.filter(Boolean).length>1;
    if(both){const txt=w<420?'Overlap kept':'Talking over each other. Both voices kept.';ctx.font='600 12px '+SANS;const w2=ctx.measureText(txt).width+26;ctx.fillStyle='#f0e9de';rr(ctx,w-w2-8,4,w2,24,12);ctx.fill();ctx.fillStyle='#1c1612';ctx.fillText(txt,w-w2+5,20)}
  });
})();

/* --- search (real search over the transcript) --- */
(function(){
  const input=$('#sIn'),hits=$('#hits');
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const toks=q=>q.toLowerCase().split(/[^a-z0-9']+/).filter(w=>w.length>2);
  function search(q){
    const ts=toks(q);if(!ts.length)return[];
    return LINES.map(l=>{const tx=l.x.toLowerCase();let s=0;ts.forEach(w=>{const stem=w.slice(0,Math.max(3,w.length-1));if(tx.includes(w))s+=2;else if(tx.includes(stem))s+=1});if(s&&l.k)s+=.3;return{l,s}}).filter(r=>r.s>0).sort((a,b)=>b.s-a.s).slice(0,3);
  }
  function hl(text,ts){let out=esc(text);ts.forEach(w=>{const stem=w.slice(0,Math.max(3,w.length-1));out=out.replace(new RegExp('\\b('+stem+"[a-z']*)",'gi'),'<mark>$1</mark>')});return out}
  function render(q){
    const res=search(q),ts=toks(q);
    if(!q.trim()){hits.innerHTML='';return}
    if(!res.length){hits.innerHTML=`<div class="none">No matches for "${esc(q)}". Try a name, a topic, or a phrase.</div>`;return}
    hits.innerHTML=res.map((r,i)=>`<button class="hit" type="button" data-t="${r.l.t}" style="--c:${SP[r.l.sp].c};animation-delay:${i*70}ms"><span class="tm">${mmss(r.l.t)}</span><span class="tx"><small><i></i>${SP[r.l.sp].name}</small>${hl(r.l.x,ts)}</span><span class="go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>`).join('');
  }
  hits.addEventListener('click',e=>{const b=e.target.closest('.hit');if(!b)return;askAPI.markInteracted();go('#ask');setTimeout(()=>askAPI.focusMoment(+b.dataset.t),reduce?0:650)});
  let manual=false,vis=false;
  input.addEventListener('input',()=>{manual=true;render(input.value)});
  input.addEventListener('focus',()=>{manual=true});
  new IntersectionObserver(([e])=>{vis=e.isIntersecting},{threshold:.3}).observe($('.c-search'));
  const DEMO=['release','first screen','who owns','import'];
  (async function demo(){
    if(reduce){input.value=DEMO[0];render(DEMO[0]);return}
    let i=0;
    while(!manual){
      while(!vis&&!manual)await sleep(300);
      if(manual)return;
      const q=DEMO[i++%DEMO.length];input.value='';render('');
      for(const ch of q){if(manual)return;input.value+=ch;render(input.value);await sleep(85)}
      await sleep(2600);if(manual)return;
      while(input.value.length&&!manual){input.value=input.value.slice(0,-1);await sleep(28)}
      render('');await sleep(350);
    }
  })();
})();

/* --- summary --- */
(function(){
  const sum=$('#sum');
  const done=GLYPH.decision, risk=GLYPH.risk;
  const check='<svg viewBox="0 0 24 24" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  sum.innerHTML=`
   <div class="sg"><h4>Decided</h4><div class="si" style="--c:${SP.jonah.c}"><span class="gl">${done}</span><span class="st">Show the decision before the process.</span></div></div>
   <div class="sg"><h4>Next</h4>
     <button class="si" type="button" role="checkbox" aria-checked="false"><span class="bx">${check}</span><span class="st">Priya brings the revised flow to Thursday's review.</span></button>
     <button class="si" type="button" role="checkbox" aria-checked="false"><span class="bx">${check}</span><span class="st">Jonah writes up the post-launch metrics.</span></button></div>
   <div class="sg"><h4>Still open</h4><div class="si" style="--c:${SP.theo.c}"><span class="gl">${risk}</span><span class="st">Can the mid-quarter release absorb the change?</span></div>
     <div class="sum-foot"><span class="tally" id="tally">0 of 2 done</span><button class="send" id="send" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg><span>Share to #design-review</span></button></div></div>`;
  const groups=$$('.sg',sum),boxes=$$('[role=checkbox]',sum),tally=$('#tally'),send=$('#send');
  boxes.forEach(b=>b.addEventListener('click',()=>{b.setAttribute('aria-checked',b.getAttribute('aria-checked')!=='true');tally.textContent=`${boxes.filter(x=>x.getAttribute('aria-checked')==='true').length} of 2 done`}));
  send.addEventListener('click',()=>{if(send.classList.contains('done'))return;send.classList.add('done');$('span',send).textContent='Shared to #design-review';setTimeout(()=>{send.classList.remove('done');$('span',send).textContent='Share to #design-review'},3200)});
  new IntersectionObserver((es,io)=>{es.forEach(e=>{if(e.isIntersecting){io.disconnect();groups.forEach((g,i)=>setTimeout(()=>g.classList.add('in'),reduce?0:i*380))}})},{threshold:.25}).observe($('.c-sum'));
})();

/* =====================================================================
   METHOD: capture → understand → return (one canvas, three states)
   ===================================================================== */
(function(){
  const stage=$('#mStage'),cvBox=$('#mCv'),cv=$('canvas',cvBox),ctx=cv.getContext('2d'),btns=$$('.m-step',stage),lanesEl=$('#mLanes'),call=$('#mCall');
  const NB=128,x0f=w=>w<600?26:104;
  const st=canvasFit(cv,s=>{lanesEl.innerHTML=ORDER.map((k,i)=>`<span style="top:${(i+1)/5*100}%;--c:${SP[k].c}"><i></i>${SP[k].name}</span>`).join('')});
  const neutral=hex('#a89a8e');
  const bars=Array.from({length:NB},(_,i)=>{const idx=Math.floor((i+.5)/NB*N);return{a:AMP[idx],s:SPK[idx],time:(i+.5)/NB*DUR,y:.5,h:.2,al:.8,c:neutral.slice(),step:0}});
  let step=0,T0=0,prog=0,auto=!reduce,hold=0;
  const decIdx=MOMENTS.findIndex(m=>m.k==='decision'),dec=MOMENTS[decIdx];
  function setStep(i,user){
    step=i;T0=performance.now();prog=0;stage.dataset.step=i;
    btns.forEach((b,j)=>b.setAttribute('aria-pressed',j===i));
    if(user)hold=performance.now()+14000;
  }
  btns.forEach((b,i)=>b.addEventListener('click',()=>setStep(i,true)));
  addLoop(cv,(now,dt)=>{
    const w=st.w,h=st.h,x0=x0f(w),usable=w-x0-18,bw=Math.max(2,usable/NB*.56),nowMs=performance.now();
    if(auto&&nowMs>hold){prog+=dt/4.6;if(prog>=1)setStep((step+1)%3,false)}
    const cur=btns[step];cur&&cur.style.setProperty('--prog',clamp(prog).toFixed(3));
    const beam=step===2?clamp((nowMs-T0-500)/2200):0,decX=x0+dec.t/DUR*usable,beamX=lerp(x0,decX,ease(beam));
    ctx.clearRect(0,0,w,h);
    bars.forEach((b,i)=>{
      if(nowMs-T0>=i*6)b.step=step;
      let ty,th,tal,tc;
      const bx=x0+(i+.5)/NB*usable;
      if(b.step===0){ty=.5;th=(.12+.3*b.a*(.7+.3*Math.sin(now*2.4+i*.45)));tal=.92;tc=neutral}
      else{ty=(b.s+1)/5;th=b.a*.065;tal=1;tc=hex(COL[b.s]);
        if(b.step===2){const near=MOMENTS.some(m=>Math.abs(m.t-b.time)<DUR*.012);
          const bd=Math.abs(bx-beamX);const lit=beam>0?Math.exp(-(bd*bd)/(2*60*60)):0;
          tal=near?1:.14+.5*lit;if(near)th*=1.35;th*=1+.5*lit;th=Math.min(th,.09)}}
      const k=1-Math.exp(-dt*7);
      b.y+=(ty-b.y)*k;b.h+=(th-b.h)*k;b.al+=(tal-b.al)*k;for(let j=0;j<3;j++)b.c[j]+=(tc[j]-b.c[j])*k;
      ctx.globalAlpha=clamp(b.al);ctx.fillStyle=`rgb(${b.c[0]|0},${b.c[1]|0},${b.c[2]|0})`;
      const bh=b.h*h;rr(ctx,bx-bw/2,b.y*h-bh,bw,bh*2,bw/2);ctx.fill();
    });
    ctx.globalAlpha=1;
    if(step===2){
      MOMENTS.forEach(m=>{const mx=x0+m.t/DUR*usable;ctx.fillStyle=SP[m.sp].c;ctx.globalAlpha=.9*clamp((nowMs-T0-300)/500);ctx.fillRect(mx-.5,h*.1,1,h*.8)});
      ctx.globalAlpha=.9*clamp(beam*3);ctx.fillStyle='#f6efe6';ctx.fillRect(beamX-.75,h*.04,1.5,h*.92);ctx.globalAlpha=1;
      call.style.left=beamX+'px';
    }
  });
  setStep(0,false);
})();

/* =====================================================================
   START: queue a real notetaker job and follow it to the finished notes
   ===================================================================== */
(function(){
  const form=$('#sendForm'),input=$('#sendUrl'),btn=$('#sendBtn'),card=$('#jobCard'),
    title=$('#jobTitle'),st=$('#jobSt'),msg=$('#jobMsg'),open=$('#jobOpen'),again=$('#jobAgain'),dot=$('#jobDot'),
    p=$('#stP'),h2=$('#st-h');
  const LABEL={queued:'Queued',claimed:'Picked up',joining:'Joining',recording:'Listening',done:'Done',failed:'Failed',cancelled:'Cancelled'};
  const COPY={
    queued:'Waiting for a notetaker runner to pick this up.',
    claimed:'A runner has it and is opening the meeting.',
    joining:'In the lobby. Let Recall in from the meeting.',
    recording:'Recall is in the call and listening. You can stay with the conversation.',
    done:'Finished. The transcript and summary are filed.',
    failed:'Recall could not complete this meeting.',
    cancelled:'This job was cancelled.'
  };
  let timer=0,jobId=null;
  const stopPoll=()=>{clearInterval(timer);timer=0};
  function show(job){
    card.hidden=false;
    title.textContent=job.title||job.meetingCode||'Meeting';
    st.textContent=LABEL[job.status]||job.status;
    msg.textContent=(job.lastMessage&&job.status!=='done'?job.lastMessage:COPY[job.status])||'';
    const fin=job.status==='done'||job.status==='failed'||job.status==='cancelled';
    dot.style.animationPlayState=fin?'paused':'running';
    dot.style.background=job.status==='done'?'var(--sage)':job.status==='failed'?'var(--rose)':'';
    open.hidden=!(job.status==='done'&&job.resultMeetingId);
    if(!open.hidden)open.href='/calls/'+encodeURIComponent(job.resultMeetingId);
    again.hidden=!fin;
    if(job.status==='recording'){h2.textContent='Press record.';p.textContent='Recall is listening. You can stay with the conversation.'}
    if(fin){stopPoll();h2.textContent=job.status==='done'?'Room kept.':'Be there for it.'}
  }
  async function poll(){
    try{
      const r=await fetch('/api/bot/jobs/'+jobId,{cache:'no-store'});
      if(r.ok)show((await r.json()).job);
    }catch(_){}
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const url=input.value.trim();
    if(!/meet\.google\.com\/|^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(url)){
      card.hidden=false;title.textContent='That does not look like a Meet link';st.textContent='';msg.textContent='Use a link like meet.google.com/abc-defg-hij.';open.hidden=true;again.hidden=true;return;
    }
    btn.disabled=true;
    try{
      const r=await fetch('/api/bot/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({meetingUrl:/^[a-z]{3}-/i.test(url)?'https://meet.google.com/'+url:url,botName:'Recall'})});
      const j=await r.json();
      if(!r.ok){card.hidden=false;title.textContent=j.error||'Could not queue';st.textContent='';msg.textContent=j.detail||'';open.hidden=true;again.hidden=true;return}
      jobId=j.job.id;form.hidden=true;show(j.job);stopPoll();timer=setInterval(poll,3000);
    }catch(_){
      card.hidden=false;title.textContent='Could not reach Recall';st.textContent='';msg.textContent='Check your connection and try again.';
    }finally{btn.disabled=false}
  });
  again.addEventListener('click',()=>{stopPoll();jobId=null;card.hidden=true;form.hidden=false;input.value='';h2.textContent='Be there for it.';p.textContent='Paste the link to your next meeting. Recall joins, listens, and files the notes.';input.focus()});
})();

/* =====================================================================
   Trust: count-up on first sight
   ===================================================================== */
(function(){
  const els=$$('[data-to]');
  const show=(el,v)=>{const d=+el.dataset.dec||0;el.textContent=d?v.toFixed(d):Math.round(v)};
  els.forEach(el=>{
    const to=+el.dataset.to;if(reduce||to===0){show(el,to);return}
    new IntersectionObserver((es,io)=>{es.forEach(e=>{if(!e.isIntersecting)return;io.disconnect();
      const t0=performance.now(),D=1600;
      (function tick(n){const k=clamp((n-t0)/D),v=to*(1-Math.pow(1-k,4));show(el,v);if(k<1)requestAnimationFrame(tick)})(t0);
    })},{threshold:.6}).observe(el);
  });
})();

/* =====================================================================
   Dock: scroll position as meeting time
   ===================================================================== */
const dockAPI=(function(){
  const dock=$('#dock'),bars=$('#dockBars'),ticks=$('#dockTicks'),dt=$('#dockT'),dl=$('#dockL');
  const NBAR=72;
  bars.innerHTML=Array.from({length:NBAR},(_,i)=>{const idx=Math.floor((i+.5)/NBAR*N);return`<i style="height:${16+AMP[idx]*84}%;--c:${COL[SPK[idx]]}"></i>`}).join('');
  const bs=[...bars.children];
  const SECS=[['top','Room'],['distill','Moments'],['ask','Ask'],['signals','Features'],['method','How it works'],['trust','Trust'],['start','Start']];
  let pos=[],lastN=-1,lastLbl='';
  function layout(){
    const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    pos=SECS.map(([id,l])=>{const el=document.getElementById(id);return{id,l,f:clamp((el.getBoundingClientRect().top+scrollY)/max),top:el.getBoundingClientRect().top+scrollY}});
    ticks.innerHTML=pos.map(s=>`<button class="tk" type="button" data-go="#${s.id}" style="left:${s.f*100}%" aria-label="Jump to ${s.l}"><span>${s.l}</span></button>`).join('');
  }
  ticks.addEventListener('click',e=>{const b=e.target.closest('.tk');if(b)go(b.dataset.go)});
  function update(){
    const max=Math.max(1,document.documentElement.scrollHeight-innerHeight),f=clamp(scrollY/max);
    dock.classList.toggle('on',scrollY>innerHeight*.62);
    const n=Math.round(f*NBAR);if(n!==lastN){bs.forEach((b,i)=>b.classList.toggle('on',i<n));lastN=n}
    dt.textContent=mmss(f*DUR);
    let cur=pos[0];pos.forEach(s=>{if(scrollY+innerHeight*.4>=s.top)cur=s});
    if(cur&&cur.l!==lastLbl){dl.textContent=cur.l;lastLbl=cur.l}
    return cur&&cur.id;
  }
  return{layout,update};
})();

/* =====================================================================
   Global scroll handling (header state, nav highlight, dock, pinned section)
   ===================================================================== */
const navLinks=$$('.nav a');
let ticking=false;
function onScroll(){
  hdr.classList.toggle('scrolled',scrollY>40);
  distill.onScroll();
  const id=dockAPI.update();
  navLinks.forEach(a=>a.setAttribute('aria-current',a.getAttribute('href')==='#'+id?'true':'false'));
  ticking=false;
}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll)}},{passive:true});
const relayout=()=>{dockAPI.layout();onScroll()};
addEventListener('resize',relayout);addEventListener('load',relayout);
document.fonts&&document.fonts.ready.then(relayout);
setTimeout(relayout,600);
dockAPI.layout();onScroll();

/* =====================================================================
   Command palette
   ===================================================================== */
(function(){
  const pal=$('#pal'),input=$('#palIn'),list=$('#palList'),btn=$('#palBtn');
  const ARROW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const ITEMS=[
    ...QA.map(q=>({g:'Ask the room',l:q.q,run:()=>{go('#ask');setTimeout(()=>askAPI.ask(q.q,true),reduce?0:700)}})),
    {g:'Jump to',l:'Moments',run:()=>go('#distill')},{g:'Jump to',l:'Ask',run:()=>go('#ask')},
    {g:'Jump to',l:'Features',run:()=>go('#signals')},{g:'Jump to',l:'How it works',run:()=>go('#method')},{g:'Jump to',l:'Start listening',run:()=>go('#start')}
  ];
  let shown=[],sel=0,opener=null;
  function render(){
    const q=input.value.trim().toLowerCase();
    shown=ITEMS.filter(i=>!q||i.l.toLowerCase().includes(q));
    if(q&&!shown.length)shown=[{g:'Ask the room',l:input.value.trim(),run:()=>{go('#ask');setTimeout(()=>askAPI.ask(input.value.trim()||'',false),reduce?0:700)}}];
    sel=clamp(sel,0,shown.length-1);
    let g='',html='';
    shown.forEach((it,i)=>{if(it.g!==g){g=it.g;html+=`<div class="pal-g" role="presentation">${g}</div>`}html+=`<button class="pal-i" type="button" role="option" aria-selected="${i===sel}" data-i="${i}"><span>${it.l}</span>${ARROW}</button>`});
    list.innerHTML=html;
  }
  function open(){opener=document.activeElement;pal.hidden=false;input.value='';sel=0;render();document.documentElement.style.overflow='hidden';setTimeout(()=>input.focus(),10)}
  function close(){pal.hidden=true;document.documentElement.style.overflow='';opener&&opener.focus&&opener.focus()}
  function choose(i){const it=shown[i];if(!it)return;close();it.run()}
  btn.addEventListener('click',open);const b2=$('#palBtn2');b2&&b2.addEventListener('click',open);
  pal.addEventListener('mousedown',e=>{if(e.target===pal)close()});
  input.addEventListener('input',()=>{sel=0;render()});
  list.addEventListener('click',e=>{const b=e.target.closest('.pal-i');if(b)choose(+b.dataset.i)});
  list.addEventListener('mousemove',e=>{const b=e.target.closest('.pal-i');if(b&&+b.dataset.i!==sel){sel=+b.dataset.i;$$('.pal-i',list).forEach((x,i)=>x.setAttribute('aria-selected',i===sel))}});
  addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();pal.hidden?open():close();return}
    if(e.key==='/'&&pal.hidden&&!/INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||'')){e.preventDefault();open();return}
    if(e.key==='Escape'){if(!pal.hidden)close();else if(sheet.classList.contains('open'))setMenu(false)}
    if(pal.hidden)return;
    if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(shown.length-1,sel+1);render();$('.pal-i[aria-selected="true"]',list)?.scrollIntoView({block:'nearest'})}
    else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(0,sel-1);render();$('.pal-i[aria-selected="true"]',list)?.scrollIntoView({block:'nearest'})}
    else if(e.key==='Enter'){e.preventDefault();choose(sel)}
    else if(e.key==='Tab'){e.preventDefault();input.focus()}
  });
})();

return () => { alive = false; ac.abort(); document.documentElement.style.overflow = ''; };
}
