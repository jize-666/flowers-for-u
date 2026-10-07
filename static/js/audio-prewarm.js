import {CONFIG} from "./config.js";
/** One reusable synthesis Worker during preparation. No main-thread synthesis fallback. */
export class AudioPrewarm {
  constructor({timeoutMs=CONFIG.audioEngine.prewarmTimeoutMs}={}){this.timeoutMs=timeoutMs;this.sequence=0;this.disposed=false;}
  generate(name){
    if(this.disposed)return Promise.reject(new Error("Audio preparation disposed"));
    if(this.pending)return Promise.reject(new Error("Only one audio preparation job may be in flight"));
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      this.pending={id,resolve,reject};
      try{
        if(!this.worker){
          this.worker=new Worker(new URL("./audio-prewarm-worker.js",import.meta.url),{type:"module"});
          this.worker.onerror=()=>this.fail(new Error("Audio synthesis Worker failed"));
          this.worker.onmessageerror=()=>this.fail(new Error("Audio synthesis transfer failed"));
          this.worker.onmessage=({data})=>{
            if(!this.pending||data.id!==this.pending.id)return;
            if(data.error||!(data.wave instanceof ArrayBuffer)){this.fail(new Error(data.error||"Invalid audio PCM payload"));return;}
            const job=this.pending;this.pending=null;clearTimeout(this.timer);job.resolve(data.wave);
          };
        }
        this.timer=setTimeout(()=>this.fail(new Error("Audio synthesis timeout")),this.timeoutMs);
        this.worker.postMessage({id,name});
      }catch(error){this.fail(error);}
    });
  }
  fail(error){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;const job=this.pending;this.pending=null;job?.reject(error);}
  release(){if(this.pending)throw new Error("Cannot release active audio job");this.worker?.terminate();this.worker=null;}
  dispose(){if(this.disposed)return;this.disposed=true;this.fail(new Error("Audio preparation disposed"));}
}
