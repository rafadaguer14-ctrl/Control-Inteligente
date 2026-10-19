(function(root){
'use strict';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function metrics(rows,duration){
 if(rows.length<10)throw Error('Ensayo incompleto: faltan muestras.');
 const ref=rows[0].Ref, gains=['Kp','Ki','Kd'];
 if(!(ref>0&&ref<=200&&duration>=5))throw Error('Referencia o duración inválida.');
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(!['t','Ref','RPM','Kp','Ki','Kd','PWM','Pert'].every(k=>Number.isFinite(r[k]))||r.RPM<0||r.PWM<0||r.PWM>255||r.Estado!=='ACTIVO'||r.Pert!==0||r.PotOn==='1'||r.Ref!==ref||gains.some(k=>r[k]!==rows[0][k]))throw Error('Datos inválidos, perturbación o parámetros cambiaron durante la prueba.');
  if(i&&(r.t<=rows[i-1].t||r.t-rows[i-1].t>1))throw Error('Hay una interrupción en las mediciones.');
 }
 if(rows[0].t<0||rows[0].t>1||rows.at(-1).t<duration-.5||rows.at(-1).t>duration+1)throw Error('Duración insuficiente o reloj inválido.');
 let area=0;for(let i=1;i<rows.length;i++)area+=(Math.abs(ref-rows[i-1].RPM)+Math.abs(ref-rows[i].RPM))*.5*(rows[i].t-rows[i-1].t);
 const mae=area/(rows.at(-1).t-rows[0].t), overshoot=Math.max(0,...rows.map(r=>(r.RPM-ref)/ref*100)),band=Math.max(2,.05*ref);
 let lastOutside=-1;rows.forEach((r,i)=>{if(Math.abs(r.RPM-ref)>band)lastOutside=i;});
 const first=rows[lastOutside+1],settled=!!first&&rows.at(-1).t-first.t>=2,ts=settled?first.t:null;
 const cost=.5*mae/ref+.25*overshoot/100+.25*(settled?ts/duration:1)+(!settled?.25:0);
 return {mae,overshoot,ts,settled,band,cost};
}
function validateTrial(t){
 if(!t||!Array.isArray(t.rows)||t.rows.length>5000||!Number.isFinite(t.duration)||t.duration<5||t.duration>120)throw Error('Formato de ensayo inválido.');
 const m=metrics(t.rows,t.duration),r=t.rows[0];
 if(r.Kp<0||r.Kp>10||r.Ki<0||r.Ki>2||r.Kd<0||r.Kd>2)throw Error('Ganancias fuera de los límites de la interfaz.');
 return {id:String(t.id||Date.now()),label:String(t.label||'Importado').slice(0,80),duration:t.duration,rows:t.rows,metrics:m,x:[r.Ref,r.Kp,r.Ki,r.Kd]};
}
function rng(seed=42){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
class Model{
 constructor(trials){
  if(trials.length<15)throw Error('Registra al menos 15 ensayos válidos antes de entrenar.');
  if(new Set(trials.map(t=>t.duration)).size!==1)throw Error('Utiliza la misma duración en todos los ensayos.');
  const groups=new Map();trials.forEach(t=>{let k=t.x.join(',');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);});
  if(groups.size<10)throw Error('Se requieren al menos 10 configuraciones distintas; las repeticiones se mantienen juntas.');
  const random=rng(), keys=[...groups.keys()];for(let i=keys.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]];}
  const n=Math.max(2,Math.round(keys.length*.2));this.test=keys.slice(0,n).flatMap(k=>groups.get(k));this.train=keys.slice(n).flatMap(k=>groups.get(k));
  this.lo=[0,1,2,3].map(i=>Math.min(...this.train.map(t=>t.x[i])));this.hi=[0,1,2,3].map(i=>Math.max(...this.train.map(t=>t.x[i])));
  if(this.lo.some((v,i)=>v===this.hi[i]))throw Error('Falta variar la referencia o alguna ganancia en los datos de entrenamiento.');
  this.w=Array.from({length:8},()=>Array.from({length:4},()=> (random()-.5)*.7));this.b=Array(8).fill(0);this.v=Array.from({length:8},()=> (random()-.5)*.7);this.c=mean(this.train.map(t=>Math.log1p(t.metrics.cost)));this.epoch=0;
 }
 forward(x){const z=x.map((v,i)=>2*(v-this.lo[i])/(this.hi[i]-this.lo[i])-1),h=this.w.map((w,j)=>Math.tanh(w.reduce((s,v,i)=>s+v*z[i],this.b[j]))),y=this.v.reduce((s,v,j)=>s+v*h[j],this.c);return {z,h,y};}
 predict(x){return Math.max(0,Math.expm1(this.forward(x).y));}
 step(rate=.02){
  let gw=this.w.map(w=>w.map(()=>0)),gb=this.b.map(()=>0),gv=this.v.map(()=>0),gc=0;
  for(const t of this.train){const {z,h,y}=this.forward(t.x),d=2*(y-Math.log1p(t.metrics.cost))/this.train.length;gc+=d;for(let j=0;j<8;j++){gv[j]+=d*h[j];const q=d*this.v[j]*(1-h[j]*h[j]);gb[j]+=q;for(let i=0;i<4;i++)gw[j][i]+=q*z[i];}}
  for(let j=0;j<8;j++){for(let i=0;i<4;i++)this.w[j][i]-=rate*gw[j][i];this.b[j]-=rate*gb[j];this.v[j]-=rate*gv[j];}this.c-=rate*gc;this.epoch++;
 }
 score(data){const errors=data.map(t=>this.predict(t.x)-t.metrics.cost),mae=mean(errors.map(Math.abs)),mse=mean(errors.map(x=>x*x)),avg=mean(data.map(t=>t.metrics.cost)),den=data.reduce((s,t)=>s+(t.metrics.cost-avg)**2,0);return {mae,rmse:Math.sqrt(mse),r2:den?1:undefined,...(den?{r2:1-errors.reduce((s,e)=>s+e*e,0)/den}:{})};}
 search(ref,bounds){
  if(!Number.isFinite(ref)||!Number.isInteger(ref)||ref<this.lo[0]||ref>this.hi[0])throw Error('Referencia fuera del intervalo observado en entrenamiento.');
  bounds.forEach(([lo,hi],i)=>{if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi||lo<this.lo[i+1]||hi>this.hi[i+1])throw Error('Los rangos deben estar dentro de los datos de entrenamiento.');});
  const random=rng(83);let best=null;for(let n=0;n<4000;n++){const x=[ref,...bounds.map(([lo,hi])=>Math.round((lo+random()*(hi-lo))*1000)/1000)];if(x.slice(1).some((v,i)=>v<bounds[i][0]||v>bounds[i][1]))continue;const cost=this.predict(x);if(!best||cost<best.cost)best={x,cost};}
  if(!best)throw Error('No hay candidatos en estos intervalos.');return best;
 }
}
root.PIDLearning={metrics,validateTrial,Model};if(typeof module!=='undefined')module.exports=root.PIDLearning;
})(typeof window!=='undefined'?window:globalThis);
