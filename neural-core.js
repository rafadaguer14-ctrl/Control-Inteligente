/* Educational dense network: two inputs, sigmoid output, mean binary cross entropy. */
(function(root){
'use strict';
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const acts={tanh:Math.tanh,sigmoid,relu:x=>Math.max(0,x),linear:x=>x};
const derivative=(name,z,a)=>name==='tanh'?1-a*a:name==='sigmoid'?a*(1-a):name==='relu'?(z>0?1:0):1;
function random(seed=42){let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
class Network{
 constructor(hidden=[{n:4,activation:'tanh'}],seed=42){
  if(hidden.length>4||hidden.some(l=>!Number.isInteger(l.n)||l.n<1||l.n>8||!acts[l.activation]))throw Error('Máximo 4 capas ocultas, de 1 a 8 neuronas.');
  const rng=random(seed);let size=2;this.layers=[...hidden,{n:1,activation:'sigmoid'}].map(({n,activation},l)=>{const limit=Math.sqrt(6/(size+n));const layer={activation,w:Array.from({length:n},()=>Array.from({length:size},()=> (rng()*2-1)*limit)),b:Array(n).fill(0)};size=n;return layer;});
 }
 clone(){const n=Object.create(Network.prototype);n.layers=JSON.parse(JSON.stringify(this.layers));return n;}
 forward(x,ablate=null){const a=[x],z=[];this.layers.forEach((layer,l)=>{z[l]=layer.w.map((w,j)=>w.reduce((v,b,k)=>v+b*a[l][k],layer.b[j]));a[l+1]=z[l].map((v,j)=>ablate&&ablate.l===l&&ablate.j===j?0:acts[layer.activation](v));});return {a,z,p:a.at(-1)[0]};}
 parameters(){const p=[];this.layers.forEach((layer,l)=>layer.w.forEach((w,j)=>{w.forEach((_,k)=>p.push({l,j,k,label:`${l===this.layers.length-1?'Salida':'C'+(l+1)} · N${j+1} · peso ${k+1}`}));p.push({l,j,k:-1,label:`${l===this.layers.length-1?'Salida':'C'+(l+1)} · N${j+1} · bias`});}));return p;}
 get(p){return p.k<0?this.layers[p.l].b[p.j]:this.layers[p.l].w[p.j][p.k];}
 set(p,v){if(!Number.isFinite(v))throw Error('Parámetro no finito.');if(p.k<0)this.layers[p.l].b[p.j]=v;else this.layers[p.l].w[p.j][p.k]=v;}
 loss(data){return data.reduce((s,d)=>{const z=this.forward(d.x).z.at(-1)[0];return s+Math.max(z,0)-z*d.y+Math.log1p(Math.exp(-Math.abs(z)));},0)/data.length;}
 accuracy(data){return data.reduce((s,d)=>s+((this.forward(d.x).p>=.5?1:0)===d.y),0)/data.length;}
 gradients(data){const g=this.layers.map(l=>({w:l.w.map(w=>w.map(()=>0)),b:l.b.map(()=>0)}));
  for(const d of data){const f=this.forward(d.x);let delta=[f.p-d.y];for(let l=this.layers.length-1;l>=0;l--){const layer=this.layers[l];for(let j=0;j<delta.length;j++){g[l].b[j]+=delta[j]/data.length;for(let k=0;k<layer.w[j].length;k++)g[l].w[j][k]+=delta[j]*f.a[l][k]/data.length;}if(l>0)delta=f.a[l].map((a,k)=>layer.w.reduce((s,w,j)=>s+w[k]*delta[j],0)*derivative(this.layers[l-1].activation,f.z[l-1][k],a));}}
  return g;
 }
 step(data,rate,only=null){const g=this.gradients(data),params=only||this.parameters();const values=params.map(p=>this.get(p)-rate*(p.k<0?g[p.l].b[p.j]:g[p.l].w[p.j][p.k]));if(values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw Error('Entrenamiento divergente: reduce la tasa y reinicia.');params.forEach((p,i)=>this.set(p,values[i]));}
}
function dataset(kind,seed=42){
 if(['and','or','xor'].includes(kind))return [[0,0],[0,1],[1,0],[1,1]].map(x=>({x,y:kind==='and'?(x[0]&x[1]):kind==='or'?(x[0]|x[1]):(x[0]^x[1])}));
 const r=random(seed),d=[];for(let i=0;i<240;i++){let x,y;if(kind==='circle'){y=i%2;const angle=r()*2*Math.PI,rad=y?.65+r()*.3:Math.sqrt(r())*.4;x=[rad*Math.cos(angle),rad*Math.sin(angle)];}else{x=[r()*2-1,r()*2-1];y=x[0]+.65*x[1]>.05?1:0;}d.push({x,y});}return d;
}
function split(data,seed=42){const groups=[data.filter(d=>d.y===0),data.filter(d=>d.y===1)];if(groups.some(g=>g.length<5))return {train:data.slice(),test:[]};const r=random(seed),train=[],test=[];for(const group of groups){const a=group.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}const n=Math.max(1,Math.round(a.length*.2));test.push(...a.slice(0,n));train.push(...a.slice(n));}return {train,test};}
function parse(text){const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());if(lines[0]&&/^x1\s*[,;\t]/i.test(lines[0]))lines.shift();if(lines.length<4||lines.length>500)throw Error('Introduce entre 4 y 500 filas x1,x2,clase.');const d=lines.map((line,i)=>{const a=line.trim().split(/[,;\t]/);if(a.length!==3||a.some(s=>!s.trim()))throw Error('Fila '+(i+1)+': se esperan tres valores.');const v=a.map(Number);if(v.some(n=>!Number.isFinite(n))||Math.abs(v[0])>10||Math.abs(v[1])>10||![0,1].includes(v[2]))throw Error('Fila '+(i+1)+': entradas entre −10 y 10, clase 0 o 1; usa punto decimal.');return {x:v.slice(0,2),y:v[2]};});if(new Set(d.map(r=>r.y)).size!==2)throw Error('Incluye ejemplos de ambas clases.');return d;}
const api={Network,dataset,split,parse,random};if(typeof module!=='undefined')module.exports=api;else root.NeuralLab=api;
})(globalThis);
