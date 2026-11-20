const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const menu = $('.menu-button');
function closeMenu(returnFocus = false) {
  if (!menu) return;
  menu.setAttribute('aria-expanded','false'); menu.setAttribute('aria-label','Open navigation'); $('#site-nav').classList.remove('is-open');
  if (returnFocus) menu.focus();
}
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); $('#site-nav').classList.toggle('is-open',open);
});
$$('#site-nav a').forEach(link => link.addEventListener('click',()=>closeMenu()));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu?.getAttribute('aria-expanded')==='true')closeMenu(true);});
document.addEventListener('click',event=>{if(!event.target.closest('.nav-wrap'))closeMenu();});
window.matchMedia('(min-width:721px)').addEventListener('change',()=>closeMenu());

const captions = {
  overview: 'The full picture: projects, agents, activity, and your next decision.',
  deliveries: 'One brief, recorded checks, clear criteria, and a history you can inspect.',
  connections: 'Bring in project references and selected tools. Keep their scope visible.'
};
function selectScreen(button, focus = false) {
  $$('.screen-tabs [role="tab"]').forEach(tab=>{const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
  $$('.product-screen').forEach(panel=>panel.hidden=panel.id!==button.getAttribute('aria-controls'));
  $('.screen-note').textContent=captions[button.dataset.screen];
  $('.screen-viewport').scrollTop=0; $('.screen-viewport').scrollLeft=0;
  if(focus)button.focus();
}
$$('.screen-tabs [role="tab"]').forEach(tab=>tab.addEventListener('click',()=>selectScreen(tab)));
$('.screen-tabs')?.addEventListener('keydown',event=>{
  const tabs=$$('.screen-tabs [role="tab"]'),index=tabs.indexOf(document.activeElement);
  if(index<0)return;
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next!==null){event.preventDefault();selectScreen(tabs[next],true);}
});

const heading = (symbol,kicker,title) => `<div class="demo-heading"><span class="demo-icon">${icon(symbol)}</span><div><span class="micro">${kicker}</span><h3>${title}</h3></div></div>`;
const footer = text => `<div class="demo-footer"><span class="status-light"></span>${text}</div>`;
const stages = [
  {
    label:'step-brief',
    content:heading('file','THE CLIENT BRIEF','Good context is a head start.')+'<p class="demo-description">A studio website with Home, Work, About, and Contact. Warm neutrals. Clear navigation. A contact flow that works on mobile.</p><div class="brief-lines"><div><span>AC–01</span><p>Every page is reachable from navigation.</p></div><div><span>AC–02</span><p>No overflow at mobile and desktop sizes.</p></div><div><span>AC–03</span><p>Contact fields have accessible labels.</p></div></div>'+footer('Requirements travel with the work.')
  },
  {
    label:'step-build',
    content:heading('code','YOUR BUILDER','One task. The full context.')+'<p class="demo-description">The selected agent receives the brief, acceptance criteria, approved tools, and project folder. It inspects the workspace and implements the goal.</p><div class="brief-lines"><div><span>AGENT</span><p>Codex · project edit mode</p></div><div><span>ROUTE</span><p>Your CLI account or selected OmniRoute model</p></div><div><span>SCOPE</span><p>Build, check, and review · up to 2 repairs</p></div></div>'+footer('The cycle starts after you approve its scope.')
  },
  {
    label:'step-check',
    content:heading('terminal','RECORDED VERIFICATION','A claim is a start. Evidence is better.')+'<p class="demo-description">The check runner executes the configured project scripts and records their output and exit codes. Required files are checked too.</p><pre class="demo-terminal"><span>$ npm run build</span>\n<span class="terminal-pass">✓ Production build completed</span>\n<span>exit code: 0</span>\n\n<span>$ npm run test</span>\n<span class="terminal-pass">✓ Navigation and form tests passed</span>\n<span>exit code: 0</span></pre>'+footer('Example output. Your own checks define the evidence.')
  },
  {
    label:'step-review',
    content:heading('repeat','SEPARATE REVIEW','A fresh look. The same standards.')+'<p class="demo-description">A separate review session assesses each acceptance criterion. In this example, one missing requirement sends the work back for a repair.</p><div class="brief-lines"><div>'+icon('check')+'<p>AC–01 · Navigation reaches every page.</p></div><div>'+icon('check')+'<p>AC–02 · Mobile layout has no overflow.</p></div><div class="review-fail"><span>FIX</span><p>AC–03 · Contact email field is missing its label.</p></div></div>'+footer('Reject → repair → repeat checks and review.')
  },
  {
    label:'step-accept',
    content:heading('shield','YOUR FINAL REVIEW','Passing work comes back to you.')+'<p class="demo-description">Once the checks and review pass, inspect the result and its evidence. Accept the delivery, or request changes and approve another cycle.</p><div class="demo-acceptance"><span>'+icon('shield')+'</span><div class="micro">READY FOR YOUR REVIEW</div><p>Your brief. Your standards.<br>Your final decision.</p><small>Publishing stays a separate action.</small></div>'+footer('A clear finish line, with you at the finish.')
  }
];
let currentStage=0;
function selectStage(index,focus=false) {
  currentStage=index; const stage=stages[index];
  $$('.workflow-step').forEach((tab,i)=>{tab.classList.toggle('active',i===index);tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
  $('#workflow-detail').setAttribute('aria-labelledby',stage.label); $('#demo-content').innerHTML=stage.content; $('#demo-current').textContent=String(index+1).padStart(2,'0');
  $('#next-step').innerHTML=(index===4?'Back to the brief':'Next stage')+icon('arrow');
  if(focus)$(`#${stage.label}`).focus();
}
$$('.workflow-step').forEach(tab=>tab.addEventListener('click',()=>selectStage(Number(tab.dataset.step))));
$('#next-step')?.addEventListener('click',()=>selectStage((currentStage+1)%stages.length));
$('.workflow-steps')?.addEventListener('keydown',event=>{
  const tabs=$$('.workflow-step'),index=tabs.indexOf(document.activeElement);if(index<0)return;
  const next=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index-1+tabs.length)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next!==null){event.preventDefault();selectStage(next,true);}
});
