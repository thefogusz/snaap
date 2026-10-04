export function mirrorCondition<T>(condition:T):T;
export function mirrorBranch<T extends {entry:unknown;stages:{condition:unknown;withinBars:number}[];cooldownBars:number;exit?:unknown;cancel?:unknown}>(spec:T):Pick<T,'entry'|'stages'|'cooldownBars'|'exit'|'cancel'>;
export function directionLabel(side:string|undefined,market:string|undefined):string;
export function signalDirection(event:{side?:string;market?:string},setupMarket?:string,setupSide?:string):string;
export function selectDirections<T>(input:T,selected:string[]):T;
export function setShortMirroring<T>(input:T,enabled:boolean):T;
