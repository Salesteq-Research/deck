import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Zap, Fuel, Battery, Calendar, Play } from 'lucide-react'
import { TypingIndicator } from '../chat/TypingIndicator'
import { MarkdownMessage } from '../chat/MarkdownMessage'
import type { ChatMessage, VehicleCard } from '@/lib/types'

const API_BASE = '/api'

type PageState = 'invite' | 'conversation' | 'confirmed'
type Lang = 'de' | 'en' | 'fr' | 'it' | 'ar' | 'es' | 'pt' | 'nl' | 'pl' | 'tr'

const LANGS: { code: Lang; flag: string; label: string }[] = [
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },
  { code: 'pl', flag: '🇵🇱', label: 'Polski' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
]

const I18N: Record<Lang, { headline: string; placeholder: string; message: string; calendar: string; bookingRef: string; celebration: string; testDrive: string; selectModel: string; bookModel: string }> = {
  de: { headline: 'Welchen BMW möchten Sie erleben?', placeholder: 'z.B. BMW i7, Elektro-SUV, 3er Touring …', message: 'Ihre Nachricht …', calendar: 'Zum Kalender hinzufügen', bookingRef: 'Buchungsreferenz', celebration: 'Wir freuen uns auf Sie', testDrive: 'Probefahrt', selectModel: 'Dieses Modell wählen', bookModel: 'Ich möchte eine Probefahrt mit dem {name} buchen' },
  en: { headline: 'Which BMW would you like to experience?', placeholder: 'e.g. BMW i7, Electric SUV, 3 Series Touring …', message: 'Your message …', calendar: 'Add to Calendar', bookingRef: 'Booking Reference', celebration: 'We look forward to seeing you', testDrive: 'Test Drive', selectModel: 'Select this model', bookModel: 'I would like to book a test drive with the {name}' },
  fr: { headline: 'Quelle BMW souhaitez-vous découvrir ?', placeholder: 'p.ex. BMW i7, SUV électrique, Série 3 Touring …', message: 'Votre message …', calendar: 'Ajouter au calendrier', bookingRef: 'Référence de réservation', celebration: 'Nous nous réjouissons de vous accueillir', testDrive: 'Essai routier', selectModel: 'Choisir ce modèle', bookModel: 'Je souhaite réserver un essai routier avec la {name}' },
  it: { headline: 'Quale BMW vorresti provare?', placeholder: 'es. BMW i7, SUV elettrico, Serie 3 Touring …', message: 'Il tuo messaggio …', calendar: 'Aggiungi al calendario', bookingRef: 'Riferimento prenotazione', celebration: 'Non vediamo l\'ora di accogliervi', testDrive: 'Test Drive', selectModel: 'Scegli questo modello', bookModel: 'Vorrei prenotare un test drive con la {name}' },
  ar: { headline: 'أي BMW تودّ تجربتها؟', placeholder: 'مثال: BMW i7، SUV كهربائي، الفئة الثالثة …', message: 'رسالتك …', calendar: 'أضف إلى التقويم', bookingRef: 'رقم الحجز', celebration: 'نتطلّع لاستقبالكم', testDrive: 'تجربة قيادة', selectModel: 'اختر هذا الموديل', bookModel: 'أرغب في حجز تجربة قيادة لسيارة {name}' },
  es: { headline: '¿Qué BMW te gustaría experimentar?', placeholder: 'ej. BMW i7, SUV eléctrico, Serie 3 Touring …', message: 'Tu mensaje …', calendar: 'Añadir al calendario', bookingRef: 'Referencia de reserva', celebration: 'Esperamos verte pronto', testDrive: 'Prueba de conducción', selectModel: 'Elegir este modelo', bookModel: 'Me gustaría reservar una prueba de conducción con el {name}' },
  pt: { headline: 'Qual BMW gostaria de experimentar?', placeholder: 'ex. BMW i7, SUV elétrico, Série 3 Touring …', message: 'Sua mensagem …', calendar: 'Adicionar ao calendário', bookingRef: 'Referência da reserva', celebration: 'Esperamos por si', testDrive: 'Test Drive', selectModel: 'Escolher este modelo', bookModel: 'Gostaria de reservar um test drive com o {name}' },
  nl: { headline: 'Welke BMW wilt u ervaren?', placeholder: 'bijv. BMW i7, elektrische SUV, 3 Serie Touring …', message: 'Uw bericht …', calendar: 'Toevoegen aan agenda', bookingRef: 'Boekingsreferentie', celebration: 'Wij kijken ernaar uit u te verwelkomen', testDrive: 'Proefrit', selectModel: 'Dit model kiezen', bookModel: 'Ik wil graag een proefrit boeken met de {name}' },
  pl: { headline: 'Które BMW chciałbyś doświadczyć?', placeholder: 'np. BMW i7, elektryczny SUV, Seria 3 Touring …', message: 'Twoja wiadomość …', calendar: 'Dodaj do kalendarza', bookingRef: 'Numer rezerwacji', celebration: 'Czekamy na Ciebie', testDrive: 'Jazda próbna', selectModel: 'Wybierz ten model', bookModel: 'Chciałbym zarezerwować jazdę próbną z {name}' },
  tr: { headline: 'Hangi BMW\'yi deneyimlemek istersiniz?', placeholder: 'ör. BMW i7, Elektrikli SUV, 3 Serisi Touring …', message: 'Mesajınız …', calendar: 'Takvime ekle', bookingRef: 'Rezervasyon Referansı', celebration: 'Sizi ağırlamayı dört gözle bekliyoruz', testDrive: 'Test Sürüşü', selectModel: 'Bu modeli seç', bookModel: '{name} ile test sürüşü rezervasyonu yapmak istiyorum' },
}

async function sendTestDriveStream(
  message: string,
  conversationHistory: ChatMessage[],
  sessionId: string,
  onText: (text: string) => void,
  onVehicles: (vehicles: VehicleCard[]) => void,
  onToolCall?: (name: string) => void,
  language?: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/testdrive/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      session_id: sessionId,
      language,
    }),
  })
  if (!response.ok) throw new Error('Stream failed')

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No reader')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === 'text') onText(event.content)
        else if (event.type === 'vehicles') onVehicles(event.vehicles)
        else if (event.type === 'tool_call' && onToolCall) onToolCall(event.name)
      } catch {
        // skip
      }
    }
  }
}

const FEATURED_IDS = ['i7', 'i4-m50', 'm3-limousine', 'ix', 'x5', 'i7-m70']

interface FeaturedModel {
  id: string
  name: string
  starting_price: number
  powertrain: string
  power_hp?: number
  range_km?: number
  image?: string
  video?: string
}

export function TestDriveBooking() {
  const [pageState, setPageState] = useState<PageState>('invite')
  const [lang, setLang] = useState<Lang>('de')
  const t = I18N[lang]
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingVehicles, setStreamingVehicles] = useState<VehicleCard[]>([])
  const [toolCallName, setToolCallName] = useState<string | null>(null)
  const [contextInfo, setContextInfo] = useState<{ car?: string; dealer?: string }>({})
  const [bgVideo, setBgVideo] = useState<string | null>(null)
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const [sessionId] = useState(() => crypto.randomUUID())

  // Load video map once
  useEffect(() => {
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then(setVideoMap).catch(() => {})
  }, [])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { if (!isLoading) inputRef.current?.focus() }, [isLoading, messages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  // Detect state transitions from conversation content
  useEffect(() => {
    const allText = messages.map(m => m.content).join(' ').toLowerCase()
    if (allText.includes('td-202') || allText.includes('buchungsreferenz') || allText.includes('booking_reference') || allText.includes('bestätigt')) {
      setPageState('confirmed')
    }

    // Extract context for context bar
    const ctx: { car?: string; dealer?: string } = {}
    for (const m of messages) {
      if (m.vehicles && m.vehicles.length > 0) {
        ctx.car = m.vehicles[0].name
      }
      // Detect car from user's booking request
      if (!ctx.car && m.role === 'user') {
        const match = m.content.match(/Probefahrt mit dem (.+?)(?:\s+buchen)?$/i)
        if (match) ctx.car = match[1]
      }
    }
    if (allText.includes('händler') || allText.includes('partner') || allText.includes('niederlassung')) {
      ctx.dealer = 'BMW Partner'
    }
    setContextInfo(ctx)
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage = text.trim()
    setInput('')

    // Transition from invite to conversation on first message
    if (pageState === 'invite') {
      // Try to match a video for the selected car
      const lowerMsg = userMessage.toLowerCase()
      const matchedId = Object.keys(videoMap).find(id => {
        const normalized = id.replace(/-/g, ' ').replace('limousine', '').trim()
        return lowerMsg.includes(normalized)
      })
      if (matchedId && videoMap[matchedId]) {
        setBgVideo(videoMap[matchedId])
      }
      setPageState('conversation')
    }

    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setIsStreaming(false)
    setStreamingText('')
    setStreamingVehicles([])
    setToolCallName(null)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      let fullText = ''
      let vehicles: VehicleCard[] = []

      await sendTestDriveStream(
        userMessage,
        history,
        sessionId,
        (delta) => {
          fullText += delta
          setStreamingText(fullText)
          setIsStreaming(true)
          setToolCallName(null)
        },
        (v) => {
          vehicles = v
          setStreamingVehicles(v)
        },
        (name) => {
          setToolCallName(name)
        },
        lang,
      )

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: fullText,
        vehicles: vehicles.length > 0 ? vehicles : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      setStreamingText('')
      setStreamingVehicles([])
      setIsStreaming(false)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Entschuldigung, ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' }])
      setStreamingText('')
      setIsStreaming(false)
    } finally {
      setIsLoading(false)
      setToolCallName(null)
    }
  }, [messages, isLoading, sessionId, pageState])

  const handleModelSelect = useCallback((vehicle: VehicleCard) => {
    sendMessage(t.bookModel.replace('{name}', vehicle.name))
  }, [sendMessage, t])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const toolCallLabel = (name: string) => {
    const labels: Record<string, string> = {
      'browse_test_drive_models': 'Modelle werden geladen …',
      'get_model_details': 'Fahrzeugdetails laden …',
      'get_available_dealers': 'BMW Partner suchen …',
      'confirm_test_drive_booking': 'Buchung wird bestätigt …',
    }
    return labels[name] || 'Wird verarbeitet …'
  }

  // ── INVITE STATE ──
  if (pageState === 'invite') {
    return (
      <div className="flex flex-col h-[100dvh] bg-black" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Header */}
        <header className="px-4 sm:px-8 py-3.5 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
            <span className="w-px h-4 bg-white/15" />
            <span className="text-[12px] font-bold text-white/80 uppercase tracking-[0.12em]">{t.testDrive}</span>
          </div>
          <nav className="flex items-center gap-1">
            <a href="/" className="px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Home</a>
            <a href="/testdrive/inventory" className="px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Modelle</a>
          </nav>
        </header>

        {/* Centered invite content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
          {/* Ambient glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[400px] h-[400px] rounded-full bg-[#1c69d4] animate-ambient-glow" />
          </div>

          {/* BMW logo */}
          <img src="/bmw-logo.png" alt="BMW" className="w-12 h-12 opacity-70 mb-6 animate-hero-in" />

          {/* Language picker */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-6 animate-hero-in [animation-delay:50ms] [animation-fill-mode:both]">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`px-2.5 py-1 rounded-[4px] text-[13px] transition-all active:scale-95 ${
                  lang === l.code
                    ? 'bg-[#1c69d4]/20 border border-[#1c69d4]/50 text-white'
                    : 'bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/80 hover:border-white/[0.16]'
                }`}
              >
                <span className="mr-1">{l.flag}</span>{l.label}
              </button>
            ))}
          </div>

          {/* Headline */}
          <h1 className="text-[2rem] sm:text-[3rem] font-extralight tracking-[0.01em] text-white text-center mb-10 animate-hero-in [animation-delay:100ms] [animation-fill-mode:both]">
            {t.headline}
          </h1>

          {/* Centered input */}
          <form onSubmit={handleSubmit} className="relative w-full max-w-xl mb-12 animate-hero-in [animation-delay:200ms] [animation-fill-mode:both]">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.placeholder}
              autoFocus
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              className="w-full bg-white/[0.06] border border-white/[0.12] rounded-[4px] pl-5 pr-14 py-5 text-lg text-white placeholder:text-white/40 outline-none focus:border-[#1c69d4]/60 focus:bg-white/[0.08] transition-all duration-300 animate-input-glow"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-[4px] bg-[#1c69d4] flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:bg-[#1a5db8] active:scale-95"
            >
              <ArrowUp className="h-5 w-5 text-white" strokeWidth={2.5} />
            </button>
          </form>

          {/* 2x3 model pills */}
          <ModelPillGrid onSelect={(name) => sendMessage(t.bookModel.replace('{name}', name))} />
        </div>
      </div>
    )
  }

  // ── CONFIRMED STATE ──
  if (pageState === 'confirmed') {
    const lastMsg = messages[messages.length - 1]
    const allText = messages.map(m => m.content).join(' ')
    const bookingRef = (() => {
      const match = allText.match(/TD-\d{4,}/i)
      return match ? match[0] : null
    })()

    return (
      <div className="flex flex-col h-[100dvh] bg-black items-center justify-center px-6">
        <div className="max-w-lg w-full text-center animate-message-in">
          <img src="/bmw-logo.png" alt="BMW" className="w-12 h-12 opacity-70 mx-auto mb-6" />
          <h1 className="text-[2rem] sm:text-[2.5rem] font-extralight text-white mb-4">
            {t.celebration}
          </h1>
          {bookingRef && (
            <div className="border-l-2 border-[#1c69d4] bg-white/[0.04] rounded-r-[4px] px-6 py-4 text-left mb-6">
              <p className="text-white/60 text-[12px] uppercase tracking-[0.1em] mb-1">{t.bookingRef}</p>
              <p className="text-white text-lg font-medium">{bookingRef}</p>
            </div>
          )}
          {lastMsg && (
            <div className="text-left mb-8">
              <MarkdownMessage content={lastMsg.content} />
            </div>
          )}
          <AddToCalendarButton messages={messages} bookingRef={bookingRef} />
        </div>
      </div>
    )
  }

  // ── CONVERSATION STATE ──
  return (
    <div className="flex flex-col h-[100dvh] bg-black relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'} onClick={() => inputRef.current?.focus()}>
      {/* Cinematic background video */}
      {bgVideo && (
        <div className="absolute inset-0 z-0" style={{ animation: 'video-fade-in 1.2s ease-out' }}>
          <video
            ref={bgVideoRef}
            src={bgVideo}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Dark overlay so chat is readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />
        </div>
      )}
      {/* Header */}
      <header className="px-4 sm:px-8 py-3.5 flex items-center justify-between shrink-0 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-3">
          <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
          <span className="w-px h-4 bg-white/15" />
          <span className="text-[12px] font-bold text-white/80 uppercase tracking-[0.12em]">{t.testDrive}</span>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/" className="px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Home</a>
          <a href="/testdrive/inventory" className="px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Modelle</a>
        </nav>
      </header>

      {/* Context bar */}
      {(contextInfo.car || contextInfo.dealer) && (
        <div className="px-4 sm:px-6 py-2 border-b border-white/[0.06] shrink-0 relative z-10">
          <div className="max-w-2xl mx-auto flex items-center gap-3 text-[12px] text-white/70">
            {contextInfo.car && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]" />
                {contextInfo.car}
              </span>
            )}
            {contextInfo.dealer && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/50" />
                {contextInfo.dealer}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6 relative z-10">
        <div className="max-w-2xl mx-auto space-y-5">
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
                  <BmwAvatar />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <MarkdownMessage content={message.content} />
                    {message.vehicles && message.vehicles.length > 0 && (
                      <VehicleRevealCards vehicles={message.vehicles} onSelect={handleModelSelect} disabled={isLoading} interactive={index === messages.length - 1} selectLabel={t.selectModel} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Streaming */}
          {isLoading && (
            <div className="flex gap-3 items-start animate-message-in">
              <BmwAvatar />
              <div className="flex-1 min-w-0 pt-0.5">
                {isStreaming && streamingText ? (
                  <>
                    <MarkdownMessage content={streamingText} />
                    {streamingVehicles.length > 0 && (
                      <VehicleRevealCards vehicles={streamingVehicles} onSelect={handleModelSelect} disabled interactive={!contextInfo.car} selectLabel={t.selectModel} />
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

      {/* Input — bottom pinned */}
      <div className="px-4 sm:px-6 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0 border-t border-white/[0.06] relative z-10">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.message}
              disabled={isLoading}
              autoFocus
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-[4px] pl-5 pr-12 py-3.5 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-[#1c69d4]/50 focus:bg-white/[0.08] transition-all duration-200 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[4px] bg-[#1c69d4] flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:bg-[#1a5db8] active:scale-95"
            >
              <ArrowUp className="h-4 w-4 text-white" strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}


/** BMW avatar */
function BmwAvatar() {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-[4px] bg-white/[0.10] flex items-center justify-center">
      <img src="/bmw-logo.png" alt="BMW" className="w-5 h-5" />
    </div>
  )
}


/** Vehicle cards with dramatic image treatment + hover-to-play video */
function VehicleRevealCards({ vehicles, onSelect, disabled, interactive = true, selectLabel = 'Dieses Modell wählen' }: {
  vehicles: VehicleCard[]
  onSelect: (v: VehicleCard) => void
  disabled?: boolean
  interactive?: boolean
  selectLabel?: string
}) {
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then(setVideoMap).catch(() => {})
  }, [])

  if (vehicles.length === 0) return null

  return (
    <div className="mt-3 pt-3">
      <div className="flex gap-3 overflow-x-auto py-2 px-0.5 scrollbar-hide">
        {vehicles.map((v, i) => {
          // Match vehicle to video by finding model id in the name
          const videoId = Object.keys(videoMap).find(id =>
            v.name.toLowerCase().includes(id.replace(/-/g, ' ').replace('limousine', '').trim())
          )
          const videoSrc = videoId ? videoMap[videoId] : undefined

          return (
            <VehicleVideoCard
              key={v.vin}
              vehicle={v}
              videoSrc={videoSrc}
              onSelect={onSelect}
              disabled={disabled}
              interactive={interactive}
              selectLabel={selectLabel}
              delay={i * 80}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Single vehicle card with hover video + play badge */
function VehicleVideoCard({ vehicle: v, videoSrc, onSelect, disabled, interactive = true, selectLabel, delay }: {
  vehicle: VehicleCard
  videoSrc?: string
  onSelect: (v: VehicleCard) => void
  disabled?: boolean
  interactive?: boolean
  selectLabel: string
  delay: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const handleMouseEnter = useCallback(() => {
    if (videoSrc && videoRef.current) {
      setIsPlaying(true)
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [videoSrc])

  const handleMouseLeave = useCallback(() => {
    setIsPlaying(false)
    if (videoRef.current) videoRef.current.pause()
  }, [])

  return (
    <button
      disabled={disabled || !interactive}
      onClick={(e) => { e.stopPropagation(); if (interactive) onSelect(v) }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`flex-shrink-0 w-[240px] sm:w-[280px] flex flex-col rounded-[4px] border border-white/[0.10] bg-white/[0.05] overflow-hidden text-left transition-all duration-200 ${interactive ? 'hover:border-white/[0.20] hover:bg-white/[0.08] active:scale-[0.98] cursor-pointer' : 'cursor-default'} disabled:opacity-50 disabled:pointer-events-none group animate-card-in [animation-fill-mode:both]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Image/Video area */}
      <div className="w-full h-[140px] sm:h-[165px] relative flex items-center justify-center overflow-hidden">
        {/* Static image — fades out when video plays */}
        {v.image && (
          <img
            src={v.image}
            alt={v.name}
            className={`w-[85%] h-auto object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.8)] group-hover:scale-105 transition-all duration-300 animate-car-reveal ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {/* Video layer */}
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
            style={isPlaying ? { animation: 'video-fade-in 0.5s ease-out' } : undefined}
          />
        )}
        {/* Video play badge */}
        <VideoPlayBadge hasVideo={!!videoSrc} isPlaying={isPlaying} size="md" />
        {/* Light bloom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[2px] bg-gradient-to-r from-transparent via-[#1c69d4]/30 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[40px] bg-[#1c69d4]/[0.04] blur-2xl" />
        {/* Powertrain badge */}
        <div className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[12px] font-bold uppercase tracking-[0.04em] ${
          v.fuel_type?.includes('Electri') ? 'bg-[#1c69d4]/25 text-[#7ab5ff]' :
          v.fuel_type?.includes('Hybrid') ? 'bg-[#1c69d4]/15 text-[#7ab5ff]' :
          'bg-white/[0.08] text-white/60'
        }`}>
          {v.fuel_type?.includes('Electri') ? <Zap className="w-2.5 h-2.5" /> :
           v.fuel_type?.includes('Hybrid') ? <Battery className="w-2.5 h-2.5" /> :
           <Fuel className="w-2.5 h-2.5" />}
          {v.fuel_type}
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5 flex-1 flex flex-col">
        <h4 className="text-[14px] font-semibold text-white leading-tight line-clamp-2">{v.name}</h4>
        <p className="text-[12px] text-white/50 mt-0.5">
          {v.series && <span className="text-[#4d8fe0] font-medium">{v.series}</span>}
          {v.body_type && <> &middot; {v.body_type}</>}
        </p>
        {v.price && (
          <p className="text-[14px] font-bold text-white mt-auto pt-2">{v.price}</p>
        )}
        {interactive && (
          <div className="mt-2 py-1.5 rounded-[2px] bg-[#1c69d4]/20 text-[#7ab5ff] text-[12px] font-bold uppercase tracking-[0.08em] text-center group-hover:bg-[#1c69d4] group-hover:text-white transition-all">
            {selectLabel}
          </div>
        )}
      </div>
    </button>
  )
}


/** Compact 2x3 model pill grid for invite screen — shows video on hover */
function ModelPillGrid({ onSelect }: { onSelect: (name: string) => void }) {
  const [featured, setFeatured] = useState<FeaturedModel[]>([])
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})

  useEffect(() => {
    // Load vehicles + video URLs in parallel
    Promise.all([
      fetch(`${API_BASE}/testdrive/vehicles`).then(r => r.json()),
      fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([data, videos]) => {
      const all: FeaturedModel[] = data.items || []
      const picked = FEATURED_IDS.map(id => all.find((m: FeaturedModel) => m.id === id)).filter(Boolean) as FeaturedModel[]
      setFeatured(picked.length > 0 ? picked : all.slice(0, 6))
      setVideoMap(videos as Record<string, string>)
    }).catch(() => {})
  }, [])

  if (featured.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl animate-hero-in [animation-delay:400ms] [animation-fill-mode:both]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[140px] rounded-[4px] bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-2xl animate-hero-in [animation-delay:400ms] [animation-fill-mode:both]">
      {featured.slice(0, 6).map((m, i) => (
        <ModelPill key={m.id} model={m} videoSrc={videoMap[m.id]} onSelect={onSelect} delay={500 + i * 60} />
      ))}
    </div>
  )
}

/** Single model pill with cinematic video play badge */
function ModelPill({ model: m, videoSrc, onSelect, delay }: {
  model: FeaturedModel
  videoSrc?: string
  onSelect: (name: string) => void
  delay: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showVideo, setShowVideo] = useState(false)

  const handleMouseEnter = useCallback(() => {
    if (videoSrc && videoRef.current) {
      setShowVideo(true)
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [videoSrc])

  const handleMouseLeave = useCallback(() => {
    setShowVideo(false)
    if (videoRef.current) {
      videoRef.current.pause()
    }
  }, [])

  return (
    <button
      onClick={() => onSelect(m.name)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group flex flex-col items-center rounded-[4px] bg-white/[0.05] border border-white/[0.10] hover:border-[#1c69d4]/50 hover:bg-white/[0.08] transition-all active:scale-[0.97] overflow-hidden animate-card-in [animation-fill-mode:both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Car image / video */}
      <div className="w-full h-[90px] sm:h-[110px] relative flex items-center justify-center pt-3 overflow-hidden">
        {m.image && (
          <img
            src={m.image}
            alt={m.name}
            className={`w-[85%] h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-all duration-300 ${showVideo ? 'opacity-0' : 'opacity-100'}`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${showVideo ? 'opacity-100' : 'opacity-0'}`}
            style={showVideo ? { animation: 'video-fade-in 0.5s ease-out' } : undefined}
          />
        )}

        {/* Video play badge */}
        <VideoPlayBadge hasVideo={!!videoSrc} isPlaying={showVideo} size="sm" />

        {/* Subtle light bloom under car */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[2px] bg-gradient-to-r from-transparent via-[#1c69d4]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {/* Name */}
      <div className="w-full px-3 py-2.5 text-center">
        <span className="text-[13px] text-white/80 group-hover:text-white transition-colors leading-tight block">{m.name.replace('BMW ', '')}</span>
      </div>
    </button>
  )
}


/**
 * Cinematic video play badge overlay.
 * - hasVideo + !isPlaying: frosted glass circle with pulsing blue ring + play icon
 * - hasVideo + isPlaying: fades out (video is showing)
 * - !hasVideo: subtle shimmer-scan hint with film-strip icon
 */
function VideoPlayBadge({ hasVideo, isPlaying, size = 'md' }: {
  hasVideo: boolean
  isPlaying: boolean
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'

  if (hasVideo) {
    // Ready state — glowing play button, hides when playing
    return (
      <div className={`absolute bottom-2.5 left-2.5 ${dim} rounded-full flex items-center justify-center transition-all duration-500 ${isPlaying ? 'opacity-0 scale-75' : 'opacity-100 scale-100'}`}>
        {/* Outer glow ring */}
        <div
          className={`absolute inset-0 rounded-full border border-[#1c69d4]/40`}
          style={{ animation: 'play-ring-pulse 3s ease-in-out infinite' }}
        />
        {/* Frosted glass background */}
        <div className="absolute inset-0 rounded-full bg-black/50 backdrop-blur-md" />
        {/* Play icon */}
        <Play className={`${iconSize} text-[#7ab5ff] relative z-10 ml-[2px] fill-[#7ab5ff]/30 group-hover:fill-[#7ab5ff]/60 group-hover:text-white transition-all duration-200`} strokeWidth={2} />
      </div>
    )
  }

  // No video yet — subtle shimmer hint
  return (
    <div className={`absolute bottom-2.5 left-2.5 ${dim} rounded-full flex items-center justify-center overflow-hidden opacity-0 group-hover:opacity-70 transition-opacity duration-300`}>
      {/* Glass bg */}
      <div className="absolute inset-0 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.10]" />
      {/* Shimmer scan */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
      >
        <div
          className="absolute inset-0 w-[60%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ animation: 'shimmer-scan 2.5s ease-in-out infinite' }}
        />
      </div>
      {/* Play outline icon */}
      <Play className={`${iconSize} text-white/40 relative z-10 ml-[1px]`} strokeWidth={1.5} />
    </div>
  )
}


/** Parse booking details from conversation and generate .ics download */
function AddToCalendarButton({ messages, bookingRef }: { messages: ChatMessage[]; bookingRef: string | null }) {
  const handleClick = useCallback(() => {
    const allText = messages.map(m => m.content).join('\n')

    // Extract car name from context
    const carName = (() => {
      for (const m of messages) {
        if (m.vehicles?.[0]?.name) return m.vehicles[0].name
      }
      const match = allText.match(/Probefahrt mit dem (.+?)(?:\s+buchen|\s*\n)/i)
      return match ? match[1] : 'BMW'
    })()

    // Extract dealer
    const dealerMatch = allText.match(/(?:Partner|Standort|Dealer)[:\s]*([^\n,]+)/i)
      || allText.match(/((?:BMW Niederlassung|Auto Frey|Häusermann|Hedin|Automobile Fankhauser|Gruss|Heron|Grand Garage|Garage de l'Union|Autobritt|Alpstaeg|Keller|Auto Ziegler|Garage Galliker|Schaller|Itin \+ Holliger|Auto Wederich)[^,\n]*)/i)
    const dealer = dealerMatch ? dealerMatch[1].trim() : ''

    // Extract date — look for DD.MM.YYYY pattern
    const dateMatch = allText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    let startDate: Date
    if (dateMatch) {
      startDate = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]))
    } else {
      // Fallback: tomorrow
      startDate = new Date()
      startDate.setDate(startDate.getDate() + 1)
    }

    // Extract time slot
    const timeSlots: Record<string, [number, number]> = {
      'morgens': [8, 11], 'morning': [8, 11], '08:00': [8, 11],
      'mittags': [11, 13], 'midday': [11, 13], '11:00': [11, 13],
      'nachmittags': [13, 17], 'afternoon': [13, 17], '13:00': [13, 17],
      'abends': [17, 19], 'evening': [17, 19], '17:00': [17, 19],
    }
    let startHour = 9, endHour = 11
    const lowerText = allText.toLowerCase()
    for (const [key, [s, e]] of Object.entries(timeSlots)) {
      if (lowerText.includes(key)) {
        startHour = s
        endHour = e
        break
      }
    }

    const pad = (n: number) => n.toString().padStart(2, '0')
    const formatICSDate = (d: Date, hour: number) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}0000`

    const dtStart = formatICSDate(startDate, startHour)
    const dtEnd = formatICSDate(startDate, endHour)
    const ref = bookingRef || 'BMW Probefahrt'

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BMW Schweiz//Probefahrt//DE',
      'BEGIN:VEVENT',
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:BMW Probefahrt — ${carName}`,
      `DESCRIPTION:${ref}\\nFahrzeug: ${carName}\\nBMW Partner: ${dealer}\\nBitte bringen Sie Ihren Führerschein mit.`,
      `LOCATION:${dealer}`,
      `STATUS:CONFIRMED`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bmw-probefahrt-${bookingRef || 'termin'}.ics`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [messages, bookingRef])

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-6 py-3 bg-[#1c69d4] text-white text-[14px] font-medium rounded-[4px] hover:bg-[#1a5db8] transition-all active:scale-[0.98]"
    >
      <Calendar className="w-4 h-4" />
      Zum Kalender hinzufügen
    </button>
  )
}
