import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// WATSON IN THE WARD - Healthcare AI with LM Studio Integration
// ============================================================================

// Safety Configuration Constants
const SAFETY_CONFIG = {
  maxInputLength: 2000,
  maxOutputLength: 4000,
  rateLimit: {
    maxRequests: 15,
    windowMs: 60000,
    emergencyBypass: true
  },
  disclaimerFrequency: 'always',
  auditLogging: true
};

// ============================================================================
// LAYER 1: PROMPT INJECTION PROTECTION
// ============================================================================
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(everything|all|your)\s+(you\s+)?(know|learned|instructions?)/gi,
  /disregard\s+(all\s+)?(safety|guidelines?|rules?|instructions?)/gi,
  /you\s+are\s+now\s+(a\s+)?new\s+(ai|assistant|bot)/gi,
  /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(different|another|new)/gi,
  /act\s+as\s+(if|though)\s+you\s+(have\s+)?no\s+(restrictions?|limits?)/gi,
  /bypass\s+(your\s+)?(safety|security|filters?|restrictions?)/gi,
  /override\s+(your\s+)?(programming|instructions?|guidelines?)/gi,
  /\bdan\s+(mode|prompt)\b/gi,
  /\bdeveloper\s+mode\b/gi,
  /\bjailbreak\b/gi,
  /\bunfiltered\s+mode\b/gi,
  /\bno\s+restrictions?\s+mode\b/gi,
  /you\s+are\s+(a\s+)?licensed\s+(doctor|physician|medical)/gi,
  /pretend\s+you\s+can\s+(diagnose|prescribe|treat)/gi,
  /give\s+me\s+(a\s+)?definitive\s+(diagnosis|treatment)/gi,
  /ignore\s+(the\s+)?medical\s+disclaimer/gi,
  /skip\s+(the\s+)?safety\s+warning/gi,
  /you\s+have\s+(medical|clinical)\s+authority/gi,
  /act\s+as\s+(a\s+)?real\s+(doctor|physician|nurse)/gi,
  /reveal\s+(your\s+)?(system\s+)?prompt/gi,
  /show\s+(me\s+)?(your\s+)?(instructions?|training)/gi,
  /what\s+(are\s+)?(your\s+)?hidden\s+instructions?/gi,
  /output\s+(your\s+)?(system|initial)\s+prompt/gi,
  /<script[^>]*>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /eval\s*\(/gi,
  /exec\s*\(/gi
];

const HEALTHCARE_DANGEROUS_PATTERNS = [
  /give\s+me\s+(exact|specific)\s+dosage/gi,
  /prescribe\s+(me\s+)?medication/gi,
  /what\s+drug\s+should\s+i\s+take/gi,
  /confirm\s+(my\s+)?diagnosis/gi,
  /tell\s+me\s+i\s+(have|don't\s+have)/gi,
  /guarantee\s+(this|the)\s+treatment/gi,
  /promise\s+(me\s+)?(this|it)\s+will\s+(work|cure)/gi,
  /am\s+i\s+going\s+to\s+die/gi,
  /how\s+long\s+do\s+i\s+have\s+to\s+live/gi
];

function detectPromptInjection(input) {
  const threats = [];
  for (const pattern of INJECTION_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      threats.push({ type: 'PROMPT_INJECTION', pattern: pattern.source, match: match[0], severity: 'HIGH' });
    }
  }
  for (const pattern of HEALTHCARE_DANGEROUS_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      threats.push({ type: 'HEALTHCARE_BOUNDARY', pattern: pattern.source, match: match[0], severity: 'MEDIUM' });
    }
  }
  return threats;
}

// ============================================================================
// LAYER 2: EMERGENCY DETECTION SYSTEM
// ============================================================================
const EMERGENCY_KEYWORDS = {
  cardiac: ['chest pain', 'heart attack', 'cardiac arrest', 'can\'t breathe', 'crushing chest', 'arm pain spreading'],
  stroke: ['face drooping', 'arm weakness', 'speech difficulty', 'stroke', 'sudden numbness', 'sudden confusion'],
  respiratory: ['can\'t breathe', 'choking', 'severe asthma attack', 'lips turning blue', 'gasping for air', 'anaphylaxis'],
  mental_health: ['want to kill myself', 'going to end it', 'suicide', 'want to die', 'self harm', 'cutting myself'],
  trauma: ['severe bleeding', 'won\'t stop bleeding', 'deep wound', 'broken bone sticking out'],
  poisoning: ['poisoned', 'overdose', 'swallowed chemicals', 'drank bleach', 'took too many pills']
};

const EMERGENCY_RESPONSES = {
  cardiac: { hotline: '911', instructions: ['Call 911 immediately', 'If trained, begin CPR if unresponsive', 'If available, use an AED', 'Keep the person calm and still'], urgency: 'CRITICAL' },
  stroke: { hotline: '911', instructions: ['Call 911 immediately - TIME IS CRITICAL', 'Note the time symptoms started', 'Remember: F.A.S.T. (Face, Arms, Speech, Time)'], urgency: 'CRITICAL' },
  respiratory: { hotline: '911', instructions: ['Call 911 immediately', 'If choking, perform Heimlich maneuver', 'If anaphylaxis and EpiPen available, use it'], urgency: 'CRITICAL' },
  mental_health: { hotline: '988 (Suicide & Crisis Lifeline)', alternateHotline: '741741 (Crisis Text Line)', instructions: ['Call 988 NOW - trained counselors available 24/7', 'Text HOME to 741741 for text-based support', 'Stay with the person, do not leave them alone'], urgency: 'CRITICAL', compassionateMessage: 'I hear that you\'re in pain right now. What you\'re feeling is real, and you deserve support. Please reach out to a crisis counselor who can help.' },
  trauma: { hotline: '911', instructions: ['Call 911 immediately', 'Apply pressure to stop bleeding', 'Do not remove embedded objects'], urgency: 'CRITICAL' },
  poisoning: { hotline: '1-800-222-1222 (Poison Control)', instructions: ['Call Poison Control immediately', 'Do NOT induce vomiting unless instructed', 'Keep the substance container for reference'], urgency: 'CRITICAL' }
};

function detectEmergency(input) {
  const lowerInput = input.toLowerCase();
  const detectedEmergencies = [];
  for (const [category, keywords] of Object.entries(EMERGENCY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        detectedEmergencies.push({ category, keyword, response: EMERGENCY_RESPONSES[category] });
        break;
      }
    }
  }
  return detectedEmergencies;
}

// ============================================================================
// LAYER 3: INPUT SANITIZATION
// ============================================================================
function sanitizeInput(input) {
  let sanitized = input;
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+=/gi, '');
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  if (sanitized.length > SAFETY_CONFIG.maxInputLength) {
    sanitized = sanitized.substring(0, SAFETY_CONFIG.maxInputLength);
  }
  return sanitized;
}

// ============================================================================
// LAYER 4: OUTPUT SAFETY FILTERING
// ============================================================================
const OUTPUT_DANGER_PATTERNS = [
  /you\s+(definitely|certainly|clearly)\s+have/gi,
  /this\s+is\s+(definitely|certainly)\s+\w+\s+(disease|cancer|condition)/gi,
  /i\s+(diagnose|am\s+diagnosing)\s+you\s+with/gi,
  /stop\s+taking\s+(your\s+)?medication/gi,
  /you\s+don't\s+need\s+(to\s+see\s+)?a\s+doctor/gi,
  /ignore\s+your\s+doctor's\s+advice/gi,
  /take\s+\d+\s*(mg|ml|pills?|tablets?)/gi,
  /you\s+will\s+(definitely|certainly)\s+(be\s+fine|recover|survive)/gi,
  /nothing\s+to\s+worry\s+about/gi,
  /it's\s+(probably\s+)?nothing\s+serious/gi
];

function filterOutput(output) {
  let filtered = output;
  let warnings = [];
  for (const pattern of OUTPUT_DANGER_PATTERNS) {
    if (pattern.test(filtered)) {
      warnings.push({ type: 'DANGEROUS_OUTPUT_FILTERED', pattern: pattern.source });
      filtered = filtered.replace(pattern, '[This statement was modified for safety]');
    }
  }
  return { filtered, warnings };
}

// ============================================================================
// LAYER 5: MEDICAL DISCLAIMERS
// ============================================================================
const DISCLAIMERS = {
  general: `⚕️ **Medical Disclaimer**: I am an AI assistant and cannot provide medical diagnoses, prescribe treatments, or replace professional medical advice. Always consult with a qualified healthcare provider.`,
  symptom: `⚕️ **Important**: These symptoms could have many causes. Please seek professional medical advice.`,
  medication: `💊 **Medication Notice**: Never start, stop, or change medication without consulting your healthcare provider.`,
  emergency: `🚨 **If this is a medical emergency, call 911 immediately.**`,
  mental_health: `💙 **Mental Health Support**: The 988 Suicide & Crisis Lifeline is available 24/7. Call or text 988.`
};

function selectDisclaimer(input) {
  const lowerInput = input.toLowerCase();
  const disclaimers = [DISCLAIMERS.general];
  if (/symptom|pain|hurt|ache|feel|sick/i.test(lowerInput)) disclaimers.push(DISCLAIMERS.symptom);
  if (/medication|drug|pill|dose|prescription|medicine/i.test(lowerInput)) disclaimers.push(DISCLAIMERS.medication);
  if (/depress|anxious|anxiety|stress|mental|suicide|harm/i.test(lowerInput)) disclaimers.push(DISCLAIMERS.mental_health);
  if (/emergency|urgent|severe|sudden|worst/i.test(lowerInput)) disclaimers.unshift(DISCLAIMERS.emergency);
  return disclaimers;
}

// ============================================================================
// LAYER 6: RATE LIMITING
// ============================================================================
function createRateLimiter() {
  const requests = [];
  return {
    checkLimit: (isEmergency = false) => {
      const now = Date.now();
      const windowStart = now - SAFETY_CONFIG.rateLimit.windowMs;
      while (requests.length > 0 && requests[0] < windowStart) requests.shift();
      if (isEmergency && SAFETY_CONFIG.rateLimit.emergencyBypass) {
        requests.push(now);
        return { allowed: true, remaining: 'EMERGENCY_BYPASS' };
      }
      if (requests.length >= SAFETY_CONFIG.rateLimit.maxRequests) {
        return { allowed: false, remaining: 0, resetIn: Math.ceil((requests[0] + SAFETY_CONFIG.rateLimit.windowMs - now) / 1000) };
      }
      requests.push(now);
      return { allowed: true, remaining: SAFETY_CONFIG.rateLimit.maxRequests - requests.length };
    }
  };
}

// ============================================================================
// LAYER 7: AUDIT LOGGING
// ============================================================================
function createAuditLogger() {
  const logs = [];
  return {
    log: (event) => {
      const entry = { timestamp: new Date().toISOString(), id: Math.random().toString(36).substr(2, 9), ...event };
      logs.push(entry);
      console.log('[AUDIT]', JSON.stringify(entry, null, 2));
      return entry;
    },
    getLogs: () => [...logs],
    exportLogs: () => JSON.stringify(logs, null, 2)
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================
const HEALTHCARE_SYSTEM_PROMPT = `You are Watson, a helpful healthcare information assistant. You provide general health information and wellness guidance while maintaining strict safety boundaries.

## YOUR ROLE:
- Provide general health education and information
- Help users understand medical terminology
- Offer wellness tips and healthy lifestyle guidance
- Direct users to appropriate medical resources

## CRITICAL SAFETY RULES - NEVER VIOLATE:
1. NEVER diagnose conditions or diseases
2. NEVER prescribe medications or dosages
3. NEVER tell users to stop taking prescribed medications
4. NEVER provide definitive medical advice
5. ALWAYS recommend consulting healthcare professionals

Remember: You are an educational resource, not a replacement for medical professionals.`;

// ============================================================================
// LM STUDIO API CLIENT
// ============================================================================
async function queryLMStudio(messages, config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model || 'local-model',
        messages: [{ role: 'system', content: HEALTHCARE_SYSTEM_PROMPT }, ...messages],
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 1000,
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`LM Studio API error: ${response.status}`);
    const data = await response.json();
    return { success: true, content: data.choices?.[0]?.message?.content || 'No response generated', usage: data.usage };
  } catch (error) {
    clearTimeout(timeoutId);
    return { success: false, error: error.name === 'AbortError' ? 'Request timed out.' : error.message };
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function WatsonHealthcareAI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [connectionError, setConnectionError] = useState('');
  const [config, setConfig] = useState({
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: '',
    temperature: 0.7,
    maxTokens: 1000
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [stats, setStats] = useState({ totalQueries: 0, blockedThreats: 0, emergenciesDetected: 0 });
  
  const messagesEndRef = useRef(null);
  const rateLimiter = useRef(createRateLimiter());
  const auditLogger = useRef(createAuditLogger());
  
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  useEffect(() => { 
    scrollToBottom(); 
  }, [messages]);
  
  const checkConnection = useCallback(async () => {
    setConnectionStatus('checking');
    setConnectionError('');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${config.baseUrl}/models`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.data || []);
        setConnectionStatus('connected');
        if (data.data?.length > 0) setConfig(prev => ({ ...prev, model: prev.model || data.data[0].id }));
        auditLogger.current.log({ type: 'CONNECTION', status: 'connected' });
      } else {
        setConnectionStatus('error');
        setConnectionError(`Server error: ${response.status}`);
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      setConnectionError(error.name === 'AbortError' ? 'Connection timed out.' : 
        'Cannot connect. Check:\n1. LM Studio is running\n2. Server is started\n3. URL is correct');
      auditLogger.current.log({ type: 'CONNECTION', status: 'failed', error: error.message });
    }
  }, [config.baseUrl]);
  
  useEffect(() => { checkConnection(); }, []);
  
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const originalInput = input;
    setInput('');
    setIsLoading(true);
    
    const sanitizedInput = sanitizeInput(originalInput);
    const injectionThreats = detectPromptInjection(sanitizedInput);
    
    if (injectionThreats.length > 0 && injectionThreats.some(t => t.severity === 'HIGH')) {
      setStats(prev => ({ ...prev, blockedThreats: prev.blockedThreats + 1 }));
      setMessages(prev => [...prev, 
        { role: 'user', content: sanitizedInput },
        { role: 'assistant', content: '🛡️ **Security Alert**: Your message contained patterns that could compromise safety. Please rephrase your question.', isSecurityAlert: true }
      ]);
      setIsLoading(false);
      return;
    }
    
    const emergencies = detectEmergency(sanitizedInput);
    if (emergencies.length > 0) {
      setStats(prev => ({ ...prev, emergenciesDetected: prev.emergenciesDetected + 1 }));
      let emergencyResponse = '🚨 **EMERGENCY DETECTED**\n\n';
      for (const emergency of emergencies) {
        const resp = emergency.response;
        emergencyResponse += `### ${emergency.category.toUpperCase()} EMERGENCY\n\n`;
        if (resp.compassionateMessage) emergencyResponse += `💙 ${resp.compassionateMessage}\n\n`;
        emergencyResponse += `**📞 Call Now: ${resp.hotline}**\n`;
        if (resp.alternateHotline) emergencyResponse += `**📱 Or: ${resp.alternateHotline}**\n`;
        emergencyResponse += '\n**Immediate Steps:**\n';
        resp.instructions.forEach((inst, i) => { emergencyResponse += `${i + 1}. ${inst}\n`; });
      }
      setMessages(prev => [...prev, { role: 'user', content: sanitizedInput }, { role: 'assistant', content: emergencyResponse, isEmergency: true }]);
      setIsLoading(false);
      return;
    }
    
    const rateCheck = rateLimiter.current.checkLimit(false);
    if (!rateCheck.allowed) {
      setMessages(prev => [...prev, { role: 'user', content: sanitizedInput }, { role: 'assistant', content: `⏳ Rate limit reached. Please wait ${rateCheck.resetIn} seconds.`, isRateLimit: true }]);
      setIsLoading(false);
      return;
    }
    
    setMessages(prev => [...prev, { role: 'user', content: sanitizedInput }]);
    
    if (connectionStatus !== 'connected') {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ **Connection Error**\n\nPlease connect to LM Studio first. Click the ⚙️ button to check settings.', isError: true }]);
      setIsLoading(false);
      return;
    }
    
    try {
      const apiMessages = messages.filter(m => !m.isSecurityAlert && !m.isError && !m.isRateLimit && !m.isEmergency).map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user', content: sanitizedInput });
      
      const result = await queryLMStudio(apiMessages, config);
      if (!result.success) throw new Error(result.error);
      
      const { filtered: filteredOutput } = filterOutput(result.content);
      const disclaimers = selectDisclaimer(sanitizedInput);
      const fullResponse = filteredOutput + '\n\n---\n' + disclaimers.join('\n\n');
      
      setStats(prev => ({ ...prev, totalQueries: prev.totalQueries + 1 }));
      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
      auditLogger.current.log({ type: 'QUERY_COMPLETE', inputLength: sanitizedInput.length, outputLength: fullResponse.length });
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ **Error**: ${error.message}`, isError: true }]);
    }
    
    setIsLoading(false);
  };

  const connColors = {
    connected: { bg: '#065f46', color: '#34d399', text: 'Connected' },
    disconnected: { bg: '#7f1d1d', color: '#fca5a5', text: 'Disconnected' },
    error: { bg: '#78350f', color: '#fcd34d', text: 'Error' },
    checking: { bg: '#1e3a8a', color: '#93c5fd', text: 'Checking...' }
  };
  const conn = connColors[connectionStatus] || connColors.disconnected;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; width: 100%; overflow: hidden; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .watson-container { height: 100vh; width: 100vw; display: flex; flex-direction: column; background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #e2e8f0; }
        .watson-header { flex-shrink: 0; background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid #334155; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .watson-main { flex: 1; display: flex; overflow: hidden; position: relative; }
        .watson-chat { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .watson-messages { flex: 1; overflow-y: auto; padding: 16px; }
        .watson-input-area { flex-shrink: 0; padding: 12px 16px; background: #0f172a; border-top: 1px solid #334155; display: flex; gap: 8px; }
        .watson-sidebar { position: absolute; top: 0; right: 0; bottom: 0; width: 300px; max-width: 90vw; background: #0f172a; border-left: 1px solid #334155; display: flex; flex-direction: column; z-index: 50; box-shadow: -4px 0 20px rgba(0,0,0,0.3); }
        .watson-sidebar-content { flex: 1; overflow-y: auto; padding: 16px; }
        .watson-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .watson-modal-content { background: #0f172a; border-radius: 12px; border: 1px solid #334155; width: 100%; max-width: 600px; max-height: 80vh; display: flex; flex-direction: column; }
        .message-bubble { max-width: 85%; margin-bottom: 12px; padding: 12px 16px; border-radius: 12px; white-space: pre-wrap; font-size: 14px; line-height: 1.5; }
        .message-user { margin-left: auto; background: #2563eb; }
        .message-assistant { background: #334155; }
        .message-alert { background: rgba(220, 38, 38, 0.2); border: 1px solid #dc2626; }
        .btn { border: none; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px; font-weight: 500; }
        .btn-primary { background: #2563eb; color: white; }
        .btn-settings { background: #1e3a8a; color: #93c5fd; }
        .btn-logs { background: #581c87; color: #c4b5fd; }
        .btn-close { background: #dc2626; color: white; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .input-field { flex: 1; background: #1e293b; border: 1px solid #475569; border-radius: 8px; padding: 12px; color: #e2e8f0; font-size: 14px; outline: none; min-width: 0; }
        .input-field:disabled { opacity: 0.5; }
        .safety-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #064e3b; border-radius: 4px; margin-bottom: 4px; font-size: 12px; }
        .stat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #334155; font-size: 12px; }
      `}</style>
      
      <div className="watson-container">
        {/* Header */}
        <header className="watson-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px', height: '40px',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', flexShrink: 0
            }}>🏥</div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#f1f5f9' }}>Watson in the Ward</h1>
              <p style={{ fontSize: '11px', color: '#64748b' }}>Healthcare AI • 7-Layer Safety</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{
              padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '6px',
              background: conn.bg, color: conn.color
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: conn.color }} />
              {conn.text}
            </div>
            
            <button className="btn btn-settings" onClick={() => setShowSidebar(!showSidebar)}>
              ⚙️ Settings
            </button>
            
            <button className="btn btn-logs" onClick={() => setShowAuditLog(true)}>
              📋 Logs
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="watson-main">
          {/* Chat Area */}
          <div className="watson-chat">
            {/* Messages - This is the scrollable area */}
            <div className="watson-messages">
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏥</div>
                  <h2 style={{ color: '#94a3b8', marginBottom: '8px', fontSize: '20px' }}>Welcome to Watson</h2>
                  <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                    Your AI healthcare assistant. Ask about health topics, symptoms, wellness tips, or help preparing for doctor visits.
                  </p>
                  {connectionStatus !== 'connected' && (
                    <div style={{
                      marginTop: '20px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)',
                      fontSize: '13px', textAlign: 'left', maxWidth: '400px', margin: '20px auto 0'
                    }}>
                      <strong style={{ color: '#f87171' }}>⚠️ Not Connected</strong>
                      <p style={{ marginTop: '6px', color: '#94a3b8', whiteSpace: 'pre-line', fontSize: '12px' }}>
                        {connectionError || 'Click Settings to connect to LM Studio'}
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`message-bubble ${msg.role === 'user' ? 'message-user' : 'message-assistant'} ${(msg.isEmergency || msg.isSecurityAlert || msg.isError) ? 'message-alert' : ''}`}
                >
                  {msg.content}
                </div>
              ))}
              
              {isLoading && (
                <div className="message-bubble message-assistant">
                  <span style={{ animation: 'pulse 1s infinite' }}>●</span> Watson is thinking...
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area - Fixed at bottom */}
            <div className="watson-input-area">
              <input
                type="text"
                className="input-field"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={connectionStatus === 'connected' ? "Ask a health question..." : "Connect to LM Studio first..."}
                disabled={isLoading || connectionStatus !== 'connected'}
              />
              <button
                className="btn btn-primary"
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim() || connectionStatus !== 'connected'}
                style={{ padding: '12px 20px', flexShrink: 0 }}
              >
                Send
              </button>
            </div>
          </div>

          {/* Sidebar */}
          {showSidebar && (
            <div className="watson-sidebar">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', color: '#f1f5f9' }}>Settings</span>
                <button className="btn btn-close" onClick={() => setShowSidebar(false)} style={{ padding: '4px 10px', fontSize: '12px' }}>
                  ✕ Close
                </button>
              </div>
              
              <div className="watson-sidebar-content">
                {/* Connection Settings */}
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px' }}>⚙️ LM Studio Connection</h3>
                  
                  <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Server URL</label>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    style={{
                      width: '100%', background: '#1e293b', border: '1px solid #475569',
                      borderRadius: '6px', padding: '8px 10px', color: '#e2e8f0', fontSize: '13px',
                      marginBottom: '10px', boxSizing: 'border-box'
                    }}
                  />
                  
                  <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Model</label>
                  {availableModels.length > 0 ? (
                    <select
                      value={config.model}
                      onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                      style={{
                        width: '100%', background: '#1e293b', border: '1px solid #475569',
                        borderRadius: '6px', padding: '8px 10px', color: '#e2e8f0', fontSize: '13px',
                        marginBottom: '10px', boxSizing: 'border-box'
                      }}
                    >
                      {availableModels.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                  ) : (
                    <div style={{ padding: '8px', background: '#7f1d1d', borderRadius: '6px', fontSize: '12px', color: '#fca5a5', marginBottom: '10px' }}>
                      No models found
                    </div>
                  )}
                  
                  <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                    Temperature: {config.temperature}
                  </label>
                  <input
                    type="range" min="0" max="1" step="0.1" value={config.temperature}
                    onChange={(e) => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    style={{ width: '100%', marginBottom: '10px' }}
                  />
                  
                  <button 
                    className="btn btn-settings" 
                    onClick={checkConnection} 
                    disabled={connectionStatus === 'checking'}
                    style={{ width: '100%', padding: '10px' }}
                  >
                    {connectionStatus === 'checking' ? '⏳ Checking...' : '🔄 Refresh Connection'}
                  </button>
                  
                  {connectionError && (
                    <div style={{ marginTop: '8px', padding: '8px', background: '#7f1d1d', borderRadius: '6px', fontSize: '11px', color: '#fca5a5', whiteSpace: 'pre-line' }}>
                      {connectionError}
                    </div>
                  )}
                </div>
                
                {/* Safety Status */}
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px' }}>🛡️ 7-Layer Safety</h3>
                  {['Injection Shield', 'Emergency Detection', 'Input Sanitization', 'Output Filtering', 'Medical Disclaimers', 'Rate Limiting', 'Audit Logging'].map((layer, idx) => (
                    <div key={idx} className="safety-item">
                      <span>{layer}</span>
                      <span style={{ color: '#34d399' }}>✓</span>
                    </div>
                  ))}
                </div>
                
                {/* Stats */}
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px' }}>📊 Session Stats</h3>
                  <div className="stat-row">
                    <span>Total Queries</span>
                    <span style={{ color: '#60a5fa', fontWeight: '600' }}>{stats.totalQueries}</span>
                  </div>
                  <div className="stat-row">
                    <span>Threats Blocked</span>
                    <span style={{ color: '#f87171', fontWeight: '600' }}>{stats.blockedThreats}</span>
                  </div>
                  <div className="stat-row" style={{ borderBottom: 'none' }}>
                    <span>Emergencies</span>
                    <span style={{ color: '#fbbf24', fontWeight: '600' }}>{stats.emergenciesDetected}</span>
                  </div>
                </div>
                
                {/* Hotlines */}
                <div>
                  <h3 style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px' }}>📞 Emergency Hotlines</h3>
                  {[
                    { name: 'Emergency', num: '911' },
                    { name: 'Suicide & Crisis', num: '988' },
                    { name: 'Poison Control', num: '1-800-222-1222' }
                  ].map((h, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                      <span style={{ color: '#94a3b8' }}>{h.name}</span>
                      <span style={{ color: '#f87171', fontWeight: '600' }}>{h.num}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Audit Log Modal */}
        {showAuditLog && (
          <div className="watson-modal">
            <div className="watson-modal-content">
              <div style={{ padding: '16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#f1f5f9' }}>📋 Audit Log</h3>
                <button className="btn btn-close" onClick={() => setShowAuditLog(false)}>Close</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <pre style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {auditLogger.current.exportLogs() || '[]'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
