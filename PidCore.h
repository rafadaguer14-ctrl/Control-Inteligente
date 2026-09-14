#pragma once
struct PidResult { float p,i,d,sum,output; };
class PidCore {
  float errorIntegral=0;
public:
  void reset(){errorIntegral=0;}
  PidResult step(float error,float measurementDerivative,float dt,float kp,float ki,float kd,float disturbance){
    PidResult r{kp*error,0,-kd*measurementDerivative,0,0};
    if(ki==0) errorIntegral=0;
    else {
      const float delta=error*dt;
      const float candidate=errorIntegral+delta;
      const float requested=r.p+ki*candidate+r.d-disturbance;
      // Conditional integration: block only increments driving saturation farther.
      if(!((requested>255 && ki*delta>0)||(requested<0 && ki*delta<0))) errorIntegral=candidate;
    }
    r.i=ki*errorIntegral;
    r.sum=r.p+r.i+r.d;
    const float effective=r.sum-disturbance;
    r.output=effective<0?0:effective>255?255:effective;
    return r;
  }
};
