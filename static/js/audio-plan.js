import { CONFIG } from "./config.js";
import { collapseSchedule } from "./collapse-core.js";
export function audioPlan(){
  const s=collapseSchedule();
  return [
    {name:"tension",at:0,bus:"soundscape",volume:.3},
    {name:"dimensionSlash",at:s.slashStart,bus:"effects",volume:.26},
    {name:"gravityBed",at:s.sphereStart,bus:"soundscape",volume:.28},
    {name:"energyRelease",at:s.expansionStart,bus:"effects",volume:.3},
    {name:"materialFailure",at:s.destructionStart,bus:"effects",volume:.32},
    {name:"finalPull",at:s.pullStart,bus:"soundscape",volume:.32},
    {name:"voidFall",at:s.voidStart,bus:"soundscape",volume:.3},
    {name:"arrivalReveal",at:s.end,bus:"effects",volume:.27},
    {name:"multiverseAmbience",at:s.end,bus:"music",volume:CONFIG.audioEngine.ambience,loop:true},
  ];
}
export function normalizeBuffer(buffer,peak=CONFIG.audioEngine.peak){
  let maximum=0;
  for(let ch=0;ch<buffer.numberOfChannels;ch++)for(const value of buffer.getChannelData(ch)){
    if(!Number.isFinite(value))throw new Error("Non-finite decoded PCM");maximum=Math.max(maximum,Math.abs(value));
  }
  if(maximum<=0)throw new Error("Silent critical audio");
  if(maximum>peak)for(let ch=0;ch<buffer.numberOfChannels;ch++){
    const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]*=peak/maximum;
  }
  return buffer;
}
