/* Read-only visualization. No serial writes and no controller state changes. */
(()=>{
 'use strict';
 const el=id=>document.getElementById(id),dialog=el('fuzzyDiagram');
 const colors=['#bd9bff','#58b9ff','#73e1ba','#ffcf5a','#ff8e9c'];
 const centers=[-1,-.5,0,.5,1],names=['Negativo grande','Negativo pequeño','Cero','Positivo pequeño','Positivo grande'];
 const num=x=>Number(x.toFixed(3)).toLocaleString('es-CO');
 const legend=el('fvLegend');
 Fuzzy.labels.forEach((label,i)=>{const span=document.createElement('span');span.textContent=label+' · '+names[i];span.style.color=colors[i];legend.append(span);});
 const table=el('fvRules'),head=table.createTHead().insertRow();
 ['e ↓ / variación →',...Fuzzy.labels].forEach(s=>{const th=document.createElement('th');th.textContent=s;head.append(th);});
 const cells=Fuzzy.rules.map((row,i)=>{const tr=table.createTBody().insertRow(),th=document.createElement('th');th.scope='row';th.textContent=Fuzzy.labels[i];tr.append(th);return row.map(v=>{const td=tr.insertCell();td.append(document.createTextNode(num(v)));const small=document.createElement('small');td.append(small);return {td,small};});});
 function svgNode(tag,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
 function graph(id,scale,point,singletons=false){
  const svg=el(id);svg.replaceChildren();const X=x=>48+(x+1)*180,Y=y=>135-y*95;
  for(const m of [0,.5,1]){svg.append(svgNode('line',{x1:48,y1:Y(m),x2:408,y2:Y(m),stroke:'#34445a'}));svg.append(svgNode('text',{x:8,y:Y(m)+4,fill:'#b9c7d9','font-size':12},num(m)));}
  svg.append(svgNode('text',{x:10,y:17,fill:'#b9c7d9','font-size':12},singletons?'Consecuentes':'Pertenencia μ'));
  centers.forEach((c,i)=>{
   if(singletons)svg.append(svgNode('line',{x1:X(c),y1:Y(0),x2:X(c),y2:Y(1),stroke:colors[i],'stroke-width':3}));
   else {const pts=[Math.max(-1,c-.5),c,Math.min(1,c+.5)].map(x=>X(x)+','+Y(Fuzzy.memberships(x)[i])).join(' ');svg.append(svgNode('polyline',{points:pts,fill:'none',stroke:colors[i],'stroke-width':3}));}
   svg.append(svgNode('text',{x:X(c),y:30,'text-anchor':'middle',fill:colors[i],'font-size':12},Fuzzy.labels[i]));
   svg.append(svgNode('text',{x:X(c),y:158,'text-anchor':'middle',fill:'#dbe8fa','font-size':12},num(c*scale)));
  });
  if(point!==null){const x=Math.max(-1,Math.min(1,point));svg.append(svgNode('line',{x1:X(x),y1:38,x2:X(x),y2:139,stroke:'#fff','stroke-width':2,'stroke-dasharray':'4 3'}));if(!singletons)Fuzzy.memberships(x).forEach((m,i)=>{if(m>0)svg.append(svgNode('circle',{cx:X(x),cy:Y(m),r:4,fill:colors[i],stroke:'#fff'}));});}
 }
 let previous='';
 function render(){
  if(!dialog.open)return;
  const live=fresh()&&latest!==null,d=live?latest:null;
  const es=d?d.ES:Number(el('kp').value),ds=d?d.DS:Number(el('ki').value),gs=d?d.GS:Number(el('kd').value);
  const active=!!d&&d.Estado==='ACTIVO';
  const key=JSON.stringify([live,active,es,ds,gs,d&&d.EN,d&&d.DEN,d&&d.Z,d&&d.Cmd,d&&d.PWM]);if(key===previous)return;previous=key;
  el('fvStatus').textContent=d?'Parámetros confirmados por ESP32 · '+d.Estado+(active?' · línea blanca: entrada recibida.':' · sin activación de reglas mostrada.'):'Sin datos recientes · curvas de los valores locales; no confirman la configuración del motor.';
  el('fvErrorScale').textContent='Error · ES = '+num(es)+' RPM';
  el('fvRateScale').textContent='Variación · DS = '+num(ds)+' RPM/s';
  graph('fvError',es,active?d.EN:null);graph('fvRate',ds,active?d.DEN:null);graph('fvSingletons',1,active?d.Z:null,true);
  el('fvValues').textContent=active?'Entradas normalizadas: eₙ = '+num(d.EN)+' · vₙ = '+num(d.DEN)+'. Valores limitados a [−1, 1].':'Las activaciones aparecerán cuando el motor esté activo y lleguen datos recientes.';
  const result=active?Fuzzy.infer(d.EN,d.DEN):null;
  cells.forEach((row,i)=>row.forEach(({td,small},j)=>{const w=result?result.a[i]*result.b[j]:0;td.style.background=w>0?'rgba(84,214,255,'+(.12+.6*w)+')':'transparent';small.textContent=w>0?'w = '+num(w):'—';}));
  el('fvGain').textContent='GS = '+num(gs)+' %/s · cambio solicitado entre −'+num(gs)+' y +'+num(gs)+' puntos porcentuales de PWM por segundo.';
  el('fvOutput').textContent=active?'z recibido: '+num(d.Z)+' → variación solicitada: '+num(d.Z*gs)+' pp/s':'z y variación solicitada: sin muestra activa.';
  el('fvCommand').textContent=d?'Mando acumulado: '+num(d.Cmd*100/255)+' % · PWM aplicado: '+num(d.PWM*100/255)+' %.':'Mando acumulado y PWM aplicado: sin datos recientes.';
 }
 el('fuzzyDiagramBtn').addEventListener('click',()=>{dialog.showModal();previous='';render();});
 el('fuzzyDiagramClose').addEventListener('click',()=>dialog.close());
 setInterval(render,150);
})();
