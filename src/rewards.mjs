const dayKey=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export function localRewards(reports,now=Date.now()) {
  const days={};let total=0,sessions=0;
  for(const r of reports.filter(r=>['completed','interrupted'].includes(r.status))) {
    let active=0;
    for(const s of r.timeline) {
      if(s.state==='paused')continue;
      let at=Date.parse(s.startedAt),remaining=s.durationMs;
      if(!Number.isFinite(at)||!Number.isFinite(remaining)||remaining<=0)continue;
      active+=remaining;
      while(remaining>0){const key=dayKey(at);const midnight=Date.parse(key+'T00:00:00+07:00')+86400000;const part=Math.min(remaining,midnight-at);if(part<=0)break;days[key]=(days[key]||0)+part;remaining-=part;at+=part;}
    }
    total+=active;if(active>=60000)sessions++;
  }
  const xp=Object.values(days).reduce((sum,ms)=>sum+Math.min(180,Math.floor(ms/60000)),0);
  const today=dayKey(now);let cursor=Date.parse(today+'T00:00:00+07:00');
  if((days[today]||0)<600000)cursor-=86400000;
  let streak=0;while((days[dayKey(cursor)]||0)>=600000){streak++;cursor-=86400000;}
  let best=0,run=0,previous=null;
  for(const day of Object.keys(days).sort()){
    const at=Date.parse(day+'T00:00:00+07:00');
    if(days[day]>=600000){run=previous===at-86400000?run+1:1;best=Math.max(best,run);previous=at;}else{run=0;previous=null;}
  }
  return {xp,level:1+Math.floor(xp/120),levelProgress:xp%120,streak,sessions,activeMinutes:Math.floor(total/60000),todayMinutes:Math.floor((days[today]||0)/60000),badges:[
    {name:'First steps',description:'Save a session of at least 1 minute',earned:sessions>=1},
    {name:'One hour in',description:'Record 60 study minutes',earned:total>=3600000},
    {name:'Steady rhythm',description:'Reach a 3-day streak',earned:best>=3},
    {name:'Study regular',description:'Complete 10 study sessions',earned:sessions>=10}]};
}
