import { dayCount } from "./marketplace";
export type Period={from:string;to:string};
export type CalendarBlock=Period & {id:string};
export const validListingId=(id:unknown):id is string=>typeof id === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(id);
export function validPeriod(from:unknown,to:unknown,today:string) {
  if(typeof from !== "string" || typeof to !== "string") return false;
  const days=dayCount(from,to);
  return days!==null && days>0 && days<=366 && from>=today && to<=`${Number(today.slice(0,4))+2}${today.slice(4)}`;
}
export function readBlocks(fields:Record<string,unknown>|undefined):CalendarBlock[] {
  const array=fields?.blocks as {arrayValue?:{values?:Array<{mapValue?:{fields?:Record<string,{stringValue?:string}>}}>}}|undefined;
  return (array?.arrayValue?.values??[]).flatMap(v=>{
    const f=v.mapValue?.fields;const id=f?.id?.stringValue,from=f?.from?.stringValue,to=f?.to?.stringValue;
    return id && from && to && dayCount(from,to)!==null ? [{id,from,to}] : [];
  });
}
export function encodeBlocks(blocks:CalendarBlock[]) {return {arrayValue:{values:blocks.map(b=>({mapValue:{fields:{id:{stringValue:b.id},from:{stringValue:b.from},to:{stringValue:b.to}}}}))}};}
