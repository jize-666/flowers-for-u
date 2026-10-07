/** Real PC measurement, with live camera and audible engine enabled. No trigger bypass. */
import {writeFile} from "node:fs/promises";
import {createInterface} from "node:readline/promises";
import {stdin,stdout} from "node:process";
const {chromium}=await import("playwright");
const quality=process.argv[3]||"high";
if(!["high","medium","low"].includes(quality))throw new Error("Quality: high, medium, low (Gentle)");
const url=new URL(process.argv[2]||"http://127.0.0.1:5000");url.searchParams.set("debug","1");url.searchParams.set("garden","1");
const terminal=createInterface({input:stdin,output:stdout});let browser,page,device,observations="",failure=null;
const errors=[];
try{
  device=await terminal.question("Record PC, CPU, GPU, OS, webcam and audio output/headphones: ");
  browser=await chromium.launch({headless:false});
  const context=await browser.newContext({viewport:{width:1440,height:900},permissions:["camera"]});
  page=await context.newPage();page.on("pageerror",error=>errors.push(String(error)));
  await page.goto(url.href);await page.waitForFunction(()=>window.__FLOWERS_DEBUG__?.getPerformance,{timeout:90000});
  await page.locator("#quality-select").selectOption(quality);
  await page.evaluate(()=>{
    const capture=window.__PHASE4_CAPTURE__={active:true,snapshots:[]};let n=0,lastState=null;
    function sample(){
      if(!capture.active)return;
      if(n++%30===0&&!document.hidden&&capture.snapshots.length<400){
        const state=window.__FLOWERS_DEBUG__.getState();capture.snapshots.push({time:performance.now(),state});lastState=state.experience.state;
      }
      requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
  });
  console.log("Enable the existing sound button, allow real camera, then perform OPEN_PALM -> FIST >=1000ms. Do not mute/hide the page during measurement.");
  await page.waitForFunction(()=>window.__FLOWERS_DEBUG__.getState().experience.state==="multiverse_interaction",{timeout:240000});
  console.log("Exercise all six gestures for at least 30 seconds; include repeated split, stationary grab, tracking loss/reacquisition. Keep audio on. Inspect clicks, blank frames, camera continuity and depth.");
  observations=await terminal.question("Enter visual/listening findings and failures, then press Enter: ");
}catch(error){failure=String(error);errors.push(failure);}
finally{
  let data=null;
  if(page)try{data=await page.evaluate(()=>{
    if(window.__PHASE4_CAPTURE__)window.__PHASE4_CAPTURE__.active=false;
    const gl=document.querySelector("#garden-canvas")?.getContext("webgl2");
    return {performance:window.__FLOWERS_DEBUG__?.getPerformance(),final:window.__FLOWERS_DEBUG__?.getState(),snapshots:window.__PHASE4_CAPTURE__?.snapshots??[],
      gl:gl?{renderer:gl.getParameter(gl.RENDERER),vendor:gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION)}:null};
  });}catch(error){errors.push(String(error));}
  const stages=["peak_collapse","void_fall","multiverse_arrival","multiverse_interaction"];
  const coverage=Object.fromEntries(stages.map(stage=>{const w=data?.performance?.windows?.[stage];return [stage,{qualifiedFrames:w?.frames??0,qualifiedCoverage:w?.qualifiedCoverage??0,status:w?.frames>=30?"recorded; inspect all-foreground stalls and observations":"insufficient / belum terukur"}];}));
  await writeFile(new URL(`../docs/phase4-device-${quality}.json`,import.meta.url),JSON.stringify({device,browserVersion:browser?.version()??null,requestedViewport:[1440,900],quality,observations,failure,errors,coverage,...data,
    notes:["Live camera and manual gestures; no fake landmarks, forced readiness or click-to-collapse.","Qualified FPS requires running AudioContext, active scheduled voice, sound enabled and Worker result within 250ms.","All foreground frames are reported separately, including stalls >250ms and tracking gaps.","RAF intervals include recording overhead. Not GPU timings, audible-output proof or automatic A01–A16 acceptance."]},null,2));
  terminal.close();await browser?.close();
}
if(failure)process.exitCode=1;
