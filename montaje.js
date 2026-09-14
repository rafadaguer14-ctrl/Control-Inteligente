'use strict';
const $=id=>document.getElementById(id),elements={fan3d:$('fan3d')};
let port=null,reader=null,readTask=null,closing=false,queue=Promise.resolve(),lastData=0,latest=null,epoch=0,lastFrame=performance.now(),pot=false,ready=false;
const history=[],duration=30,pending=new Map(),desired=new Map();let flushing=false,generation=0,resetting=false;
const percent=value=>value*100/255;
const percentText=value=>percent(value).toFixed(1)+' %';
const sliders=['targetSpeed','kp','ki','kd'];
function note(s){$('connectionNote').textContent=s;}
function fresh(){return !!port&&lastData>0&&performance.now()-lastData<2000;}
function parse(line){const d={};for(const m of line.matchAll(/([A-Za-z][A-Za-z0-9]*):([^\s]+)/g))d[m[1]]=m[2];for(const k of ['Ref','RPM','PWM','PID','Pert','Cruda','Bruta','N250','Desc250']){if(d[k]===undefined||!Number.isFinite(Number(d[k])))return null;d[k]=Number(d[k]);}if(d.V==='3'&&!['P','I','D','Suma','Kp','Ki','Kd'].every(k=>d[k]!==undefined&&Number.isFinite(Number(d[k]))))return null;if(!['ACTIVO','PARADO','FALLO','TEST'].includes(d.Estado))return null;for(const k of ['P','I','D','Suma','Kp','Ki','Kd'])if(d[k]!==undefined)d[k]=Number(d[k]);return d;}
function updateLabel(id){$(id==='targetSpeed'?'targetOut':id+'Out').textContent=Number($(id).value).toFixed(id==='targetSpeed'?0:3)+(id==='targetSpeed'?' RPM':'');}
function controls(){$('defaultsBtn').disabled=resetting||closing;for(const id of sliders.concat('potBtn'))$(id).disabled=resetting||!ready||!fresh();$('resetBtn').disabled=!port||closing;$('connectBtn').disabled=!!port;$('disconnectBtn').disabled=!port||closing;}
function receive(line){const d=parse(line);if(!d){if(/^(Ganancias:|FALLO:|ERROR|Fallo:)/.test(line))note(line);return;}latest=d;lastData=performance.now();if(d.V!=='3'){ready=false;note('Carga LecturaEncoder v3.0 para habilitar los controles en vivo.');controls();return;}
 if(!ready&&d.Ref===0&&d.PWM===0){ready=true;for(const [id,k] of [['kp','Kp'],['ki','Ki'],['kd','Kd']]){$(id).value=d[k];updateLabel(id);}note('Conectado · cambios en vivo · referencia inicial 0 RPM.');}
 const t=(lastData-epoch)/1000;history.push({...d,time:t});while(history.length&&t-history[0].time>duration)history.shift();
 for(const [id,text]of Object.entries({timeValue:t.toFixed(1)+' s',targetValue:d.Ref.toFixed(1)+' RPM',speedValue:d.RPM.toFixed(1)+' RPM',currentValue:(d.Ref-d.RPM).toFixed(1)+' RPM',controlText:'PWM '+percentText(d.PWM),motorSpeed3d:d.RPM.toFixed(1)+' RPM',motorVoltage3d:percentText(d.PWM),actualPWM:percentText(d.PWM),actualPert:percentText(d.Pert),quality:d.N250+' flancos · '+d.Desc250+' descartados',pTerm:percentText(d.P),iTerm:percentText(d.I),dTerm:percentText(d.D),sumTerm:percentText(d.Suma),confirmedGains:`Recibidos: Kp ${d.Kp.toFixed(3)} · Ki ${d.Ki.toFixed(3)} · Kd ${d.Kd.toFixed(3)}`}))$(id).textContent=text;
 pot=d.PotOn==='1';$('potBtn').textContent=pot?'Deshabilitar potenciómetro':'Habilitar potenciómetro';
 for(const [id,k]of [['targetSpeed','Ref'],['kp','Kp'],['ki','Ki'],['kd','Kd']]){if(desired.has(id)&&Math.abs(desired.get(id)-d[k])<.0005)desired.delete(id);}
 if(d.Estado==='FALLO')note('FALLO del equipo. Detén y revisa el montaje.');controls();}
function send(cmd,token=null){const p=port;if(!p||closing)return Promise.reject(Error('Sin conexión'));const task=queue.catch(()=>{}).then(async()=>{if(token!==null&&token!==generation)return;if(port!==p||!p.writable)throw Error('Conexión perdida');const w=p.writable.getWriter();try{await w.write(new TextEncoder().encode(cmd+'\n'));}finally{w.releaseLock();}});queue=task;return task;}
function action(fn){return async()=>{try{await fn();}catch(e){note(e.message);}};}
async function flush(){if(flushing||!pending.size)return;if(!ready||!fresh()){pending.clear();return;}flushing=true;const token=generation;try{for(const [id,v]of [...pending]){if(token!==generation)break;pending.delete(id);await send(id==='targetSpeed'?String(v):id.toUpperCase()+' '+v,token);}}catch(e){pending.clear();note(e.message);}finally{flushing=false;}}
async function stop(){generation++;pending.clear();desired.clear();$('targetSpeed').value=0;updateLabel('targetSpeed');await send('0');note('Parada enviada; esperando confirmación del equipo.');}
async function read(p){const dec=new TextDecoder();let buffer='';reader=p.readable.getReader();try{while(!closing){const {value,done}=await reader.read();if(done)break;buffer+=dec.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const l of lines)receive(l.trim());if(buffer.length>4096)buffer='';}}catch(e){note(e.message);}finally{reader.releaseLock();reader=null;if(!closing){await queue.catch(()=>{});await p.close().catch(()=>{});if(port===p)port=null;ready=false;pending.clear();controls();note('USB desconectado. No se puede confirmar la parada del motor.');}}}
$('connectBtn').onclick=action(async()=>{if(!navigator.serial)throw Error('Usa Chrome o Edge de escritorio.');const p=await navigator.serial.requestPort();await p.open({baudRate:115200});port=p;closing=false;ready=false;latest=null;lastData=0;epoch=performance.now();history.length=0;pending.clear();desired.clear();$('targetSpeed').value=0;updateLabel('targetSpeed');controls();readTask=read(p);await send('0');note('Esperando firmware v3 y confirmación de parada…');});
$('disconnectBtn').onclick=action(async()=>{await stop();closing=true;controls();if(reader)await reader.cancel();await readTask;await queue.catch(()=>{});await port.close();port=null;closing=false;ready=false;controls();note('Puerto cerrado; se envió la orden de parada.');});
$('resetBtn').onclick=action(stop);
async function restoreDefaults(){
 resetting=true;generation++;pending.clear();desired.clear();controls();
 try {
   if(port) await send('0');
   for(const [id,value] of Object.entries({targetSpeed:0,kp:0.15,ki:0.20,kd:0.005})){$(id).value=value;updateLabel(id);}
   if(port){
     for(const command of ['KP 0.15','KI 0.20','KD 0.005','POT OFF']) await send(command);
     note('Valores predeterminados enviados: referencia 0 RPM, Kp 0.15, Ki 0.20, Kd 0.005. Esperando confirmación del equipo.');
   } else note('Valores predeterminados restablecidos en la interfaz. Sin conexión con el equipo.');
   pot=false;$('potBtn').textContent='Habilitar potenciómetro';
 } finally {resetting=false;controls();}
}
$('defaultsBtn').onclick=action(restoreDefaults);
$('potBtn').onclick=action(async()=>{await send(pot?'POT OFF':'POT ON');});
for(const id of sliders){updateLabel(id);$(id).oninput=()=>{updateLabel(id);if(!ready||!fresh())return;const v=Number($(id).value);desired.set(id,v);if(id==='targetSpeed'&&v===0){action(stop)();return;}pending.set(id,v);flush();};$(id).onchange=()=>flush();}
window.addEventListener('beforeunload',e=>{if(port){e.preventDefault();e.returnValue='';}});
$('currentPath').classList.remove('flow');$('rotor').classList.remove('rotating');controls();
setInterval(()=>{if(!fresh()){pending.clear();if(port&&lastData)note('Sin datos recientes; valores congelados. La desconexión no detiene el equipo.');}controls();flush();},80);
function resizeCanvas(c){const r=c.getBoundingClientRect(),scale=devicePixelRatio||1;const width=Math.max(1,Math.floor(r.width*scale)),height=Math.max(1,Math.floor(r.height*scale));if(c.width!==width)c.width=width;if(c.height!==height)c.height=height;return {width,height,scale};}
const hover=new Map();for(const id of ['speedChart','controlChart','currentChart']){$(id).addEventListener('pointermove',e=>{const r=$(id).getBoundingClientRect();hover.set(id,e.clientX-r.left);});$(id).addEventListener('pointerleave',()=>hover.delete(id));}
function drawChart(id,keys,unit){const c=$(id),{width,height,scale}=resizeCanvas(c),ctx=c.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);const w=width/scale,h=height/scale,L=55,R=14,T=23,B=29,W=w-L-R,H=h-T-B;ctx.clearRect(0,0,w,h);if(W<10||H<10)return;
 const val=(d,k)=>k==='Error'?d.Ref-d.RPM:k==='PWM'?percent(d.PWM):d[k];const values=history.flatMap(d=>keys.map(k=>val(d,k)));let lo=0,hi=id==='controlChart'?100:Math.max(id==='speedChart'?200:10,...values)*1.1;if(id==='currentChart'){hi=Math.max(10,...values.map(Math.abs))*1.15;lo=-hi;}
 const y=v=>T+H*(1-(v-lo)/(hi-lo)),end=history.length?history.at(-1).time:0,x=t=>L+W*(1-(end-t)/duration);
 ctx.font='12px Arial';ctx.fillStyle='#c3cedf';ctx.fillText(unit,L,14);for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,yy=y(v);ctx.strokeStyle='#ffffff18';ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R,yy);ctx.stroke();ctx.fillText(v.toFixed(0),5,yy+4);}for(let i=0;i<=3;i++){const xx=L+W*i/3;ctx.fillStyle='#9ba8bd';ctx.fillText(i===3?'ahora':(i*10-30)+' s',Math.min(xx,w-42),h-7);}
 const colors=['#54d6ff','#ffcf5a'];keys.forEach((k,j)=>{ctx.strokeStyle=colors[j];ctx.lineWidth=j?2:2.8;ctx.setLineDash(j?[7,5]:[]);ctx.beginPath();history.forEach((d,i)=>{if(!i||d.time-history[i-1].time>1)ctx.moveTo(x(d.time),y(val(d,k)));else ctx.lineTo(x(d.time),y(val(d,k)));});ctx.stroke();ctx.setLineDash([]);});
 const head=c.parentElement.querySelector('.chart-head span');head.textContent=history.length?keys.map(k=>(k==='Ref'?'Objetivo':k==='RPM'?'Medida':k)+' '+val(history.at(-1),k).toFixed(1)).join(' · ')+' '+unit:'Esperando mediciones';
 if(!history.length){ctx.fillStyle='#9ba8bd';ctx.fillText('Sin datos del montaje',L+15,T+H/2);return;}
 if(hover.has(id)){const t=end-duration+(hover.get(id)-L)/W*duration;const d=history.reduce((a,b)=>Math.abs(a.time-t)<Math.abs(b.time-t)?a:b);ctx.strokeStyle='#ffffff77';ctx.beginPath();ctx.moveTo(x(d.time),T);ctx.lineTo(x(d.time),T+H);ctx.stroke();const text=keys.map(k=>k+': '+val(d,k).toFixed(1)).join('  ')+' '+unit;const tw=ctx.measureText(text).width+16;const tx=Math.max(L,Math.min(x(d.time),w-tw));ctx.fillStyle='#14243a';ctx.fillRect(tx,T+5,tw,26);ctx.fillStyle='#fff';ctx.fillText(text,tx+8,T+22);}}
let lastPlot=0;
function animate(now){const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;const live=fresh();if(live&&latest.V==='3')motorView.angle=(motorView.angle+latest.RPM*Math.PI/30*dt)%(Math.PI*2);$('rotor').style.transform='rotate('+motorView.angle+'rad)';$('stateText').textContent=live?latest.Estado:port?'Sin datos recientes':'Sin conexión';$('motorState').textContent=live?(latest.RPM>0?'Giro · encoder':'Detenido'):'Sin datos en vivo';$('speedValue').style.opacity=live?'1':'.45';drawMotor();if(now-lastPlot>80){lastPlot=now;drawChart('speedChart',['RPM','Ref'],'RPM');drawChart('controlChart',['PWM'],'%');drawChart('currentChart',['Error'],'RPM');}requestAnimationFrame(animate);}


const motorView = { angle: 0 };
function drawMotor() {
    const canvas = elements.fan3d;
    const { width, height, scale } = resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const zoom = Math.min(width / 6.6, height / 3.9);
    const project = ([x,y,z]) => {
        const a = -0.48, b = 0.30;
        const xx = x*Math.cos(a)+z*Math.sin(a);
        const zz = -x*Math.sin(a)+z*Math.cos(a);
        const yy = y*Math.cos(b)-zz*Math.sin(b);
        const depth = y*Math.sin(b)+zz*Math.cos(b);
        return [width*.52+xx*zoom, height*.48-yy*zoom, depth];
    };
    const shadow = ctx.createRadialGradient(width*.5,height*.79,0,width*.5,height*.79,width*.4);
    shadow.addColorStop(0,'rgba(0,0,0,.65)'); shadow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=shadow;ctx.fillRect(0,height*.62,width,height*.3);
    const faces=[];
    function face(points,color) {
        const p=points.map(project);
        faces.push({p,color,depth:p.reduce((s,v)=>s+v[2],0)/p.length});
    }
    function cylinder(x0,x1,r,color,cy=0,cz=0,n=64) {
        const left=[],right=[];
        for(let i=0;i<n;i++) {
            const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n;
            const p=[x0,cy+r*Math.cos(a),cz+r*Math.sin(a)];
            const q=[x1,p[1],p[2]];
            left.push(p);right.push(q);
            const light=.48+.47*Math.max(0,Math.cos(a-.65));
            const shade=color.map(c=>Math.round(c*light));
            face([p,q,[x1,cy+r*Math.cos(b),cz+r*Math.sin(b)],[x0,cy+r*Math.cos(b),cz+r*Math.sin(b)]],`rgb(${shade})`);
        }
        face(left,`rgb(${color.map(c=>Math.round(c*.78))})`);
        face(right,`rgb(${color.map(c=>Math.round(c*.55))})`);
    }
    function box(x0,x1,y0,y1,z0,z1,color) {
        const p=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
        [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]].forEach((f,i)=>face(f.map(j=>p[j]),`rgb(${color.map(c=>Math.round(c*(.60+i*.065)))})`));
    }
    // Closed cylindrical geometry: steel housing, end bells, bearing and shaft.
    box(-1.25,1.15,-1.20,-1.04,-.76,.76,[90,110,133]);
    box(-.92,-.57,-1.08,-.68,-.57,.57,[123,143,161]);
    box(.64,.98,-1.08,-.68,-.57,.57,[123,143,161]);
    cylinder(-1.35,1.30,.87,[201,215,226]);
    cylinder(1.28,1.53,.80,[58,72,91]);
    cylinder(-1.53,-1.34,.90,[144,164,182]);
    cylinder(-1.58,-1.53,.73,[191,207,219]);
    cylinder(-1.76,-1.58,.32,[100,123,146]);
    cylinder(-2.57,-1.76,.13,[222,234,242]);
    cylinder(-2.61,-2.54,.15,[158,184,203]);
    // Machined housing bands and front fasteners.
    [-1.20,1.10].forEach(x=>cylinder(x,x+.055,.88,[111,133,151]));
    for(let i=0;i<4;i++) {
        const a=Math.PI/4+i*Math.PI/2;
        cylinder(-1.62,-1.58,.065,[60,77,94],.60*Math.cos(a),.60*Math.sin(a),12);
    }
    // Rear ventilation slots and insulated electrical terminals.
    for(let i=0;i<12;i++) {
        const a=i*Math.PI/6;
        cylinder(1.53,1.545,.07,[17,25,37],.60*Math.cos(a),.60*Math.sin(a),10);
    }
    box(.75,1.2,.75,1.02,-.3,.3,[35,47,63]);
    box(.80,.92,1.02,1.20,-.23,-.08,[226,85,72]);
    box(1.01,1.13,1.02,1.20,.08,.23,[65,77,92]);
    // A rotating shaft key makes the rotation visible without rotating the housing.
    const a=motorView.angle;
    const key=[];
    for(const x of [-2.49,-1.91]) for(const t of [a-.18,a+.18]) key.push([x,.145*Math.cos(t),.145*Math.sin(t)]);
    face([key[0],key[1],key[3],key[2]],'#54d6ff');
    faces.sort((a,b)=>a.depth-b.depth);
    for(const f of faces) {
        ctx.beginPath();f.p.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
        ctx.fillStyle=f.color;ctx.fill();ctx.strokeStyle=f.color;ctx.lineWidth=.45*scale;ctx.stroke();
    }
    ctx.font=`600 ${10*scale}px Arial`;ctx.fillStyle='#9ba8bd';
    ctx.fillText('DC  /  ARMADURA DE IMÁN PERMANENTE',16*scale,height-16*scale);
}



requestAnimationFrame(animate);