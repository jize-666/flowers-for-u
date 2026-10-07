import test from "node:test";
import assert from "node:assert/strict";
import {GardenExperience} from "../static/js/experience.js";
import {SCENE_STATES} from "../static/js/experience-state.js";
test("A4/A16: inference continues through all five states; garden trigger ticks only in garden",()=>{
  for(const state of SCENE_STATES){
    let inference=0,trigger=0;
    const experience={disposed:false,sceneState:{state},tracker:{tick(){inference++;}},trigger:{tick(){trigger++;}},audio:{criticalReady:true},readiness:{set(){}},updateHint(){}};
    GardenExperience.prototype.tick.call(experience);
    assert.equal(inference,1,state);assert.equal(trigger,state==="garden_intro"?1:0,state);
  }
});
