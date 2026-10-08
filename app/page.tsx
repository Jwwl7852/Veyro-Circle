"use client";
import { COMPANY_IDENTITY } from "@/lib/company";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ListingReviews,ReviewForm } from "@/components/circle-reviews";
import { WantedBoard } from "@/components/wanted-board";
import { AgreementExtension } from "@/components/agreement-extension";
import { validTime,type AgreementSchedule } from "@/lib/agreement-schedule";
import { SavedSearches } from "@/components/saved-searches";
import { communityFetch } from "@/lib/community-client";
import { matchesSearch,type Preferences,type SearchFilter } from "@/lib/discovery";
import { detailFields } from "@/lib/listing-details";
import { ListingCalendar } from "@/components/listing-calendar";
import { loadAvailability } from "@/lib/firebase-calendar";
import { validPeriod, type Period } from "@/lib/listing-calendar";
import { PushSettings } from "@/components/push-settings";
import { CircleAuthScreen, EmailVerificationScreen, FirebaseSetupNotice, circleSignOut, useCircleAuth } from "@/components/circle-auth";
import { loadCircleProfile, saveCircleProfile, saveCircleLanguage } from "@/lib/firebase-profile";
import { agreementsChanged, loadBookedPeriods, loadCircleAgreements, saveCircleAgreement, saveCircleAgreementNote, saveCircleSignature, updateCircleAgreement, type SignaturePhase, type StoredAgreement } from "@/lib/firebase-agreements";
import { agreementErrorText, agreementNotices, agreementStage, circleToday, decisionAllowed, isArchived, noticeLabels, overlaps, stageLabels, type AgreementNotice, type Decision, type WorkflowAgreement } from "@/lib/agreement-workflow";
import { sendCircleMessage, subscribeToCircleMessages, type CircleMessage } from "@/lib/firebase-messages";
import { deleteCircleListing, saveCircleListing, subscribeToCircleListings, type CircleListingRecord } from "@/lib/firebase-listings";
import { openBilling } from "@/lib/billing-client";
import { PlacePicker, CountrySelect, ProfileForm } from "@/components/marketplace-fields";
import { CommunityMap } from "@/components/community-map";
import { AgreementJourney } from "@/components/agreement-journey";
import { agreementSigning, displayedAgreementNote, type NoteEdit } from "@/lib/agreement-signing";
import { parseDeposit } from "@/lib/marketplace";
import { AgreementPhotos as AgreementPhotoPanel } from "@/components/agreement-photos";
import { phasePhotos, photoVersion, type AgreementPhotos, type AgreementPhoto } from "@/lib/agreement-photos";
import { SEARCH_RADII, defaultSearchRadius, type Place, type Profile, type Country, type ListingPlan, distanceKm, places,parseDailyPrice, money, dayCount, todayLocal, canCreateListing, listingLimit, PLUS_LISTING_LIMIT } from "@/lib/marketplace";
import { compressListingImage, formatImageSize, MAX_LISTING_IMAGES, type CompressedListingImage } from "@/lib/image-compression";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Bell, Bike, CalendarDays, Camera, Check, ChevronDown, CircleUserRound, Drill,
  SprayCan, Heart, Home, ImagePlus, Languages, MapPin, Map as MapIcon, MessageCircle,
  PackagePlus, PartyPopper, Pencil, Search, ShieldCheck, Sparkles, TentTree,
  Trash2, Truck, Utensils, Wrench, X, Crown, FileSignature, Printer, LockKeyhole,
  LogOut, LoaderCircle, Send, Save, RefreshCw, List, LayoutGrid,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Lang = "da" | "sv";
type Tab = "saved" | "wanted" | "home" | "map" | "items" | "requests" | "profile" | "subscription";
type AgreementSignature = { dataUrl: string; signedAt: string };
type Loan = WorkflowAgreement & AgreementPhotos & AgreementSchedule & { id: string; item: Listing; from: string; to: string; days: number; total: number; deposit: number; message: string; handoverNote?: string; returnNote?: string; borrower: Profile; borrowerUid?: string; lenderUid?: string; borrowerSignature?: AgreementSignature; lenderSignature?: AgreementSignature; borrowerReturnSignature?: AgreementSignature; lenderReturnSignature?: AgreementSignature; returnedAt?: string; returnCondition?: "good" | "remarks"; saved?: boolean };
type Listing = {
  id: string; name: string; owner: string; city: string; country: "DK" | "SE";
  ownerStreet: string; ownerPhone: string; ownerUid?: string;
  distance: number; category: string; icon: typeof Drill; color: string;
  publishable?:boolean;description: string; details?:Record<string,string>;createdAt?:string; rating: number; availability: string;
  place: Place; dailyPrice: number; deposit?:number; photos?: CompressedListingImage[]; owned?: boolean;
};

const categories = [
  { id: "all", da: "Alt", sv: "Allt", icon: Sparkles },
  { id: "transport", da: "Transport", sv: "Transport", icon: Truck },
  { id: "tools", da: "Værktøj", sv: "Verktyg", icon: Wrench },
  { id: "garden", da: "Have", sv: "Trädgård", icon: SprayCan },
  { id: "leisure", da: "Fritid", sv: "Fritid", icon: TentTree },
  { id: "party", da: "Fest", sv: "Fest", icon: PartyPopper },
  { id: "kitchen", da: "Køkken", sv: "Kök", icon: Utensils },
  { id: "bike", da: "Cykler", sv: "Cyklar", icon: Bike },
  { id: "other", da: "Andet", sv: "Övrigt", icon: PackagePlus },
];

const categoryColors: Record<string, string> = {
  tools: "from-[#f7d87b] to-[#e8ad35]",
  transport: "from-[#96c9ed] to-[#62a7de]",
  garden: "from-[#91d9bc] to-[#4bb993]",
  leisure: "from-[#81c6c8] to-[#3ca3ab]",
  bike: "from-[#acbff0] to-[#819fdf]",
  party: "from-[#efb99d] to-[#db956f]",
  kitchen: "from-[#e7c5a2] to-[#cfaa80]",
};

function listingFromCloud(record: CircleListingRecord, currentUid: string): Listing {
  const category = categories.find(item => item.id === record.category);
  return {
    ...record,
    ownerStreet:"",
    ownerPhone:"",
    distance:0,
    icon:category?.icon ?? PackagePlus,
    color:categoryColors[record.category] ?? categoryColors.tools,
    details:record.details,createdAt:record.createdAt,
    rating:0,
    availability:"",
    owned:record.ownerUid === currentUid,
  };
}

const copy = {
  da: {
    search: "Hvad vil du låne?", nearby: "Begge lande", denmark: "Danmark", sweden: "Sverige",
    heroKicker: "Del mere i dit lokalområde", heroTitle: "Brug mere. Køb mindre.",
    heroText: "Lån gratis eller lej til en overkommelig pris. Find ting i nærheden, og del det, du ikke bruger hver dag.",
    heroButton: "Find noget at låne", addItem: "Tilføj en ting", popular: "Ting i dit søgeområde",
    viewAll: "Se alle", free: "Gratis", borrow: "Spørg om at låne", navHome: "Hjem",
    navItems: "Mine ting", navRequests: "Mine lån", navProfile: "Konto", results: "ting fundet",
    noResults: "Ingen ting matcher din søgning endnu.", addTitle: "Hvad vil du dele?",
    addDescription: "Vælg gratis udlån eller angiv en pris pr. dag. Kun by og postnummer vises.", itemName: "Navn på tingen",
    city: "By", description: "Kort beskrivelse", publish: "Opret annonce", photo: "Tilføj billeder",
    requestTitle: "Vælg hvornår du vil låne", from: "Fra", to: "Til", message: "Besked til ejeren",
    send: "Send forespørgsel", trust: "Trygt at dele",
    trustText: "Din adresse vises ikke i søgeresultater. Aftal altid afhentning og aflevering med ejeren.",
    requests: "Mine lån", outgoing: "Sendte", incoming: "Modtagne", approved: "Godkendt",
    awaiting: "Afventer svar", activeLoan: "Aktivt lån", chat: "Skriv besked", impact: "Din effekt",
    loans: "gennemførte lån", saved: "kr. sparet i fællesskabet", itemsShared: "ting delt",
    memberSince: "Medlem siden 2026", verify: "Bekræftet Circle-profil", country: "Land", language: "Sprog",
  },
  sv: {
    search: "Vad vill du låna?", nearby: "Båda länderna", denmark: "Danmark", sweden: "Sverige",
    heroKicker: "Dela mer i ditt närområde", heroTitle: "Använd mer. Köp mindre.",
    heroText: "Låna gratis eller hyr till ett överkomligt pris. Hitta saker i närheten och dela det du inte använder varje dag.",
    heroButton: "Hitta något att låna", addItem: "Lägg till en sak", popular: "Saker i ditt sökområde",
    viewAll: "Visa alla", free: "Gratis", borrow: "Fråga om att låna", navHome: "Hem",
    navItems: "Mina saker", navRequests: "Mina lån", navProfile: "Konto", results: "saker hittades",
    noResults: "Inga saker matchar din sökning ännu.", addTitle: "Vad vill du dela?",
    addDescription: "Välj gratis utlåning eller ange ett pris per dag. Bara ort och postnummer visas.", itemName: "Sakens namn",
    city: "Ort", description: "Kort beskrivning", publish: "Skapa annons", photo: "Lägg till bilder",
    requestTitle: "Välj när du vill låna", from: "Från", to: "Till", message: "Meddelande till ägaren",
    send: "Skicka förfrågan", trust: "Tryggt att dela",
    trustText: "Din adress visas inte i sökresultat. Kom alltid överens med ägaren om hämtning och återlämning.",
    requests: "Mina lån", outgoing: "Skickade", incoming: "Mottagna", approved: "Godkänd",
    awaiting: "Väntar på svar", activeLoan: "Aktivt lån", chat: "Skriv meddelande", impact: "Din effekt",
    loans: "genomförda lån", saved: "kr sparade i gemenskapen", itemsShared: "saker delade",
    memberSince: "Medlem sedan 2026", verify: "Bekräftad Circle-profil", country: "Land", language: "Språk",
  },
};

export default function HomePage() {
  const { user, loading: authLoading, configured } = useCircleAuth();
  const [lang, setLang] = useState<Lang>("da");
  const [languageSaving,setLanguageSaving]=useState(false);
  const reportProfileError=useEffectEvent(()=>toast.error(lang === "da" ? "Profilen kunne ikke hentes fra Firebase." : "Profilen kunde inte hämtas från Firebase."));
  async function changeLanguage(next:Lang) {
    if(languageSaving)return;
    setLang(next);
    if(!user?.emailVerified)return;
    setLanguageSaving(true);
    try{await saveCircleLanguage(user,next);}catch{toast.error(next==="da"?"Sproget er skiftet, men kunne ikke gemmes på kontoen. Prøv igen.":"Språket har ändrats men kunde inte sparas på kontot. Försök igen.");}finally{setLanguageSaving(false);}
  }
  useEffect(()=>{document.documentElement.lang=lang;},[lang]);
  const [prefs,setPrefs]=useState<Preferences>({favorites:[],searches:[]});
  const [onlyFavorites,setOnlyFavorites]=useState(false);
  const [listingView,setListingView]=useState<"list"|"kanban">("kanban");
  const [favoriteBusy,setFavoriteBusy]=useState<string|null>(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [calendarItem,setCalendarItem]=useState<Listing|null>(null);
  const [searchFrom,setSearchFrom]=useState("");
  const [searchTo,setSearchTo]=useState("");
  const [dateResults,setDateResults]=useState<{key:string;periods:Record<string,Period[]|null>;error:boolean}>({key:"",periods:{},error:false});
  const [calendarRevision,setCalendarRevision]=useState(0);
  const [listingsLoading,setListingsLoading]=useState(true);
  const [listingsError,setListingsError]=useState(false);
  const [tab, setTab] = useState<Tab>("home");
  useEffect(()=>{
    if(!user?.emailVerified) return;
    void import("@/lib/firebase-push").then(m=>m.maintainPush(user.uid,lang)).catch(()=>undefined);
  },[user?.uid,user?.emailVerified,lang]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [newName, setNewName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [radius, setRadius] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [newCountry, setNewCountry] = useState<Country>("DK");
  const [newPlace, setNewPlace] = useState<Place | null>(null);
  const [newDetails,setNewDetails]=useState<Record<string,string>>({});
  const [newCategory, setNewCategory] = useState("tools");
  const [pricing, setPricing] = useState("free");
  const [priceInput, setPriceInput] = useState("");
  const [pickupTime,setPickupTime]=useState("10:00");
  const [returnTime,setReturnTime]=useState("17:00");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [newDepositInput, setNewDepositInput] = useState("");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [agreementLoan, setAgreementLoan] = useState<Loan | null>(null);
  const [chatLoan, setChatLoan] = useState<Loan | null>(null);
  const [agreementsError, setAgreementsError] = useState(false);
  const [agreementSaving, setAgreementSaving] = useState(false);
  const [signatureBusy, setSignatureBusy] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState<SignaturePhase | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoReviews, setPhotoReviews] = useState<Record<string,string>>({});
  const [handoverEdit,setHandoverEdit] = useState<NoteEdit>(null);
  const [returnEdit,setReturnEdit] = useState<NoteEdit>(null);
  const handoverNoteDraft=displayedAgreementNote(agreementLoan,"handover",handoverEdit);
  const returnNoteDraft=displayedAgreementNote(agreementLoan,"return",returnEdit);
  function setHandoverNoteDraft(value:string) {setHandoverEdit(agreementLoan && value !== (agreementLoan.handoverNote ?? "") ? {id:agreementLoan.id,value} : null);}
  function setReturnNoteDraft(value:string) {setReturnEdit(agreementLoan && value !== (agreementLoan.returnNote ?? "") ? {id:agreementLoan.id,value} : null);}
  const [formError, setFormError] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPhotos, setNewPhotos] = useState<CompressedListingImage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Listing | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [listingSaving, setListingSaving] = useState(false);
  const [requestPreparing, setRequestPreparing] = useState(false);
  const [listingPlan, setListingPlan] = useState<ListingPlan>("free");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loanDirection,setLoanDirection] = useState<"borrower"|"lender">("borrower");
  const [loanArchive,setLoanArchive] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{loan:Loan;action:Decision} | null>(null);
  const [agreementsLoading, setAgreementsLoading] = useState(true);
  const [today, setToday] = useState(circleToday);
  const [bookedPeriods,setBookedPeriods] = useState<Array<{from:string;to:string}>>([]);
  const [availabilityError,setAvailabilityError] = useState(false);
  const bookingConflict = bookedPeriods.some(period=>overlaps({from,to},period));
  const requestTicket = useRef<string | null>(null);
  const notices = loans.flatMap(loan=>agreementNotices(loan,user?.uid ?? "",today)).sort((a,b)=>b.at.localeCompare(a.at));
  const unreadCount = notices.filter(n=>!n.read).length;
  const awaitingCount = loans.filter(loan=>loan.lenderUid === user?.uid && agreementStage(loan) === "requested").length;
  const requestSent = awaitingCount > 0;
  const t = copy[lang];
  const days = dayCount(from, to);
  const dateValid = days !== null && from >= todayLocal() && validTime(pickupTime) && validTime(returnTime) && (from!==to || returnTime>pickupTime);

  useEffect(()=>{
    if (!showRequest || !selected?.id) return;
    let active = true;
    loadBookedPeriods(selected.id).then(periods=>{if(active) {setBookedPeriods(periods);setAvailabilityError(false);}}).catch(()=>{if(active) setAvailabilityError(true);});
    return ()=>{active=false;};
  },[showRequest,selected?.id]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("checkout");
    if (status === "success") toast.success(lang === "da" ? "Tak. Stripe behandler dit Circle Plus-abonnement." : "Tack. Stripe behandlar din Circle Plus-prenumeration.");
    if (status === "cancelled") toast.info(lang === "da" ? "Betalingen blev afbrudt. Der er ikke trukket penge." : "Betalningen avbröts. Inga pengar har dragits.");
    if (status) history.replaceState({}, "", window.location.pathname);
  }, [lang]);

  async function billing(action: "checkout" | "portal") {
    if (!configured || !user) {
      toast.error(lang === "da" ? "Betaling er ikke konfigureret endnu." : "Betalning är inte konfigurerad ännu.");
      return;
    }
    setBillingBusy(true);
    try { await openBilling(user, action); }
    catch (error) { toast.error(error instanceof Error ? error.message : (lang === "da" ? "Stripe kunne ikke åbnes." : "Stripe kunde inte öppnas.")); setBillingBusy(false); }
  }

  useEffect(() => {
    if (!configured || !user?.emailVerified) return;
    let active = true;
    // The loading flag intentionally mirrors this external Firestore request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileLoading(true);
    loadCircleProfile(user.uid).then(cloud => {
      if (!active) return;
      if (cloud) {
        const next = { defaultRadiusKm: cloud.defaultRadiusKm, name: cloud.name, email: user.email || cloud.email, phone: cloud.phone, street: cloud.street, place: cloud.place, taxAcknowledgement: cloud.taxAcknowledgement };
        setProfile(next); setLang(cloud.preferredLanguage); setOrigin(cloud.place);setRadius(String(defaultSearchRadius(cloud.defaultRadiusKm))); setNewPlace(cloud.place); setNewCountry(cloud.place.country);
        setListingPlan(cloud.subscriptionPlan === "plus" ? "plus" : "free");
      } else setTab("profile");
    }).catch(() => reportProfileError())
      .finally(() => active && setProfileLoading(false));
    return () => { active = false; };
  }, [configured, user?.email, user?.emailVerified, user?.uid]);

  useEffect(() => {
    if (!configured || !user?.emailVerified) return;
    let active = true;
    let loading = false;
    let queued = false;
    const refresh = async () => {
      if (loading) { queued = true; return; }
      loading = true;
      try {
        const records = await loadCircleAgreements(user.uid);
        if (!active) return;
        const next = records.map(agreementFromCloud);
        setAgreementsError(false); setLoans(next); setToday(circleToday());
        setAgreementLoan(current=>current ? next.find(item=>item.id === current.id) ?? null : null);
        const params=new URLSearchParams(window.location.search);
        const ticket=params.get("ticket");
        const target=next.find(item=>item.id === ticket);
        if(target && params.has("push")) {
          setTab("requests");setLoanDirection(target.lenderUid === user.uid ? "lender" : "borrower");setLoanArchive(isArchived(target));
          if(params.get("push") === "message") setChatLoan(target);
          else if(agreementStage(target) !== "requested") setAgreementLoan(target);
          params.delete("ticket");params.delete("push");
          window.history.replaceState(null,"",window.location.pathname+(params.size ? "?"+params.toString() : ""));
        }
      } catch { if (active) setAgreementsError(true); }
      finally {
        loading = false;
        if (active) setAgreementsLoading(false);
        if (active && queued) { queued = false; void refresh(); }
      }
    };
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = window.setInterval(visibleRefresh,15_000);
    window.addEventListener("focus",visibleRefresh);
    document.addEventListener("visibilitychange",visibleRefresh);
    window.addEventListener("circle:agreements-changed",visibleRefresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus",visibleRefresh); document.removeEventListener("visibilitychange",visibleRefresh); window.removeEventListener("circle:agreements-changed",visibleRefresh); };
  }, [configured, user?.emailVerified, user?.uid]);

  useEffect(() => {
    if (!configured) return;
    return subscribeToCircleListings(records => {
      setListingsLoading(false);setListingsError(false);
      const linkedId=new URLSearchParams(window.location.search).get("listing");
      if(linkedId){const linked=records.find(r=>r.id===linkedId);if(linked){setSelected(listingFromCloud(linked,user?.uid??""));window.history.replaceState(null,"",window.location.pathname);}}
      setListings(records.map(record => ({...listingFromCloud(record, user?.uid ?? ""),availability:lang === "da" ? "Forespørg om datoer" : "Fråga om datum"})));
    }, error => {
      setListingsLoading(false);setListingsError(true);
      console.error("Circle listings could not be loaded", error);
      toast.error(lang === "da" ? "Annoncerne kunne ikke hentes fra Firebase." : "Annonserna kunde inte hämtas från Firebase.");
    });
  }, [configured, lang, user?.emailVerified, user?.uid]);

  const nearby = useMemo(() => {
    if (!origin && radius !== "all") return [];
    const q = query.trim().toLowerCase();
    return listings.map(item => ({ ...item, distance: origin ? distanceKm(origin, item.place) : NaN })).filter(item =>
      item.publishable!==false && 
      (category === "all" || item.category === category) &&
      (radius === "all" || item.distance <= Number(radius)) &&
      (priceFilter === "all" || (priceFilter === "free" ? item.dailyPrice === 0 : item.dailyPrice > 0)) &&
      (!onlyFavorites || prefs.favorites.includes(item.id)) &&
      (!q || `${item.name} ${item.city} ${item.description}`.toLowerCase().includes(q))
    ).sort((a,b) => origin ? a.distance - b.distance : a.id.localeCompare(b.id));
  }, [category, listings, query, origin, radius, priceFilter,onlyFavorites,prefs.favorites]);

  const datesEntered=Boolean(searchFrom || searchTo);
  const searchDatesValid=validPeriod(searchFrom,searchTo,today);
  const searchDays=searchDatesValid ? dayCount(searchFrom,searchTo) : null;
  const candidateIds=nearby.map(item=>item.id).join(",");
  const availabilityKey=`${candidateIds}|${searchFrom}|${searchTo}|${calendarRevision}`;
  const datePending=datesEntered && searchDatesValid && dateResults.key!==availabilityKey;
  const dateFailed=datesEntered && dateResults.key===availabilityKey && dateResults.error;
  const filtered=datesEntered ? (!searchDatesValid || datePending || dateFailed ? [] : nearby.filter(item=>Array.isArray(dateResults.periods[item.id]) && !dateResults.periods[item.id]!.some(period=>overlaps(period,{from:searchFrom,to:searchTo})))) : nearby;
  useEffect(()=>{
    const changed=()=>setCalendarRevision(v=>v+1);
    window.addEventListener("circle:calendar-changed",changed);
    window.addEventListener("circle:agreements-changed",changed);
    return()=>{window.removeEventListener("circle:calendar-changed",changed);window.removeEventListener("circle:agreements-changed",changed);};
  },[]);
  useEffect(()=>{
    if(!searchDatesValid || !datesEntered)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{void loadAvailability(candidateIds ? candidateIds.split(",") : [],controller.signal).then(periods=>{if(!controller.signal.aborted)setDateResults({key:availabilityKey,periods,error:false});}).catch(()=>{if(!controller.signal.aborted)setDateResults({key:availabilityKey,periods:{},error:true});});},250);
    return()=>{controller.abort();clearTimeout(timer);};
  },[availabilityKey,candidateIds,searchDatesValid,datesEntered]);
  useEffect(()=>{
    if(!user?.emailVerified)return;let active=true;
    communityFetch("/api/preferences").then(p=>{if(active)setPrefs(p);}).catch(()=>undefined);
    return()=>{active=false;};
  },[user?.uid,user?.emailVerified]);
  const savedFilter:SearchFilter={query,country:"ALL",category,price:priceFilter,radius,placeId:origin?.id??""};
  const savedMatches=prefs.searches.filter(s=>s.alerts).reduce((sum,s)=>sum+listings.filter(i=>!i.owned&&i.createdAt&&i.createdAt>s.seenThrough&&matchesSearch(s,i)).length,0);
  function openFavorites() {
    if (!user) { setAuthOpen(true); return; }
    setQuery(""); setCategory("all"); setPriceFilter("all");
    setRadius("all"); setSearchFrom(""); setSearchTo("");
    setOnlyFavorites(true); setTab("home");
  }
  function openHome() { setOnlyFavorites(false); setTab("home"); }
  function applySearch(filter:SearchFilter){setQuery(filter.query);setCategory(filter.category);setPriceFilter(filter.price);setRadius(filter.radius);setOrigin(places.find(p=>p.id===filter.placeId)??null);setSearchFrom("");setSearchTo("");setOnlyFavorites(false);setTab("home");setNotificationsOpen(false);}
  async function favorite(item:Listing){if(!user){setAuthOpen(true);return;}setFavoriteBusy(item.id);try{setPrefs(await communityFetch("/api/preferences",{action:"favorite",id:item.id,enabled:!prefs.favorites.includes(item.id)}));}catch{toast.error(lang==="da"?"Favoritten kunne ikke gemmes. Prøv igen.":"Favoriten kunde inte sparas. Försök igen.");}finally{setFavoriteBusy(null);}}
  function navigate(next:Tab) {if(!user && next!=="home" && next!=="wanted"){setAuthOpen(true);return;}setTab(next);}

  function resetItemForm() {
    setEditingId(null); setNewName(""); setNewDescription(""); setNewCategory("tools");setNewDetails({});
    setPricing("free"); setPriceInput(""); setNewDepositInput(""); setNewPhotos([]); setFormError("");
  }

  function openAdd() {
    if(!user){setAuthOpen(true);return;}
    if (!profile) { setTab("profile"); toast.info(lang === "da" ? "Opret først din profil med adresse og by." : "Skapa först din profil med adress och ort."); return; }
    const activeCount = listings.filter(item => item.owned).length;
    if (!canCreateListing(activeCount, listingPlan)) {
      if (listingPlan === "free") setShowUpgrade(true);
      else toast.info(lang === "da" ? "Du har nået grænsen på 20 aktive ting. Slet en ting, før du opretter en ny." : "Du har nått gränsen på 20 aktiva saker. Ta bort en sak innan du skapar en ny.");
      return;
    }
    resetItemForm(); setNewPlace(profile.place); setNewCountry(profile.place.country); setShowAdd(true);
  }

  function openEdit(item: Listing) {
    if (!item.owned) return;
    if(listingPlan!=="plus"){setSelected(null);setShowUpgrade(true);return;}
    setSelected(null); setEditingId(item.id); setNewName(item.name); setNewDescription(item.description);
    setNewCategory(item.category);setNewDetails(item.details??{}); setNewCountry(item.country); setNewPlace(item.place);
    setPricing(item.dailyPrice > 0 ? "paid" : "free");
    setPriceInput(item.dailyPrice > 0 ? String(item.dailyPrice / 100).replace(".", lang === "da" ? "," : ".") : "");
    setNewDepositInput(item.deposit ? String(item.deposit/100).replace(".",",") : "");
    setNewPhotos(item.photos || []); setFormError(""); setShowAdd(true);
  }

  async function saveProfile(next: Profile) {
    if (!configured || !user) throw new Error(lang === "da" ? "Firebase er ikke konfigureret." : "Firebase är inte konfigurerat.");
    try { await saveCircleProfile(user, next, lang); }
    catch (cause) { const message = cause instanceof Error ? cause.message : (lang === "da" ? "Profilen kunne ikke gemmes. Prøv igen." : "Profilen kunde inte sparas. Försök igen."); toast.error(message); throw cause; }
    setProfile(next); setRadius(String(defaultSearchRadius(next.defaultRadiusKm))); setOrigin(next.place); setNewPlace(next.place); setNewCountry(next.place.country);
    toast.success(lang === "da" ? "Profilen er gemt sikkert." : "Profilen har sparats säkert.");
  }

  async function logout() {
    if (configured) await circleSignOut();
    setPrefs({favorites:[],searches:[]});setOnlyFavorites(false);setProfile(null); setLoans([]); setAgreementLoan(null); setChatLoan(null); setNotificationsOpen(false); setListingPlan("free"); setOrigin(null); setRadius("all");setTab("home");setAuthOpen(false);
    toast.success(lang === "da" ? "Du er logget ud." : "Du har loggats ut.");
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || isCompressing) return;
    const available = MAX_LISTING_IMAGES - newPhotos.length;
    if (available <= 0) {
      setFormError(lang === "da" ? "Du kan højst tilføje 2 billeder." : "Du kan lägga till högst 2 bilder.");
      return;
    }
    const candidates = Array.from(files).slice(0, available);
    if (files.length > available) {
      toast.info(lang === "da" ? "Der er kun plads til 2 billeder i alt." : "Det finns bara plats för 2 bilder totalt.");
    }
    setIsCompressing(true); setFormError("");
    const compressed: CompressedListingImage[] = [];
    for (const file of candidates) {
      try {
        compressed.push(await compressListingImage(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : (lang === "da" ? "Billedet kunne ikke tilføjes." : "Bilden kunde inte läggas till."));
      }
    }
    setNewPhotos(current => [...current, ...compressed].slice(0, MAX_LISTING_IMAGES));
    setIsCompressing(false);
    if (compressed.length) toast.success(lang === "da" ? "Billedet er komprimeret og klar." : "Bilden är komprimerad och klar.");
  }

  async function publishItem() {
    const amount = pricing === "free" ? 0 : parseDailyPrice(priceInput);
    const deposit=parseDeposit(newDepositInput);
    if (deposit === null) {setFormError(lang === "da" ? "Depositum skal være mellem 0 og 100.000 kr. med højst to decimaler." : "Depositionen måste vara mellan 0 och 100 000 kr med högst två decimaler.");return;}
    if (!profile || !newName.trim() || !newPlace || newPlace.country !== newCountry || amount === null) {
      setFormError(lang === "da" ? "Udfyld navn, vælg by, og indtast en positiv dagspris med højst 2 decimaler, hvis du vælger betaling." : "Fyll i namn, välj ort och ange ett positivt dagspris med högst 2 decimaler om du väljer betalning.");
      return;
    }
    const activeCount = listings.filter(item => item.owned).length;
    if (editingId === null && !canCreateListing(activeCount, listingPlan)) {
      setShowAdd(false);
      if (listingPlan === "free") setShowUpgrade(true);
      else toast.info(lang === "da" ? "Du kan højst have 20 aktive ting." : "Du kan ha högst 20 aktiva saker.");
      return;
    }
    if (!configured || !user) { setFormError(lang === "da" ? "Du skal være logget ind for at gemme en annonce." : "Du måste vara inloggad för att spara en annons."); return; }
    const id = editingId ?? crypto.randomUUID();
    const update = {
      id, city: newPlace.city,
      country: newCountry, place: newPlace, dailyPrice: amount, deposit, category: newCategory,
      details:newDetails,description: newDescription || (lang === "da" ? "Til udlån efter aftale." : "För utlåning enligt överenskommelse."),
      photos: newPhotos, name:newName.trim(),
    };
    setListingSaving(true); setFormError("");
    try {
      const previous = editingId ? listings.find(item => item.id === editingId)?.photos ?? [] : [];
      await saveCircleListing(update, previous);
      setOrigin(newPlace); setCategory("all"); setPriceFilter("all"); setQuery("");
      setShowAdd(false); resetItemForm(); setTab("items");
      toast.success(editingId !== null
        ? (lang === "da" ? "Dine ændringer er gemt." : "Dina ändringar har sparats.")
        : (lang === "da" ? "Annoncen er oprettet og gemt i Firebase." : "Annonsen har skapats och sparats i Firebase."));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : (lang === "da" ? "Annoncen kunne ikke gemmes." : "Annonsen kunde inte sparas."));
    } finally {
      setListingSaving(false);
    }
  }

  async function deleteItem(item: Listing) {
    if (!item.owned) return;
    try {
      await deleteCircleListing({id:item.id, ownerUid:user!.uid, photos:item.photos ?? []});
      if (selected?.id === item.id) setSelected(null);
      setPendingDelete(null);
      toast.success(lang === "da" ? "Tingen og dens billeder er slettet." : "Saken och dess bilder har tagits bort.");
    } catch (error) { toast.error(error instanceof Error ? error.message : (lang === "da" ? "Tingen kunne ikke slettes." : "Saken kunde inte tas bort.")); }
  }

  function openRequest() {
    if(!user){setAuthOpen(true);return;}
    if (!profile) { setSelected(null); setTab("profile"); toast.info(lang === "da" ? "Opret først din profil med adresse og by." : "Skapa först din profil med adress och ort."); return; }
    const today = todayLocal();
    requestTicket.current = null;
    setBookedPeriods([]);setAvailabilityError(false);
    setPickupTime("10:00");setReturnTime("17:00");setFrom(searchDatesValid?searchFrom:today); setTo(searchDatesValid?searchTo:today); setFormError(""); setRequestMessage(""); setShowRequest(true);
  }

  async function sendRequest() {
    if (!selected || !profile || !dateValid || days === null || bookingConflict) {
      setFormError(lang === "da" ? "Vælg gyldige datoer. Slutdato må ikke ligge før startdato, og startdato må ikke være i fortiden." : "Välj giltiga datum. Slutdatum får inte vara före startdatum och startdatum får inte vara i det förflutna."); return;
    }
    const deposit = selected.deposit ?? 0;
    setRequestPreparing(true); setFormError("");
    try {
      const ticket = requestTicket.current ?? `VC-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      requestTicket.current = ticket;
      const item = {...selected,ownerStreet:"",ownerPhone:""};
      const loan: Loan = {id: ticket, item, from, to, pickupTime,returnTime,days, total: selected.dailyPrice * days, deposit, message: requestMessage.trim(), borrower: profile, borrowerUid: user?.uid, lenderUid: selected.ownerUid};
      const stored = await saveCircleAgreement(agreementForCloud(loan));
      const saved = agreementFromCloud(stored);
      setLoans(items=>[saved, ...items.filter(item=>item.id !== saved.id)]);
      setShowRequest(false); setSelected(null); setLoanDirection("borrower"); setLoanArchive(false); setTab("requests");
      toast.success(lang === "da" ? "Forespørgslen er sendt og gemt. Ejeren kan nu godkende eller afvise den." : "Förfrågan har skickats och sparats. Ägaren kan nu godkänna eller avböja den.");
    } catch (error) { setFormError(agreementErrorText(error,lang)); }
    finally { setRequestPreparing(false); }
  }

  async function storeAgreement(loan: Loan) {
    if (!configured || !user || !loan.borrowerUid) { toast.error(lang === "da" ? "Du skal være logget ind for at gemme aftalen." : "Du måste vara inloggad för att spara avtalet."); return; }
    setAgreementSaving(true);
    try {
      await saveCircleAgreement(agreementForCloud({...loan, borrowerSignature:undefined, lenderSignature:undefined}));
      if (loan.borrowerSignature) await saveCircleSignature(loan.id, "borrower", loan.borrowerSignature);
      const updated = {...loan, saved:true};
      setLoans(items => items.map(item => item.id === loan.id ? updated : item)); setAgreementLoan(updated);
      toast.success(lang === "da" ? "Aftalen er gemt på din konto i 12 måneder." : "Avtalet har sparats på ditt konto i 12 månader.");
    } catch (error) { toast.error(agreementErrorText(error,lang)); }
    finally { setAgreementSaving(false); }
  }

  async function signAgreement(loan: Loan, role: "borrower" | "lender", dataUrl: string, phase: SignaturePhase = "handover") {
    if (!photosReady(loan,phase)) return;
    const expectedUid = role === "borrower" ? loan.borrowerUid : loan.lenderUid;
    if (!user || expectedUid !== user.uid) { toast.error(lang === "da" ? "Du kan kun underskrive som dig selv." : "Du kan bara signera som dig själv."); return; }
    if (phase === "return" && (!loan.saved || !loan.borrowerSignature || !loan.lenderSignature)) { toast.error(lang === "da" ? "Udleveringen skal være gemt og underskrevet af begge parter først." : "Utlämningen måste vara sparad och signerad av båda parter först."); return; }
    const signature = { dataUrl, signedAt: new Date().toISOString() };
    const field = phase === "return" ? (role === "borrower" ? "borrowerReturnSignature" : "lenderReturnSignature") : (role === "borrower" ? "borrowerSignature" : "lenderSignature");
    const busyKey = `${loan.id}-${phase}-${role}`;
    setSignatureBusy(busyKey);
    try {
      const result: {returnedAt?:string;returnCondition?:"good"|"remarks"} = loan.saved ? await saveCircleSignature(loan.id, role, signature, phase, phase === "handover" ? loan.handoverNote ?? "" : loan.returnNote ?? "", phasePhotos(loan,phase).map(p=>p.id),loan.to) : {};
      const updated = { ...loan, [field]:signature, ...(result.returnedAt ? {returnedAt:result.returnedAt,returnCondition:(result.returnCondition ?? "good")} : {}) };
      setLoans(items => items.map(item => item.id === loan.id ? updated : item));
      setAgreementLoan(updated);
      toast.success(phase === "return"
        ? (result.returnedAt ? (result.returnCondition === "remarks" ? (lang === "da" ? "Returkvitteringen er færdig og registreret med bemærkninger." : "Returkvittot är klart och registrerat med anmärkningar.") : (lang === "da" ? "Returkvitteringen er færdig. Tingen er registreret som tilbageleveret i god stand." : "Returkvittot är klart. Saken är registrerad som återlämnad i gott skick.")) : (lang === "da" ? "Din returunderskrift er gemt. Den anden part mangler at underskrive." : "Din retursignatur är sparad. Den andra parten behöver fortfarande signera."))
        : loan.saved ? (lang === "da" ? "Underskriften er registreret." : "Signaturen har registrerats.") : (lang === "da" ? "Underskriften er tilføjet. Vælg ‘Gem på min konto’ for at bevare aftalen." : "Signaturen har lagts till. Välj ‘Spara på mitt konto’ för att behålla avtalet."));
    } catch (error) { toast.error(agreementErrorText(error,lang)); }
    finally { setSignatureBusy(null); }
  }

  async function storeAgreementNote(loan: Loan, phase: SignaturePhase) {
    if (!loan.saved) { toast.error(lang === "da" ? "Gem først aftalen på din konto." : "Spara först avtalet på ditt konto."); return; }
    const note = phase === "handover" ? handoverNoteDraft : returnNoteDraft;
    setNoteBusy(phase);
    try {
      const savedNote = await saveCircleAgreementNote(loan.id, phase, note);
      const field = phase === "handover" ? "handoverNote" : "returnNote";
      const updated = {...loan,[field]:savedNote};
      setLoans(items=>items.map(item=>item.id === loan.id ? updated : item));
      setAgreementLoan(updated);
      if (phase === "handover") setHandoverEdit(null); else setReturnEdit(null);
      toast.success(lang === "da" ? "Noten er gemt og klar til begge parters godkendelse." : "Anteckningen är sparad och klar för båda parternas godkännande.");
    } catch (error) { toast.error(agreementErrorText(error,lang)); }
    finally { setNoteBusy(null); }
  }

  function openAgreement(loan: Loan) {
    setPhotoReviews({});
    setHandoverEdit(null);setReturnEdit(null);
    setAgreementLoan(loan);
  }

  function photosReady(loan:Loan,phase:SignaturePhase) {
    const photos=phasePhotos(loan,phase);
    return !photoBusy && (photos.length === 0 || photoReviews[`${loan.id}:${phase}`] === photoVersion(photos));
  }
  function signing(loan:Loan,role:"borrower"|"lender",phase:SignaturePhase) {
    const result=agreementSigning(loan,user?.uid ?? "",role,phase,phase === "handover" ? handoverNoteDraft : returnNoteDraft,photosReady(loan,phase),lang);
    return {canSign:result.canSign,waitingReason:result.reason};
  }
  function changeAgreementPhotos(id:string,phase:SignaturePhase,photos:AgreementPhoto[]) {
    const field=phase === "handover" ? "handoverPhotos" : "returnPhotos";
    setLoans(items=>items.map(item=>item.id === id ? {...item,[field]:photos} : item));
    setAgreementLoan(item=>item?.id === id ? {...item,[field]:photos} : item);
  }
  function agreementPhotos(loan:Loan,phase:SignaturePhase) {
    const photos=phasePhotos(loan,phase);
    const locked=phase === "handover" ? Boolean(loan.borrowerSignature || loan.lenderSignature) : Boolean(loan.borrowerReturnSignature || loan.lenderReturnSignature || loan.returnedAt);
    const enabled=phase === "handover" ? agreementStage(loan) === "accepted" : agreementStage(loan) === "handedOver";
    return <AgreementPhotoPanel key={`${loan.id}:${phase}`} id={loan.id} phase={phase} photos={photos} uid={user?.uid ?? ""} lang={lang} editable={Boolean(loan.saved && enabled)} locked={locked} busy={photoBusy || Boolean(signatureBusy || noteBusy)} onBusy={setPhotoBusy} onChange={next=>changeAgreementPhotos(loan.id,phase,next)} reviewed={photosReady(loan,phase)} onReview={value=>setPhotoReviews(old=>({...old,[`${loan.id}:${phase}`]:value ? photoVersion(photos) : ""}))}/>;
  }

  async function decide() {
    if (!pendingDecision) return;
    const {loan,action} = pendingDecision;
    setDecisionBusy(loan.id);
    try {
      await updateCircleAgreement(loan.id,action);
      setPendingDecision(null);
      toast.success(lang === "da" ? "Aftalens status er opdateret." : "Avtalets status har uppdaterats.");
    } catch (cause) { toast.error(agreementErrorText(cause,lang)); }
    finally { setDecisionBusy(null); }
  }
  async function readNotice(notice:AgreementNotice) {
    const loan = loans.find(l=>l.id === notice.agreementId);
    if (!loan) return;
    setNotificationsOpen(false); setTab("requests");
    setLoanDirection(loan.lenderUid === user?.uid ? "lender" : "borrower"); setLoanArchive(isArchived(loan));
    if (notice.kind === "message") setChatLoan(loan);
    else if (agreementStage(loan) !== "requested") openAgreement(loan);
    if (!notice.read) {
      try { await updateCircleAgreement(loan.id,"read",{noticeIds:[notice.id]}); }
      catch { toast.error(lang === "da" ? "Kunne ikke markere notifikationen som læst." : "Kunde inte markera aviseringen som läst."); }
    }
  }

  if (!configured) return <main className="auth-page"><FirebaseSetupNotice lang={lang} /></main>;
  if (authLoading || (configured && user?.emailVerified && profileLoading)) return <main className="auth-page"><img className="auth-brand-logo" src="/branding/veyro-systems-logo.png" alt="Veyro Systems" /><p>{lang === "da" ? "Indlæser Veyro Circle…" : "Laddar Veyro Circle…"}</p></main>;
  if (configured && !user && authOpen) return <CircleAuthScreen lang={lang} setLang={setLang} onBrowse={()=>setAuthOpen(false)} />;
  if (configured && user && !user.emailVerified) return <EmailVerificationScreen user={user} lang={lang} />;

  return (
    <main className="min-h-screen bg-[#F2F6F8] text-[#172936]">
      <Toaster position="top-center" richColors />
      <header className="app-header sticky top-0 z-40 border-b border-[#174354] bg-[#031725] text-white">
        <div className="app-header-inner mx-auto flex h-20 max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <button className="brand-lockup" onClick={openHome} aria-label={lang === "da" ? "Veyro Circle hjem" : "Veyro Circle hem"}>
            <img src="/branding/veyro-systems-logo.png" alt="Veyro Systems" /><span>Circle</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button className="icon-button notification-bell" onClick={()=>user?setNotificationsOpen(true):setAuthOpen(true)} aria-label={`${lang === "da" ? "Notifikationer" : "Aviseringar"} · ${unreadCount} ${lang === "da" ? "ulæste" : "olästa"}`}><Bell size={20} />{unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}</button>
            <button className="language-button" disabled={languageSaving} aria-label={lang === "da" ? "Skift til svensk" : "Byt till danska"} onClick={() => void changeLanguage(lang === "da" ? "sv" : "da")}>
              <Languages size={18} /><span>{lang === "da" ? "DA" : "SV"}</span><ChevronDown size={15} />
            </button>
            <button className="flex min-h-11 items-center gap-2 rounded-full bg-[#172936] px-3 text-sm font-semibold text-white" onClick={() => navigate("profile")}>
              <CircleUserRound size={18} />{profile ? profile.name.split(" ")[0] : (lang === "da" ? "Log ind / opret" : "Logga in / skapa")}
            </button>
          </div>
        </div>
      </header>

      <div className="app-main-grid mx-auto grid max-w-[1440px] gap-7 px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-10 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6">
            <nav className="space-y-1" aria-label="Hovedmenu">
              <SideNav icon={Home} label={t.navHome} active={tab === "home" && !onlyFavorites} onClick={openHome} />
              <SideNav icon={MapIcon} label={lang === "da" ? "Kort" : "Karta"} active={tab === "map"} onClick={() => navigate("map")} />
              <SideNav icon={Search} label={lang === "da" ? "Gemte søgninger" : "Sparade sökningar"} active={tab === "saved"} onClick={() => navigate("saved")} />
              <SideNav icon={Search} label={lang === "da" ? "Efterlysning" : "Efterlysning"} active={tab === "wanted"} onClick={() => navigate("wanted")} />
              <SideNav icon={ImagePlus} label={t.navItems} active={tab === "items"} onClick={() => navigate("items")} />
              <SideNav icon={CalendarDays} label={t.navRequests} active={tab === "requests"} badge={awaitingCount ? String(awaitingCount) : undefined} onClick={() => navigate("requests")} />
              <SideNav icon={Heart} label={lang === "da" ? "Mine favoritter" : "Mina favoriter"} active={tab === "home" && onlyFavorites} onClick={openFavorites} />
              <SideNav icon={CircleUserRound} label={t.navProfile} active={tab === "profile"} onClick={() => navigate("profile")} />
            </nav>

            <div className="rounded-xl bg-[#16866B] p-5 text-white">
              <ShieldCheck className="mb-4 text-[#f5bf42]" size={28} />
              <h3 className="font-bold">{t.trust}</h3>
              <p className="mt-2 text-sm leading-6 text-white/85">{t.trustText}</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {tab === "home" && <>
            {!onlyFavorites && <>
            {!user && <p className="guest-intro">{lang === "da" ? "Se ting i nærheden uden en konto. Log ind, når du vil låne, leje eller dele." : "Se saker i närheten utan konto. Logga in när du vill låna, hyra eller dela."}</p>}
            <section className="hero-card">
              <img src="/assets/neighbours-sharing.webp" alt="Naboer deler værktøj og trailer" />
              <div className="hero-overlay" />
              <div className="relative z-10 max-w-[540px] p-6 text-white sm:p-8 lg:p-10">
                <span className="hero-kicker"><Sparkles size={15} />{t.heroKicker}</span>
                <h1>{t.heroTitle}</h1><p>{t.heroText}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => document.getElementById("specific-listing-search")?.focus()} className="h-12 rounded-lg bg-[#f5bf42] px-6 font-semibold text-[#172936] hover:bg-[#ffcf62]"><Search className="mr-2" size={18} />{t.heroButton}</Button>
                  <Button onClick={openAdd} variant="outline" className="h-12 rounded-lg border-white/35 bg-white/12 px-6 font-bold text-white backdrop-blur hover:bg-white/20 hover:text-white"><PackagePlus className="mr-2" size={18} />{t.addItem}</Button>
                </div>
              </div>
            </section>

            <section className="search-filters compact-search" aria-label={lang === "da" ? "Søgeområde og pris" : "Sökområde och pris"}>
              <div className="specific-search">
                <label htmlFor="specific-listing-search">{lang === "da" ? "Hvad søger du efter?" : "Vad söker du efter?"}</label>
                <div>
                  <Search size={20} aria-hidden="true" />
                  <input id="specific-listing-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={lang === "da" ? "Søg fx efter boremaskine, trailer eller tæpperenser" : "Sök t.ex. efter borrmaskin, släp eller mattvätt"} />
                  {query && <button type="button" onClick={() => setQuery("")} aria-label={lang === "da" ? "Ryd søgning" : "Rensa sökning"}><X size={18} /></button>}
                </div>
                <small>{lang === "da" ? "Søger i annoncens navn, beskrivelse og by." : "Söker i annonsens namn, beskrivning och ort."}</small>
              </div>
            <div className="category-strip scrollbar-none" role="list" aria-label="Kategorier">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return <button key={cat.id} data-category={cat.id} role="listitem" className={`category-chip ${category === cat.id ? "active" : ""}`} onClick={() => setCategory(cat.id)}>
                  <Icon size={19} /><span>{cat[lang]}</span>
                </button>;
              })}
            </div>
              <div className="filter-grid">
                <PlacePicker value={origin} onChange={setOrigin} lang={lang} label={lang === "da" ? "Søg fra postnummer eller by" : "Sök från postnummer eller ort"} />
                <div className="place-field"><label id="radius-label">Radius</label>
                  <Select value={radius} onValueChange={setRadius}>
                    <SelectTrigger aria-labelledby="radius-label" className="!h-12 w-full rounded-xl bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{SEARCH_RADII.map(k=><SelectItem key={k} value={String(k)}>{k} km</SelectItem>)}<SelectItem value="all">{lang === "da" ? "Ingen afstandsgrænse" : "Ingen avståndsgräns"}</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="place-field"><label id="price-filter-label">{lang === "da" ? "Pris" : "Pris"}</label>
                  <Select value={priceFilter} onValueChange={setPriceFilter}>
                    <SelectTrigger aria-labelledby="price-filter-label" className="!h-12 w-full rounded-xl bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">{lang === "da" ? "Gratis og betalt" : "Gratis och betalt"}</SelectItem><SelectItem value="free">{lang === "da" ? "Kun gratis" : "Bara gratis"}</SelectItem><SelectItem value="paid">{lang === "da" ? "Kun betalt" : "Bara betalt"}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <details className="search-dates"><summary>{lang === "da" ? "Vælg datoer (valgfrit)" : "Välj datum (valfritt)"}{datesEntered ? ` · ${searchFrom} – ${searchTo}` : ""}</summary>
              <div className="date-search-row">
                <label>{lang === "da" ? "Fra dato" : "Från datum"}<input type="date" min={today} value={searchFrom} onChange={e=>setSearchFrom(e.target.value)} /></label>
                <label>{lang === "da" ? "Til dato" : "Till datum"}<input type="date" min={searchFrom||today} value={searchTo} onChange={e=>setSearchTo(e.target.value)} /></label>
                {datesEntered && <button onClick={()=>{setSearchFrom("");setSearchTo("");}}>{lang === "da" ? "Ryd datoer" : "Rensa datum"}</button>}
              </div>
              <p className="search-date-help">{lang === "da" ? "Vælg datoer for at se ting uden kendte reservationer eller blokeringer. Ejeren skal godkende. Begge datoer tæller med i prisen." : "Välj datum för att se saker utan kända bokningar eller blockeringar. Ägaren måste godkänna. Båda datumen räknas i priset."}</p>
              {datesEntered && !searchDatesValid && <p role="status">{lang === "da" ? "Vælg begge datoer fra i dag, højst 366 dage og inden for de næste to år." : "Välj båda datumen från i dag, högst 366 dagar och inom de kommande två åren."}</p>}
              {datePending && <p role="status">{lang === "da" ? "Kontrollerer ledige datoer…" : "Kontrollerar lediga datum…"}</p>}
              {dateFailed && <p role="alert">{lang === "da" ? "Ledighed kunne ikke kontrolleres. Prøv igen eller ryd datoerne." : "Tillgängligheten kunde inte kontrolleras. Försök igen eller rensa datumen."} <button onClick={()=>setCalendarRevision(v=>v+1)}>{lang === "da" ? "Prøv igen" : "Försök igen"}</button></p>}
              </details>
              <div className="filter-explanation">
                <span>{origin ? (lang === "da" ? `Udgangspunkt: ${origin.postcode} ${origin.city}. Afstand i luftlinje mellem postområder.` : `Utgångspunkt: ${origin.postcode} ${origin.city}. Fågelväg mellan postområden.`) : (lang === "da" ? "Vælg et postnummer/by fra listen for at bruge radius." : "Välj ett postnummer/ort från listan för att använda radie.")}</span>
                {profile && <button onClick={()=>setOrigin(profile.place)}>{lang === "da" ? "Brug min by" : "Använd min ort"}</button>}
              </div>
              <SavedSearches mode="save" lang={lang} prefs={prefs} filter={savedFilter} onChange={setPrefs} onApply={applySearch} items={listings} onLogin={user ? undefined : ()=>setAuthOpen(true)} />
            </section>
            </>}
            <div className="mb-4 mt-7 flex items-end justify-between">
              <div><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#777b90]">{`${filtered.length} ${t.results}`}{radius !== "all" ? ` · ${radius} km` : ""}</p><h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{onlyFavorites ? (lang === "da" ? "Mine favoritter" : "Mina favoriter") : t.popular}</h2></div>
            </div>
            <div className="listing-view-toggle" role="group" aria-label={lang === "da" ? "Visning af annoncer" : "Annonsvisning"}><button aria-pressed={listingView === "list"} onClick={()=>setListingView("list")}><List size={18}/>{lang === "da" ? "Listevisning" : "Listvy"}</button><button aria-pressed={listingView === "kanban"} onClick={()=>setListingView("kanban")}><LayoutGrid size={18}/>Kanban</button></div>
            {listingsLoading ? <p role="status">{lang === "da" ? "Henter annoncer…" : "Hämtar annonser…"}</p> : listingsError ? <p role="alert">{lang === "da" ? "Annoncerne kunne ikke hentes. Genindlæs siden." : "Annonserna kunde inte hämtas. Ladda om sidan."}</p> : datePending || dateFailed || (datesEntered && !searchDatesValid) ? null : filtered.length ? <div className={`listing-grid ${listingView === "list" ? "listing-list" : ""}`}>{filtered.map((item) => <ListingCard key={item.id} item={item} lang={lang} freeLabel={priceLabel(item, lang)} periodDays={searchDays} favorite={prefs.favorites.includes(item.id)} busy={favoriteBusy===item.id} onFavorite={()=>void favorite(item)} onOpen={() => setSelected(item)} />)}</div> :
              <div className="rounded-xl border border-dashed border-[#cbd0dd] bg-white px-6 py-16 text-center"><Search className="mx-auto mb-4 text-[#85899b]" size={34} /><p className="font-bold">{onlyFavorites ? (lang === "da" ? "Du har ingen favoritter endnu. Tryk på hjertet på en annonce for at gemme den." : "Du har inga favoriter ännu. Tryck på hjärtat på en annons för att spara den.") : t.noResults}</p></div>}
          </>}

          {tab === "saved" && <div className="content-panel">{user && <SavedSearches lang={lang} prefs={prefs} filter={savedFilter} onChange={setPrefs} onApply={applySearch} items={listings} />}</div>}
          {tab === "wanted" && <div className="content-panel"><h1 className="sr-only">Efterlysning</h1><WantedBoard lang={lang} uid={user?.uid} origin={origin} radius={radius} items={listings} onLogin={()=>setAuthOpen(true)} onOpen={id=>{const item=listings.find(i=>i.id===id);if(item)setSelected(item);else toast.info(lang==="da"?"Annoncen er ikke længere tilgængelig.":"Annonsen är inte längre tillgänglig.");}} /></div>}
          {tab === "map" && <div className="map-page"><h1 className="sr-only">{lang === "da" ? "Kort" : "Karta"}</h1>{profile ? <CommunityMap origin={profile.place} radiusKm={defaultSearchRadius(profile.defaultRadiusKm)} lang={lang} /> : <div className="content-panel"><p>{lang === "da" ? "Udfyld din profil for at se kortet med udgangspunkt i dit postnummer." : "Fyll i din profil för att se kartan med utgångspunkt i ditt postnummer."}</p><Button className="mt-4" onClick={()=>setTab("profile")}>{lang === "da" ? "Gå til konto" : "Gå till konto"}</Button></div>}</div>}
          {tab === "items" && <ItemsView lang={lang} profile={profile} listings={listings.filter(item => item.owned)} plan={listingPlan} onAdd={openAdd} onEdit={openEdit} onDelete={setPendingDelete} onCalendar={setCalendarItem} />}
          {tab === "requests" && <RequestsView t={t} loans={loans} lang={lang} userUid={user?.uid ?? ""} loading={agreementsLoading} loadError={agreementsError} direction={loanDirection} setDirection={setLoanDirection} archive={loanArchive} setArchive={setLoanArchive} onChat={setChatLoan} onAgreement={openAgreement} onDecision={(loan,action)=>setPendingDecision({loan,action})} />}
          {tab === "profile" && <ProfileView lang={lang} profile={profile} authenticatedEmail={user?.email || undefined} onSave={saveProfile}
            onLogout={logout} onSubscription={() => setTab("subscription")} />}
          {tab === "subscription" && <SubscriptionView lang={lang} plan={listingPlan} used={listings.filter(item => item.owned).length} onBack={() => setTab("profile")} onUpgrade={() => setShowUpgrade(true)} onManage={() => billing("portal")} />}
        </section>

        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-4">
            <div className="sharing-info">
              <h2>{lang === "da" ? "Enkel og ærlig pris" : "Enkelt och tydligt pris"}</h2>
              <p><b>{lang === "da" ? "Gratis at søge og forespørge" : "Gratis att söka och skicka förfrågningar"}</b>{lang === "da" ? "Det koster ikke noget at finde ting eller sende en forespørgsel." : "Det kostar inget att hitta saker eller skicka en förfrågan."}</p>
              <p><b>{lang === "da" ? "Annoncer kræver Circle Plus" : "Annonser kräver Circle Plus"}</b>{lang === "da" ? "Op til 20 aktive ting for 49 DKK eller 69 SEK om måneden." : "Upp till 20 aktiva saker för 49 DKK eller 69 SEK per månad."}</p>
              <p className="muted">{lang === "da" ? "Veyro Circle tager ingen provision af den private lejeaftale." : "Veyro Circle tar ingen provision på den privata hyresaffären."}</p>
            </div>
            <div className="rounded-xl border border-[#dde1ec] bg-white p-5">
              <div className="mb-4 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-[#edf2f6] text-[#008EAC]"><MessageCircle size={20} /></span><div><p className="font-bold">Veyro Circle</p><p className="text-xs text-[#74788b]">Danmark · Sverige</p></div></div>
              <p className="text-sm leading-6 text-[#5f6376]">{lang === "da" ? "Del kun ting, du føler dig tryg ved. Aftal altid stand og aflevering i chatten." : "Dela bara saker du känner dig trygg med. Kom alltid överens om skick och återlämning i chatten."}</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="site-footer">
        <div className="footer-brand"><img src="/branding/veyro-systems-logo.png" alt="Veyro Systems" /><div><b>Veyro Circle</b><span>{lang === "da" ? `Et produkt fra ${COMPANY_IDENTITY}` : `En produkt från ${COMPANY_IDENTITY}`}</span></div></div>
        <nav aria-label="Juridisk information">
          <a href="/legal#privacy">{lang === "da" ? "Privatliv og GDPR" : "Integritet och GDPR"}</a><a href="/legal#terms">{lang === "da" ? "Handelsbetingelser" : "Köpvillkor"}</a><a href="/legal#cookies">Cookies</a><a href="/legal#complaints">{lang === "da" ? "Klager" : "Klagomål"}</a><a href="/legal#safety">{lang === "da" ? "Sikkerhed og ansvar" : "Säkerhet och ansvar"}</a>
        </nav>
        <div className="footer-meta"><span>© {new Date().getFullYear()} {COMPANY_IDENTITY}</span><small>{lang === "da" ? "Postområder og omtrentlige koordinater:" : "Postområden och ungefärliga koordinater:"} <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></small></div>
      </footer>
      <nav className="mobile-nav" aria-label="Mobilmenu">
        <MobileNav icon={Home} label={t.navHome} active={tab === "home" && !onlyFavorites} onClick={openHome} />
        <MobileNav icon={MapIcon} label={lang === "da" ? "Kort" : "Karta"} active={tab === "map"} onClick={() => navigate("map")} />
        <MobileNav icon={Search} label={lang === "da" ? "Gemte søgninger" : "Sparade sökningar"} active={tab === "saved"} onClick={() => navigate("saved")} />
        <MobileNav icon={Search} label={lang === "da" ? "Efterlysning" : "Efterlysning"} active={tab === "wanted"} onClick={() => navigate("wanted")} />
        <MobileNav icon={ImagePlus} label={t.navItems} active={tab === "items"} onClick={() => navigate("items")} />
        <MobileNav icon={PackagePlus} label={t.addItem} onClick={openAdd} />
        <MobileNav icon={CalendarDays} label={t.navRequests} active={tab === "requests"} badge={requestSent} onClick={() => navigate("requests")} />
        <MobileNav icon={CircleUserRound} label={t.navProfile} active={tab === "profile"} onClick={() => navigate("profile")} />
      </nav>

      <Dialog open={!!selected && !showRequest} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && <DialogContent className="listing-dialog max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl border-0 p-0 sm:max-w-[600px]">
          {selected.photos?.length ? <div className={`listing-detail-gallery ${selected.photos.length === 1 ? "single" : ""}`}>
            {selected.photos.map((photo, index) => <img key={`${photo.name}-${index}`} src={photo.src} alt={`${selected.name} · billede ${index + 1}`} />)}
            <span className="absolute left-5 top-5 rounded-md bg-white px-3 py-1.5 text-sm font-bold shadow-sm">{priceLabel(selected, lang)}</span>
          </div> : <div className={`listing-placeholder relative flex h-52 items-center justify-center bg-gradient-to-br ${selected.color}`}><selected.icon size={86} strokeWidth={1.35} className="text-[#172936]/75" /><span className="absolute left-5 top-5 rounded-full bg-white px-3 py-1.5 text-sm font-bold">{priceLabel(selected, lang)}</span></div>}
          <div className="listing-dialog-body">
            <DialogHeader className="text-left"><DialogTitle className="text-2xl font-bold tracking-tight">{selected.name}</DialogTitle><DialogDescription className="flex flex-wrap items-center gap-3"><span className="flex items-center gap-1"><MapPin size={15} />{selected.city} · {Number.isFinite(selected.distance) ? `ca. ${selected.distance.toLocaleString(lang === "da" ? "da-DK" : "sv-SE", {maximumFractionDigits: 1})} km` : ""}</span></DialogDescription></DialogHeader>
            <p className="mt-5 leading-7 text-[#575b6e]">{selected.description}</p>
            <ListingCalendar key={selected.id} id={selected.id} lang={lang} from={searchFrom} to={searchTo} onRange={(f,t)=>{setSearchFrom(f);setSearchTo(t);}} />
            {searchDays && <p className="period-price">{lang === "da" ? "Pris for perioden" : "Pris för perioden"}: <strong>{money(selected.dailyPrice*searchDays,selected.country,lang)}</strong> · {searchDays} {lang === "da" ? "kalenderdage" : "kalenderdagar"}</p>}
            <dl className="listing-specs">{(detailFields[selected.category]??[]).filter(f=>selected.details?.[f.key]).map(f=><div key={f.key}><dt>{f[lang]}</dt><dd>{selected.details![f.key]}</dd></div>)}</dl>
            <DepositSummary amount={selected.deposit ?? 0} country={selected.country} lang={lang} />
            <div className="mt-5 flex items-center justify-between rounded-xl bg-[#f2f4f9] p-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-[#008EAC] font-bold text-white">{selected.owner[0]}</span><div><p className="font-bold">{selected.owner}</p><p className="text-xs text-[#777b8e]">{t.verify}</p></div></div><ShieldCheck size={22} className="text-[#587560]" /></div>
            <div className="mt-4 flex items-center gap-2 text-sm font-bold text-[#31744c]"><Check size={17} />{selected.availability}</div>
            {selected.owned ? <div className="mt-7 grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-13 rounded-xl" onClick={() => openEdit(selected)}><Pencil size={17} />{lang === "da" ? "Rediger" : "Redigera"}</Button>
              <Button variant="outline" className="h-13 rounded-xl border-[#d9aaaa] text-[#9c3030] hover:bg-[#fff1f1] hover:text-[#842424]" onClick={() => setPendingDelete(selected)}><Trash2 size={17} />{lang === "da" ? "Slet" : "Ta bort"}</Button>
            </div> : <div className="listing-dialog-action"><Button className="mt-7 h-13 w-full rounded-xl bg-[#008EAC] text-base font-semibold text-white hover:bg-[#006F88]" onClick={openRequest}>{selected.dailyPrice > 0 ? (lang === "da" ? "Spørg om at leje" : "Fråga om att hyra") : t.borrow}</Button></div>}
            <ListingReviews key={selected.id+"reviews"} id={selected.id} lang={lang} />
          </div>
        </DialogContent>}
      </Dialog>

      <Dialog open={!!calendarItem} onOpenChange={open=>!open && setCalendarItem(null)}><DialogContent className="calendar-dialog"><DialogHeader><DialogTitle>{calendarItem?.name}</DialogTitle><DialogDescription>{lang === "da" ? "Administrér ledige og blokerede dage" : "Hantera lediga och blockerade dagar"}</DialogDescription></DialogHeader>{calendarItem && <ListingCalendar key={calendarItem.id} id={calendarItem.id} lang={lang} owner />}</DialogContent></Dialog>

      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="request-dialog max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl sm:max-w-[520px]">
          <DialogHeader><DialogTitle className="text-2xl font-bold">{t.requestTitle}</DialogTitle><DialogDescription>{selected?.name}</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">{t.from}<input type="date" min={todayLocal()} value={from} onChange={e=>setFrom(e.target.value)} /></label><label className="field-label">{t.to}<input type="date" min={from || todayLocal()} value={to} onChange={e=>setTo(e.target.value)} /></label></div>
          <div className="date-search-row"><label>{lang === "da" ? "Afhentning kl." : "Hämtning kl."}<input type="time" value={pickupTime} onChange={e=>setPickupTime(e.target.value)} /></label><label>{lang === "da" ? "Tilbagelevering kl." : "Återlämning kl."}<input type="time" value={returnTime} onChange={e=>setReturnTime(e.target.value)} /></label></div><p className="search-date-help">{lang === "da" ? "Lokal tid i Danmark/Sverige. Ejeren godkender tiderne sammen med forespørgslen." : "Lokal tid i Danmark/Sverige. Ägaren godkänner tiderna tillsammans med förfrågan."}</p>
          {bookedPeriods.length > 0 && <div className="booked-periods"><strong>{lang === "da" ? "Allerede reserveret" : "Redan reserverad"}</strong><ul>{bookedPeriods.map((period,index)=><li key={index}>{formatAgreementDate(period.from,lang)} – {formatAgreementDate(period.to,lang)}</li>)}</ul></div>}
          {bookingConflict && <p role="alert" className="form-error">{lang === "da" ? "Perioden overlapper en godkendt booking. Vælg andre datoer." : "Perioden överlappar en godkänd bokning. Välj andra datum."}</p>}
          {availabilityError && <p role="status">{lang === "da" ? "Reserverede datoer kunne ikke vises. Ejeren kan kun godkende, hvis perioden er ledig." : "Reserverade datum kunde inte visas. Ägaren kan endast godkänna om perioden är ledig."}</p>}
          <label className="field-label">{t.message}<textarea value={requestMessage} onChange={e=>setRequestMessage(e.target.value)} placeholder={lang === "da" ? "Fortæl kort, hvad du skal bruge tingen til." : "Berätta kort vad du behöver saken till."} rows={4} /></label>
          {selected && <DepositSummary amount={selected.deposit ?? 0} country={selected.country} lang={lang} explain />}
          <div className="price-summary">
            <span>{lang === "da" ? "Pris for perioden" : "Pris för perioden"}</span>
            <strong>{selected && dateValid && days ? (selected.dailyPrice ? money(selected.dailyPrice * days, selected.country, lang) : t.free) : "—"}</strong>
            {selected && dateValid && days && <small>{days} {lang === "da" ? "kalenderdage" : "kalenderdagar"} · {priceLabel(selected, lang)}</small>}
            <p>{lang === "da" ? "Både start- og slutdagen tæller med. Betaling aftales direkte med ejeren. Der trækkes ingen penge i appen." : "Både start- och slutdagen räknas. Betalning avtalas direkt med ägaren. Inga pengar dras i appen."}</p>
          </div>
          {formError && <p role="alert" className="form-error">{formError}</p>}
          <Button disabled={!dateValid || requestPreparing || bookingConflict} onClick={() => void sendRequest()} className="h-13 rounded-xl bg-[#008EAC] text-base font-semibold text-white hover:bg-[#006F88]">{requestPreparing ? (lang === "da" ? "Sender forespørgsel…" : "Skickar förfrågan…") : t.send}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="notification-dialog">
          <DialogHeader><DialogTitle>{lang === "da" ? "Notifikationer" : "Aviseringar"}</DialogTitle><DialogDescription>{lang === "da" ? "Seneste aktivitet pr. aftale og dine påmindelser. Opdateres hvert 15. sekund, mens Circle er åbent." : "Senaste aktivitet per avtal och dina påminnelser. Uppdateras var 15:e sekund när Circle är öppet."}</DialogDescription></DialogHeader>
          {user && savedMatches>0 && <p>{lang === "da" ? "Nye match i dine gemte søgninger" : "Nya träffar i dina sparade sökningar"}: {savedMatches} <button onClick={()=>{setTab("home");setNotificationsOpen(false);}}>{lang==="da"?"Se gemte søgninger":"Se sparade sökningar"}</button></p>}
          {user && <PushSettings uid={user.uid} lang={lang} />}
          {agreementsError && <p role="alert">{lang === "da" ? "Notifikationerne kunne ikke opdateres." : "Aviseringarna kunde inte uppdateras."} <button onClick={agreementsChanged}>{lang === "da" ? "Prøv igen" : "Försök igen"}</button></p>}
          {agreementsLoading && <p role="status">{lang === "da" ? "Henter…" : "Hämtar…"}</p>}
          {!agreementsLoading && !agreementsError && !notices.length && <p>{lang === "da" ? "Ingen notifikationer endnu." : "Inga aviseringar ännu."}</p>}
          <div className="notification-list">{notices.map(notice=><button key={notice.id} className={`notification-entry ${notice.read ? "" : "unread"}`} onClick={()=>void readNotice(notice)}><strong>{noticeLabels[lang][notice.kind] ?? noticeLabels[lang].updated}</strong><span>{loans.find(l=>l.id === notice.agreementId)?.item.name}</span><small>{notice.agreementId} · {formatAgreementDate(notice.at.slice(0,10),lang)} · {notice.read ? (lang === "da" ? "Læst" : "Läst") : (lang === "da" ? "Ulæst" : "Oläst")}</small></button>)}</div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDecision} onOpenChange={open=>!open && !decisionBusy && setPendingDecision(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{lang === "da" ? "Bekræft dit valg" : "Bekräfta ditt val"}</AlertDialogTitle><AlertDialogDescription>{pendingDecision && <>{pendingDecision.loan.item.name} · {pendingDecision.loan.from} – {pendingDecision.loan.to}. {pendingDecision.action === "accept" ? (lang === "da" ? "Godkend forespørgslen og reservér perioden? Begge parter underskriver ved udlevering." : "Godkänn förfrågan och reservera perioden? Båda parter signerar vid utlämning.") : pendingDecision.action === "decline" ? (lang === "da" ? "Afvis forespørgslen? Låneren får besked i Circle." : "Avböj förfrågan? Låntagaren meddelas i Circle.") : (lang === "da" ? "Annullér aftalen? Den anden part får besked, og perioden frigives." : "Avbryt avtalet? Den andra parten meddelas och perioden frigörs.")}</>}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={!!decisionBusy}>{lang === "da" ? "Tilbage" : "Tillbaka"}</AlertDialogCancel><AlertDialogAction disabled={!!decisionBusy} onClick={event=>{event.preventDefault();void decide();}}>{decisionBusy ? "…" : (lang === "da" ? "Bekræft" : "Bekräfta")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!agreementLoan} onOpenChange={open => !open && setAgreementLoan(null)}>
        {agreementLoan && <DialogContent className="agreement-dialog max-h-[94vh] overflow-y-auto rounded-xl sm:max-w-[760px]">
          <AgreementJourney agreement={agreementLoan} uid={user?.uid ?? ""} lang={lang} names={{borrower:agreementLoan.borrower.name,lender:agreementLoan.item.owner}} onContinue={phase=>{const section=document.getElementById(`agreement-${phase}-section`);section?.scrollIntoView({block:"start",behavior:"instant"});section?.focus({preventScroll:true});}} />
          <div className="agreement-account-help no-print"><p>{lang === "da" ? "Begge underskriver fra hver sin konto. Åbn samme ticket under Mine lån → Jeg låner / Jeg udlåner." : "Båda signerar från varsitt konto. Öppna samma ticket under Mina lån → Jag lånar / Jag lånar ut."}<br/>{lang === "da" ? "Du er logget ind som" : "Du är inloggad som"}: <b>{user?.email}</b></p><Button variant="outline" onClick={agreementsChanged}><RefreshCw size={16}/>{lang === "da" ? "Opdatér aftalen" : "Uppdatera avtalet"}</Button></div>
          {agreementStage(agreementLoan)==="returned" && <ReviewForm key={agreementLoan.id} id={agreementLoan.id} lang={lang} target={user?.uid===agreementLoan.borrowerUid?"lender":"borrower"} />}
          {["accepted","handedOver"].includes(agreementStage(agreementLoan)) && !agreementLoan.borrowerReturnSignature && !agreementLoan.lenderReturnSignature && <AgreementExtension key={agreementLoan.id} loan={agreementLoan} uid={user?.uid??""} lang={lang} />}
          <div className="print-agreement">
            <p className="agreement-lifecycle-status">{stageLabels[lang][agreementStage(agreementLoan)]}</p>
            {agreementStage(agreementLoan) === "requested" && <p className="no-print">{lang === "da" ? "Ejeren skal først godkende forespørgslen under Mine lån. Derefter åbnes underskrifterne." : "Ägaren måste först godkänna förfrågan under Mina lån. Därefter öppnas signering."}</p>}
            <DialogHeader className="agreement-header"><p className="eyebrow">Veyro Circle · Ticket {agreementLoan.id}</p><DialogTitle className="text-2xl font-bold">{lang === "da" ? "Leje- og låneaftale" : "Hyres- och låneavtal"}</DialogTitle><DialogDescription>{lang === "da" ? "Automatisk aftale mellem ejeren og låneren" : "Automatiskt avtal mellan ägaren och låntagaren"}<br />{lang === "da" ? "Platform:" : "Plattform:"} {COMPANY_IDENTITY}</DialogDescription></DialogHeader>
            {agreementStage(agreementLoan)==="requested" && <p className="contact-privacy-note">{lang === "da" ? "Adresse og telefonnummer bliver først synlige, når ejeren har godkendt forespørgslen." : "Adress och telefonnummer visas först när ägaren har godkänt förfrågan."}</p>}
            <div className="agreement-parties"><AgreementParty title={lang === "da" ? "Udlejer / ejer" : "Uthyrare / ägare"} name={agreementLoan.item.owner} street={agreementLoan.item.ownerStreet} postcode={agreementLoan.item.place.postcode} city={agreementLoan.item.place.city} phone={agreementLoan.item.ownerPhone} /><AgreementParty title={lang === "da" ? "Låner / lejer" : "Låntagare / hyrestagare"} name={agreementLoan.borrower.name} street={agreementLoan.borrower.street} postcode={agreementLoan.borrower.place.postcode} city={agreementLoan.borrower.place.city} phone={agreementLoan.borrower.phone} /></div>
            <dl className="agreement-facts"><div><dt>{lang === "da" ? "Genstand" : "Föremål"}</dt><dd>{agreementLoan.item.name}</dd></div><div><dt>{lang === "da" ? "Periode" : "Period"}</dt><dd>{agreementLoan.from} {agreementLoan.pickupTime} – {agreementLoan.to} {agreementLoan.returnTime} ({agreementLoan.days} {lang === "da" ? "dage" : "dagar"})</dd></div><div><dt>{lang === "da" ? "Lejepris" : "Hyra"}</dt><dd>{agreementLoan.total ? money(agreementLoan.total, agreementLoan.item.country, lang) : t.free}</dd></div><div><dt>{lang === "da" ? "Depositum" : "Deposition"}</dt><dd>{agreementLoan.deposit ? money(agreementLoan.deposit, agreementLoan.item.country, lang) : (lang === "da" ? "Intet aftalt" : "Ingen avtalad")}</dd></div></dl>
            {!!agreementLoan.extensions?.length && <section className="agreement-addenda"><h3>{lang === "da" ? "Godkendte tillæg" : "Godkända tillägg"}</h3><p>{lang === "da" ? "Oprindelig retur/pris" : "Ursprunglig retur/pris"}: {agreementLoan.originalTo} {agreementLoan.originalReturnTime} · {money(agreementLoan.originalTotal??0,agreementLoan.item.country,lang)}. {lang === "da" ? "Tillæggene er godkendt fra begge konti; de oprindelige underskrifter er bevaret." : "Tilläggen har godkänts från båda kontona; ursprungliga signaturer har bevarats."}</p>{agreementLoan.extensions.map(e=><p key={e.id}>{e.to} {e.returnTime} · {money(e.total,agreementLoan.item.country,lang)} · {e.proposedBy===agreementLoan.borrowerUid ? agreementLoan.borrower.name : agreementLoan.item.owner}: {e.proposedAt.slice(0,16).replace("T"," ")} UTC → {e.acceptedBy===agreementLoan.borrowerUid ? agreementLoan.borrower.name : agreementLoan.item.owner}: {e.acceptedAt?.slice(0,16).replace("T"," ")} UTC</p>)}</section>}
            <section className="agreement-terms"><h3>{lang === "da" ? "Aftalens vilkår" : "Avtalsvillkor"}</h3><ol><li>{lang === "da" ? "Genstanden udleveres i den beskrevne stand. Parterne bør dokumentere standen med billeder ved udlevering og aflevering." : "Föremålet lämnas ut i beskrivet skick. Parterna bör dokumentera skicket med bilder vid utlämning och återlämning."}</li><li>{lang === "da" ? "Låneren skal bruge genstanden forsvarligt og returnere den senest på slutdatoen. Tid og sted aftales mellem parterne." : "Låntagaren ska använda föremålet aktsamt och återlämna det senast på slutdagen. Tid och plats avtalas mellan parterna."}</li><li>{lang === "da" ? "Skader, bortkomst, betaling, depositum og eventuel erstatning afgøres mellem parterne efter gældende ret. Veyro Circle er formidler og ikke part i aftalen." : "Skador, förlust, betalning, deposition och eventuell ersättning avgörs mellan parterna enligt gällande rätt. Veyro Circle förmedlar kontakten och är inte part i avtalet."}</li></ol>{agreementLoan.message && <p><b>{lang === "da" ? "Særlig aftale:" : "Särskild överenskommelse:"}</b> {agreementLoan.message}</p>}</section>
            <section className="agreement-id-check"><h3><ShieldCheck size={19} />{lang === "da" ? "Kontrol ved overdragelsen" : "Kontroll vid överlämningen"}</h3><p>{lang === "da" ? "Parterne skal sikre sig, hvem de indgår aftalen med." : "Parterna ska säkerställa vem de ingår avtalet med."}</p><ul><li>{lang === "da" ? "Begge parter foreviser gyldig billedlegitimation med navn og adresse." : "Båda parter visar giltig fotolegitimation med namn och adress."}</li><li>{lang === "da" ? "Navn og adresse på legitimationen sammenholdes med oplysningerne i aftalen." : "Namn och adress på legitimationen jämförs med uppgifterna i avtalet."}</li><li>{lang === "da" ? "Aftalen underskrives på telefonen eller udskrives og underskrives fysisk af begge parter." : "Avtalet signeras på telefonen eller skrivs ut och undertecknas fysiskt av båda parter."}</li></ul><p className="id-privacy">{lang === "da" ? "Tag ikke kopi eller foto af legitimationen, medmindre personen udtrykkeligt har accepteret det og der er et lovligt behov." : "Ta inte en kopia eller ett foto av legitimationen om personen inte uttryckligen har godkänt det och det finns ett lagligt behov."}</p></section>
            <AgreementConditionNote phase="handover" lang={lang} savedNote={agreementLoan.handoverNote ?? ""} draft={handoverNoteDraft} onChange={setHandoverNoteDraft} saved={Boolean(agreementLoan.saved)} locked={Boolean(agreementLoan.borrowerSignature || agreementLoan.lenderSignature)} enabled={agreementStage(agreementLoan) === "accepted"} onSave={() => void storeAgreementNote(agreementLoan, "handover")} busy={noteBusy === "handover"} />
            {agreementPhotos(agreementLoan,"handover")}
            <div className="agreement-signatures"><SignatureBox title={lang === "da" ? "Låners underskrift ved udlevering" : "Låntagarens signatur vid utlämning"} name={agreementLoan.borrower.name} signature={agreementLoan.borrowerSignature} lang={lang} {...signing(agreementLoan,"borrower","handover")} busy={signatureBusy === `${agreementLoan.id}-handover-borrower`} onSign={dataUrl => void signAgreement(agreementLoan, "borrower", dataUrl)} /><SignatureBox title={lang === "da" ? "Ejers underskrift ved udlevering" : "Ägarens signatur vid utlämning"} name={agreementLoan.item.owner} signature={agreementLoan.lenderSignature} lang={lang} {...signing(agreementLoan,"lender","handover")} busy={signatureBusy === `${agreementLoan.id}-handover-lender`} onSign={dataUrl => void signAgreement(agreementLoan, "lender", dataUrl)} /></div>
            <p className="agreement-legal"><LockKeyhole size={15} />{lang === "da" ? "Ved underskrift bekræfter hver part, at oplysningerne er korrekte, og at den anden parts navn og adresse er kontrolleret mod forevist ID." : "Genom underskrift bekräftar varje part att uppgifterna är korrekta och att den andra partens namn och adress har kontrollerats mot visad legitimation."}</p>
            <section className={`return-receipt ${agreementLoan.returnedAt ? "is-complete" : ""}`}>
              <header><div><p className="eyebrow">{lang === "da" ? "Returkvittering" : "Returkvitto"}</p><h3>{agreementLoan.returnedAt ? (agreementLoan.returnCondition === "remarks" ? (lang === "da" ? "Tilbageleveret med bemærkninger" : "Återlämnad med anmärkningar") : (lang === "da" ? "Tilbageleveret i god stand" : "Återlämnad i gott skick")) : (lang === "da" ? "Kvittering for tilbagelevering" : "Kvitto på återlämning")}</h3></div>{agreementLoan.returnedAt && <span><Check size={16} />{lang === "da" ? "Afsluttet" : "Avslutat"}</span>}</header>
              <p>{lang === "da" ? "Parterne skriver eventuelle skader eller andre forhold i returnoten. Ved underskrift bekræfter låneren afleveringen, og ejeren bekræfter modtagelsen samt den gemte note. En tom note betyder, at tingen er tilbageleveret i god stand." : "Parterna skriver eventuella skador eller andra förhållanden i returanteckningen. Genom signering bekräftar låntagaren återlämningen och ägaren mottagandet samt den sparade anteckningen. En tom anteckning betyder att saken har återlämnats i gott skick."}</p>
              {!agreementLoan.returnedAt && (!agreementLoan.saved || !agreementLoan.borrowerSignature || !agreementLoan.lenderSignature) && <p className="return-locked no-print"><LockKeyhole size={16} />{lang === "da" ? "Returunderskrifter åbnes, når aftalen er gemt og udleveringen er underskrevet af begge parter." : "Retursignaturer öppnas när avtalet har sparats och utlämningen har signerats av båda parter."}</p>}
              {agreementLoan.returnedAt && <p className="return-completed-at">{lang === "da" ? "Retur registreret" : "Retur registrerad"}: {new Intl.DateTimeFormat(lang === "da" ? "da-DK" : "sv-SE", {dateStyle:"long",timeStyle:"short"}).format(new Date(agreementLoan.returnedAt))}</p>}
              <AgreementConditionNote phase="return" lang={lang} savedNote={agreementLoan.returnNote ?? ""} draft={returnNoteDraft} onChange={setReturnNoteDraft} saved={Boolean(agreementLoan.saved)} locked={Boolean(agreementLoan.borrowerReturnSignature || agreementLoan.lenderReturnSignature || agreementLoan.returnedAt)} enabled={Boolean(agreementLoan.borrowerSignature && agreementLoan.lenderSignature)} onSave={() => void storeAgreementNote(agreementLoan, "return")} busy={noteBusy === "return"} />
            {agreementPhotos(agreementLoan,"return")}
              <div className="agreement-signatures return-signatures"><SignatureBox title={lang === "da" ? "Låner · aflevering og note godkendt" : "Låntagare · återlämning och anteckning godkänd"} name={agreementLoan.borrower.name} signature={agreementLoan.borrowerReturnSignature} lang={lang} {...signing(agreementLoan,"borrower","return")} busy={signatureBusy === `${agreementLoan.id}-return-borrower`} onSign={dataUrl => void signAgreement(agreementLoan, "borrower", dataUrl, "return")} /><SignatureBox title={lang === "da" ? "Ejer · modtagelse og note godkendt" : "Ägare · mottagande och anteckning godkänd"} name={agreementLoan.item.owner} signature={agreementLoan.lenderReturnSignature} lang={lang} {...signing(agreementLoan,"lender","return")} busy={signatureBusy === `${agreementLoan.id}-return-lender`} onSign={dataUrl => void signAgreement(agreementLoan, "lender", dataUrl, "return")} /></div>
            </section>
          </div>
          <div className="agreement-actions no-print"><div className="agreement-choice-buttons"><Button disabled={agreementSaving || agreementLoan.saved} onClick={() => void storeAgreement(agreementLoan)}><Save size={17} />{agreementLoan.saved ? (lang === "da" ? "Gemt på kontoen" : "Sparat på kontot") : agreementSaving ? (lang === "da" ? "Gemmer…" : "Sparar…") : (lang === "da" ? "Gem på min konto" : "Spara på mitt konto")}</Button><Button variant="outline" onClick={() => printAgreementDocument(lang)}><Printer size={17} />{lang === "da" ? "Udskriv aftalen" : "Skriv ut avtalet"}</Button></div><span>{lang === "da" ? "Gemte aftaler kan ses under Mine lån i 12 måneder." : "Sparade avtal visas under Mina lån i 12 månader."}</span></div>
        </DialogContent>}
      </Dialog>

      <ChatDialog loan={chatLoan} userUid={user?.uid || ""} lang={lang} onClose={() => setChatLoan(null)} />

      <Dialog open={showAdd} onOpenChange={open => { setShowAdd(open); if (!open) resetItemForm(); }}>
        <DialogContent className="form-dialog max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl sm:max-w-[560px]">
          <DialogHeader><DialogTitle className="text-2xl font-bold">{editingId !== null ? (lang === "da" ? "Rediger din ting" : "Redigera din sak") : t.addTitle}</DialogTitle><DialogDescription>{t.addDescription}</DialogDescription></DialogHeader>
          {editingId === null && <div className="listing-limit-inline"><span>{listingPlan === "plus" ? <Crown size={17} /> : <PackagePlus size={17} />}{listingPlan === "plus" ? "Veyro Circle Plus" : (lang === "da" ? "Gratis" : "Gratis")}</span><b>{listings.filter(item => item.owned).length + 1} / {listingLimit(listingPlan)}</b></div>}
          <div className="photo-uploader">
            <div className="photo-uploader-head"><div><b>{t.photo}</b><small>{lang === "da" ? "Maks. 2 billeder · JPG, PNG eller WEBP" : "Högst 2 bilder · JPG, PNG eller WEBP"}</small></div><span>{newPhotos.length}/2</span></div>
            {newPhotos.length > 0 && <div className="photo-previews">
              {newPhotos.map((photo, index) => <figure key={`${photo.name}-${index}`}><img src={photo.src} alt={lang === "da" ? `Valgt billede ${index + 1}` : `Vald bild ${index + 1}`} /><button type="button" onClick={() => setNewPhotos(items => items.filter((_, i) => i !== index))} aria-label={lang === "da" ? `Fjern billede ${index + 1}` : `Ta bort bild ${index + 1}`}><X size={17} /></button><figcaption>{formatImageSize(photo.bytes, lang)}</figcaption></figure>)}
            </div>}
            {newPhotos.length < MAX_LISTING_IMAGES && <label className={`photo-drop ${isCompressing ? "is-loading" : ""}`}>
              {isCompressing ? <Camera className="animate-pulse" size={27} /> : <ImagePlus size={27} />}
              <span>{isCompressing ? (lang === "da" ? "Komprimerer…" : "Komprimerar…") : (newPhotos.length ? (lang === "da" ? "Tilføj et billede mere" : "Lägg till en bild till") : t.photo)}</span>
              <small>{lang === "da" ? "Tag et foto eller vælg fra enheden · komprimeres automatisk" : "Ta ett foto eller välj från enheten · komprimeras automatiskt"}</small>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple disabled={isCompressing} onChange={event => { void addPhotos(event.target.files); event.currentTarget.value = ""; }} />
            </label>}
          </div>
          <label className="field-label">{t.itemName}<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={lang === "da" ? "Fx tæpperenser" : "T.ex. mattvätt"} /></label>
          <div className="field-label">{t.country}<CountrySelect value={newCountry} onChange={c=>{setNewCountry(c);setNewPlace(null);}} lang={lang} /></div>
          <PlacePicker key={newCountry} country={newCountry} value={newPlace} onChange={setNewPlace} lang={lang} label={lang === "da" ? "Afhentning · postnummer og by *" : "Hämtning · postnummer och ort *"} />
          <div className="field-label">{lang === "da" ? "Kategori" : "Kategori"}<Select value={newCategory} onValueChange={setNewCategory}><SelectTrigger className="!h-12 w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{categories.filter(c=>c.id !== "all").map(c=><SelectItem key={c.id} value={c.id}>{c[lang]}</SelectItem>)}</SelectContent></Select></div>
          <div className="listing-spec-inputs">{(detailFields[newCategory]??[]).map(field=><label className="field-label" key={field.key}>{field[lang]}<input maxLength={200} value={newDetails[field.key]??""} onChange={e=>setNewDetails(old=>({...old,[field.key]:e.target.value}))} /></label>)}</div>
          <fieldset className="pricing-choice">
            <legend>{lang === "da" ? "Hvordan vil du dele tingen?" : "Hur vill du dela saken?"}</legend>
            <RadioGroup value={pricing} onValueChange={setPricing} className="grid grid-cols-2 gap-3">
              <label htmlFor="price-free" className={pricing === "free" ? "selected" : ""}><RadioGroupItem id="price-free" value="free" />{lang === "da" ? "Gratis udlån" : "Gratis utlåning"}</label>
              <label htmlFor="price-paid" className={pricing === "paid" ? "selected" : ""}><RadioGroupItem id="price-paid" value="paid" />{lang === "da" ? "Mod betaling" : "Mot betalning"}</label>
            </RadioGroup>
            {pricing === "paid" && <label className="field-label mt-4">{lang === "da" ? "Pris pr. kalenderdag" : "Pris per kalenderdag"} · {newCountry === "DK" ? "DKK" : "SEK"}<input inputMode="decimal" value={priceInput} onChange={e=>setPriceInput(e.target.value)} placeholder="50" maxLength={10} /><small>{lang === "da" ? "Ingen automatisk betaling. Beløbet aftales med låneren." : "Ingen automatisk betalning. Beloppet avtalas med låntagaren."}</small></label>}
            <label className="field-label mt-4">{lang === "da" ? "Dit depositum (valgfrit)" : "Din deposition (valfritt)"} · {newCountry === "DK" ? "DKK" : "SEK"}<input inputMode="decimal" value={newDepositInput} onChange={e=>setNewDepositInput(e.target.value)} placeholder="0" maxLength={10}/><small>{lang === "da" ? "Du fastsætter beløbet som ejer. Det vises på annoncen og i nye aftaler. Skriv 0 for intet depositum." : "Du bestämmer beloppet som ägare. Det visas på annonsen och i nya avtal. Skriv 0 för ingen deposition."}</small></label>
          </fieldset>
          <label className="field-label">{t.description}<textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={4} placeholder={lang === "da" ? "Stand, tilbehør og det låneren bør vide…" : "Skick, tillbehör och det låntagaren bör veta…"} /></label>
          {formError && <p role="alert" className="form-error">{formError}</p>}
          <Button disabled={isCompressing || listingSaving} onClick={() => void publishItem()} className="h-13 rounded-xl bg-[#008EAC] text-base font-semibold text-white hover:bg-[#006F88]">{listingSaving ? (lang === "da" ? "Gemmer…" : "Sparar…") : editingId !== null ? (lang === "da" ? "Gem ændringer" : "Spara ändringar") : t.publish}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="form-dialog max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-xl sm:max-w-[520px]">
          <DialogHeader><DialogTitle className="flex items-center gap-3 text-2xl font-bold"><span className="plus-icon"><Crown size={23} /></span>Veyro Circle Plus</DialogTitle><DialogDescription>{lang === "da" ? "Det er gratis at søge og sende forespørgsler. For at annoncere skal du have Plus, som giver op til 20 aktive ting." : "Det är gratis att söka och skicka förfrågningar. För att annonsera behöver du Plus, som ger upp till 20 aktiva saker."}</DialogDescription></DialogHeader>
          <div className="upgrade-price"><strong>{profile?.place.country === "SE" ? "69 SEK" : "49 DKK"}</strong><span>{lang === "da" ? "om måneden" : "per månad"}</span></div>
          <ul className="upgrade-benefits">
            <li><Check size={18} />{lang === "da" ? "Op til 20 aktive ting" : "Upp till 20 aktiva saker"}</li>
            <li><Check size={18} />{lang === "da" ? "Både gratis deling og betalt udlejning" : "Både gratis delning och betald uthyrning"}</li>
            <li><Check size={18} />{lang === "da" ? "Ingen provision på den private lejeaftale" : "Ingen provision på den privata uthyrningen"}</li>
          </ul>
          <p className="demo-note">{lang === "da" ? "Du sendes til Stripes sikre betalingsside. Abonnementet kan bagefter administreres fra din konto." : "Du skickas till Stripes säkra betalningssida. Prenumerationen kan sedan hanteras från ditt konto."}</p>
          <Button disabled={billingBusy} className="h-13 rounded-xl bg-[#008EAC] text-base font-bold text-white hover:bg-[#006F88]" onClick={() => billing("checkout")}>{billingBusy ? (lang === "da" ? "Åbner sikker betaling…" : "Öppnar säker betalning…") : (lang === "da" ? "Køb Circle Plus" : "Köp Circle Plus")}</Button>
          <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setShowUpgrade(false)}>{lang === "da" ? "Ikke nu" : "Inte nu"}</Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => !open && setPendingDelete(null)}>
        {pendingDelete && <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{lang === "da" ? "Slet denne ting?" : "Ta bort den här saken?"}</AlertDialogTitle><AlertDialogDescription>{lang === "da" ? `“${pendingDelete.name}” fjernes fra dine annoncer. Handlingen kan ikke fortrydes.` : `“${pendingDelete.name}” tas bort från dina annonser. Åtgärden kan inte ångras.`}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{lang === "da" ? "Annuller" : "Avbryt"}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void deleteItem(pendingDelete)}><Trash2 size={17} />{lang === "da" ? "Slet" : "Ta bort"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>}
      </AlertDialog>
    </main>
  );
}

function priceLabel(item: Listing, lang: Lang) {
  return item.dailyPrice === 0 ? "Gratis" : money(item.dailyPrice, item.country, lang) + (lang === "da" ? " / dag" : " / dag");
}

function printAgreementDocument(lang: Lang) {
  const agreement = document.querySelector<HTMLElement>(".print-agreement");
  if (!agreement) { toast.error(lang === "da" ? "Aftalen kunne ikke klargøres til udskrift." : "Avtalet kunde inte förberedas för utskrift."); return; }
  const copy = agreement.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".no-print,canvas,button").forEach(node => node.remove());
  const printFrame = document.createElement("iframe");
  printFrame.setAttribute("aria-hidden", "true");
  printFrame.style.position = "fixed";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";
  document.body.appendChild(printFrame);
  const printDocument = printFrame.contentDocument;
  const printWindow = printFrame.contentWindow;
  if (!printDocument || !printWindow) {
    printFrame.remove();
    toast.error(lang === "da" ? "Aftalen kunne ikke klargøres til udskrift." : "Avtalet kunde inte förberedas för utskrift.");
    return;
  }
  printDocument.open();
  printDocument.write(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Veyro Circle · ${lang === "da" ? "Leje- og låneaftale" : "Hyres- och låneavtal"}</title><style>
    @page{size:A4 portrait;margin:6mm}*{box-sizing:border-box;min-width:0}html,body{width:100%;margin:0;padding:0;overflow:visible}body{color:#172936;font:8.2px/1.13 Arial,sans-serif;overflow-wrap:anywhere}h1,h2,h3,p{margin-top:0}h2{font-size:16px;line-height:1.08;margin-bottom:2px}h3{font-size:10px;line-height:1.12;margin-bottom:2px}.print-agreement{width:100%;max-width:100%;overflow:hidden}.agreement-header{border-bottom:2px solid #008eac;padding-bottom:3px}.agreement-header p{margin-bottom:1px}.eyebrow,small,dt{color:#607583;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.agreement-parties,.agreement-signatures,.agreement-facts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px;margin-top:4px}.agreement-parties section,.agreement-signatures section{display:grid;gap:1px;border:1px solid #d6e1e6;padding:3px 4px;break-inside:avoid}.agreement-parties p{margin-bottom:1px}.agreement-facts{gap:0;border:1px solid #d6e1e6;break-inside:avoid}.agreement-facts div{padding:2px 4px;border-bottom:1px solid #d6e1e6}.agreement-facts dd{margin:0;font-weight:700}.agreement-terms,.agreement-id-check{margin-top:4px}.agreement-terms ol,.agreement-id-check ul{margin:1px 0;padding-left:13px}.agreement-terms li+li,.agreement-id-check li+li{margin-top:1px}.agreement-terms p{margin-bottom:1px}.agreement-id-check{border:1px solid #86b8c2;padding:3px 4px;background:#eef9fa;break-inside:avoid}.agreement-id-check p{margin-bottom:1px}.agreement-condition-note{margin-top:4px;border:1px solid #bfd2da;padding:3px 4px;background:#f8fbfc;break-inside:avoid}.condition-note-heading{display:flex;justify-content:space-between}.condition-note-heading p,.condition-note-help{margin-bottom:1px}.condition-note-value{display:grid;gap:1px;margin-top:2px;border-left:2px solid #008eac;padding:2px 4px;background:white}.condition-note-value span{white-space:pre-wrap}.paper-note-lines{display:block}.paper-note-lines span{display:block;height:8px;border-bottom:1px solid #aeb9c5}.agreement-signatures section{min-height:45px;border-style:dashed}.agreement-signatures p{margin-bottom:1px}.paper-signature-line{display:block;margin-top:auto;padding-top:11px;border-bottom:1px solid #172936}.agreement-legal{margin:4px 0 0;border-left:3px solid #d88920;padding:3px 4px;background:#fff7df;break-inside:avoid}.return-receipt{margin-top:4px;border:1px solid #7eb7c2;padding:3px 4px;background:#f2fbfc;break-inside:avoid}.return-receipt>header{display:flex;align-items:center;justify-content:space-between}.return-receipt>header p,.return-receipt>p{margin:1px 0}.return-receipt>header span{font-weight:700}.return-signatures{margin-top:2px}.return-signatures section{min-height:42px}.signature-image{max-width:100%;max-height:30px;object-fit:contain}svg{display:none}.agreement-addenda{margin-top:3px;border:1px solid #d6e1e6;padding:3px}.agreement-addenda p{margin:1px 0}
  </style></head><body>${copy.outerHTML}</body></html>`);
  printDocument.close();
  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } finally {
      window.setTimeout(() => printFrame.remove(), 1_000);
    }
  }, 250);
}

function agreementForCloud(loan: Loan): StoredAgreement {
  if (!loan.borrowerUid) throw new Error("Aftalen mangler låner");
  return {
    id:loan.id, borrowerUid:loan.borrowerUid, ...(loan.lenderUid ? {lenderUid:loan.lenderUid} : {}), participantUids:loan.lenderUid ? [loan.borrowerUid,loan.lenderUid] : [loan.borrowerUid], borrower:loan.borrower,
    lender:{name:loan.item.owner,street:loan.item.ownerStreet,phone:loan.item.ownerPhone,place:loan.item.place},
    item:{id:loan.item.id,name:loan.item.name,category:loan.item.category,country:loan.item.country,dailyPrice:loan.item.dailyPrice},
    from:loan.from,to:loan.to,pickupTime:loan.pickupTime,returnTime:loan.returnTime,days:loan.days,total:loan.total,deposit:loan.deposit,message:loan.message,
    handoverNote:loan.handoverNote,returnNote:loan.returnNote,borrowerSignature:loan.borrowerSignature,lenderSignature:loan.lenderSignature,borrowerReturnSignature:loan.borrowerReturnSignature,lenderReturnSignature:loan.lenderReturnSignature,returnedAt:loan.returnedAt,returnCondition:loan.returnCondition,
  };
}

function agreementFromCloud(record: StoredAgreement): Loan {
  const category = categories.find(item => item.id === record.item.category) || categories[1];
  return {
    ...record,
    id:record.id,from:record.from,to:record.to,days:record.days,total:record.total,deposit:record.deposit,message:record.message,
    borrower:record.borrower,borrowerUid:record.borrowerUid,lenderUid:record.lenderUid,handoverNote:record.handoverNote,returnNote:record.returnNote,borrowerSignature:record.borrowerSignature,lenderSignature:record.lenderSignature,borrowerReturnSignature:record.borrowerReturnSignature,lenderReturnSignature:record.lenderReturnSignature,returnedAt:record.returnedAt,returnCondition:record.returnCondition,saved:true,
    item:{id:record.item.id,name:record.item.name,owner:record.lender.name,ownerStreet:record.lender.street,ownerPhone:record.lender.phone,ownerUid:record.lenderUid,city:record.lender.place.city,country:record.item.country,distance:0,category:record.item.category,icon:category.icon,color:categoryColors[record.item.category] || categoryColors.tools,description:"",rating:0,availability:"",place:record.lender.place,dailyPrice:record.item.dailyPrice},
  };
}

function DepositSummary({amount,country,lang,explain=false}:{amount:number;country:Country;lang:Lang;explain?:boolean}) {
  return <div className="listing-deposit"><span>{lang === "da" ? "Depositum fastsat af ejeren" : "Deposition bestämd av ägaren"}</span><strong>{amount ? money(amount,country,lang) : (lang === "da" ? "Intet depositum" : "Ingen deposition")}</strong>{explain && <small>{lang === "da" ? "Beløbet overføres til aftalen. Betaling aftales direkte med ejeren; Circle opkræver det ikke." : "Beloppet förs över till avtalet. Betalning avtalas direkt med ägaren; Circle tar inte betalt för det."}</small>}</div>;
}

function ListingCard({ item, lang, freeLabel, onOpen,periodDays,favorite,busy,onFavorite }: { item: Listing; lang:Lang; freeLabel: string; onOpen: () => void; periodDays?:number|null;favorite?:boolean;busy?:boolean;onFavorite?:()=>void }) {
  const Icon = item.icon;
  return <article className="listing-card text-left"><button onClick={onOpen} className="listing-card-main" aria-label={item.name}><div className={`listing-image bg-gradient-to-br ${item.color}`}>{item.photos?.[0] ? <img src={item.photos[0].src} alt={item.name} /> : <Icon size={57} strokeWidth={1.4} className="text-[#172936]/70" />}<span className={`free-tag ${item.dailyPrice === 0 ? "is-free" : "is-paid"}`}>{freeLabel}</span>{item.photos && item.photos.length > 1 && <span className="photo-count"><Camera size={14} />{item.photos.length}</span>}</div><div className="p-4"><div className="flex items-start justify-between gap-2"><h3>{item.name}</h3></div><p className="mt-2 flex items-center gap-1.5 text-sm text-[#6d7185]"><MapPin size={15} />{item.city} · {Number.isFinite(item.distance) ? `ca. ${item.distance.toLocaleString("da-DK", {maximumFractionDigits: 1})} km` : ""}</p><p className="period-price">{periodDays ? <>{lang === "da" ? "Pris for perioden" : "Pris för perioden"}: <strong>{money(item.dailyPrice*periodDays,item.country,lang)}</strong> · {periodDays} {lang === "da" ? "dage" : "dagar"}</> : null}</p><p className="mt-2 text-sm text-[#172936]">{lang === "da" ? "Depositum" : "Deposition"}: {item.deposit ? money(item.deposit,item.country,lang) : (lang === "da" ? "Intet" : "Ingen")}</p><div className="mt-3 flex items-center gap-2"><span className="size-2 rounded-full bg-[#38a66b]" /><span className="text-xs font-bold text-[#397252]">{item.availability}</span></div></div></button><button className="heart-button" disabled={busy} aria-pressed={favorite} aria-label={lang==="da"?(favorite?"Fjern fra favoritter":"Gem som favorit"):(favorite?"Ta bort favorit":"Spara som favorit")} onClick={onFavorite}><Heart size={18} fill={favorite?"currentColor":"none"}/></button></article>;
}

function SideNav({ icon: Icon, label, active, badge, onClick }: { icon: typeof Home; label: string; active?: boolean; badge?: string; onClick: () => void }) {
  return <button onClick={onClick} className={`side-nav ${active ? "active" : ""}`}><Icon size={20} /><span>{label}</span>{badge && <b>{badge}</b>}</button>;
}

function MobileNav({ icon: Icon, label, active, badge, onClick }: { icon: typeof Home; label: string; active?: boolean; badge?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`mobile-nav-item ${active ? "active" : ""}`}><span className="relative"><Icon size={22} />{badge && <i />}</span><small>{label}</small></button>;
}

function RequestsView({ t, loans, lang, userUid, loading, loadError, direction, setDirection, archive, setArchive, onChat, onAgreement, onDecision }: { t: typeof copy.da; loans: Loan[]; lang: Lang; userUid:string; loading:boolean; loadError: boolean; direction:"borrower"|"lender";setDirection:(value:"borrower"|"lender")=>void;archive:boolean;setArchive:(value:boolean)=>void; onChat: (loan: Loan) => void; onAgreement: (loan: Loan) => void; onDecision:(loan:Loan,action:Decision)=>void }) {
  const [search,setSearch] = useState("");
  const da = lang === "da";
  const own = loans.filter(loan=>(direction === "borrower" ? loan.borrowerUid : loan.lenderUid) === userUid);
  const visible = own.filter(loan=>isArchived(loan) === archive && `${loan.id} ${loan.item.name} ${loan.borrower.name} ${loan.item.owner}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="content-panel loans-panel">
    <h1 className="sr-only">{t.requests}</h1>
    <div className="loans-heading">
      <div className="loan-filters loan-direction" role="group" aria-label={da ? "Låner eller ejer" : "Låntagare eller ägare"}>{(["borrower","lender"] as const).map(role=><button type="button" key={role} aria-pressed={direction === role} onClick={()=>setDirection(role)}><span>{role === "borrower" ? (da ? "Jeg låner" : "Jag lånar") : (da ? "Jeg udlåner" : "Jag lånar ut")}</span><b>{loans.filter(l=>(role === "borrower" ? l.borrowerUid : l.lenderUid) === userUid && !isArchived(l)).length}</b></button>)}</div>
      <Button type="button" variant="ghost" className="loan-refresh" disabled={loading} onClick={agreementsChanged}><RefreshCw size={16} aria-hidden="true" /><span>{da ? "Opdatér" : "Uppdatera"}</span></Button>
    </div>
    <div className="loan-toolbar">
      <div className="loan-filters loan-period" role="group" aria-label={da ? "Aktive eller arkiv" : "Aktiva eller arkiv"}><button type="button" aria-pressed={!archive} onClick={()=>setArchive(false)}>{da ? "Aktuelle" : "Aktuella"}</button><button type="button" aria-pressed={archive} onClick={()=>setArchive(true)}>{da ? "Arkiv" : "Arkiv"}<span className="loan-retention">{da ? "12 mdr." : "12 mån."}</span><span className="sr-only">{da ? "12 måneder" : "12 månader"}</span></button></div>
      <label className="loan-search"><span className="sr-only">{da ? "Find en aftale" : "Hitta ett avtal"}</span><Search size={18} aria-hidden="true" /><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={da ? "Søg på genstand, navn eller ticket" : "Sök på föremål, namn eller ticket"} /></label>
    </div>
    {loading && <p role="status">{da ? "Henter dine aftaler…" : "Hämtar dina avtal…"}</p>}
    {loadError && <p className="agreements-load-note" role="alert">{da ? "Aftalerne kunne ikke opdateres. Viste oplysninger kan være forældede. Prøv Opdatér igen." : "Avtalen kunde inte uppdateras. Uppgifterna kan vara inaktuella. Försök uppdatera igen."}</p>}
    <div className="mt-6 space-y-4">
      {visible.map(loan=>{
        const stage = agreementStage(loan);
        const ownSignature = direction === "borrower" ? loan.borrowerSignature : loan.lenderSignature;
        const ownReturn = direction === "borrower" ? loan.borrowerReturnSignature : loan.lenderReturnSignature;
        const next = stage === "requested" ? (da ? "Se forespørgsel" : "Visa förfrågan") : stage === "accepted" ? (ownSignature ? (da ? "Afventer den anden underskrift" : "Inväntar den andra signaturen") : (da ? "Underskriv ved udlevering" : "Signera vid utlämning")) : stage === "handedOver" ? (ownReturn ? (da ? "Afventer den anden returunderskrift" : "Inväntar den andra retursignaturen") : (da ? "Bekræft tilbagelevering" : "Bekräfta återlämning")) : (da ? "Se gemt aftale" : "Visa sparat avtal");
        return <article key={loan.id} className="request-summary">
          <LoanRow title={loan.item.name} owner={direction === "borrower" ? loan.item.owner : loan.borrower.name} ticket={loan.id} status={stage === "returned" && loan.returnCondition === "remarks" ? (da ? "Tilbageleveret med bemærkninger" : "Återlämnad med anmärkningar") : stageLabels[lang][stage]} statusClass={isArchived(loan) ? "approved" : stage === "requested" ? "waiting" : "active-loan"} icon={loan.item.icon} onChat={()=>onChat(loan)} chatLabel={t.chat} dates={`${formatAgreementDate(loan.from,lang)} – ${formatAgreementDate(loan.to,lang)}`} lang={lang} />
          {stage === "handedOver" && loan.to < circleToday() && <p className="loan-overdue">{da ? "Afleveringsdatoen er passeret; returkvitteringen er ikke afsluttet." : "Återlämningsdatumet har passerat; returkvittot är inte avslutat."}</p>}
          <div className="request-price"><span>{loan.days} {da ? "kalenderdage" : "kalenderdagar"}</span><b>{loan.total === 0 ? t.free : money(loan.total,loan.item.country,lang)}</b></div>
          {loan.message && <p className="loan-message">{loan.message}</p>}
          <div className="loan-actions">
            {decisionAllowed(loan,userUid,"accept") && <Button disabled={loadError} onClick={()=>onDecision(loan,"accept")}>{da ? "Godkend forespørgsel" : "Godkänn förfrågan"}</Button>}
            {decisionAllowed(loan,userUid,"decline") && <Button disabled={loadError} variant="outline" onClick={()=>onDecision(loan,"decline")}>{da ? "Afvis" : "Avböj"}</Button>}
            {decisionAllowed(loan,userUid,"cancel") && !(stage === "requested" && direction === "lender") && <Button disabled={loadError} variant="outline" onClick={()=>onDecision(loan,"cancel")}>{da ? "Annullér" : "Avbryt"}</Button>}
          </div>
          <button type="button" className="agreement-open" onClick={()=>onAgreement(loan)}><FileSignature size={18} /><span>{next}</span></button>
        </article>;
      })}
      {!visible.length && !loadError && !loading && <div className="my-items-empty"><MessageCircle size={28} /><p>{search ? (da ? "Ingen aftaler matcher søgningen." : "Inga avtal matchar sökningen.") : archive ? (da ? "Ingen afsluttede aftaler i denne oversigt." : "Inga avslutade avtal i denna vy.") : (da ? "Ingen aktuelle aftaler i denne oversigt." : "Inga aktuella avtal i denna vy.")}</p></div>}
    </div>
  </div>;
}

function ChatDialog({ loan, userUid, lang, onClose }: { loan: Loan | null; userUid: string; lang: Lang; onClose: () => void }) {
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const da = lang === "da";
  useEffect(() => {
    if (!loan || !userUid || !loan.borrowerUid || !loan.lenderUid) return;
    return subscribeToCircleMessages(loan.id, setMessages, () => setError(da ? "Samtalen kunne ikke hentes fra Firebase." : "Konversationen kunde inte hämtas från Firebase."));
  }, [da, loan, userUid]);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!loan || !userUid || !text.trim()) return;
    setBusy(true); setError("");
    try { await sendCircleMessage(loan.id, userUid, text); setText(""); }
    catch (reason) { setError(agreementErrorText(reason,lang)); }
    finally { setBusy(false); }
  }
  const available = Boolean(loan?.borrowerUid && loan?.lenderUid && userUid);
  return <Dialog open={Boolean(loan)} onOpenChange={open => !open && onClose()}>{loan && <DialogContent className="chat-dialog rounded-xl sm:max-w-[560px]"><DialogHeader><DialogTitle>{da ? "Samtale om" : "Konversation om"} {loan.item.name}</DialogTitle><DialogDescription>{loan.item.owner} · {loan.from} – {loan.to}</DialogDescription></DialogHeader>{available ? <><div className="chat-thread" aria-live="polite">{messages.length ? messages.map(message => <div key={message.id} className={`chat-message ${message.senderUid === userUid ? "mine" : "theirs"}`}><p>{message.text}</p><time>{message.createdAt ? new Intl.DateTimeFormat(da ? "da-DK" : "sv-SE", {dateStyle:"short",timeStyle:"short"}).format(message.createdAt) : (da ? "Sender…" : "Skickar…")}</time></div>) : <p className="chat-empty">{da ? "Ingen beskeder endnu. Skriv den første besked om aftalen." : "Inga meddelanden ännu. Skriv det första meddelandet om avtalet."}</p>}<div ref={endRef} /></div>{error && <p className="auth-error" role="alert">{error}</p>}<form className="chat-compose" onSubmit={submit}><label htmlFor="circle-chat-message" className="sr-only">{da ? "Skriv besked" : "Skriv meddelande"}</label><textarea id="circle-chat-message" rows={3} maxLength={2000} value={text} onChange={event=>setText(event.target.value)} placeholder={da ? "Skriv en besked…" : "Skriv ett meddelande…"} /><Button type="submit" disabled={busy || !text.trim()}>{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}{da ? "Send" : "Skicka"}</Button></form></> : <p className="agreements-load-note">{da ? "Denne aftale er ikke knyttet til to brugerkonti, så der kan ikke oprettes en samtale." : "Det här avtalet är inte kopplat till två användarkonton, så en konversation kan inte skapas."}</p>}</DialogContent>}</Dialog>;
}

function AgreementParty({ title, name, street, postcode, city, phone }: { title: string; name: string; street: string; postcode: string; city: string; phone: string }) {
  return <section><small>{title}</small><b>{name}</b>{street && <span>{street}</span>}<span>{postcode} {city}</span>{phone && <span>Telefon: {phone}</span>}</section>;
}

function AgreementConditionNote({ phase, lang, savedNote, draft, onChange, saved, locked, enabled, onSave, busy }: {
  phase: SignaturePhase;
  lang: Lang;
  savedNote: string;
  draft: string;
  onChange: (value: string) => void;
  saved: boolean;
  locked: boolean;
  enabled: boolean;
  onSave: () => void;
  busy: boolean;
}) {
  const da = lang === "da";
  const handover = phase === "handover";
  const normalizedSaved = savedNote.trim();
  const normalizedDraft = draft.trim();
  const dirty = normalizedDraft !== normalizedSaved;
  const heading = handover ? (da ? "Tilstandsnote ved udlevering" : "Skickanteckning vid utlämning") : (da ? "Tilstandsnote ved tilbagelevering" : "Skickanteckning vid återlämning");
  const emptyText = da ? "Ingen bemærkninger registreret." : "Inga anmärkningar registrerade.";
  const help = handover
    ? (da ? "Skriv eksisterende skader eller mangler, før tingen udleveres. Begge parter godkender den samme note med deres underskrift." : "Skriv befintliga skador eller brister innan saken lämnas ut. Båda parter godkänner samma anteckning med sin signatur.")
    : (da ? "Skriv nye skader, mangler eller andre forhold ved returneringen. Begge parter godkender den samme note med deres underskrift." : "Skriv nya skador, brister eller andra förhållanden vid återlämningen. Båda parter godkänner samma anteckning med sin signatur.");
  const placeholder = handover
    ? (da ? "Fx: Plastikken ved håndtaget er revnet ved udlevering." : "T.ex.: Plasten vid handtaget är sprucken vid utlämning.")
    : (da ? "Fx: Der er kommet en ny revne, eller en del mangler ved returnering." : "T.ex.: En ny spricka har uppstått eller en del saknas vid återlämning.");

  return <section id={`agreement-${phase}-section`} tabIndex={-1} className="agreement-condition-note">
    <div className="condition-note-heading"><div><p className="eyebrow">{handover ? (da ? "Udlevering" : "Utlämning") : (da ? "Tilbagelevering" : "Återlämning")}</p><h3>{heading}</h3></div>{locked && <span className="condition-note-locked no-print"><LockKeyhole size={14} />{da ? "Låst" : "Låst"}</span>}</div>
    <p className="condition-note-help">{help}</p>
    <div className={`condition-note-value ${normalizedSaved ? "has-note" : ""}`}><b>{da ? "Aftalt note:" : "Avtalad anteckning:"}</b><span>{normalizedSaved || emptyText}</span></div>
    {!normalizedSaved && <div className="paper-note-lines"><span /><span /></div>}
    {!locked && <div className="condition-note-editor no-print">
      {!saved ? <p className="condition-note-notice">{da ? "Gem aftalen på kontoen, før noten kan redigeres og godkendes digitalt." : "Spara avtalet på kontot innan anteckningen kan redigeras och godkännas digitalt."}</p> : !enabled ? <p className="condition-note-notice">{handover ? (da ? "Ejeren skal først godkende forespørgslen. Derefter kan I gemme noten, før I underskriver." : "Ägaren måste först godkänna förfrågan. Därefter kan ni spara anteckningen innan ni signerar.") : (da ? "Returnoten åbnes, når begge parter har underskrevet udleveringen. Se øverst, hvem der mangler." : "Returanteckningen öppnas när båda parter har signerat utlämningen. Se överst vem som saknas.")}</p> : <>
        <label htmlFor={`agreement-${phase}-note`}>{da ? "Fælles note" : "Gemensam anteckning"}<textarea id={`agreement-${phase}-note`} value={draft} onChange={event=>onChange(event.target.value)} maxLength={600} rows={3} placeholder={placeholder} /></label>
        <footer><span>{draft.length} / 600</span><Button type="button" variant="outline" disabled={busy || !dirty} onClick={onSave}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}{busy ? (da ? "Gemmer…" : "Sparar…") : (da ? "Gem note" : "Spara anteckning")}</Button></footer>
        {dirty && <p className="condition-note-unsaved">{da ? "Gem ændringen, før en af parterne underskriver." : "Spara ändringen innan någon av parterna signerar."}</p>}
      </>}
    </div>}
    {locked && <p className="condition-note-lock-copy no-print"><LockKeyhole size={14} />{da ? "Noten er låst, fordi mindst én part har underskrevet. Den anden part godkender præcis denne note." : "Anteckningen är låst eftersom minst en part har signerat. Den andra parten godkänner exakt denna anteckning."}</p>}
  </section>;
}

function SignatureBox({ title, name, signature, lang, canSign = true, busy = false, waitingReason, onSign }: { title: string; name: string; signature?: AgreementSignature; lang: Lang; canSign?: boolean; busy?: boolean; waitingReason?:string; onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    return { x:(event.clientX - rect.left) * canvas.width / rect.width, y:(event.clientY - rect.top) * canvas.height / rect.height };
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!; const ctx = canvas.getContext("2d"); if (!ctx) return;
    drawing.current = true; canvas.setPointerCapture(event.pointerId); const p = point(event);
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#172936";
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return; const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const p = point(event); ctx.lineTo(p.x,p.y); ctx.stroke(); setHasInk(true);
  }
  function stop() { drawing.current = false; }
  function clear() { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height); setHasInk(false); }
  return <section className={signature ? "is-signed" : ""}><small>{title}</small><b>{name}</b>{signature ? <><img className="signature-image" src={signature.dataUrl} alt={lang === "da" ? `Underskrift fra ${name}` : `Signatur från ${name}`} /><time>{new Intl.DateTimeFormat(lang === "da" ? "da-DK" : "sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(signature.signedAt))}</time></> : <>{canSign ? <><div className="signature-pad no-print"><canvas ref={canvasRef} width={520} height={150} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} aria-label={lang === "da" ? `Underskriftsfelt for ${name}` : `Signaturfält för ${name}`} /><span>{lang === "da" ? "Skriv med fingeren eller musen" : "Skriv med fingret eller musen"}</span></div><div className="signature-buttons no-print"><Button type="button" variant="outline" disabled={busy} onClick={clear}>{lang === "da" ? "Ryd" : "Rensa"}</Button><Button type="button" disabled={!hasInk || busy} onClick={() => { const dataUrl=canvasRef.current?.toDataURL("image/png"); if (dataUrl) onSign(dataUrl); }}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <FileSignature size={17} />}{busy ? (lang === "da" ? "Gemmer…" : "Sparar…") : (lang === "da" ? "Godkend underskrift" : "Godkänn signatur")}</Button></div></> : <p className="signature-waiting no-print">{waitingReason || (lang === "da" ? "Afventer denne parts underskrift." : "Inväntar den här partens signatur.")}</p>}<div className="paper-signature-line"><span>{lang === "da" ? "Dato og fysisk underskrift" : "Datum och fysisk underskrift"}</span></div></>}</section>;
}

function formatAgreementDate(value: string, lang: Lang) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(lang === "da" ? "da-DK" : "sv-SE", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(date);
}

function LoanRow({ title, owner, ticket, status, statusClass, icon: Icon, onChat, chatLabel, dates, lang }: { title: string; owner: string; ticket: string; status: string; statusClass: string; icon: typeof Drill; onChat: () => void; chatLabel: string; dates: string; lang: Lang }) {
  return <article className="loan-row"><div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-[#eef0f8]"><Icon size={31} className="text-[#008EAC]" /></div><div className="min-w-0 flex-1"><p className="loan-kind">{lang === "da" ? "Udlånt / lejet" : "Utlånat / hyrt"}</p><h3 className="truncate font-semibold">{title}</h3><p className="mt-1 text-sm text-[#73778b]">{owner}</p><div className="loan-ticket-meta"><span><b>Ticket:</b> {ticket}</span><span><b>{lang === "da" ? "Periode:" : "Period:"}</b> {dates}</span></div><span className={`loan-status ${statusClass}`}>{status}</span></div><button onClick={onChat} className="chat-button"><MessageCircle size={18} /><span className="hidden sm:inline">{chatLabel}</span></button></article>;
}

function ProfileView({ lang, profile, authenticatedEmail, onSave, onLogout, onSubscription }: {
  lang: Lang; profile: Profile | null; onSave: (p: Profile)=>Promise<void>;
  authenticatedEmail?: string; onLogout: () => void;
  onSubscription: () => void;
}) {
  return <div className="content-panel">
    <div className="profile-head"><div className="profile-identity"><span className="profile-avatar"><CircleUserRound size={32} /></span><div className="min-w-0 flex-1"><p className="eyebrow">{lang === "da" ? "Din konto" : "Ditt konto"}</p><h1 className="page-title">{profile?.name || (lang === "da" ? "Log ind eller opret konto" : "Logga in eller skapa konto")}</h1>{profile && <><p className="mt-2 text-sm">{profile.email}</p><p className="mt-1 text-sm">{profile.place.postcode} {profile.place.city} · {profile.place.country}</p></>}</div></div>{profile && <div className="profile-head-actions"><Button type="button" variant="outline" onClick={onSubscription}><Crown size={17} />{lang === "da" ? "Mit abonnement" : "Min prenumeration"}</Button><Button type="button" variant="outline" className="logout-button" onClick={onLogout}><LogOut size={17} />{lang === "da" ? "Log ud" : "Logga ut"}</Button></div>}</div>
    <ProfileForm profile={profile} lang={lang} authenticatedEmail={authenticatedEmail} onSave={onSave} />
  </div>;
}

function SubscriptionView({ lang, plan, used, onBack, onUpgrade, onManage }: { lang: Lang; plan: ListingPlan; used: number; onBack: () => void; onUpgrade: () => void; onManage: () => void }) {
  const limit = listingLimit(plan);
  return <div className="content-panel subscription-page"><button type="button" className="text-link" onClick={onBack}>← {lang === "da" ? "Tilbage til konto" : "Tillbaka till konto"}</button><div><p className="eyebrow">Veyro Circle</p><h1 className="page-title">{lang === "da" ? "Mit abonnement" : "Min prenumeration"}</h1></div><section className={`membership-card ${plan === "plus" ? "is-plus" : ""}`}><div className="membership-top"><div className="membership-icon">{plan === "plus" ? <Crown size={22} /> : <PackagePlus size={22} />}</div><div><p className="eyebrow">{lang === "da" ? "Dit abonnement" : "Din prenumeration"}</p><h2>{plan === "plus" ? "Veyro Circle Plus" : (lang === "da" ? "Gratis søgning og forespørgsler" : "Gratis sökning och förfrågningar")}</h2></div><span className="plan-badge">{plan === "plus" ? "Aktiv" : "0 kr."}</span></div><div className="membership-usage"><div><span>{lang === "da" ? "Aktive ting" : "Aktiva saker"}</span><b>{used} {lang === "da" ? "af" : "av"} {limit}</b></div><Progress value={limit ? Math.min(100, used / limit * 100) : 0} /></div><p>{plan === "plus" ? (lang === "da" ? "Du kan have op til 20 aktive ting. Redigering og sletning tæller ikke som nye opslag." : "Du kan ha upp till 20 aktiva saker. Redigering och borttagning räknas inte som nya annonser.") : (lang === "da" ? `Du kan søge og forespørge gratis. Annoncer kræver Circle Plus: 49 DKK eller 69 SEK om måneden for op til ${PLUS_LISTING_LIMIT} aktive ting.` : `Du kan söka och skicka förfrågningar gratis. Annonser kräver Circle Plus: 49 DKK eller 69 SEK per månad för upp till ${PLUS_LISTING_LIMIT} aktiva saker.`)}</p>{plan === "free" ? <Button type="button" onClick={onUpgrade} className="membership-cta"><Crown size={17} />Se Veyro Circle Plus</Button> : <Button type="button" onClick={onManage} variant="outline" className="membership-cta manage-subscription">{lang === "da" ? "Administrer abonnement" : "Hantera prenumeration"}</Button>}</section></div>;
}

function ItemsView({ lang, profile, listings, plan, onAdd, onEdit, onDelete,onCalendar }: { lang: Lang; profile: Profile | null; listings: Listing[]; plan: ListingPlan; onAdd: () => void; onEdit: (item: Listing) => void; onDelete: (item: Listing) => void; onCalendar:(item:Listing)=>void }) {
  const used = listings.length;
  return <div className="content-panel"><section className="my-items my-items-page">
      <div className="my-items-head"><div><p className="eyebrow">{lang === "da" ? "Dine annoncer" : "Dina annonser"}</p><h2>{lang === "da" ? "Mine ting" : "Mina saker"}</h2></div><Button type="button" onClick={onAdd} disabled={!profile || (plan === "plus" && used >= PLUS_LISTING_LIMIT)}><PackagePlus size={17} />{lang === "da" ? "Tilføj" : "Lägg till"}</Button></div>
      {!profile ? <p className="my-items-empty">{lang === "da" ? "Opret din konto for at dele eller udleje en ting." : "Skapa ditt konto för att dela eller hyra ut en sak."}</p> : listings.length === 0 ? <div className="my-items-empty"><ImagePlus size={28} /><p>{lang === "da" ? "Du har endnu ingen ting. Circle Plus giver plads til op til 20 aktive annoncer." : "Du har inga saker ännu. Circle Plus ger plats för upp till 20 aktiva annonser."}</p><button type="button" onClick={onAdd}>{lang === "da" ? "Opret din første annonce" : "Skapa din första annons"}</button></div> : <div className="my-items-list">{plan!=="plus" && <p className="agreements-load-note">{lang==="da"?"Dine ting er gemt, men vises ikke i søgningen uden Circle Plus. Du kan stadig slette dem.":"Dina saker finns kvar men visas inte i sökningen utan Circle Plus. Du kan fortfarande ta bort dem."}</p>}
        {listings.map(item => { const Icon = item.icon; return <article key={item.id} className="my-item-row"><div className={`my-item-thumb bg-gradient-to-br ${item.color}`}>{item.photos?.[0] ? <img src={item.photos[0].src} alt="" /> : <Icon size={27} />}</div><div className="min-w-0 flex-1"><h3>{item.name}</h3><p>{item.city} · {priceLabel(item, lang)}</p><small>{item.photos?.length || 0}/2 {lang === "da" ? "billeder" : "bilder"}</small></div><div className="my-item-actions"><button type="button" onClick={()=>onCalendar(item)}><CalendarDays size={16}/>{lang === "da" ? "Kalender" : "Kalender"}</button><button type="button" onClick={() => onEdit(item)}><Pencil size={16} />{lang === "da" ? "Rediger" : "Redigera"}</button><button type="button" className="delete" onClick={() => onDelete(item)}><Trash2 size={16} />{lang === "da" ? "Slet" : "Ta bort"}</button></div></article>; })}
      </div>}
    </section></div>;
}
