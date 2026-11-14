(function(){
  var $=function(s,c){return (c||document).querySelector(s)}, $$=function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s))};
  var yr=$('#yr'); if(yr) yr.textContent=new Date().getFullYear();

  var burger=$('#burger'), menu=$('#menu');
  burger.addEventListener('click',function(){var o=menu.classList.toggle('open');burger.setAttribute('aria-expanded',o)});
  $$('#menu a').forEach(function(a){a.addEventListener('click',function(){menu.classList.remove('open');burger.setAttribute('aria-expanded',false)})});

  $$('.dd').forEach(function(d){
    var b=$('.dd-btn',d);
    b.addEventListener('click',function(e){e.stopPropagation();var o=!d.classList.contains('open');
      $$('.dd').forEach(function(x){x.classList.remove('open');$('.dd-btn',x).setAttribute('aria-expanded','false')});
      if(o){d.classList.add('open');b.setAttribute('aria-expanded','true')}});
    $$('a',d).forEach(function(a){a.addEventListener('click',function(){d.classList.remove('open');b.setAttribute('aria-expanded','false')})});
  });
  document.addEventListener('click',function(e){if(!e.target.closest('.dd'))$$('.dd').forEach(function(x){x.classList.remove('open');$('.dd-btn',x).setAttribute('aria-expanded','false')})});

  var F=[
    ['monitor','Smart classrooms','g'],['atom','Physics lab','g'],['flask','Chemistry lab','g'],['leaf','Biology lab','g'],
    ['cpu','Computer lab','gs'],['calc','Maths lab','g'],['library','Library','g'],['field','Playground','gs'],
    ['dice','Indoor games','gs'],['trophy','Sports coaching','g'],['karate','Karate','gs'],['skate','Skating','gs'],
    ['yoga','Yoga','g'],['music','Music','gs'],['dance','Dance','gs'],['palette','Art & craft','gs'],
    ['blocks','Kids play area','gs'],['bus','School transport','gs'],['gps','GPS-enabled buses','g'],['cam','CCTV security','gs'],
    ['drop','RO drinking water','gs'],['med','Medical room','gs'],['hall','Activity hall','gs'],['cup','Canteen','g'],
    ['map','Educational trips','g'],['cal','Annual events & festivals','gs']
  ];
  var grid=$('#fgrid');
  function tagOf(c){return c==='gs'?'Both campuses':'Maruti Kunj'}
  function draw(f){
    if(!grid)return;
    grid.innerHTML=F.filter(function(x){return f==='all'||x[2].indexOf(f)>-1}).map(function(x){
      return '<div class="fac reveal rv-zoom"><span class="fi"><svg class="ico"><use href="#i-'+x[0]+'"/></svg></span><span><b>'+x[1]+'</b><small>'+tagOf(x[2])+'</small></span></div>';
    }).join('');
    $$('.fac',grid).forEach(function(el,i){el.style.transitionDelay=Math.min(i*40,480)+'ms'});
    if(window.__reveal)window.__reveal(grid);
  }
  draw('all');
  $$('.ftab').forEach(function(b){b.addEventListener('click',function(){
    $$('.ftab').forEach(function(x){x.classList.remove('on');x.setAttribute('aria-selected','false')});
    b.classList.add('on');b.setAttribute('aria-selected','true');draw(b.dataset.f);
  })});

  /* gallery filter + autoplay video when visible */
  $$('.gtabs .ftab').forEach(function(b){b.addEventListener('click',function(){
    $$('.gtabs .ftab').forEach(function(x){x.classList.remove('on')});b.classList.add('on');var f=b.dataset.g;
    $$('.ggrid .gitem').forEach(function(it){var show=f==='all'||it.dataset.campus===f;it.classList.toggle('hide',!show);if(show){it.classList.add('in')}})})});
  if('IntersectionObserver' in window){var vio=new IntersectionObserver(function(es){es.forEach(function(en){var v=en.target;if(en.isIntersecting){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()})},{threshold:.35});$$('.gvid video').forEach(function(v){vio.observe(v)})}
  var lb=$('#lb'), lbImg=$('#lbImg'), lbCap=$('#lbCap');
  $$('.gitem').forEach(function(g){if(!$('img',g))return;g.addEventListener('click',function(){
    lbImg.src=$('img',g).src; lbImg.alt=$('img',g).alt; lbCap.textContent=g.dataset.cap||''; lb.classList.add('on');
  })});
  function closeLb(){lb.classList.remove('on')}
  $('#lbClose').addEventListener('click',closeLb);
  lb.addEventListener('click',function(e){if(e.target===lb)closeLb()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeLb();$('#waPop').classList.remove('on')}});

  var waBtn=$('#waBtn'), waPop=$('#waPop');
  waBtn.addEventListener('click',function(){var o=waPop.classList.toggle('on');waBtn.setAttribute('aria-expanded',o)});

  var form=$('#enquiry'), done=$('#formDone');
  if(form){
  var C={g:{name:'Vivek Model Sr. Sec. School, Maruti Kunj (Gurugram)',wa:'919811197509'},s:{name:'Vivek Model School, Sohna',wa:'919811197029'}};
  function setBad(el,bad,msg){var f=el.closest('.field');f.classList.toggle('bad',bad);if(msg)$('.err',f).textContent=msg}
  $$('input,select,textarea',form).forEach(function(el){el.addEventListener('input',function(){setBad(el,false)});el.addEventListener('change',function(){setBad(el,false)})});
  var cls=$('#f-class');
  function branchVal(){var r=$('input[name=branch]:checked',form);return r?r.value:''}
  $$('input[name=branch]',form).forEach(function(r){r.addEventListener('change',function(){
    var sohna=r.value==='s';
    $$('option[data-g]',cls).forEach(function(o){o.disabled=sohna;o.hidden=sohna});
    if(sohna&&/Class 1[12]/.test(cls.value)){cls.value=''}
  })});
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var br=branchVal(),st=$('#f-student'),pa=$('#f-parent'),ph=$('#f-phone'),ok=true;
    if(!br){setBad($('input[name=branch]',form),true);ok=false}
    if(!st.value.trim()){setBad(st,true);ok=false}
    if(!pa.value.trim()){setBad(pa,true);ok=false}
    var digits=ph.value.replace(/\D/g,'').replace(/^(91|0)(?=\d{10}$)/,'');
    if(!/^[6-9]\d{9}$/.test(digits)){setBad(ph,true);ok=false}
    if(!cls.value){setBad(cls,true);ok=false}
    if(!ok){var first=$('.field.bad input:not([type=radio]),.field.bad select',form);if(first)first.focus();else $('#branch-field').scrollIntoView({behavior:'smooth',block:'center'});return}
    var c=C[br];
    var lines=['*New Admission Enquiry*','Branch: '+c.name,'','Student name: '+st.value.trim(),'Parent name: '+pa.value.trim(),'Mobile: +91 '+digits,'Class: '+cls.value];
    var m=$('#f-msg').value.trim(); if(m) lines.push('Message: '+m);
    lines.push('','(Sent from vivekmodelsrsecschool.in)');
    var url='https://wa.me/'+c.wa+'?text='+encodeURIComponent(lines.join('\n'));
    $('#doneWa').href=url;
    $('#doneText').innerHTML='WhatsApp is opening with your enquiry for <b>'+c.name+'</b>. Please tap <b>Send</b> in WhatsApp – our team will call you back soon.';
    var w=null; try{w=window.open(url,'_blank')}catch(err){}
    if(w){try{w.opener=null}catch(err){}}else{window.location.href=url;return}
    form.hidden=true; done.hidden=false; done.scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('#doneNew').addEventListener('click',function(){form.reset();$$('option[data-g]',cls).forEach(function(o){o.disabled=false;o.hidden=false});done.hidden=true;form.hidden=false});
  }

  var nav=$('.nav'),tick=false; window.addEventListener('scroll',function(){if(tick)return;tick=true;requestAnimationFrame(function(){nav.classList.toggle('scrolled',window.scrollY>10);tick=false})},{passive:true});
  function countUp(el){var to=el.dataset.to==='years'?IST().y-1983:+el.dataset.to;if(el.dataset.plain!==undefined){var from=to-43;}else{var from=0}var t0=null;
    function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/1400),e=1-Math.pow(1-p,3);var v=Math.round(from+(to-from)*e);el.textContent=el.dataset.fmt!==undefined?v.toLocaleString('en-IN'):v;if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)}
  $$('.count[data-to=years]').forEach(function(el){el.textContent=IST().y-1983});
  if('IntersectionObserver' in window){
    var co=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){countUp(en.target);co.unobserve(en.target)}})},{threshold:.6});
    $$('.count').forEach(function(el){co.observe(el)})
  }

  /* ---- live features ---- */
  function IST(){var d=new Date(Date.now()+(330+new Date().getTimezoneOffset())*60000);return {d:d,y:d.getFullYear(),day:d.getDay(),h:d.getHours(),m:d.getMinutes(),s:d.getSeconds()}}
  var lsEl=$('#liveStatus'),lsText=$('#lsText'),lsTime=$('#lsTime');
  var cd={D:$('#cdD'),H:$('#cdH'),M:$('#cdM'),S:$('#cdS')};
  var SESSION=Date.UTC(2027,3,1,2,30,0); /* 1 Apr 2027, 8:00 AM IST */
  function pad(n,l){n=String(n);while(n.length<(l||2))n='0'+n;return n}
  function tickLive(){
    var t=IST(),mins=t.h*60+t.m,work=t.day>=1&&t.day<=6;
    if(lsEl){
      var cls='',txt;
      if(work&&mins>=480&&mins<720){cls='open';txt='School & admission office open now'}
      else if(work&&mins>=720&&mins<840){cls='open';txt='School open now · office hours 8 AM–12 PM'}
      else{txt=work&&mins<480?'Opens today at 8:00 AM':(t.day===6||t.day===0?'Closed · opens Monday 8:00 AM':'Closed · opens tomorrow 8:00 AM');if(t.day===6&&mins<480)txt='Opens today at 8:00 AM'}
      lsEl.className='live-status '+cls; lsText.textContent=txt;
    }
    if(cd.D){var diff=Math.max(0,SESSION-Date.now()),s=Math.floor(diff/1000);
      cd.D.textContent=pad(Math.floor(s/86400),3);cd.H.textContent=pad(Math.floor(s%86400/3600));cd.M.textContent=pad(Math.floor(s%3600/60));cd.S.textContent=pad(s%60)}
  }
  tickLive(); setInterval(tickLive,1000);

  /* scroll progress, back-to-top, scrollspy (rAF-throttled, transform only) */
  var sp=$('#sprog'),tt=$('#toTop'),ring=$('#toTopRing'),busy=false;
  var spyLinks=$$('.menu > a[href^="#"]:not(.btn)'),spySecs=spyLinks.map(function(a){return $(a.getAttribute('href'))});
  function onScroll(){busy=false;var h=document.documentElement,max=h.scrollHeight-h.clientHeight,p=max>0?h.scrollTop/max:0;
    if(sp)sp.style.transform='scaleX('+p+')';
    if(tt){tt.classList.toggle('on',h.scrollTop>600);ring.style.strokeDashoffset=132-132*p}
    var cur=null;spySecs.forEach(function(sec,i){if(sec&&sec.getBoundingClientRect().top<140)cur=i});
    spyLinks.forEach(function(a,i){a.classList.toggle('active',i===cur)});}
  window.addEventListener('scroll',function(){if(!busy){busy=true;requestAnimationFrame(onScroll)}},{passive:true}); onScroll();
  if(tt) tt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});

  /* desktop-only: tilt, spotlight, hero parallax, staggered reveals */
  var fine=window.matchMedia('(hover:hover) and (pointer:fine) and (min-width:881px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(fine){
    $$('.why-card,.lcard,.campus,.stage,.gmcard,.fac,.stream').forEach(function(c){c.classList.add('tilt');
      c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
        var k=c.classList.contains('gmcard')||c.classList.contains('campus')?3:6;
        c.style.transform='perspective(900px) rotateX('+((.5-y)*k)+'deg) rotateY('+((x-.5)*k)+'deg) translateY(-4px)';
        c.style.setProperty('--mx',(x*100)+'%');c.style.setProperty('--my',(y*100)+'%')});
      c.addEventListener('mouseleave',function(){c.style.transform=''})});
    var hero=$('.hero'),col=$('.collage');
    if(hero&&col) hero.addEventListener('mousemove',function(e){var r=hero.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;col.style.transform='translate3d('+(x*-14)+'px,'+(y*-10)+'px,0)'});
  }

  /* ---- scroll motion: tag elements, stagger groups, reveal on view ---- */
  function tag(sel,cls){$$(sel).forEach(function(el){if(!el.closest('.hero'))el.classList.add('reveal');if(cls)el.classList.add(cls)})}
  tag('.sec-head');tag('.why-card');tag('.stage');tag('.fac','rv-zoom');tag('.gitem','rv-zoom');tag('.reel','rv-zoom');
  tag('.steps li');tag('.docs');tag('.vm div');tag('.gm-list li');tag('.vc');tag('.journey div');tag('.ccard');tag('.hours div');
  tag('.about-img','rv-left');tag('.campus');tag('.lcard');tag('.founder','rv-zoom');tag('.gm-main','rv-left');tag('.gm-side','rv-right');tag('.form-wrap','rv-right');tag('.cd-card','rv-zoom');tag('.ft-top > div');
  var groups='.sgrid,.why-grid,.stages,.lgrid,.cgrid,.rgrid,.ggrid,.fgrid,.steps,.vm,.gm-list,.ventures,.journey,.hours,.ft-top,.curr';
  function stagger(){ $$(groups).forEach(function(g){var i=0;Array.prototype.forEach.call(g.children,function(el){if(el.classList.contains('reveal')){el.style.transitionDelay=Math.min(i*80,560)+'ms';i++}})}) }
  stagger();
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io=('IntersectionObserver' in window && !reduce)?new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){var el=en.target;el.classList.add('in');io.unobserve(el);setTimeout(function(){el.classList.add('done');el.style.transitionDelay=''},1600)}})},{threshold:.12,rootMargin:'0px 0px -8% 0px'}):null;
  window.__reveal=function(root){$$('.reveal:not(.in)',root||document).forEach(function(el){io?io.observe(el):el.classList.add('in')})};
  window.__reveal();
  /* images fade in once loaded (no pop) */
  $$('img').forEach(function(im){if(im.closest('.dd-menu')||im.id==='lbImg')return;if(im.complete&&im.naturalWidth){return}im.classList.add('fade');im.addEventListener('load',function(){im.classList.add('ok')},{once:true});im.addEventListener('error',function(){im.classList.add('ok')},{once:true})});

})();
