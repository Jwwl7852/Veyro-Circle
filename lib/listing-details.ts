export const detailFields:Record<string,Array<{key:string;da:string;sv:string}>>={
 transport:[{key:"dimensions",da:"Ladmål / plads",sv:"Lastmått / utrymme"},{key:"payload",da:"Tilladt lasteevne (kg)",sv:"Tillåten lastvikt (kg)"},{key:"connection",da:"Stik og tilkobling",sv:"Kontakt och koppling"}],
 tools:[{key:"model",da:"Mærke og model",sv:"Märke och modell"},{key:"power",da:"Batteri eller strøm",sv:"Batteri eller el"},{key:"accessories",da:"Medfølgende tilbehør",sv:"Tillbehör som ingår"}],
 garden:[{key:"model",da:"Mærke og model",sv:"Märke och modell"},{key:"power",da:"Batteri / strøm / brændstof",sv:"Batteri / el / bränsle"},{key:"accessories",da:"Medfølgende tilbehør",sv:"Tillbehör som ingår"}],
 leisure:[{key:"size",da:"Størrelse og kapacitet",sv:"Storlek och kapacitet"},{key:"accessories",da:"Medfølgende tilbehør",sv:"Tillbehör som ingår"}],
 party:[{key:"capacity",da:"Antal personer / kapacitet",sv:"Antal personer / kapacitet"},{key:"setup",da:"Opsætning og strømbehov",sv:"Montering och elbehov"}],
 kitchen:[{key:"capacity",da:"Kapacitet",sv:"Kapacitet"},{key:"cleaning",da:"Rengøring ved retur",sv:"Rengöring vid återlämning"}],
 bike:[{key:"size",da:"Stelstørrelse / passende højde",sv:"Ramstorlek / passande längd"},{key:"type",da:"Cykeltype",sv:"Cykeltyp"},{key:"accessories",da:"Lås, hjelm og andet tilbehør",sv:"Lås, hjälm och andra tillbehör"}],
};
export function cleanDetails(category:string,input:unknown):Record<string,string> {
  if(!input || typeof input!=="object" || Array.isArray(input))return {};
  const data=input as Record<string,unknown>;
  return Object.fromEntries((detailFields[category]??[]).flatMap(({key})=>typeof data[key]==="string" && data[key].trim() ? [[key,data[key].trim().slice(0,200)]]:[]));
}
