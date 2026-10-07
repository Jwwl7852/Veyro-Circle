export type Extension={id:string;fromTo:string;to:string;returnTime:string;total:number;proposedBy:string;proposedAt:string;acceptedBy?:string;acceptedAt?:string};
export type AgreementSchedule={pickupTime?:string;returnTime?:string;originalTo?:string;originalTotal?:number;originalReturnTime?:string;changeProposal?:Extension|null;extensions?:Extension[]};
export const validTime=(time:unknown):time is string=>typeof time==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
