export type IndicatorParam={key:string;label:string;value:number;min:number;max:number;integer:boolean};
export type IndicatorDefinition={name:string;label:string;method:string;args:string[];params:IndicatorParam[];output:number|null;overlay:boolean;unit:string;description:string;source:boolean};
export const extendedIndicators:IndicatorDefinition[];
export const indicatorByName:Record<string,IndicatorDefinition>;
export const extendedNames:string[];
