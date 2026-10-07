import { agreementStage, type WorkflowAgreement } from "./agreement-workflow";
type Phase="handover"|"return";
type Agreement=WorkflowAgreement & {handoverNote?:string;returnNote?:string;saved?:boolean};
export type NoteEdit={id:string;value:string}|null;
export function displayedAgreementNote(a:Agreement|null,phase:Phase,edit:NoteEdit) {
  if (!a) return "";
  const locked=phase === "handover" ? a.borrowerSignature || a.lenderSignature : a.borrowerReturnSignature || a.lenderReturnSignature || a.returnedAt;
  // Untouched forms follow the server. Signed notes always show the exact
  // locked text rather than a stale local draft that blocks the second signer.
  return !locked && edit?.id === a.id ? edit.value : (phase === "handover" ? a.handoverNote : a.returnNote) ?? "";
}
export function agreementSigning(a:Agreement,uid:string,role:"borrower"|"lender",phase:Phase,draft:string,photosReady:boolean,lang:"da"|"sv") {
  const da=lang === "da";
  const blocked=(reason:string)=>({canSign:false,reason});
  if (!a.borrowerUid || !a.lenderUid || a.borrowerUid === a.lenderUid) return blocked(da ? "Aftalen skal være knyttet til to forskellige konti. Opret en ny forespørgsel på den rigtige annonce." : "Avtalet måste vara kopplat till två olika konton. Skapa en ny förfrågan på rätt annons.");
  const expected=role === "borrower" ? a.borrowerUid : a.lenderUid;
  if (!expected) return blocked(da ? "Denne part mangler en tilknyttet konto. Opret en ny forespørgsel fra den rigtige annonce." : "Den här parten saknar ett kopplat konto. Skapa en ny förfrågan från rätt annons.");
  if (uid !== expected) return blocked(da ? "Denne person skal åbne samme ticket under Mine lån og underskrive fra sin egen konto." : "Den här personen ska öppna samma ticket under Mina lån och signera från sitt eget konto.");
  if (!a.saved) return blocked(da ? "Gem aftalen først." : "Spara avtalet först.");
  const stage=agreementStage(a);
  if (stage === "returned" || stage === "cancelled" || stage === "declined") return blocked(da ? "Aftalen er afsluttet eller annulleret." : "Avtalet är avslutat eller avbrutet.");
  if (phase === "handover" && stage !== "accepted") return blocked(da ? "Ejeren skal først godkende forespørgslen under Mine lån → Jeg udlåner." : "Ägaren måste först godkänna förfrågan under Mina lån → Jag lånar ut.");
  if (phase === "return" && (!a.borrowerSignature || !a.lenderSignature)) return blocked(da ? "Begge parter skal først underskrive udleveringen." : "Båda parter måste först signera utlämningen.");
  if (draft.trim() !== ((phase === "handover" ? a.handoverNote : a.returnNote) ?? "").trim()) return blocked(da ? "Gem din ændring til noten ovenfor, før du underskriver." : "Spara din ändring av anteckningen ovan innan du signerar.");
  if (!photosReady) return blocked(da ? "Vent på billederne og markér ovenfor, at du har gennemgået dem." : "Vänta på bilderna och markera ovan att du har granskat dem.");
  return {canSign:true,reason:""};
}
