// Shared, pure policy: both the API and the UI use the same lifecycle.
export type RequestStatus = "requested" | "accepted" | "declined" | "cancelled";
export type Decision = "accept" | "decline" | "cancel";
export type WorkflowAgreement = {
  id: string; borrowerUid?: string; lenderUid?: string; from: string; to: string;
  requestStatus?: RequestStatus; createdAt?: string; updatedAt?: string;
  borrowerSignature?: unknown; lenderSignature?: unknown;
  borrowerReturnSignature?: unknown; lenderReturnSignature?: unknown; returnedAt?: string;
  activityAt?: string; activityBy?: string; activityKind?: string;
  notificationReads?: Record<string, string[]>;
};
export function agreementStage(a: WorkflowAgreement) {
  if (a.returnedAt || (a.borrowerReturnSignature && a.lenderReturnSignature)) return "returned";
  if (a.requestStatus === "declined" || a.requestStatus === "cancelled") return a.requestStatus;
  if (a.borrowerSignature && a.lenderSignature) return "handedOver";
  // Preserve previously signed agreements; unsigned legacy requests need approval.
  if (a.requestStatus === "accepted" || a.borrowerSignature || a.lenderSignature) return "accepted";
  return "requested";
}
export function isArchived(a: WorkflowAgreement) {
  return ["returned", "declined", "cancelled"].includes(agreementStage(a));
}
export function decisionAllowed(a: WorkflowAgreement, uid: string, action: Decision) {
  const stage = agreementStage(a);
  if (action === "accept" || action === "decline") return a.lenderUid === uid && stage === "requested";
  return (a.borrowerUid === uid || a.lenderUid === uid) &&
    (stage === "requested" || stage === "accepted") && !a.borrowerSignature && !a.lenderSignature;
}
export function overlaps(a: {from:string;to:string}, b: {from:string;to:string}) {
  // Calendar days are inclusive: two bookings cannot share the return day.
  return a.from <= b.to && b.from <= a.to;
}
export function reservesDates(a: WorkflowAgreement) {
  return ["accepted", "handedOver"].includes(agreementStage(a));
}
export function circleToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Copenhagen", year:"numeric", month:"2-digit", day:"2-digit"}).format(now);
}
export const stageLabels = {
  da: {requested:"Afventer ejerens svar", accepted:"Godkendt · afventer udlevering", handedOver:"Udleveret · afventer retur", returned:"Tilbageleveret · afsluttet", declined:"Afvist", cancelled:"Annulleret"},
  sv: {requested:"Inväntar ägarens svar", accepted:"Godkänd · inväntar utlämning", handedOver:"Utlämnad · inväntar retur", returned:"Återlämnad · avslutad", declined:"Avböjd", cancelled:"Avbruten"},
};
export type AgreementNotice = {id:string;agreementId:string;kind:string;at:string;read:boolean};
export function agreementNotices(a: WorkflowAgreement, uid: string, today = circleToday()): AgreementNotice[] {
  if (uid !== a.borrowerUid && uid !== a.lenderUid) return [];
  const result: AgreementNotice[] = [];
  const add = (kind: string, key: string, at: string) => result.push({id:`${a.id}:${key}`,agreementId:a.id,kind,at,read:(a.notificationReads?.[uid] ?? []).includes(`${a.id}:${key}`)});
  if (a.activityAt && a.activityBy !== uid) add(a.activityKind ?? "updated", `activity:${a.activityAt}`, a.activityAt);
  const stage = agreementStage(a);
  const mine = uid === a.borrowerUid ? a.borrowerSignature : a.lenderSignature;
  const myReturn = uid === a.borrowerUid ? a.borrowerReturnSignature : a.lenderReturnSignature;
  if (stage === "requested" && uid === a.lenderUid && !a.activityAt) add("requested", "legacy-request", a.createdAt ?? a.from);
  if (stage === "accepted" && !mine) add("handover", "handover", a.from);
  if (stage === "accepted" && a.from <= today) add("pickupDue", "pickup", a.from);
  if (stage === "handedOver" && !myReturn && a.to <= today) add(a.to < today ? "overdue" : "returnDue", `return:${today > a.to ? "overdue" : "due"}`, a.to);
  return result;
}
export const noticeLabels: Record<"da"|"sv",Record<string,string>> = {
  da:{requested:"Ny låneforespørgsel",accepted:"Forespørgslen er godkendt",declined:"Forespørgslen er afvist",cancelled:"Aftalen er annulleret",message:"Ny besked",signature:"Ny underskrift",note:"Aftalens noter er opdateret",returned:"Tilbageleveringen er afsluttet",handover:"Din underskrift ved udlevering mangler",returnDue:"Aftalt tilbagelevering er i dag",overdue:"Returkvitteringen mangler efter afleveringsdatoen",updated:"Aftalen er opdateret"},
  sv:{requested:"Ny låneförfrågan",accepted:"Förfrågan är godkänd",declined:"Förfrågan har avböjts",cancelled:"Avtalet har avbrutits",message:"Nytt meddelande",signature:"Ny signatur",note:"Avtalets anteckningar har uppdaterats",returned:"Återlämningen är avslutad",handover:"Din signatur vid utlämning saknas",returnDue:"Avtalad återlämning är i dag",overdue:"Returkvittot saknas efter återlämningsdatumet",updated:"Avtalet har uppdaterats"},
};
noticeLabels.da.pickupDue = "Den aftalte afhentningsdato er nået";
noticeLabels.sv.pickupDue = "Det avtalade hämtningsdatumet har nåtts";
noticeLabels.da.photos = "Aftalens billeder er opdateret";
noticeLabels.sv.photos = "Avtalets bilder har uppdaterats";

export function agreementErrorText(cause:unknown, lang:"da"|"sv") {
  const message = cause instanceof Error ? cause.message : "Aftalen kunne ikke opdateres.";
  if (lang === "da") return message;
  if (message.includes("to forskellige konti")) return "Avtalet måste vara kopplat till två olika konton. Skapa en ny förfrågan på rätt annons.";
  if (message.includes("pris eller depositum er ændret")) return "Annonsens pris eller deposition har ändrats. Stäng förfrågan och öppna annonsen igen.";
  if (message.includes("booket")) return "Saken är redan bokad under en del av perioden. Välj andra datum.";
  if (message.includes("Noten er ændret")) return "Anteckningen har ändrats. Öppna avtalet igen, läs den och signera på nytt.";
  if (message.includes("Billederne er ændret")) return "Bilderna har ändrats. Öppna avtalet igen, granska bilderna och signera på nytt.";
  if (message.includes("ændret samtidig")) return "Avtalet ändrades samtidigt. Uppdatera och försök igen.";
  if (message.includes("Ejeren skal godkende")) return "Ägaren måste godkänna förfrågan först.";
  if (message.includes("Perioden er udløbet")) return "Perioden har passerat. Be om en ny förfrågan.";
  if (message.includes("ikke længere aktiv") || message.includes("Annoncen findes ikke")) return "Annonsen är inte längre aktiv.";
  if (message.includes("Begge profiler")) return "Båda profilerna måste vara kompletta före en förfrågan.";
  if (message.includes("Vælg gyldige datoer")) return "Välj giltiga datum från i dag, högst 366 dagar.";
  if (message.includes("allerede gemt")) return "Avtalet är redan sparat och kan inte skrivas över. Uppdatera översikten.";
  if (message.includes("låst")) return "Anteckningen är låst eftersom en part redan har signerat.";
  return "Åtgärden kunde inte slutföras. Uppdatera avtalet och försök igen.";
}
