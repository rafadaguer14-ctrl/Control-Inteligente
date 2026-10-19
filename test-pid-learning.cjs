const assert=require('node:assert/strict');
const {metrics,validateTrial,Model}=require('./pid-learning-core.js');
const rows=(speed)=>Array.from({length:81},(_,i)=>({t:i/4,Ref:100,RPM:typeof speed==='function'?speed(i/4):speed,Kp:.15,Ki:.2,Kd:.005,PWM:100,Pert:0,PotOn:'0',Estado:'ACTIVO'}));
let m=metrics(rows(100),20);assert.equal(m.cost,0);assert.equal(m.ts,0);assert.equal(m.mae,0);
m=metrics(rows(0),20);assert.equal(m.cost,1);assert.equal(m.ts,null);assert.equal(m.mae,100);
m=metrics(rows(t=>t<5?0:100),20);assert.equal(m.ts,5);assert.equal(m.overshoot,0);
assert.equal(metrics(rows(120),20).overshoot,20);
assert.throws(()=>metrics(rows(100).map((r,i)=>({...r,Kp:i>.5?.2:.15})),20));
assert.throws(()=>metrics(rows(100).filter((_,i)=>i<8||i>20),20));
assert.throws(()=>metrics(rows(100).slice(0,10),20));
assert.throws(()=>validateTrial({rows:rows(100).map(r=>({...r,Pert:1})),duration:20}));
// Synthetic values exercise the math only. They are never user experimental data.
let trials=[];for(let i=0;i<60;i++){let x=[40+(i%5)*30,.1+(i%4)*.08,.1+(i%3)*.1,.001+(i%7)*.002];trials.push({id:String(i),x,duration:20,metrics:{cost:.1+(x[0]/200-.5)**2+(x[1]-.2)**2+x[2]*.5+x[3]*3}});}
const model=new Model(trials);const testKeys=new Set(model.test.map(t=>t.x.join(',')));assert(model.train.every(t=>!testKeys.has(t.x.join(','))));
const objective=()=>model.train.reduce((s,t)=>s+(model.forward(t.x).y-Math.log1p(t.metrics.cost))**2,0)/model.train.length;
const old=model.w[0][0],eps=1e-5;model.w[0][0]=old+eps;const plus=objective();model.w[0][0]=old-eps;const minus=objective();model.w[0][0]=old;model.step(1e-4);assert(Math.abs((old-model.w[0][0])/1e-4-(plus-minus)/(2*eps))<1e-7);
const before=model.score(model.train).rmse;for(let i=0;i<2000;i++)model.step();assert(model.score(model.train).rmse<before*.5);
assert.throws(()=>model.search(1000,[[.1,.2],[.1,.2],[.001,.002]]));
const candidate=model.search(100,model.lo.slice(1).map((v,i)=>[v,model.hi[i+1]]));assert(Number.isFinite(candidate.cost));
assert.throws(()=>new Model(trials.slice(0,5)));
console.log('PASS: metrics, incomplete/invalid trials, grouped split, numerical gradient, learning and bounded search.',model.score(model.test));
