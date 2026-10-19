const assert=require('node:assert/strict');
const {Network,dataset,split,parse}=require('./neural-core.js');
for(const activation of ['tanh','sigmoid','relu','linear']){
 const n=new Network([{n:3,activation}],42),data=[{x:[.2,.7],y:1},{x:[-.4,.3],y:0}];
 const g=n.gradients(data),eps=1e-5;
 for(const p of n.parameters()){const v=n.get(p);n.set(p,v+eps);const a=n.loss(data);n.set(p,v-eps);const b=n.loss(data);n.set(p,v);const analytic=p.k<0?g[p.l].b[p.j]:g[p.l].w[p.j][p.k];assert.ok(Math.abs((a-b)/(2*eps)-analytic)<1e-6,activation+' gradient');}
}
for(const kind of ['and','or','xor','circle','linear']){
 const hidden=['and','or','linear'].includes(kind)?[]:[{n:kind==='circle'?8:4,activation:'tanh'}];
 const n=new Network(hidden,42),d=split(dataset(kind,42),42);
 const rate=kind==='circle'?.3:.5,epochs=kind==='circle'?2000:3000;
 for(let i=0;i<epochs;i++)n.step(d.train,rate);
 const accuracy=n.accuracy(d.test.length?d.test:d.train);assert.ok(accuracy>=(kind==='linear'?.90:.95),kind+' generalization '+accuracy);assert.ok(n.loss(d.train)<.12,kind+' low training loss');console.log(kind,accuracy,n.loss(d.train));
}
const xor=dataset('xor'),linear=new Network([],42);for(let i=0;i<3000;i++)linear.step(xor,.5);assert.ok(linear.loss(xor)>.68,'XOR linear limitation');
const n=new Network([{n:4,activation:'tanh'}]),params=n.parameters(),before=params.map(p=>n.get(p));n.step(xor,.1,params.slice(0,2));params.slice(2).forEach((p,i)=>assert.equal(n.get(p),before[i+2]));
assert.equal(n.forward([.4,.2],{l:0,j:1}).a[1][1],0);
assert.equal(parse('x1,x2,clase\n0,0,0\n0,1,1\n1,0,1\n1,1,0').length,4);
assert.throws(()=>parse('0,0,0\n1,1,2\n0,1,1\n1,0,1'));
assert.deepEqual(split(dataset('circle'),42),split(dataset('circle'),42));
assert.equal(split(xor).test.length,0);
const clone=n.clone(),p=clone.parameters()[0];clone.set(p,9);assert.notEqual(n.get(p),9);
console.log('PASS gradients, convergence, linear XOR limit, frozen parameters, ablation, parser, deterministic split, snapshot isolation');
