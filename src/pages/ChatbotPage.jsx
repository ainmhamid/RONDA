import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePlaces } from '../hooks/usePlaces';
import { db } from '../firebase/config';
import { collection, addDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import LoadingSpinner from '../components/LoadingSpinner';
import './ChatbotPage.css';

// Local rule-based recommendation and itinerary generator fallback
function generateLocalResponse(prompt, places, lang = 'en') {
  const query = prompt.toLowerCase();
  
  // 1. Detect category keywords
  let category = null;
  if (query.includes('eat') || query.includes('food') || query.includes('makan') || query.includes('restaurant') || query.includes('cafe') || query.includes('eatery') || query.includes('bakery') || query.includes('seafood')) {
    category = 'eateries';
  } else if (query.includes('shop') || query.includes('store') || query.includes('mall') || query.includes('market') || query.includes('kedai') || query.includes('beli') || query.includes('gift')) {
    category = 'shop';
  } else if (query.includes('hotel') || query.includes('homestay') || query.includes('resort') || query.includes('stay') || query.includes('motel') || query.includes('penginapan')) {
    category = 'hotel';
  } else if (query.includes('activity') || query.includes('nature') || query.includes('visit') || query.includes('go') || query.includes('hike') || query.includes('park') || query.includes('lawat') || query.includes('jalan') || query.includes('outdoor')) {
    category = 'activity';
  }

  // 2. Detect state keywords
  const states = ['Penang', 'Selangor', 'Kuala Lumpur', 'Sabah', 'Sarawak', 'Kedah', 'Johor', 'Melaka', 'Pahang', 'Terengganu', 'Kelantan', 'Perlis', 'Negeri Sembilan', 'Perak'];
  let detectedState = null;
  for (const s of states) {
    if (query.includes(s.toLowerCase())) {
      detectedState = s;
      break;
    }
  }

  // 3. Detect days for itinerary
  let days = 1;
  const dayMatch = query.match(/(\d+)\s*(day|hari)/);
  if (dayMatch) {
    days = parseInt(dayMatch[1]);
  } else if (query.includes('two day') || query.includes('dua hari')) {
    days = 2;
  } else if (query.includes('three day') || query.includes('tiga hari')) {
    days = 3;
  }
  if (days > 5) days = 5;

  // 4. Score matching places based on interests/accessibility/budget tags
  let scoredPlaces = [...places];
  
  // Filter by state first if detected
  if (detectedState) {
    scoredPlaces = scoredPlaces.filter(p => p.state?.toLowerCase() === detectedState.toLowerCase());
  }
  if (scoredPlaces.length === 0) {
    scoredPlaces = [...places];
  }

  scoredPlaces = scoredPlaces.map(p => {
    let score = 0;
    
    // Category match
    if (category && p.categoryName?.toLowerCase() === category.toLowerCase()) {
      score += 10;
    }
    
    // Accessibility matching
    if (query.includes('wheelchair') || query.includes('kerusi roda')) {
      const hasWheelchair = p.accessibility?.some(a => a.toLowerCase().includes('wheelchair') || a.toLowerCase().includes('mesra oku'));
      if (hasWheelchair) score += 8;
    }
    if (query.includes('kids') || query.includes('family') || query.includes('kanak-kanak') || query.includes('keluarga') || query.includes('child')) {
      const hasFamily = p.accessibility?.some(a => a.toLowerCase().includes('family') || a.toLowerCase().includes('kids') || a.toLowerCase().includes('elderly') || a.toLowerCase().includes('mesra keluarga'));
      if (hasFamily) score += 6;
    }
    
    // Interest matching
    if (query.includes('nature') || query.includes('alam') || query.includes('hike') || query.includes('outdoor')) {
      const hasNature = p.interest?.some(i => i.toLowerCase().includes('nature') || i.toLowerCase().includes('outdoor') || i.toLowerCase().includes('natural'));
      if (hasNature) score += 6;
    }
    if (query.includes('culture') || query.includes('history') || query.includes('budaya') || query.includes('sejarah')) {
      const hasCulture = p.interest?.some(i => i.toLowerCase().includes('cultural') || i.toLowerCase().includes('history') || i.toLowerCase().includes('sejarah'));
      if (hasCulture) score += 6;
    }
    
    // Budget matching
    if (query.includes('budget') || query.includes('cheap') || query.includes('murah') || query.includes('free') || query.includes('percuma')) {
      const isCheap = p.description?.toLowerCase().includes('cheap') || p.description?.toLowerCase().includes('free') || p.description?.toLowerCase().includes('budget') || p.description?.toLowerCase().includes('tidak mahal');
      if (isCheap) score += 8;
    }

    // Title / general text search overlap
    const pText = `${p.title} ${p.description || ''}`.toLowerCase();
    const queryWords = query.split(/\s+/).filter(w => w.length > 3);
    queryWords.forEach(w => {
      if (pText.includes(w)) score += 2;
    });

    return { place: p, score };
  });

  // Sort by score desc, then by rating
  scoredPlaces.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.place.totalScore || 5.0) - (a.place.totalScore || 5.0);
  });

  const selected = scoredPlaces.map(sp => sp.place);

  // Helper to format short address
  const getShortAddress = (addr) => {
    if (!addr) return '';
    const parts = addr.split(',');
    if (parts.length <= 2) return addr;
    return `${parts[0].trim()}, ${parts[1].trim()}`;
  };

  const isItinerary = query.includes('itinerary') || query.includes('plan') || query.includes('schedule') || query.includes('trip') || query.includes('day') || query.includes('jadual') || query.includes('rancang');

  if (lang === 'my') {
    if (isItinerary) {
      let responseText = `Berikut adalah jadual perjalanan ${days} hari tersuai untuk anda${detectedState ? ' di ' + detectedState : ''}:\n\n`;
      const times = ["09:00 AM", "12:00 PM", "03:00 PM", "07:00 PM"];
      
      for (let d = 1; d <= days; d++) {
        responseText += `### Hari ${d}:\n`;
        const dayPlaces = selected.slice((d - 1) * 4, d * 4);
        const activePlaces = dayPlaces.length > 0 ? dayPlaces : selected.slice(0, 4);
        
        activePlaces.forEach((place, index) => {
          const time = times[index] || "08:00 PM";
          responseText += `- ${time}: **${place.title}** (${place.categoryName} • ★ ${place.totalScore || '5.0'})\n`;
        });
        responseText += `\n`;
      }
      responseText += `Anda boleh memindahkan jadual perjalanan ini terus ke perancang anda dengan klik butang "Pindah ke Kalendar" di bawah.`;
      return responseText;
    } else {
      let responseText = `Berikut adalah beberapa tempat menarik yang saya syorkan${detectedState ? ' di ' + detectedState : ''}:\n\n`;
      selected.slice(0, 4).forEach(place => {
        responseText += `📍 **${place.title}** (${place.categoryName})\n`;
        responseText += `   ★ ${place.totalScore || '5.0'} • ${getShortAddress(place.address)}\n\n`;
      });
      responseText += `Adakah anda mahu saya merangka jadual perjalanan harian dengan tempat-tempat ini? Cuma katakan "rancang jadual perjalanan"!`;
      return responseText;
    }
  } else {
    if (isItinerary) {
      let responseText = `Here is a custom ${days}-day itinerary for you${detectedState ? ' in ' + detectedState : ''}:\n\n`;
      const times = ["09:00 AM", "12:00 PM", "03:00 PM", "07:00 PM"];
      
      for (let d = 1; d <= days; d++) {
        responseText += `### Day ${d}:\n`;
        const dayPlaces = selected.slice((d - 1) * 4, d * 4);
        const activePlaces = dayPlaces.length > 0 ? dayPlaces : selected.slice(0, 4);
        
        activePlaces.forEach((place, index) => {
          const time = times[index] || "08:00 PM";
          responseText += `- ${time}: **${place.title}** (${place.categoryName} • ★ ${place.totalScore || '5.0'})\n`;
        });
        responseText += `\n`;
      }
      responseText += `You can click the "Transfer Itinerary" button below to add this schedule directly to your planner.`;
      return responseText;
    } else {
      let responseText = `Here are some great places I recommend${detectedState ? ' in ' + detectedState : ''}:\n\n`;
      selected.slice(0, 4).forEach(place => {
        responseText += `📍 **${place.title}** (${place.categoryName})\n`;
        responseText += `   ★ ${place.totalScore || '5.0'} • ${getShortAddress(place.address)}\n\n`;
      });
      responseText += `Would you like me to construct a daily itinerary with these spots? Just say "plan an itinerary"!`;
      return responseText;
    }
  }
}

export default function ChatbotPage() {
  const { currentUser } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { places } = usePlaces();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillPlace = searchParams.get('prefill');

  const [messages, setMessages] = useState([
    { id: 'msg_welcome', sender: 'bot', text: t('botGreeting'), timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedItineraryText, setSelectedItineraryText] = useState('');
  const getLocalDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const [transferDate, setTransferDate] = useState(getLocalDateString(new Date())); // Default to today's date
  const [transferTime, setTransferTime] = useState('10:00');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom on new messages
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setMessages(prev => prev.map(m => m.id === 'msg_welcome' ? { ...m, text: t('botGreeting') } : m));
  }, [language, t]);

  const processMessage = useCallback(async (promptText) => {
    if (!promptText.trim()) return;

    const userMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      // Initialize Gemini
      const genAI = new GoogleGenerativeAI("AIzaSyDacJQ9qS3IglKPwnZlN8x7sOemev_b2dg");

      // Provide system instruction for itinerary layout and language support
      const systemInstruction = `
        You are RONDA, a friendly and premium travel assistant chatbot for Malaysia. 
        Help the user plan trips, itineraries, or recommend places based on their budget, interest, or accessibility requirements.
        
        Itinerary & Recommendation Planning Rules:
        1. When planning itineraries for multiple days (e.g. 2 days, 3 days, etc.), structure your response Day by Day:
           ### Day 1: [Day Title]
           - HH:MM AM/PM: **Place Title** (Category • ★ Rating)
           
           ### Day 2: [Day Title]
           - HH:MM AM/PM: **Place Title** (Category • ★ Rating)
           
        2. Keep places recommended on the same day in the same state or city to make travel logical and avoid excessive driving.
        3. Match specific user requests with the appropriate parameters:
           - **Specific interests/needs**: Use the "Interests" and "Accessibility" properties of the database places.
           - **Budget / Cost constraints**: Recommend free or cheaper locations when users ask for "budget", "cheap", "free", or "murah". For luxury or higher budgets, recommend premium spots.
           - **Multiple people / Families / Kids**: Prioritize places with tags like "Family and kids friendly environment" or "Elderly friendly facilities".
        
        Language Support & Responsiveness Rules:
        1. Automatically detect the user's input language. If they message you in Malay (Bahasa Melayu) or ask a question in Malay, you MUST respond in Malay. If they message you in English, respond in English.
        2. The default user interface language of the application is currently: ${language === 'my' ? 'Malay (Bahasa Melayu)' : 'English'}.
        3. When responding in Malay, use a warm, polite, and helpful tone (e.g. use "saya" or "Ronda" to refer to yourself, and "anda" to refer to the user). Translate categories nicely (e.g., eateries -> Tempat Makan, hotel -> Hotel/Resor, activity -> Aktiviti, shop -> Beli-belah).
        4. When responding in English, use a professional, welcoming, and premium tone.
        
        Formatting rules:
        1. Format each day's plan with timings:
           - HH:MM AM/PM: **Place Title** (Category • ★ Rating)
           
        2. If providing recommendations, keep it compact and clean:
           📍 **Place Title** (Category)
           ★ Rating • Short Address/City
           
        3. Do NOT output long descriptions, detailed full addresses, or verbose paragraphs. Keep responses concise, clear, and highly readable.
        
        Here is the rich database of places available in our database to recommend:
        ${places.map(p => {
          const accessibilityStr = p.accessibility ? p.accessibility.join(', ') : '';
          const interestsStr = p.interest ? p.interest.join(', ') : '';
          const amenitiesStr = p.amenities ? p.amenities.join(', ') : '';
          let priceInfo = '';
          const priceMatch = p.description?.match(/Price\/Review Info:\s*(.+)$/i);
          if (priceMatch) {
            priceInfo = priceMatch[1];
          }
          return `- **${p.title}** [Category: ${p.categoryName}, State: ${p.state}, Rating: ${p.totalScore || '5.0'}]
            * Interests: ${interestsStr}
            * Accessibility: ${accessibilityStr}
            * Amenities: ${amenitiesStr}
            ${priceInfo ? '* Price: ' + priceInfo : ''}`;
        }).join('\n')}
      `;

      const model = genAI.getGenerativeModel({ 
        model: "gemini-flash-latest",
        systemInstruction: systemInstruction
      });

      const result = await model.generateContent(promptText);
      const botResponseText = result.response.text();

      const botMessage = {
        id: `msg_bot_${Date.now()}`,
        sender: 'bot',
        text: botResponseText,
        timestamp: new Date(),
        isItinerary: botResponseText.includes(':00') || botResponseText.includes('AM') || botResponseText.includes('PM')
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Gemini AI API Error, falling back to local generator:", error);
      
      // Fallback to local rule-based response generator
      const fallbackResponse = generateLocalResponse(promptText, places, language);
      
      const botMessage = {
        id: `msg_bot_${Date.now()}`,
        sender: 'bot',
        text: fallbackResponse,
        timestamp: new Date(),
        isItinerary: fallbackResponse.includes(':00') || fallbackResponse.includes('AM') || fallbackResponse.includes('PM')
      };

      setMessages(prev => [...prev, botMessage]);
    } finally {
      setLoading(false);
    }
  }, [places, language]);

  useEffect(() => {
    if (prefillPlace && places.length > 0) {
      // Clear parameter from URL so it doesn't run again on page refresh
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('prefill');
      setSearchParams(newParams, { replace: true });

      const queryText = language === 'my'
        ? `Rancang jadual perjalanan untuk ${prefillPlace}`
        : `Plan an itinerary for ${prefillPlace}`;
      
      processMessage(queryText);
    }
  }, [prefillPlace, places, language, searchParams, setSearchParams, processMessage]);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'my' : 'en');
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await processMessage(text);
  };

  // Open itinerary transfer settings
  const handleOpenTransfer = (text) => {
    if (!currentUser) {
      alert(t('signInToSavePlans'));
      return;
    }
    setSelectedItineraryText(text);
    setShowTransferModal(true);
  };

  // Extract places and times from itinerary text and write to Firestore calendar collection
  const handleConfirmTransfer = async () => {
    try {
      // Simple parser: find lines that look like a schedule (e.g. "10:00 AM: Visit [Place]")
      // If none, we will just save the whole text block as a summary plan
      const lines = selectedItineraryText.split('\n');
      let transferCount = 0;

      const baseDate = new Date(transferDate);

      for (const line of lines) {
        // Regex to check line matching times (e.g. 10:00 AM, 12:00 PM, 14:00, etc.)
        const timeMatch = line.match(/(\d{1,2})[:.](\d{2})\s*(AM|PM)?/i);
        
        if (timeMatch) {
          let hourStr = timeMatch[1];
          const minStr = timeMatch[2];
          const meridian = timeMatch[3];
          
          let hours = parseInt(hourStr);
          if (meridian) {
            if (meridian.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (meridian.toUpperCase() === 'AM' && hours === 12) hours = 0;
          }

          // Format time as hh:00
          const formattedTime = `${hours.toString().padStart(2, '0')}:00`;
          
          // Find if there is a match in our database title (removing leading non-alphanumeric chars except asterisks, then stripping asterisks)
          let planTitle = line.replace(timeMatch[0], '').replace(/^[^a-zA-Z0-9*]+/, '').trim();
          planTitle = planTitle.replace(/\*\*/g, '');
          
          // Find matching place in database
          let matchedPlaceId = '';
          const matchedPlace = places.find(p => planTitle.toLowerCase().includes(p.title.toLowerCase()));
          if (matchedPlace) {
            matchedPlaceId = matchedPlace.id;
            planTitle = matchedPlace.title;
          }

          await addDoc(collection(db, 'planner'), {
            uid: currentUser.uid,
            date: transferDate, // YYYY-MM-DD
            time: formattedTime, // HH:MM
            title: planTitle || "Sightseeing spot",
            placeId: matchedPlaceId || '',
            createdAt: new Date().toISOString()
          });

          transferCount++;
        }
      }

      // If no schedules found, add as a single 1-hour event block using default values
      if (transferCount === 0) {
        await addDoc(collection(db, 'planner'), {
          uid: currentUser.uid,
          date: transferDate,
          time: `${transferTime}`,
          title: "Itinerary Recommendation",
          description: selectedItineraryText.slice(0, 150) + "...",
          placeId: '',
          createdAt: new Date().toISOString()
        });
      }

      setShowTransferModal(false);
      alert(t('transferSuccess'));
    } catch (err) {
      console.error("Failed to transfer itinerary:", err);
      alert(t('transferFailed'));
    }
  };

  const handleSuggestionClick = (promptText) => {
    setInputText(promptText);
  };

  const suggestionPrompts = [
    t('placeholderPrompt1'),
    t('placeholderPrompt2'),
    t('placeholderPrompt3')
  ];

  return (
    <div className="chatbot-page app-content">
      {/* Header bar */}
      <div className="chat-header glass">
        <div className="chat-logo-container">
          <img src="/Entites/Chatbot Icon (Brown).png" alt="RONDA Bot" className="chat-avatar-icon" />
          <div className="chat-header-text">
            <h3>RONDA AI</h3>
            <span className="chat-status">{t('onlineCompanion')}</span>
          </div>
        </div>
        <div className="lang-pill dark" onClick={toggleLanguage}>
          <span className={language === 'my' ? 'active' : ''}>MY</span>
          <span className={language === 'en' ? 'active' : ''}>EN</span>
        </div>
      </div>

      {/* Messages layout */}
      <div className="chat-messages-container">
        {messages.map(msg => (
          <div key={msg.id} className={`message-bubble-wrapper ${msg.sender}`}>
            {msg.sender === 'bot' && (
              <img src="/Entites/Chatbot Icon (Brown).png" alt="Bot" className="message-avatar" />
            )}
            <div className={`message-bubble ${msg.sender}`}>
              <p className="message-text">{msg.text}</p>
              
              {/* If Bot response is an itinerary, render 'Transfer Itinerary' button */}
              {msg.sender === 'bot' && msg.id !== 'msg_welcome' && (
                <button 
                  className="transfer-planner-btn"
                  onClick={() => handleOpenTransfer(msg.text)}
                >
                  🗓️ {t('transferBtn')}
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message-bubble-wrapper bot">
            <img src="/Entites/Chatbot Icon (Brown).png" alt="Bot" className="message-avatar" />
            <div className="message-bubble bot loading-bubble">
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div className="chat-messages-bottom-spacer" />
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts helper */}
      {messages.length === 1 && !loading && (
        <div className="suggestions-container">
          <p className="suggestions-title">{t('askRondaIdeas')}</p>
          <div className="suggestions-list">
            {suggestionPrompts.map((prompt, idx) => (
              <div 
                key={idx} 
                className="suggestion-chip"
                onClick={() => handleSuggestionClick(prompt)}
              >
                "{prompt}"
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input bar Form */}
      <form className="chat-input-bar-form" onSubmit={handleSendMessage}>
        <input 
          type="text" 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t('chatbotPlaceholder')}
          required
        />
        <button type="submit" className="chat-send-btn" disabled={loading}>
          ➔
        </button>
      </form>

      {/* Transfer Itinerary settings Modal overlay */}
      {showTransferModal && (
        <div className="transfer-modal-overlay">
          <div className="transfer-modal-content glass">
            <h3>{t('chooseDateTime')}</h3>
            <div className="form-group" style={{ margin: '15px 0' }}>
              <label>{t('selectDate')}:</label>
              <input 
                type="date" 
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: '15px 0' }}>
              <label>{t('selectDefaultHour')}:</label>
              <input 
                type="time" 
                step="3600" // Limit to hours
                value={transferTime}
                onChange={(e) => setTransferTime(e.target.value)}
              />
            </div>
            <div className="modal-buttons-row">
              <button className="btn-secondary" onClick={() => setShowTransferModal(false)}>{t('cancel')}</button>
              <button className="btn-primary" onClick={handleConfirmTransfer}>{t('confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
