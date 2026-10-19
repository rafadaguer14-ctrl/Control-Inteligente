/* Sugeno de orden cero: 5 conjuntos triangulares por entrada, 25 reglas.
   Entrada 1: error RPM / escala. Entrada 2: variacion del error RPM/s / escala.
   Salida: variacion normalizada del ciclo util por segundo. */
(function(root){
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const labels=['NG','NP','Z','PP','PG'];
  const centers=[-1,-.5,0,.5,1];
  const rules=centers.map(e=>centers.map(de=>clamp(e+de,-1,1)));
  function memberships(x){x=clamp(x,-1,1);return centers.map(c=>Math.max(0,1-Math.abs(x-c)/.5));}
  function infer(e,de){
    const a=memberships(e),b=memberships(de);let sum=0,weight=0;const active=[];
    a.forEach((u,i)=>b.forEach((v,j)=>{const w=u*v;if(w){sum+=w*rules[i][j];weight+=w;active.push({i,j,w});}}));
    return {value:weight?sum/weight:0,active,a,b};
  }
  class Controller{
    constructor(){this.reset();}
    reset(){this.duty=0;this.previousError=null;this.last={value:0,active:[],a:[],b:[]};}
    step(target,rpm,dt,errorScale,rateScale,gain){
      const e=target-rpm;
      const de=this.previousError===null?0:(e-this.previousError)/dt;
      this.previousError=e;this.last=infer(e/errorScale,de/rateScale);
      this.duty=target===0?0:clamp(this.duty+this.last.value*(gain/100)*dt,0,1);
      return this.duty;
    }
  }
  const api={Controller,infer,memberships,rules,labels};
  if(typeof module!=='undefined')module.exports=api;else root.Fuzzy=api;
})(globalThis);
