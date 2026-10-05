import type {IndicatorParam} from './indicator-catalog.js';
export type BasicIndicator = {name:string;label:string;description:string;period:number;overlay:boolean;source:boolean;params?:IndicatorParam[]};
export const basicIndicators:BasicIndicator[];
export const basicByName:Record<string,BasicIndicator>;
