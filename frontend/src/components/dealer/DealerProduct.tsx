import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Zap, Car, Play, Fuel, Battery, Search, MapPin, ChevronRight, Phone, BarChart3, Radio, Users, X, User, Clock, Flame } from 'lucide-react'
import { TypingIndicator } from '../chat/TypingIndicator'
import { MarkdownMessage } from '../chat/MarkdownMessage'
import { InlineProductRow } from '../chat/InlineProductRow'
import { VehicleSpotlight } from '../chat/VehicleSpotlight'
import { sendChatMessageStream, getChatSuggestions } from '@/lib/api'
import { matchVideoForVehicle } from '@/lib/video-match'
import type { ChatMessage, VehicleCard } from '@/lib/types'

type Lang = 'de' | 'fr' | 'it' | 'en'

const LANG_LABELS: Record<Lang, string> = { de: 'DE', fr: 'FR', it: 'IT', en: 'EN' }

const i18n: Record<string, Record<Lang, string>> = {
  preparedFor:      { de: 'Vorbereitet für', fr: 'Préparé pour', it: 'Preparato per', en: 'Prepared for' },
  vehiclesReady:    { de: 'Fahrzeuge', fr: 'Véhicules', it: 'Veicoli', en: 'Vehicles' },
  vehiclesSingular: { de: 'Fahrzeug', fr: 'Véhicule', it: 'Veicolo', en: 'Vehicle' },
  modelSeries:      { de: 'Modellreihen', fr: 'Séries', it: 'Serie', en: 'Series' },
  fromCHF:          { de: 'Ab CHF', fr: 'Dès CHF', it: 'Da CHF', en: 'From CHF' },
  electric:         { de: 'Elektrisch', fr: 'Électrique', it: 'Elettrico', en: 'Electric' },
  heroTitle:        { de: 'Ihr KI-Verkaufsberater kennt bereits jedes Fahrzeug in Ihrem Bestand.', fr: 'Votre conseiller de vente IA connaît déjà chaque véhicule de votre inventaire.', it: 'Il vostro consulente di vendita IA conosce già ogni veicolo nel vostro inventario.', en: 'Your AI Sales Assistant already knows every car in your inventory.' },
  heroSubtitle:     { de: 'Klicken Sie auf ein Fahrzeug oder stellen Sie eine Frage.', fr: 'Cliquez sur un véhicule ou posez une question.', it: 'Cliccate su un veicolo o fate una domanda.', en: 'Click a vehicle or ask a question.' },
  inputPlaceholder: { de: 'Fragen Sie zu Ihrem Bestand …', fr: 'Posez une question sur votre inventaire …', it: 'Chiedete del vostro inventario …', en: 'Ask about your inventory …' },
  series:           { de: 'Serie', fr: 'Série', it: 'Serie', en: 'Series' },
  leadCaptured:     { de: 'Lead erfasst', fr: 'Lead capturé', it: 'Lead acquisito', en: 'Lead Captured' },
  interests:        { de: 'Interessen', fr: 'Intérêts', it: 'Interessi', en: 'Interests' },
  vehiclesViewed:   { de: 'Angesehene Fahrzeuge', fr: 'Véhicules consultés', it: 'Veicoli visualizzati', en: 'Vehicles Viewed' },
  messages:         { de: 'Nachrichten', fr: 'Messages', it: 'Messaggi', en: 'Messages' },
  vehicles:         { de: 'Fahrzeuge', fr: 'Véhicules', it: 'Veicoli', en: 'Vehicles' },
  source:           { de: 'Quelle', fr: 'Source', it: 'Fonte', en: 'Source' },
  leadCardFooter:   { de: 'Das landet automatisch in Ihrem CRM', fr: 'Ceci arrive automatiquement dans votre CRM', it: 'Questo arriva automaticamente nel vostro CRM', en: 'This is what lands in your CRM — automatically' },
  exclusivePreview: { de: 'Exklusive Vorschau', fr: 'Aperçu exclusif', it: 'Anteprima esclusiva', en: 'Exclusive Preview' },
  clickToExplore:   { de: 'Fahrzeug anklicken zum Entdecken', fr: 'Cliquez pour découvrir', it: 'Cliccate per scoprire', en: 'Click a vehicle to explore' },
  // Tool call labels
  searchingInventory:   { de: 'Bestand wird durchsucht …', fr: 'Recherche dans l\'inventaire …', it: 'Ricerca nell\'inventario …', en: 'Searching inventory …' },
  loadingVehicle:       { de: 'Fahrzeugdetails werden geladen …', fr: 'Chargement des détails …', it: 'Caricamento dettagli …', en: 'Loading vehicle details …' },
  comparingModels:      { de: 'Modelle werden verglichen …', fr: 'Comparaison des modèles …', it: 'Confronto dei modelli …', en: 'Comparing models …' },
  processing:           { de: 'Wird verarbeitet …', fr: 'Traitement en cours …', it: 'Elaborazione in corso …', en: 'Processing …' },
  bookingAppointment:   { de: 'Termin wird gebucht …', fr: 'Réservation en cours …', it: 'Prenotazione in corso …', en: 'Booking appointment …' },
  // Lead card
  websiteVisitor:       { de: 'Website-Besucher', fr: 'Visiteur du site', it: 'Visitatore del sito', en: 'Website Visitor' },
  justNow:              { de: 'Gerade eben', fr: 'À l\'instant', it: 'Proprio ora', en: 'Just now' },
  hot:                  { de: 'Heiss', fr: 'Chaud', it: 'Caldo', en: 'Hot' },
  aiAssistant:          { de: 'KI-Assistent', fr: 'Assistant IA', it: 'Assistente IA', en: 'AI Assistant' },
  more:                 { de: 'weitere', fr: 'de plus', it: 'altri', en: 'more' },
  // Interest labels
  interestElectric:     { de: 'Elektro', fr: 'Électrique', it: 'Elettrico', en: 'Electric' },
  interestSUV:          { de: 'SUV', fr: 'SUV', it: 'SUV', en: 'SUV' },
  interestPrice:        { de: 'Preisbewusst', fr: 'Sensible au prix', it: 'Attento al prezzo', en: 'Price-sensitive' },
  interestPerformance:  { de: 'Leistung', fr: 'Performance', it: 'Prestazioni', en: 'Performance' },
  interestFamily:       { de: 'Familie', fr: 'Famille', it: 'Famiglia', en: 'Family' },
  interestGeneral:      { de: 'Allgemeine Anfrage', fr: 'Demande générale', it: 'Richiesta generale', en: 'General inquiry' },
  // Error / loading states
  errorOccurred:        { de: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.', fr: 'Une erreur est survenue. Veuillez réessayer.', it: 'Si è verificato un errore. Riprovate.', en: 'An error occurred. Please try again.' },
  loadingDealership:    { de: 'Ihr Autohaus wird geladen …', fr: 'Chargement de votre concession …', it: 'Caricamento della concessionaria …', en: 'Loading your dealership…' },
  dealerNotFound:       { de: 'Autohaus nicht gefunden', fr: 'Concessionnaire introuvable', it: 'Concessionaria non trovata', en: 'Dealership Not Found' },
  dealerNotFoundDesc:   { de: 'Wir konnten dieses Autohaus nicht finden. Prüfen Sie den Link Ihrer Einladung.', fr: 'Nous n\'avons pas trouvé ce concessionnaire. Vérifiez le lien de votre invitation.', it: 'Non abbiamo trovato questa concessionaria. Controllate il link del vostro invito.', en: 'We couldn\'t find this dealership. Check the link from your invitation.' },
  browseAll:            { de: 'Alle Autohäuser anzeigen', fr: 'Parcourir tous les concessionnaires', it: 'Mostra tutte le concessionarie', en: 'Browse all dealerships' },
  // Picker
  aiSalesChannel:       { de: 'Commercial OS', fr: 'Commercial OS', it: 'Commercial OS', en: 'Commercial OS' },
  selectDealership:     { de: 'Willkommen', fr: 'Bienvenue', it: 'Benvenuti', en: 'Welcome' },
  pickerSubtitle:       { de: 'Geben Sie den Namen Ihres Autohauses ein, um Ihre persönliche Demo zu starten.', fr: 'Saisissez le nom de votre concession pour lancer votre démo personnalisée.', it: 'Inserite il nome della vostra concessionaria per avviare la demo personalizzata.', en: 'Enter your dealership name to start your personalized demo.' },
  vehiclesAcross:       { de: 'Fahrzeuge bei', fr: 'véhicules chez', it: 'veicoli presso', en: 'vehicles across' },
  dealerships:          { de: 'Autohäusern', fr: 'concessionnaires', it: 'concessionarie', en: 'dealerships' },
  searchDealership:     { de: 'Ihr Autohaus eingeben …', fr: 'Entrez votre concession …', it: 'Inserite la concessionaria …', en: 'Enter your dealership …' },
  loadingDealerships:   { de: 'Autohäuser werden geladen …', fr: 'Chargement des concessionnaires …', it: 'Caricamento concessionarie …', en: 'Loading dealerships…' },
  noDealerFound:        { de: 'Kein Autohaus gefunden für', fr: 'Aucun concessionnaire trouvé pour', it: 'Nessuna concessionaria trovata per', en: 'No dealership found for' },
  keepTyping:           { de: 'Bitte geben Sie mehr Buchstaben ein …', fr: 'Veuillez saisir plus de lettres …', it: 'Inserite più lettere …', en: 'Please type more letters …' },
  pickerVehicles:       { de: 'Fahrzeuge', fr: 'véhicules', it: 'veicoli', en: 'vehicles' },
  pickerVehicleSingular:{ de: 'Fahrzeug', fr: 'véhicule', it: 'veicolo', en: 'vehicle' },
  pickerLocations:      { de: 'Standorte', fr: 'sites', it: 'sedi', en: 'locations' },
  loading:              { de: 'Wird geladen …', fr: 'Chargement …', it: 'Caricamento …', en: 'Loading…' },
  backToAll:            { de: 'Zurück', fr: 'Retour', it: 'Indietro', en: 'Back' },
  bmwSwitzerland:       { de: 'BMW Schweiz', fr: 'BMW Suisse', it: 'BMW Svizzera', en: 'BMW Switzerland' },
  comingSoon:           { de: 'Demnächst', fr: 'Bientôt', it: 'Prossimamente', en: 'Coming soon' },
}

const suggestionsByLang: Record<Lang, string[]> = {
  de: ['Familien-SUV empfehlen', 'X5 vs X7 vergleichen', 'Probefahrt buchen', 'Beste Elektro-Optionen?'],
  fr: ['Recommander un SUV familial', 'Comparer X5 vs X7', 'Réserver un essai', 'Meilleures options électriques ?'],
  it: ['Consigliare un SUV familiare', 'Confrontare X5 vs X7', 'Prenotare un test drive', 'Migliori opzioni elettriche?'],
  en: ['Recommend a family SUV', 'Compare X5 vs X7', 'Book a test drive', 'Best electric options?'],
}

function t(key: string, lang: Lang): string {
  return i18n[key]?.[lang] || i18n[key]?.['en'] || key
}

const FUEL_LABELS: Record<string, Record<Lang, string>> = {
  GASOLINE: { de: 'Benzin', fr: 'Essence', it: 'Benzina', en: 'Gasoline' },
  DIESEL:   { de: 'Diesel', fr: 'Diesel', it: 'Diesel', en: 'Diesel' },
  ELECTRIC: { de: 'Elektrisch', fr: 'Électrique', it: 'Elettrico', en: 'Electric' },
  BEV:      { de: 'Elektrisch', fr: 'Électrique', it: 'Elettrico', en: 'Electric' },
  PHEV:     { de: 'Plug-in-Hybrid', fr: 'Hybride rechargeable', it: 'Ibrido plug-in', en: 'Plug-in Hybrid' },
  HYBRID:   { de: 'Hybrid', fr: 'Hybride', it: 'Ibrido', en: 'Hybrid' },
}

function fuelLabel(fuelType: string, lang: Lang): string {
  const key = fuelType.toUpperCase()
  if (FUEL_LABELS[key]) return FUEL_LABELS[key][lang]
  if (key.includes('ELECTRI')) return FUEL_LABELS['ELECTRIC'][lang]
  if (key.includes('HYBRID')) return FUEL_LABELS['HYBRID'][lang]
  return fuelType
}

interface DealerGroup {
  name: string
  vehicle_count: number
  location_count: number
  locations: string[]
}

interface DealerInfo {
  found: boolean
  dealer_name: string
  language?: string
  vehicle_count: number
  location_count?: number
  locations?: { name: string; id: string }[]
  series: { name: string; count: number }[]
  fuel_types: Record<string, number>
  price_range: { min: number | null; max: number | null }
  sample_vehicles: {
    vin: string
    name: string
    series?: string
    fuel_type?: string
    color?: string
    price?: string
    price_offer?: number
    image?: string
  }[]
}

/** Slugify a dealer name: lowercase, umlauts, strip special chars, spaces to hyphens */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
    .replace(/à/g, 'a').replace(/â/g, 'a')
    .replace(/ô/g, 'o').replace(/î/g, 'i').replace(/ù/g, 'u').replace(/û/g, 'u')
    .replace(/ç/g, 'c').replace(/ñ/g, 'n').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Extract dealer slug from /d/SLUG path pattern */
function getDealerSlugFromPath(): string {
  const match = window.location.pathname.match(/^\/d\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : ''
}

/** Get initial dealer from URL: prefer /d/slug path, fall back to ?d= query param */
function getInitialDealerParam(): string {
  const slug = getDealerSlugFromPath()
  if (slug) return slug // will be resolved against API groups later
  const params = new URLSearchParams(window.location.search)
  return params.get('d') || ''
}

export function DealerProduct() {
  const initialParam = getInitialDealerParam()
  const isSlugUrl = !!getDealerSlugFromPath()

  const [dealerInfo, setDealerInfo] = useState<DealerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<'picker' | 'dealer'>(initialParam ? 'dealer' : 'picker')
  const [selectedDealer, setSelectedDealer] = useState(initialParam)
  const [dealerSlugResolved, setDealerSlugResolved] = useState(!isSlugUrl) // false if we need to resolve slug → name
  const [lang, setLang] = useState<Lang>('de')

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingVehicles, setStreamingVehicles] = useState<VehicleCard[]>([])
  const [toolCallName, setToolCallName] = useState<string | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [bgVideo, setBgVideo] = useState<string | null>(null)
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})
  const [spotlightVehicle, setSpotlightVehicle] = useState<VehicleCard | null>(null)
  const [showLeadCard, setShowLeadCard] = useState(false)
  const [leadCardDismissed, setLeadCardDismissed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId] = useState(() => crypto.randomUUID())

  const hasConversation = messages.length > 0 || isLoading

  // Resolve slug URL → real dealer name via groups API
  useEffect(() => {
    if (dealerSlugResolved || !isSlugUrl || !selectedDealer) return
    fetch('/api/dealer/groups')
      .then(r => r.json())
      .then((groups: DealerGroup[]) => {
        const slug = selectedDealer.toLowerCase()
        const match = groups.find(g => slugify(g.name) === slug)
        if (match) {
          setSelectedDealer(match.name)
          setDealerSlugResolved(true)
        } else {
          // No match found — try using the slug as-is (API might still find it)
          setDealerSlugResolved(true)
        }
      })
      .catch(() => setDealerSlugResolved(true))
  }, [selectedDealer, dealerSlugResolved, isSlugUrl])

  // Load dealer info
  useEffect(() => {
    if (!selectedDealer || !dealerSlugResolved) { if (!selectedDealer) setLoading(false); return }
    setLoading(true)
    fetch(`/api/dealer/info?name=${encodeURIComponent(selectedDealer)}`)
      .then((r) => r.json())
      .then((data) => {
        setDealerInfo(data)
        if (data.found) {
          setPhase('dealer')
          // Update URL to clean slug form
          const slug = slugify(data.dealer_name || selectedDealer)
          if (window.location.pathname !== `/d/${slug}`) {
            window.history.replaceState(null, '', `/d/${slug}`)
          }
          if (data.language && ['de', 'fr', 'it', 'en'].includes(data.language)) {
            setLang(data.language as Lang)
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedDealer, dealerSlugResolved])

  // Load video map
  useEffect(() => {
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then(setVideoMap).catch(() => {})
  }, [])

  // Set bg video when vehicles appear
  useEffect(() => {
    if (!bgVideo) {
      for (const msg of messages) {
        if (msg.vehicles?.length) {
          const matchedVideo = matchVideoForVehicle(msg.vehicles[0].name, videoMap)
          if (matchedVideo) { setBgVideo(matchedVideo); break }
        }
      }
    }
  }, [messages, videoMap, bgVideo])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  // Always keep input focused — on mount, after responses, on tab switch
  useEffect(() => {
    const focus = () => { if (!isLoading && inputRef.current) inputRef.current.focus() }
    focus()
    const onVisibility = () => { if (document.visibilityState === 'visible') setTimeout(focus, 50) }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', onVisibility) }
  }, [isLoading, messages])

  // Show lead card after 2nd assistant response
  useEffect(() => {
    if (leadCardDismissed) return
    const assistantCount = messages.filter(m => m.role === 'assistant').length
    if (assistantCount >= 2 && !showLeadCard) {
      const timer = setTimeout(() => setShowLeadCard(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [messages, showLeadCard, leadCardDismissed])

  const dealerName = dealerInfo?.dealer_name || selectedDealer

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage = text.trim()
    setInput('')
    setSuggestedQuestions([])

    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setIsStreaming(false)
    setStreamingText('')
    setStreamingVehicles([])
    setToolCallName(null)

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      let fullText = ''
      let vehicles: VehicleCard[] = []

      await sendChatMessageStream(
        userMessage, history, sessionId,
        (delta) => { fullText += delta; setStreamingText(fullText); setIsStreaming(true); setToolCallName(null) },
        (v) => { vehicles = v; setStreamingVehicles(v) },
        (name) => { setToolCallName(name) },
        undefined,
        { language: lang, dealer_name: dealerName },
      )

      setMessages((prev) => [...prev, { role: 'assistant', content: fullText, vehicles: vehicles.length > 0 ? vehicles : undefined }])
      setStreamingText('')
      setStreamingVehicles([])
      setIsStreaming(false)
      getChatSuggestions(userMessage, history).then(setSuggestedQuestions)
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('errorOccurred', lang) }])
      setStreamingText('')
      setIsStreaming(false)
    } finally {
      setIsLoading(false)
      setToolCallName(null)
    }
  }, [messages, isLoading, sessionId, lang, dealerName])

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input) }
  const handleVehicleSelect = useCallback((vehicle: VehicleCard) => { setSpotlightVehicle(vehicle) }, [])
  const handleSpotlightAction = useCallback((message: string) => { sendMessage(message) }, [sendMessage])
  const getVideoForVehicle = useCallback((name: string) => matchVideoForVehicle(name, videoMap), [videoMap])

  const toolCallLabel = (name: string) => {
    const labels: Record<string, string> = {
      'search_inventory': t('searchingInventory', lang),
      'get_vehicle_details': t('loadingVehicle', lang),
      'compare_vehicles': t('comparingModels', lang),
      'book_appointment': t('bookingAppointment', lang),
    }
    return labels[name] || t('processing', lang)
  }

  // ── PICKER PHASE ──
  if (phase === 'picker') {
    return <DealerPicker lang={lang} onLangChange={setLang} onSelect={(name) => {
      setSelectedDealer(name)
      setDealerSlugResolved(true)
      window.history.pushState(null, '', `/d/${slugify(name)}`)
    }} />
  }

  // ── LOADING ──
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-center">
          <img src="/bmw-logo.png" alt="BMW" className="w-12 h-12 mx-auto mb-4 opacity-40 animate-pulse" />
          <p className="text-sm text-white/30">{t('loadingDealership', lang)}</p>
        </div>
      </div>
    )
  }

  // ── NOT FOUND ──
  if (dealerInfo && !dealerInfo.found) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-center px-6">
          <img src="/bmw-logo.png" alt="BMW" className="w-14 h-14 mx-auto mb-6 opacity-60" />
          <h1 className="text-2xl font-extralight text-white/80 mb-3">{t('dealerNotFound', lang)}</h1>
          <p className="text-sm text-white/40 max-w-sm mx-auto">{t('dealerNotFoundDesc', lang)}</p>
          <button onClick={() => { setSelectedDealer(''); setDealerInfo(null); setPhase('picker'); window.history.pushState(null, '', '/') }}
            className="mt-6 px-5 py-2 rounded-[4px] text-[13px] text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10] transition-all">
            {t('browseAll', lang)}
          </button>
        </div>
      </div>
    )
  }

  // If dealerInfo is null and we're past loading/not-found, show error state
  if (!dealerInfo) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-center px-6">
          <img src="/bmw-logo.png" alt="BMW" className="w-14 h-14 mx-auto mb-6 opacity-60" />
          <h1 className="text-2xl font-extralight text-white/80 mb-3">{t('dealerNotFound', lang)}</h1>
          <p className="text-sm text-white/40 max-w-sm mx-auto">{t('dealerNotFoundDesc', lang)}</p>
          <button onClick={() => { setSelectedDealer(''); setDealerInfo(null); setPhase('picker'); window.history.pushState(null, '', '/') }}
            className="mt-6 px-5 py-2 rounded-[4px] text-[13px] text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10] transition-all">
            {t('browseAll', lang)}
          </button>
        </div>
      </div>
    )
  }

  const info = dealerInfo
  const electricCount = info.fuel_types['ELECTRIC'] || info.fuel_types['BEV'] || 0

  // Hero video
  const heroVideo = (() => {
    const preferred = ['i7', 'ix', 'i7-m70', 'i4-m50', 'x5', 'm3-limousine']
    for (const id of preferred) { if (videoMap[id]) return videoMap[id] }
    const all = Object.values(videoMap)
    return all.length > 0 ? all[0] : null
  })()

  const activeVideo = bgVideo || heroVideo

  // ── DEALER EXPERIENCE (single page — hero morphs into conversation) ──
  return (
    <div className="flex flex-col h-[100dvh] bg-black relative overflow-hidden">
      {/* Cinematic background video */}
      {activeVideo && (
        <div className="fixed inset-0 z-0 pointer-events-none" style={{ animation: 'video-fade-in 2s ease-out' }}>
          <video src={activeVideo} autoPlay muted loop playsInline className="w-full h-full object-cover" />
          <div className={`absolute inset-0 transition-all duration-1000 ${
            hasConversation
              ? 'bg-gradient-to-b from-black/95 via-black/92 to-black/97'
              : 'bg-gradient-to-b from-black/80 via-black/65 to-black/95'
          }`} />
        </div>
      )}
      {!activeVideo && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-[#1c69d4] animate-ambient-glow" />
        </div>
      )}

      {/* Header */}
      <header className="px-4 sm:px-8 py-3 flex items-center justify-between shrink-0 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-3">
          <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
          <span className="w-px h-4 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-white/70 uppercase tracking-[0.1em]">{dealerName}</span>
            <span className="text-[10px] text-white/30">{t('exclusivePreview', lang)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {(['de', 'fr', 'it', 'en'] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold uppercase tracking-wider transition-all ${
                  l === lang ? 'bg-white/[0.12] text-white/70' : 'text-white/20 hover:text-white/40'
                }`}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
          <button onClick={() => { setSelectedDealer(''); setDealerInfo(null); setPhase('picker'); setMessages([]); setBgVideo(null); window.history.pushState(null, '', '/') }}
            className="text-[12px] text-white/50 hover:text-white/70 transition-colors ml-2 flex items-center gap-1 sm:w-[70px] justify-end">
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            <span className="hidden sm:inline">{t('backToAll', lang)}</span>
          </button>
        </div>
      </header>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain relative z-10">

        {/* Hero section — collapses when conversation starts */}
        <div className={`transition-all duration-700 ease-out overflow-hidden ${
          hasConversation ? 'max-h-0 opacity-0' : 'max-h-[60vh] opacity-100'
        }`}>
          <div className="flex flex-col items-center justify-center px-6 pt-8 sm:pt-16 pb-4">
            {/* Dealer name reveal */}
            <div className="animate-hero-in text-center mb-6">
              <p className="text-[10px] font-bold text-[#1c69d4] uppercase tracking-[0.2em] mb-2">{t('preparedFor', lang)}</p>
              <h1 className="text-[1.6rem] sm:text-[2.8rem] font-extralight text-white tracking-[-0.02em] leading-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                {dealerName}
              </h1>
            </div>

            {/* Compact stats */}
            <div className="flex items-center gap-6 sm:gap-8 mb-6 animate-hero-in [animation-delay:150ms] [animation-fill-mode:both]">
              <div className="text-center">
                <span className="text-[1.4rem] sm:text-[1.8rem] font-extralight text-white">{info.vehicle_count}</span>
                <span className="text-[10px] text-white/70 uppercase tracking-wider ml-1.5">{info.vehicle_count === 1 ? t('vehiclesSingular', lang) : t('vehiclesReady', lang)}</span>
              </div>
              <span className="w-px h-6 bg-white/[0.15]" />
              <div className="text-center">
                <span className="text-[1.4rem] sm:text-[1.8rem] font-extralight text-white">{info.series.length}</span>
                <span className="text-[10px] text-white/70 uppercase tracking-wider ml-1.5">{t('modelSeries', lang)}</span>
              </div>
              {electricCount > 0 && (
                <>
                  <span className="w-px h-6 bg-white/[0.15]" />
                  <div className="text-center flex items-baseline">
                    <span className="text-[1.4rem] sm:text-[1.8rem] font-extralight text-white">{electricCount}</span>
                    <span className="text-[10px] text-white/70 uppercase tracking-wider ml-1.5">{t('electric', lang)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Headline */}
            <p className="text-[14px] sm:text-[16px] font-light text-white/80 text-center max-w-lg leading-relaxed animate-hero-in [animation-delay:250ms] [animation-fill-mode:both]">
              {t('heroTitle', lang)}
            </p>
          </div>
        </div>

        {/* Vehicle strip — always visible (hidden if no sample vehicles) */}
        {info.sample_vehicles.length > 0 && (
        <div className={`transition-all duration-500 ${hasConversation ? 'pt-3 pb-2' : 'pt-2 pb-4'}`}>
          {!hasConversation && (
            <div className="flex items-center gap-2 justify-center mb-3 animate-hero-in [animation-delay:350ms] [animation-fill-mode:both]">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/[0.06]" />
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.15em]">{t('clickToExplore', lang)}</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/[0.06]" />
            </div>
          )}
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 sm:px-8" style={!hasConversation ? { animation: 'hero-in 0.6s ease-out 0.4s both' } : undefined}>
            {info.sample_vehicles.slice(0, 6).map((v) => {
              const vVideoSrc = matchVideoForVehicle(v.name, videoMap)
              return (
                <HeroVehicleCard
                  key={v.vin}
                  name={v.name}
                  image={v.image}
                  price={v.price}
                  fuelType={v.fuel_type}
                  videoSrc={vVideoSrc}
                  compact={hasConversation}
                  lang={lang}
                  onClick={() => {
                    const msg = lang === 'de' ? `Erzählen Sie mir über den ${v.name} (VIN: ${v.vin})` :
                                lang === 'fr' ? `Parlez-moi du ${v.name} (VIN: ${v.vin})` :
                                lang === 'it' ? `Parlatemi della ${v.name} (VIN: ${v.vin})` :
                                `Tell me about the ${v.name} (VIN: ${v.vin})`
                    sendMessage(msg)
                    // Set bg video immediately for this car
                    if (vVideoSrc) setBgVideo(vVideoSrc)
                  }}
                />
              )
            })}
          </div>
        </div>
        )}

        {/* Conversation area */}
        <div className="px-4 sm:px-6">
          <div className="max-w-2xl mx-auto space-y-4 pb-16">
            {/* Suggestion chips (shown before conversation) */}
            {!hasConversation && (
              <div className="flex flex-wrap gap-2 justify-center pt-4 animate-hero-in [animation-delay:500ms] [animation-fill-mode:both]">
                {(suggestionsByLang[lang] || suggestionsByLang['en']).map((q) => (
                  <button key={q} onClick={() => sendMessage(q)}
                    className="px-3.5 py-2 rounded-[4px] text-[12px] text-white/45 bg-white/[0.04] border border-white/[0.06] hover:border-[#1c69d4]/30 hover:bg-white/[0.06] hover:text-white/70 transition-all active:scale-[0.98]">
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat messages */}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={index === messages.length - 1 ? 'animate-message-in' : ''}>
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[70%] rounded-[4px] px-4 py-2.5 bg-white/[0.10] text-white">
                      <p className="text-[14px] leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-[4px] bg-white/[0.10] flex items-center justify-center">
                      <img src="/bmw-logo.png" alt="BMW" className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <MarkdownMessage content={message.content} />
                      {message.vehicles && message.vehicles.length > 0 && (
                        <InlineProductRow vehicles={message.vehicles} lang={lang} onSelect={handleVehicleSelect} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming */}
            {isLoading && (
              <div className="flex gap-3 items-start animate-message-in">
                <div className="flex-shrink-0 w-8 h-8 rounded-[4px] bg-white/[0.10] flex items-center justify-center">
                  <img src="/bmw-logo.png" alt="BMW" className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  {isStreaming && streamingText ? (
                    <>
                      <MarkdownMessage content={streamingText} />
                      {streamingVehicles.length > 0 && (
                        <InlineProductRow vehicles={streamingVehicles} lang={lang} onSelect={handleVehicleSelect} />
                      )}
                    </>
                  ) : toolCallName ? (
                    <div className="flex items-center gap-2.5 py-2 animate-tool-call-in">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:200ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:400ms]" />
                      </div>
                      <span className="text-[12px] text-white/50">{toolCallLabel(toolCallName)}</span>
                    </div>
                  ) : (
                    <div className="py-2"><TypingIndicator dotClassName="bg-[#1c69d4]/50" /></div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Suggested Questions (after responses) */}
      {suggestedQuestions.length > 0 && !isLoading && (
        <div className="px-4 sm:px-6 pb-2 shrink-0 relative z-10">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {suggestedQuestions.map((question, index) => (
                <button key={index} onClick={() => sendMessage(question)}
                  className="shrink-0 px-3 py-1.5 rounded-[4px] text-[12px] text-white/50 bg-white/[0.04] border border-white/[0.08] hover:border-[#1c69d4]/30 hover:text-white/70 transition-all whitespace-nowrap">
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input bar — always visible */}
      <div className="px-4 sm:px-6 pt-2 pb-2 shrink-0 border-t border-white/[0.06] relative z-10">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('inputPlaceholder', lang)}
              disabled={isLoading}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-[4px] pl-4 pr-12 py-3 text-[16px] sm:text-[14px] text-white placeholder:text-white/40 outline-none focus:border-[#1c69d4]/50 focus:bg-white/[0.08] transition-all duration-200 disabled:opacity-40"
            />
            <button type="submit" disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[4px] bg-[#1c69d4] flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:bg-[#1a5db8] active:scale-95">
              <ArrowUp className="h-4 w-4 text-white" strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </div>

      {/* Capabilities bar */}
      <div className="px-4 sm:px-6 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-2 shrink-0 relative z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between px-3 py-1.5 rounded-[4px] bg-white/[0.03] border border-white/[0.04]">
            <div className="flex items-center gap-3 sm:gap-4 text-[10px] text-white/25 overflow-x-auto scrollbar-hide">
              <a href="tel:+41445055262" className="flex items-center gap-1 shrink-0 hover:text-white/50 transition-colors">
                <Phone className="w-2.5 h-2.5 text-[#7ab5ff]/60" />
                <span className="text-[#7ab5ff]/50">+41 44 505 52 62</span>
              </a>
              <span className="w-px h-2.5 bg-white/[0.06] shrink-0" />
              <span className="flex items-center gap-1 shrink-0 opacity-40 cursor-default" title={t('comingSoon', lang)}><Users className="w-2.5 h-2.5" /> Leads</span>
              <span className="hidden sm:flex items-center gap-1 shrink-0 opacity-40 cursor-default" title={t('comingSoon', lang)}><Radio className="w-2.5 h-2.5" /> Monitor</span>
              <span className="hidden sm:flex items-center gap-1 shrink-0 opacity-40 cursor-default" title={t('comingSoon', lang)}><BarChart3 className="w-2.5 h-2.5" /> Analytics</span>
            </div>
            <span className="text-[9px] text-white/10 ml-auto shrink-0">Salesteq</span>
          </div>
        </div>
      </div>

      {/* Lead Captured card */}
      {showLeadCard && !leadCardDismissed && (() => {
        const allVehicles = messages.flatMap(m => m.vehicles || [])
        const uniqueNames = [...new Set(allVehicles.map(v => v.name))]
        const userMsgs = messages.filter(m => m.role === 'user')
        const interests: string[] = []
        const txt = userMsgs.map(m => m.content.toLowerCase()).join(' ')
        if (txt.match(/electri|bev|ev\b|i[47x]|elektr/)) interests.push(t('interestElectric', lang))
        if (txt.match(/suv|x[1-7]/)) interests.push(t('interestSUV', lang))
        if (txt.match(/price|cost|cheap|budget|under|afford|preis|prix|prezzo|unter|sous|sotto/)) interests.push(t('interestPrice', lang))
        if (txt.match(/sport|m[2-8]|perform|leistung/)) interests.push(t('interestPerformance', lang))
        if (txt.match(/family|space|seat|famili|platz/)) interests.push(t('interestFamily', lang))
        if (interests.length === 0) interests.push(t('interestGeneral', lang))

        return (
          <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[280px]">
            <div className="rounded-[4px] bg-[#0c0c10]/95 backdrop-blur-xl border border-white/[0.10] shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden" style={{ animation: 'lead-card-in 0.4s ease-out' }}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-[0.1em]">{t('leadCaptured', lang)}</span>
                </div>
                <button onClick={() => setLeadCardDismissed(true)} className="text-white/20 hover:text-white/50 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="px-3 py-2.5 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-[4px] bg-[#1c69d4]/15 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-[#7ab5ff]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white/80 font-medium">{t('websiteVisitor', lang)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-2 h-2 text-white/25" />
                      <span className="text-[9px] text-white/25">{t('justNow', lang)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-[2px] bg-orange-500/15">
                    <Flame className="w-2.5 h-2.5 text-orange-400" />
                    <span className="text-[9px] font-bold text-orange-400/90 uppercase">{t('hot', lang)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1">{t('interests', lang)}</p>
                  <div className="flex flex-wrap gap-1">
                    {interests.map(i => (
                      <span key={i} className="px-1.5 py-0.5 rounded-[2px] text-[9px] text-[#7ab5ff] bg-[#1c69d4]/10 border border-[#1c69d4]/15">{i}</span>
                    ))}
                  </div>
                </div>
                {uniqueNames.length > 0 && (
                  <div>
                    <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1">{t('vehiclesViewed', lang)}</p>
                    {uniqueNames.slice(0, 2).map(name => (
                      <div key={name} className="flex items-center gap-1.5 mb-0.5">
                        <Car className="w-2.5 h-2.5 text-white/20" />
                        <span className="text-[10px] text-white/50 truncate">{name}</span>
                      </div>
                    ))}
                    {uniqueNames.length > 2 && <span className="text-[9px] text-white/20">+{uniqueNames.length - 2} {t('more', lang)}</span>}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.04]">
                  <div><p className="text-[9px] text-white/25">{t('messages', lang)}</p><p className="text-[13px] text-white/60 font-medium">{userMsgs.length}</p></div>
                  <div><p className="text-[9px] text-white/25">{t('vehicles', lang)}</p><p className="text-[13px] text-white/60 font-medium">{uniqueNames.length}</p></div>
                  <div><p className="text-[9px] text-white/25">{t('source', lang)}</p><p className="text-[9px] text-white/40 mt-0.5">{t('aiAssistant', lang)}</p></div>
                </div>
              </div>
              <div className="px-3 py-2 bg-white/[0.02] border-t border-white/[0.04]">
                <p className="text-[9px] text-white/20 text-center">{t('leadCardFooter', lang)}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Vehicle Spotlight overlay */}
      {spotlightVehicle && (
        <VehicleSpotlight
          vehicle={spotlightVehicle}
          videoSrc={getVideoForVehicle(spotlightVehicle.name)}
          lang={lang}
          onClose={() => setSpotlightVehicle(null)}
          onAction={handleSpotlightAction}
        />
      )}
    </div>
  )
}

// ── Hero Vehicle Card ──
function HeroVehicleCard({
  name, image, price, fuelType, videoSrc, compact, lang = 'en', onClick,
}: {
  name: string; image?: string; price?: string; fuelType?: string; videoSrc?: string; compact?: boolean; lang?: Lang; onClick?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playTapRef = useRef(false)

  const handleMouseEnter = () => {
    if (videoSrc && videoRef.current) {
      setIsPlaying(true)
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }
  const handleMouseLeave = () => {
    setIsPlaying(false)
    if (videoRef.current) videoRef.current.pause()
  }

  const handlePlayTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    playTapRef.current = true
    if (!videoSrc || !videoRef.current) return
    if (isPlaying) {
      setIsPlaying(false)
      videoRef.current.pause()
    } else {
      setIsPlaying(true)
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }

  const handleCardClick = () => {
    if (playTapRef.current) { playTapRef.current = false; return }
    onClick?.()
  }

  return (
    <div
      className={`shrink-0 rounded-[4px] overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.18] transition-all duration-300 group cursor-pointer active:scale-[0.98] ${
        compact ? 'w-[120px] sm:w-[140px]' : 'w-[150px] sm:w-[210px]'
      }`}
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={compact ? 'aspect-[16/9] relative overflow-hidden' : 'aspect-[16/10] relative overflow-hidden'}>
        {image ? (
          <img src={image} alt={name}
            className={`w-[85%] h-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-all duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Car className="w-8 h-8 text-white/15" /></div>
        )}
        {videoSrc && (
          <video ref={videoRef} src={videoSrc} muted loop playsInline preload="none"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
        )}
        {videoSrc && (
          <div
            onClick={handlePlayTap}
            className={`absolute bottom-1.5 left-1.5 w-8 h-8 sm:w-6 sm:h-6 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 hover:scale-110 active:scale-95 ${isPlaying ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}`}
          >
            <div className="absolute inset-0 rounded-full border border-[#1c69d4]/40" style={{ animation: 'play-ring-pulse 3s ease-in-out infinite' }} />
            <div className="absolute inset-0 rounded-full bg-black/50 backdrop-blur-md" />
            <Play className="w-2.5 h-2.5 text-[#7ab5ff] relative z-10 ml-[1px] fill-[#7ab5ff]/30" strokeWidth={2} />
          </div>
        )}
        {fuelType && !compact && (
          <div className={`absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded-[2px] text-[8px] font-bold uppercase tracking-[0.04em] ${
            fuelType.includes('Electri') || fuelType === 'BEV' ? 'bg-[#1c69d4]/25 text-[#7ab5ff]' :
            fuelType.includes('Hybrid') || fuelType === 'PHEV' ? 'bg-[#1c69d4]/15 text-[#7ab5ff]' :
            'bg-white/[0.08] text-white/50'
          }`}>
            {fuelType.includes('Electri') || fuelType === 'BEV' ? <Zap className="w-2 h-2" /> :
             fuelType.includes('Hybrid') || fuelType === 'PHEV' ? <Battery className="w-2 h-2" /> :
             <Fuel className="w-2 h-2" />}
            {fuelLabel(fuelType, lang)}
          </div>
        )}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-[#1c69d4]/25 to-transparent" />
      </div>
      <div className={compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}>
        <p className={`text-white/70 font-medium truncate ${compact ? 'text-[10px]' : 'text-[11px] sm:text-[12px]'}`}>{name}</p>
        {price && !compact && <p className="text-[10px] sm:text-[11px] text-white/40 mt-0.5">{price}</p>}
      </div>
    </div>
  )
}

// ── Dealer Picker ──
function DealerPicker({ lang, onLangChange, onSelect }: { lang: Lang; onLangChange: (l: Lang) => void; onSelect: (name: string) => void }) {
  const [groups, setGroups] = useState<DealerGroup[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dealer/groups')
      .then((r) => r.json())
      .then(setGroups)
      .catch(console.error)
      .finally(() => setLoading(false))
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then((map: Record<string, string>) => {
      setVideoSrc(map['i7'] || Object.values(map)[0] || null)
    }).catch(() => {})
  }, [])

  const matches = search.length >= 3 ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase())) : []
  const filtered = matches.length <= 5 ? matches : []

  return (
    <div className="min-h-[100dvh] bg-black flex flex-col relative overflow-hidden" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {videoSrc && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <video src={videoSrc} autoPlay muted loop playsInline className="w-full h-full object-cover opacity-[0.25]" />
        </div>
      )}

      <header className="px-4 sm:px-8 py-3.5 flex items-center justify-between shrink-0 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-3">
          <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
          <span className="w-px h-4 bg-white/15" />
          <span className="text-[10px] sm:text-[12px] font-bold text-white/80 uppercase tracking-[0.12em]">{t('aiSalesChannel', lang)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {(['de', 'fr', 'it', 'en'] as Lang[]).map(l => (
              <button key={l} onClick={() => onLangChange(l)}
                className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold uppercase tracking-wider transition-all ${
                  l === lang ? 'bg-white/[0.12] text-white/70' : 'text-white/20 hover:text-white/40'
                }`}>
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-white/20 uppercase tracking-[0.15em]">Salesteq</span>
        </div>
      </header>

      <div className="relative flex flex-col items-center justify-center min-h-[22vh] sm:min-h-[28vh] px-6 overflow-hidden z-10">
        <div className="relative z-10 text-center animate-hero-in">
          <img src="/bmw-logo.png" alt="BMW" className="w-10 h-10 sm:w-12 sm:h-12 opacity-70 mx-auto mb-4 sm:mb-6" />
          <h1 className="text-[1.8rem] sm:text-[3rem] font-extralight text-white tracking-[-0.02em] leading-[1.05] mb-3">
            {t('selectDealership', lang)}
          </h1>
          <p className="text-[14px] sm:text-[16px] font-light text-white/50 max-w-lg mx-auto leading-relaxed min-h-[3rem]">
            {t('pickerSubtitle', lang)}
          </p>
        </div>
      </div>

      <div className="w-full max-w-[800px] mx-auto px-4 sm:px-8 pb-12 relative z-10 animate-hero-in [animation-delay:200ms] [animation-fill-mode:both]">
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchDealership', lang)} autoFocus
            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-[4px] pl-11 pr-4 py-3.5 sm:py-4 text-[16px] sm:text-[14px] text-white placeholder:text-white/40 outline-none focus:border-[#1c69d4]/60 focus:bg-white/[0.08] transition-all duration-300 animate-input-glow" />
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-2 border-white/10 border-t-[#1c69d4] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[12px] text-white/30">{t('loadingDealerships', lang)}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
            {filtered.map((group) => (
              <button key={group.name} onClick={() => onSelect(group.name)}
                className="group flex items-center gap-4 px-5 py-4 bg-transparent border-b border-white/[0.06] hover:bg-white/[0.04] transition-all duration-200 active:scale-[0.99] text-left">
                <div className="w-9 h-9 rounded-[4px] bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:bg-[#1c69d4]/20 transition-colors">
                  <Car className="w-4 h-4 text-white/40 group-hover:text-[#7ab5ff] transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white/90 uppercase tracking-[0.06em] truncate">{group.name}</div>
                  {group.location_count > 1 && (
                    <div className="text-[11px] text-white/35 mt-0.5 inline-flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5" />{group.location_count} {t('pickerLocations', lang)}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-white/0 group-hover:text-white/30 group-hover:translate-x-1 transition-all duration-300 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && search.length >= 3 && (
          <div className="text-center py-12">
            <p className="text-[13px] text-white/40">{matches.length > 5 ? t('keepTyping', lang) : `${t('noDealerFound', lang)} \u201C${search}\u201D`}</p>
          </div>
        )}
      </div>

      <footer className="mt-auto px-4 sm:px-8 py-4 border-t border-white/[0.04] flex items-center justify-between shrink-0 relative z-10">
        <span className="text-[10px] text-white/10 tracking-[0.05em]">{t('bmwSwitzerland', lang)}</span>
        <span className="text-[10px] text-white/10 tracking-[0.05em]">Powered by Salesteq</span>
      </footer>
    </div>
  )
}
