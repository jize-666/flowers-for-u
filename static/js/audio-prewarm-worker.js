import {synthesizeCue,encodeWave} from "./transition-audio.js";
self.onmessage=({data})=>{
  try{
    const wave=encodeWave(synthesizeCue(data.name));
    self.postMessage({id:data.id,wave},[wave]);
  }catch(error){self.postMessage({id:data.id,error:String(error.message)});}
};
