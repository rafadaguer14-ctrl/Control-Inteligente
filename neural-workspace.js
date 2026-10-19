/* Rearrange the existing controls without duplicating IDs or resetting the network. */
(()=>{
 const $=id=>document.getElementById(id),aside=document.querySelector('aside'),workspace=document.querySelector('.workspace');
 const sections=[...aside.children],problem=sections[0],architecture=sections[1],training=sections[2],parameters=sections[3];
 const network=$('networkScroll').closest('section'),output=$('outputMap').closest('section'),loss=$('lossChart').closest('section'),inspector=$('neuronTitle').closest('section'),surface=$('surface').closest('section');
 [problem,architecture,training,parameters,network,output,loss,inspector,surface].forEach((el,i)=>el.classList.add(['setup-problem','setup-architecture','training-panel','setup-parameters','network-panel','output-panel','loss-panel','inspector-panel','surface-panel'][i]));
 function dialog(title){const d=document.createElement('dialog');d.className='lab-dialog';const head=document.createElement('div');head.className='heading';const h=document.createElement('h2');h.textContent=title;const close=document.createElement('button');close.textContent='Cerrar';close.onclick=()=>d.close();head.append(h,close);d.append(head);document.body.append(d);return d;}
 const help=dialog('Cómo leer el laboratorio');
 for(const card of [problem,architecture,training,parameters,network,output,loss,inspector,surface]){
  const notes=[...card.querySelectorAll('p.help')].filter(p=>!p.id);
  if(notes.length){const h=document.createElement('h3');h.textContent=card.querySelector('h2').textContent;help.append(h);notes.forEach(p=>help.append(p));}
 }
 const demo=dialog('Demostración guiada');demo.append($('demo'));demo.querySelectorAll('[data-demo]').forEach(b=>b.addEventListener('click',()=>demo.close()));
 const nav=document.querySelector('header nav');nav.querySelector('a[href="#demo"]').remove();
 for(const [label,d]of [['Guía',help],['Demostración',demo]]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.onclick=()=>d.showModal();nav.append(b);}
 function tabs(parent,items,label){const bar=document.createElement('div');bar.className='lab-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label',label);const buttons=[];items.forEach(([name,panel],i)=>{const b=document.createElement('button');b.textContent=name;b.id='tab-'+label+'-'+i;b.setAttribute('role','tab');panel.id=panel.id||'panel-'+label+'-'+i;b.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);function select(){items.forEach(([,p],j)=>{p.hidden=i!==j;buttons[j].setAttribute('aria-selected',String(i===j));buttons[j].tabIndex=i===j?0:-1;});window.dispatchEvent(new Event('resize'));}b.onclick=select;b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowRight'?1:items.length-1))%items.length;buttons[n].click();buttons[n].focus();}};buttons.push(b);bar.append(b);});parent.append(bar);items.forEach(([,p])=>parent.append(p));buttons[0].click();return buttons;}
 const setup=document.createElement('div');setup.className='setup-panel';aside.replaceChildren(setup,training);
 tabs(setup,[['Datos',problem],['Capas',architecture],['Pesos',parameters]],'controles');
 const visual=document.createElement('div');visual.className='visual-panel';const neuronTabs=tabs(visual,[['Red y conexiones',network],['Neurona seleccionada',inspector]],'visual');
 // Clicking a neuron keeps the architecture visible; inspector remains one tab away.
 const bar=document.createElement('div');bar.className='compact-summary';bar.append($('status'),document.querySelector('.metrics'));
 workspace.replaceChildren(bar,visual,output,loss,surface);
 for(const [panel,text]of [[loss,'Azul: entrenamiento · amarillo: evaluación'],[output,'Probabilidad clase 1 · naranja 0 / azul 1']]){const legend=document.createElement('small');legend.className='compact-legend';legend.textContent=text;panel.querySelector('h2').after(legend);}
 inspector.querySelectorAll(':scope > .pair > div').forEach((column,i)=>{const caption=document.createElement('small');caption.textContent=i?'Aporte: p(original) − p(anulada)':'Activación de la neurona';column.prepend(caption);});
 const heading=surface.querySelector('h2');heading.textContent='Superficie de coste · 3D';$('captureSurface').textContent='Actualizar corte';
 const surfaceSettings=document.createElement('div');surfaceSettings.className='surface-settings';surface.querySelectorAll(':scope > .pair').forEach(p=>surfaceSettings.append(p));surface.querySelector('.heading').after(surfaceSettings);
 const custom=dialog('Datos personalizados');const customBox=$('customBox');const customOpen=document.createElement('button');customOpen.className='secondary';customOpen.textContent='Editar datos personalizados';customOpen.id='openCustom';customOpen.hidden=true;customOpen.onclick=()=>{customBox.hidden=false;custom.showModal();};problem.querySelector('#loadData').before(customOpen);custom.append(customBox);const apply=document.createElement('button');apply.textContent='Cargar estos datos';const feedback=document.createElement('p');feedback.setAttribute('role','alert');apply.onclick=()=>{$('loadData').click();if(!$('status').classList.contains('error')){feedback.textContent='';custom.close();}else feedback.textContent=$('status').textContent;};custom.append(apply,feedback);
 $('problem').addEventListener('change',()=>{customOpen.hidden=$('problem').value!=='custom';});demo.querySelectorAll('[data-demo]').forEach(b=>b.addEventListener('click',()=>{customOpen.hidden=true;}));
 const more=document.createElement('p');more.className='compact-tip';more.textContent='Cambiar datos o capas reinicia el aprendizaje. Las pestañas conservan el estado.';aside.append(more);
 // Fit all neurons vertically, including the maximum eight-neuron architecture.
 function fitNetwork(){if(network.hidden)return;const area=$('networkScroll');const columns=[...document.querySelectorAll('.node-column')];const count=Math.max(1,...columns.map(c=>c.querySelectorAll('.neuron').length));const height=area.clientHeight;const size=Math.max(18,Math.min(60,(height-25)/count-5))+'px';if(area.style.getPropertyValue('--node-size')!==size){area.style.setProperty('--node-size',size);window.dispatchEvent(new Event('resize'));}}
 new ResizeObserver(fitNetwork).observe($('networkScroll'));
 new MutationObserver(fitNetwork).observe($('nodeColumns'),{childList:true,subtree:true});
 window.addEventListener('resize',fitNetwork);
})();
