import {validate} from './core.js';
export const service={id:'rnk',name:'RnK',voc:true,breakfastDefault:''};
export function menuValue(value,key){return value?.trim()?value:(key==='breakfast'?service.breakfastDefault:'');}
export function applyDefaults(data){const valid=validate(data);return {...valid,days:valid.days.map(day=>({...day,breakfast:menuValue(day.breakfast,'breakfast')}))};}
