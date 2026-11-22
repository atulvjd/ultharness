import path from 'node:path';
const args=process.argv.slice(2),references=[];
let aim='',folder='',base=process.env.ULTHARNESS_URL||'http://127.0.0.1:4310',route='direct',model='',maxRepairs,runPolicy='persistent',maxMinutes=720;
try {
 for(let i=0;i<args.length;i++){
  const value=args[i];
  if(value==='--ref')references.push(args[++i]);
  else if(value==='--project')folder=args[++i];
  else if(value==='--server')base=args[++i];
  else if(value==='--route')route=args[++i];
  else if(value==='--model')model=args[++i];
  else if(value==='--bounded')runPolicy='bounded';
  else if(value==='--minutes')maxMinutes=Number(args[++i]);
  else if(value==='--repairs')maxRepairs=Number(args[++i]);
  else if(value.startsWith('--'))throw Error(`Unknown option: ${value}`);
  else aim+=(aim?' ':'')+value;
 }
 if(!aim)throw Error('Usage: npm run aim -- "Your aim" [--project /path] [--ref URL-or-relative-file] [--repairs 3] [--server http://127.0.0.1:4310]');
 const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password)throw Error('Use a local Ultharness HTTP server');base=url.origin;
 const request=async(endpoint,body)=>{const response=await fetch(base+'/api/'+endpoint,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
 const state=await request('state');let project=folder?state.projects.find(p=>p.path===path.resolve(folder)):state.projects.find(p=>p.available);
 if(!project&&folder)project=await request('projects',{name:path.basename(path.resolve(folder)),path:path.resolve(folder)});
 if(!project)throw Error('Connect a project folder first or pass --project /path');
 const delivery=await request('missions',{aim,references,projectId:project.id,route,model,maxRepairs,runPolicy,maxMinutes});
 console.log(`Started: ${delivery.title}\nWatch: ${base}/#live\nCtrl+C stops this cycle.`);
 let stopping=false;process.once('SIGINT',async()=>{stopping=true;try{await request(`deliveries/${delivery.id}/pause`,{});}catch{}process.exit(130);});
 const seen=new Map();
 while(!stopping){
  const snapshot=await request('state'),d=snapshot.deliveries.find(item=>item.id===delivery.id);
  if(!d)throw Error('Mission is no longer available');
  for(const id of d.taskIds){const task=snapshot.tasks.find(t=>t.id===id);if(!seen.has(id))console.log(`\n→ ${task.title}`);const start=seen.get(id)||0;for(const entry of task.logs.slice(start))console.log(entry.text);seen.set(id,task.logs.length);}
  if(['awaiting_acceptance','accepted','blocked','paused'].includes(d.status)){console.log(`\n${d.status==='awaiting_acceptance'?'Checks and review passed. Ready for your acceptance.':d.error||d.status}`);if(d.status==='blocked')process.exitCode=1;break;}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
}catch(error){console.error(error.cause?.code==='ECONNREFUSED'?'Start Ultharness first with npm start, or use --server for the desktop app’s local URL.':error.message);process.exitCode=1;}
