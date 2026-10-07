export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type Value={nullValue?:null;booleanValue?:boolean;integerValue?:string;doubleValue?:number;stringValue?:string;timestampValue?:string;arrayValue?:{values?:Value[]};mapValue?:{fields?:Record<string,Value>}};
export function encode(value:Json):Value {
  if(value===null)return {nullValue:null};if(typeof value==="boolean")return {booleanValue:value};if(typeof value==="number")return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};if(typeof value==="string")return {stringValue:value};if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
}
export function decode(v:Value):Json {if("nullValue" in v)return null;if(v.booleanValue!==undefined)return v.booleanValue;if(v.integerValue!==undefined)return Number(v.integerValue);if(v.doubleValue!==undefined)return v.doubleValue;if(v.stringValue!==undefined)return v.stringValue;if(v.timestampValue!==undefined)return v.timestampValue;if(v.arrayValue)return(v.arrayValue.values??[]).map(decode);return Object.fromEntries(Object.entries(v.mapValue?.fields??{}).map(([k,v])=>[k,decode(v)]));}
export const decodeFields=(fields:Record<string,Value>={})=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decode(v)]));
export const encodeFields=(data:Record<string,Json>)=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]));
