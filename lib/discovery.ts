import {distanceKm,places,type Place} from "./marketplace";
export type SearchFilter={query:string;country:string;category:string;price:string;radius:string;placeId:string};
export type SavedSearch=SearchFilter & {id:string;alerts:boolean;createdAt:string;seenThrough:string};
export type Preferences={favorites:string[];searches:SavedSearch[]};
export function cleanSearch(raw:unknown):SearchFilter|null {
  if(!raw||typeof raw!=="object")return null;const v=raw as Record<string,unknown>;
  if(typeof v.query!=="string"||v.query.length>100||!["ALL","DK","SE"].includes(String(v.country))||!["all","tools","transport","garden","leisure","party","kitchen","bike"].includes(String(v.category))||!["all","free","paid"].includes(String(v.price))||!["all","5","10","25","50","100","200"].includes(String(v.radius)))return null;
  const placeId=typeof v.placeId==="string"?v.placeId:"";
  if(v.radius!=="all"&&!places.some(p=>p.id===placeId))return null;
  return {query:v.query.trim(),country:String(v.country),category:String(v.category),price:String(v.price),radius:String(v.radius),placeId};
}
export function matchesSearch(s:SearchFilter,item:{name:string;description:string;country:string;category:string;dailyPrice:number;place:Place;city:string}) {
  const origin=places.find(p=>p.id===s.placeId),q=s.query.toLocaleLowerCase();
  return (s.country==="ALL"||s.country===item.country)&&(s.category==="all"||s.category===item.category)&&(s.price==="all"||(s.price==="free"?item.dailyPrice===0:item.dailyPrice>0))&&(!q||`${item.name} ${item.description} ${item.city}`.toLocaleLowerCase().includes(q))&&(s.radius==="all"||!!origin&&distanceKm(origin,item.place)<=Number(s.radius));
}
