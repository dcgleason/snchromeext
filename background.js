// Background script for persistence
console.log('[Extension Background] background.js loaded');
// Register onInstalled listener (guarded against missing API)
try {
  chrome.runtime.onInstalled.addListener(() => {
    console.log("TrustPoint ServiceNow Data Analyzer installed/updated");
    // Initialize default values in storage if not already set
    chrome.storage.local.get([
    'extractedData', 
    'openaiApiKey', 
    'chatHistory', 
    'snCredentials', 
    'openaiModel',
    'debugMode',
    'debugLogs'
  ], (result) => {
    if (!result.extractedData) {
      chrome.storage.local.set({ extractedData: {} });
    }
    if (!result.chatHistory) {
      chrome.storage.local.set({ chatHistory: [] });
    }
    if (!result.snCredentials) {
      chrome.storage.local.set({ snCredentials: { enabled: false } });
    }
    if (!result.openaiModel) {
      chrome.storage.local.set({ openaiModel: 'gpt-4.1' });
    }
    if (result.debugMode === undefined) {
      chrome.storage.local.set({ debugMode: false });
    }
    if (!result.debugLogs) {
      chrome.storage.local.set({ debugLogs: [] });
    }
    // Don't set a default API key - should be provided by user
    
    // Log initialization
    if (result.debugMode) {
      logDebug('Extension initialized', 'info');
    }
  });
}); // end onInstalled listener
} catch (e) {
  console.error('[Background] runtime.onInstalled.addListener failed:', e);
}

// Listen for messages from popup or content scripts (guarded)
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    // Handle debug logging
    if (request.action === "logDebug") {
      // Handle debug logging
      handleDebugLog(request.message, request.level, request.timestamp);
      return false; // No response needed
    }
    
    // Handle data persistence
    if (request.action === "saveData") {
      logDebug('Saving extracted data', 'info');
      chrome.storage.local.set({ extractedData: request.data }, () => {
        sendResponse({ status: "Data saved successfully" });
        logDebug('Data saved successfully', 'info');
      });
      return true; // Required for async sendResponse
    }

    // Handle ServiceNow API calls
    if (request.action === "fetchServiceNowData") {
      logDebug(`Fetching ServiceNow data from table: ${request.endpoint}`, 'info');
      fetchFromServiceNow(request.endpoint, request.params, sendResponse);
      return true; // Required for async sendResponse
    }

    // Handle OpenAI API requests
    if (request.action === "openaiChat") {
      logDebug('Processing OpenAI chat request', 'info');
      handleOpenAIChat(request, sendResponse);
      return true; // Required for async sendResponse
    }

    // Clear chat history
    if (request.action === "clearChat") {
      logDebug('Clearing chat history', 'info');
      chrome.storage.local.set({ chatHistory: [] }, () => {
        sendResponse({ status: "Chat history cleared" });
        logDebug('Chat history cleared successfully', 'info');
      });
      return true;
    }
    
    // Get debug logs
    if (request.action === "getDebugLogs") {
      chrome.storage.local.get(['debugLogs'], (result) => {
        sendResponse({ logs: result.debugLogs || [] });
      });
      return true;
    }
    
    // Clear debug logs
    if (request.action === "clearDebugLogs") {
      chrome.storage.local.set({ debugLogs: [] }, () => {
        sendResponse({ status: "Debug logs cleared" });
      });
      return true;
    }
  } catch (error) {
    console.error("Error in message listener:", error);
    logDebug(`Error in message listener: ${error.message}`, 'error');
    sendResponse({ error: "Internal extension error: " + error.message });
    return true;
  }
  });
} catch (e) {
  console.error('[Background] runtime.onMessage.addListener failed:', e);
}

// Handle debug logging
function handleDebugLog(message, level, timestamp) {
  chrome.storage.local.get(['debugMode', 'debugLogs'], (result) => {
    if (!result.debugMode) return;
    
    const logs = result.debugLogs || [];
    
    // Add the new log
    logs.push({
      timestamp: timestamp || new Date().toLocaleTimeString(),
      message: message,
      level: level || 'info'
    });
    
    // Limit to last 500 logs
    if (logs.length > 500) {
      logs.splice(0, logs.length - 500);
    }
    
    // Save updated logs
    chrome.storage.local.set({ debugLogs: logs });
  });
}

// Debug log helper
function logDebug(message, level = 'info') {
  chrome.storage.local.get(['debugMode'], (result) => {
    if (!result.debugMode) return;
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Always log to console
    const consoleMethod = level === 'error' ? console.error : 
                         level === 'warn' ? console.warn : 
                         console.log;
    consoleMethod(`[${timestamp}] ${message}`);
    
    // Also save to storage
    handleDebugLog(message, level, timestamp);
  });
}

// Handle OpenAI chat requests
async function handleOpenAIChat(request, sendResponse) {
  logDebug('Processing OpenAI chat request', 'info');
  
  try {
    // Get API key from storage
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['openaiApiKey', 'extractedData', 'chatHistory', 'openaiModel', 'systemPrompt'], resolve);
    });

    if (!result.openaiApiKey) {
      sendResponse({ error: "API key not found. Please set it in the options page." });
      logDebug('OpenAI API key not found', 'error');
      return;
    }

    try {
      // Get model, defaulting to gpt-4.1 if not set
      const model = result.openaiModel || "gpt-4.1";
      logDebug(`Using OpenAI model: ${model}`, 'info');
      
      // Use custom system prompt if available
      const systemPrompt = result.systemPrompt || 
        "You are an assistant analyzing data from the TrustPoint ServiceNow Data Analyzer Chrome extension. Use the extracted data to provide insights.";
      
      // Check if extracted data is too large
      let extractedDataStr;
      try {
        extractedDataStr = JSON.stringify(result.extractedData);
        logDebug(`Data size for OpenAI: ${Math.round(extractedDataStr.length / 1024)} KB`, 'info');
      } catch (error) {
        console.error("Error stringifying data:", error);
        logDebug(`Error stringifying data: ${error.message}`, 'error');
        extractedDataStr = JSON.stringify({ error: "Data too large to stringify" });
      }
      
      let userMessage = request.message;
      
      // Add warning if data is likely to exceed context window
      if (extractedDataStr.length > 100000 || 
         (result.extractedData.listData && result.extractedData.listData.length > 200) ||
         (result.extractedData.result && result.extractedData.result.length > 200)) {
        userMessage += "\n\nNote: The extracted data is very large and may exceed context limits. Consider filtering or aggregating data before analysis.";
        logDebug('Added large data warning to message', 'warn');
      }

      // Prepare data for the OpenAI API
      let extractedDataForAPI = result.extractedData;
      
      // If data is XML format, use the original JSON data if available
      if (result.extractedData.format === 'xml' && result.extractedData.originalData) {
        extractedDataForAPI = result.extractedData.originalData;
        logDebug('Using original JSON data instead of XML for API call', 'info');
      }

      // Call OpenAI API with prepared messages
      logDebug('Sending request to OpenAI API', 'info');
      
      try {
        // Prepare system message content including extracted data once
   // Prepare developer message content including extracted data once
          const dataForSystem = JSON.stringify(extractedDataForAPI);
          const messagesPayload = [
            {
              role: "developer",  // Change from "system" to "developer"
              content: systemPrompt + "\n\nExtracted Data: " + dataForSystem
            },
            // Map existing chat history roles
            ...result.chatHistory.map(msg => ({
              role: msg.role === "system" ? "developer" : msg.role,
              content: msg.content
            })),
            {
              role: "user",
              content: userMessage
            }
          ];
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${result.openaiApiKey}`
          },
          body: JSON.stringify({
            model: model,
            input: messagesPayload,
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          logDebug(`OpenAI API error: HTTP ${response.status} - ${errorData.error?.message || 'Unknown error'}`, 'error');
          throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        logDebug('Received successful response from OpenAI', 'info');
        
        // If there's an error key, report it
        if (data.error) {
          logDebug(`OpenAI returned error: ${data.error.message}`, 'error');
          sendResponse({ error: data.error.message });
          return;
        }
        
        // Parse assistant text from Responses API
        let assistantText = '';
        // Use helper output_text if present
        if (typeof data.output_text === 'string' && data.output_text) {
          assistantText = data.output_text;
        }
        // Otherwise, process the output array for message events
        else if (Array.isArray(data.output)) {
          for (const item of data.output) {
            if (item.type === 'message' && Array.isArray(item.content)) {
              for (const contentItem of item.content) {
                if (contentItem.type === 'output_text' && contentItem.text) {
                  assistantText += contentItem.text;
                }
              }
            }
          }
        }
        // Legacy fallback to result.content
        else if (data.result && typeof data.result.content === 'string') {
          assistantText = data.result.content;
        }
        logDebug(`Parsed assistant text: ${assistantText}`, 'info');
        // Update chat history
        const updatedHistory = [
          ...result.chatHistory,
          { role: 'user', content: request.message },
          { role: 'assistant', content: assistantText }
        ];
        chrome.storage.local.set({ chatHistory: updatedHistory });
        logDebug('Chat history updated with new messages', 'info');
        // Send reply back to popup
        sendResponse({ reply: assistantText, updatedHistory: updatedHistory });
      } catch (fetchError) {
        logDebug(`OpenAI fetch error: ${fetchError.message}`, 'error');
        throw fetchError;
      }
    } catch (error) {
      logDebug(`Error in OpenAI chat: ${error.message}`, 'error');
      sendResponse({ error: error.message });
    }
  } catch (error) {
    console.error("Error in handleOpenAIChat:", error);
    logDebug(`Error in handleOpenAIChat: ${error.message}`, 'error');
    sendResponse({ error: "Error communicating with OpenAI: " + error.message });
  }
}

// Function to fetch data from ServiceNow with basic authentication
async function fetchFromServiceNow(endpoint, params, sendResponse) {
  logDebug(`Fetching ServiceNow data: ${endpoint} with format ${params.format}`, 'info');
  
  try {
    // Get ServiceNow credentials
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['snCredentials'], resolve);
    });
    
    const credentials = result.snCredentials;
    
    if (!credentials || !credentials.enabled || !credentials.instance || 
        !credentials.username || !credentials.password) {
      sendResponse({ 
        error: "ServiceNow credentials not found or incomplete. Please configure them in settings." 
      });
      logDebug('ServiceNow credentials missing or incomplete', 'error');
      return;
    }
    
    // Build the URL
    let url = `https://${credentials.instance}.service-now.com/api/now/table/${endpoint}`;
    logDebug(`ServiceNow URL: ${url}`, 'info');
    
    // Add query parameters
    if (params && Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        queryParams.append(key, value);
      }
      url += `?${queryParams.toString()}`;
      logDebug(`ServiceNow query parameters: ${queryParams.toString()}`, 'info');
    }
    
    // Create Basic Auth header
    const basicAuth = 'Basic ' + btoa(`${credentials.username}:${credentials.password}`);
    
    try {
      // Make the request
      logDebug('Sending request to ServiceNow', 'info');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': basicAuth,
          'Content-Type': 'application/json',
          'Accept': params.format === 'xml' ? 'application/xml' : 'application/json'
        }
      });
      
      logDebug(`ServiceNow response status: ${response.status}`, 'info');
      
      if (!response.ok) {
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error ? errorData.error.message : `HTTP error ${response.status}`;
        } catch (e) {
          errorMessage = `HTTP error ${response.status}`;
        }
        logDebug(`ServiceNow API error: ${errorMessage}`, 'error');
        throw new Error(`ServiceNow API error: ${errorMessage}`);
      }
      
      // Parse response based on requested format
      let data;
      if (params.format === 'xml') {
        const xmlText = await response.text();
        data = { xmlData: xmlText, format: 'xml' };
        logDebug('Received XML response from ServiceNow', 'info');
      } else {
        data = await response.json();
        data.format = 'json';
        
        if (data.result && Array.isArray(data.result)) {
          logDebug(`Received JSON response with ${data.result.length} records`, 'info');
        } else {
          logDebug('Received JSON response from ServiceNow', 'info');
        }
      }
      
      // Check if result size exceeds limits
      let warning = null;
      if (data.result && Array.isArray(data.result) && data.result.length > 200) {
        warning = "Warning: The number of records exceeds 200, which may exceed the context window of GPT-4.1 and similar models.";
        logDebug(`Large result set warning: ${data.result.length} records`, 'warn');
      }
      
      sendResponse({ 
        data: data,
        warning: warning
      });
    } catch (fetchError) {
      logDebug(`ServiceNow fetch error: ${fetchError.message}`, 'error');
      throw fetchError;
    }
  } catch (error) {
    console.error("Error in fetchFromServiceNow:", error);
    logDebug(`Error in fetchFromServiceNow: ${error.message}`, 'error');
    sendResponse({ error: error.message });
  }
}

// Listen for errors and log them
chrome.runtime.onError.addListener((error) => {
  console.error("Runtime error:", error);
  logDebug(`Runtime error: ${error.message}`, 'error');
});