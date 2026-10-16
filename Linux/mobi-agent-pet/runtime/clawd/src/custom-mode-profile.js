'use strict';
(function(root){
 const {PET_STATE_IDS}=typeof module!=='undefined'&&module.exports?require('./pet-states'):root.MobiPetStates;
 const DEFAULTS=Object.freeze({version:1,petVisible:true,states:PET_STATE_IDS,trayAlerts:true,agentBubbles:true,notificationSeconds:6,permissionSeconds:0,roamIntervalSeconds:120,sessionHud:true,hudStateLabels:true,hudContext:true,hudQuota:true,keepAwake:false,keepSizeAcrossDisplays:false,fullscreenOverlay:true,permissionAutomationMode:'off',flashIntervalMs:500,flashDurationMs:5000});
 const NUMBER_RANGES={roamIntervalSeconds:[10,3600],notificationSeconds:[1,3600],permissionSeconds:[0,3600],flashIntervalMs:[200,2000],flashDurationMs:[0,60000]};
 function defaultCustomModeProfile(){return {...DEFAULTS,states:[...PET_STATE_IDS]};}
 function builtInModeProfile(mode){
  if(!['normal','background','automatic'].includes(mode))throw new RangeError('Unknown built-in mode: '+mode);
  const profile={...defaultCustomModeProfile(),keepAwake:true,keepSizeAcrossDisplays:true};
  if(mode==='background')return {...profile,petVisible:false,sessionHud:false,hudQuota:false};
  if(mode==='automatic')return {...profile,states:PET_STATE_IDS.filter(state=>state!=='roam'),agentBubbles:false,sessionHud:false,hudQuota:false,permissionAutomationMode:'unattended'};
  return profile;
 }
 function validateCustomModeProfile(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return 'Custom mode profile must be an object';
  for(const key of Object.keys(value))if(!Object.hasOwn(DEFAULTS,key))return 'Unknown custom mode field: '+key;
  if(value.version!==1)return 'Unsupported custom mode version';
  for(const [key,initial]of Object.entries(DEFAULTS))if(typeof initial==='boolean'&&typeof value[key]!=='boolean')return key+' must be boolean';
  if(!Array.isArray(value.states)||value.states.some(id=>!PET_STATE_IDS.includes(id))||new Set(value.states).size!==value.states.length)return 'Invalid custom pet state list';
  if(!value.states.includes('idle'))return 'Custom mode must retain idle for fallback';
  if(!['off','auto-tools','unattended'].includes(value.permissionAutomationMode))return 'Invalid custom approval mode';
  for(const [key,[min,max]]of Object.entries(NUMBER_RANGES))if(!Number.isInteger(value[key])||value[key]<min||value[key]>max)return key+' is out of range';
  return null;
 }
 function normalizeCustomModeProfile(value){
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const {permissionBubbles,notificationBubbles,bubbleFollow,hudElapsed,lowPowerIdle,allowEdgePinning,miniModeEnabled,...current}=input;
  if(!Object.hasOwn(current,'agentBubbles')&&(Object.hasOwn(input,'permissionBubbles')||Object.hasOwn(input,'notificationBubbles'))){
   current.agentBubbles=permissionBubbles!==false||notificationBubbles!==false;
  }
  const candidate={...defaultCustomModeProfile(),...current};
  return validateCustomModeProfile(candidate)?defaultCustomModeProfile():{...candidate,states:[...candidate.states]};
 }
 const api={PET_STATE_IDS,defaultCustomModeProfile,builtInModeProfile,validateCustomModeProfile,normalizeCustomModeProfile};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MobiCustomModeProfile=api;
})(globalThis);
