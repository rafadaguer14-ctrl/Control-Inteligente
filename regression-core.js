(function(root){
'use strict';
const sum=a=>a.reduce((s,x)=>s+x,0),dot=(a,b)=>sum(a.map((x,i)=>x*b[i]));
function parseCSV(text,delimiter='auto'){
 text=text.replace(/^\uFEFF/,'');
 if(delimiter==='auto'){
  let quoted=false,counts={',':0,';':0,'\t':0};
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted){if(c==='\n'||c==='\r')break;if(c in counts)counts[c]++;}}
  delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
 }
 const records=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<=text.length;i++){
  const c=i===text.length?'\n':text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{if(i===text.length)throw Error('Hay una comilla sin cerrar en el CSV.');field+=c;}continue;}
  if(c==='"'){if(field.trim()||closed)throw Error('Comillas inesperadas en el CSV.');quoted=true;field='';}
  else if(c===delimiter||c==='\r'||c==='\n'){
   row.push(field.trim());field='';closed=false;
   if(c!==delimiter){if(row.some(x=>x!==''))records.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
  }else{if(closed&&!/\s/.test(c))throw Error('Texto inesperado después de cerrar comillas.');field+=c;}
 }
 if(records.length<2)throw Error('El archivo necesita encabezados y al menos una fila de datos.');
 const headers=records.shift();
 if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw Error('Los encabezados deben ser únicos y no estar vacíos.');
 if(headers.length>60||records.length>20000)throw Error('Límite: 60 columnas y 20 000 filas.');
 records.forEach((r,i)=>{if(r.length!==headers.length)throw Error(`La fila ${i+2} tiene ${r.length} columnas; se esperaban ${headers.length}. Revisa el separador.`);});
 return {headers,rows:records,delimiter};
}
function numeric(s,decimalComma=false){
 if(typeof s==='number')return Number.isFinite(s)?s:null;
 s=String(s).trim();if(decimalComma)s=s.replace(',','.');
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s))return null;
 const x=Number(s);return Number.isFinite(x)?x:null;
}
function metrics(y,p){
 const mean=sum(y)/y.length,e=y.map((x,i)=>x-p[i]),sse=dot(e,e),sst=sum(y.map(x=>(x-mean)**2));
 return {mae:sum(e.map(Math.abs))/y.length,mse:sse/y.length,rmse:Math.sqrt(sse/y.length),r2:sst>1e-20?1-sse/sst:null};
}
function split(n,fraction=.2,seed=42){
 const ids=Array.from({length:n},(_,i)=>i);let s=seed>>>0;
 for(let i=n-1;i>0;i--){s=(Math.imul(1664525,s)+1013904223)>>>0;const j=Math.floor(s/4294967296*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
 const k=Math.max(2,Math.round(n*fraction));return {train:ids.slice(k),test:ids.slice(0,k)};
}
function fit(X,y){
 const n=X.length,p=X[0].length,m=p+1;
 if(n<=m)throw Error(`Se necesitan más de ${m} filas de entrenamiento para ${p} entradas.`);
 const means=Array.from({length:p},(_,j)=>sum(X.map(r=>r[j]))/n);
 const scales=means.map((mu,j)=>Math.sqrt(sum(X.map(r=>(r[j]-mu)**2))/n));
 if(scales.some(x=>!Number.isFinite(x)||x<1e-12))throw Error('Hay una entrada constante o de escala demasiado pequeña en entrenamiento. Retírala.');
 const columns=[Array(n).fill(1),...means.map((mu,j)=>X.map(r=>(r[j]-mu)/scales[j]))];
 const Q=[],R=Array.from({length:m},()=>Array(m).fill(0));
 // Reorthogonalized modified Gram-Schmidt QR. No normal-equation inversion.
 for(let j=0;j<m;j++){
  const v=columns[j].slice();
  for(let pass=0;pass<2;pass++)for(let k=0;k<j;k++){const a=dot(Q[k],v);R[k][j]+=a;for(let i=0;i<n;i++)v[i]-=a*Q[k][i];}
  R[j][j]=Math.sqrt(dot(v,v));
  if(R[j][j]<1e-7*Math.sqrt(n))throw Error('Las entradas son redundantes o casi colineales. Retira una de las variables relacionadas.');
  Q.push(v.map(x=>x/R[j][j]));
 }
 const rhs=Q.map(q=>dot(q,y)),beta=Array(m).fill(0);
 for(let j=m-1;j>=0;j--)beta[j]=(rhs[j]-sum(beta.slice(j+1).map((b,k)=>R[j][j+1+k]*b)))/R[j][j];
 const coefficients=beta.slice(1).map((b,j)=>b/scales[j]);const intercept=beta[0]-dot(coefficients,means);
 const predict=x=>beta[0]+sum(x.map((v,j)=>beta[j+1]*(v-means[j])/scales[j]));
 const residual=y.map((v,i)=>v-predict(X[i])),df=n-m,sigma2=dot(residual,residual)/df;
 if(!Number.isFinite(sigma2)||!Number.isFinite(intercept)||coefficients.some(x=>!Number.isFinite(x)))throw Error('Escala numérica no válida. Revisa la magnitud de los datos.');
 const ranges=means.map((_,j)=>[Math.min(...X.map(r=>r[j])),Math.max(...X.map(r=>r[j]))]);
 function interval(x){
  const v=[1,...x.map((v,j)=>(v-means[j])/scales[j])],z=Array(m).fill(0);
  for(let j=0;j<m;j++)z[j]=(v[j]-sum(z.slice(0,j).map((a,k)=>R[k][j]*a)))/R[j][j];
  const leverage=dot(z,z),half=tCritical(df)*Math.sqrt(sigma2*(1+leverage)),value=predict(x);
  return {value,low:value-half,high:value+half,leverage,outside:x.some((v,j)=>v<ranges[j][0]||v>ranges[j][1])};
 }
 return {predict,interval,coefficients,intercept,df,sigma2,ranges,n,p};
}
// Student t quantile, calculated by integrating its density after t=tan(theta).
function tCritical(df){
 const density=theta=>Math.pow(Math.cos(theta),df-1)/Math.pow(df+(1-df)*Math.sin(theta)**2,(df+1)/2);
 // Scale cancels in the ratio; integration uses x=t/sqrt(df), x=tan(theta).
 const f=theta=>Math.pow(Math.cos(theta),df-1);
 function integral(end){const n=1024,h=end/n;let s=f(0)+f(end);for(let i=1;i<n;i++)s+=(i%2?4:2)*f(i*h);return s*h/3;}
 const total=integral(Math.PI/2);let lo=0,hi=Math.PI/2;
 for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(integral(mid)/total<.95)lo=mid;else hi=mid;}
 return Math.sqrt(df)*Math.tan((lo+hi)/2);
}
const api={parseCSV,numeric,metrics,split,fit,tCritical};if(typeof module!=='undefined')module.exports=api;else root.Regression=api;
})(globalThis);
