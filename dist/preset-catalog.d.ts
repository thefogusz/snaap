export const presets: {id:string;title:string;tag:string;frame:string;description:string;note:string;chart:string;horizon:string;level:string;audience:string;pace:string;caution:string;leverageNote:string}[];
export function buildPreset(id:string,config:{exchange:string;market:string;side:string;pair?:string;pairs?:string[];targets?:{exchange:string;pair:string}[];timeframe?:string;level?:number}):unknown;
export function describePreset(spec:any):string;
