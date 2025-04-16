document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const modelSelect = document.getElementById('modelSelect');
    const extractionPatterns = document.getElementById('extractionPatterns');
    const maxRecords = document.getElementById('maxRecords');
    const systemPrompt = document.getElementById('systemPrompt');
    
    const enableSN = document.getElementById('enableSN');
    const snCredentials = document.getElementById('snCredentials');
    const instanceInput = document.getElementById('instanceInput');
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    const testResult = document.getElementById('testResult');
    
    const enableDebug = document.getElementById('enableDebug');
    const debugOptions = document.getElementById('debugOptions');
    const showConsole = document.getElementById('showConsole');
    const debugConsoleContainer = document.getElementById('debugConsoleContainer');
    const debugConsole = document.getElementById('debugConsole');
    const clearConsoleBtn = document.getElementById('clearConsoleBtn');
    
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusMessage = document.getElementById('statusMessage');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const processingMessage = document.getElementById('processingMessage');
    
    // Default values
    const defaultSettings = {
      openaiModel: 'gpt-4.1',
      maxRecords: 200,
      extractionPatterns: JSON.stringify({
        servicenow: {
          formFields: '.form-group input, .form-group select, .form-group textarea',
          listHeaders: 'table.list_table tr.list_header th',
          listRows: 'table.list_table tr.list_row',
          listCells: 'td',
          allTables: 'table'
        },
        general: {
          title: 'title',
          metaTags: 'meta[name]',
          mainContent: 'main, article, body',
          paragraphs: 'p',
          tables: 'table'
        }
      }, null, 2),
      systemPrompt: 'You are an assistant analyzing data from TrustPoint ServiceNow Data Analyzer Chrome extension. Use the extracted data to provide insights and answer questions. Be specific and helpful.',
      debugMode: false,
      showDebugConsole: false
    };
    
    // Init debug logs array to store logs even when console is not shown
    let debugLogs = [];
    
    // Toggle ServiceNow credentials visibility
    enableSN.addEventListener('change', () => {
      if (enableSN.checked) {
        snCredentials.classList.remove('hidden');
      } else {
        snCredentials.classList.add('hidden');
      }
      debugLog('ServiceNow authentication ' + (enableSN.checked ? 'enabled' : 'disabled'));
    });
    
    // Toggle debug options visibility
    enableDebug.addEventListener('change', () => {
      if (enableDebug.checked) {
        debugOptions.classList.remove('hidden');
        debugLog('Debug mode enabled', 'info');
      } else {
        debugOptions.classList.add('hidden');
        debugLog('Debug mode disabled', 'info');
      }
    });
    
    // Toggle debug console visibility
    showConsole.addEventListener('change', () => {
      if (showConsole.checked) {
        debugConsoleContainer.classList.remove('hidden');
        updateDebugConsole();
      } else {
        debugConsoleContainer.classList.add('hidden');
      }
      debugLog('Debug console ' + (showConsole.checked ? 'shown' : 'hidden'));
    });
    
    // Clear debug console
    clearConsoleBtn.addEventListener('click', () => {
      debugLogs = [];
      debugConsole.innerHTML = '';
      debugLog('Console cleared', 'info');
    });
    
    // Test ServiceNow connection
    testConnectionBtn.addEventListener('click', () => {
      testServiceNowConnection();
    });
    
    // Load saved settings
    loadSavedSettings();
    
    // Event Listeners
    saveBtn.addEventListener('click', saveSettings);
    resetBtn.addEventListener('click', resetSettings);
    
    // Functions
    function loadSavedSettings() {
      chrome.storage.local.get([
        'openaiApiKey',
        'openaiModel',
        'extractionPatterns',
        'maxRecords',
        'systemPrompt',
        'snCredentials',
        'debugMode',
        'showDebugConsole'
      ], (result) => {
        // OpenAI Settings
        if (result.openaiApiKey) {
          apiKeyInput.value = result.openaiApiKey;
        }
        
        if (result.openaiModel) {
          modelSelect.value = result.openaiModel;
        } else {
          modelSelect.value = defaultSettings.openaiModel;
        }
        
        // ServiceNow Settings
        if (result.snCredentials) {
          enableSN.checked = result.snCredentials.enabled;
          
          if (result.snCredentials.enabled) {
            snCredentials.classList.remove('hidden');
            
            if (result.snCredentials.instance) {
              instanceInput.value = result.snCredentials.instance;
            }
            
            if (result.snCredentials.username) {
              usernameInput.value = result.snCredentials.username;
            }
            
            if (result.snCredentials.password) {
              passwordInput.value = result.snCredentials.password;
            }
          }
        }
        
        // Data Extraction Settings
        if (result.extractionPatterns) {
          try {
            const parsedPatterns = JSON.parse(result.extractionPatterns);
            extractionPatterns.value = JSON.stringify(parsedPatterns, null, 2);
          } catch (e) {
            extractionPatterns.value = defaultSettings.extractionPatterns;
            debugLog('Error parsing extraction patterns: ' + e.message, 'error');
          }
        } else {
          extractionPatterns.value = defaultSettings.extractionPatterns;
        }
        
        if (result.maxRecords) {
          maxRecords.value = result.maxRecords;
        } else {
          maxRecords.value = defaultSettings.maxRecords;
        }
        
        // Chat Settings
        if (result.systemPrompt) {
          systemPrompt.value = result.systemPrompt;
        } else {
          systemPrompt.value = defaultSettings.systemPrompt;
        }
        
        // Debug Settings
        enableDebug.checked = result.debugMode === true;
        showConsole.checked = result.showDebugConsole === true;
        
        if (enableDebug.checked) {
          debugOptions.classList.remove('hidden');
        }
        
        if (showConsole.checked) {
          debugConsoleContainer.classList.remove('hidden');
        }
        
        debugLog('Settings loaded successfully', 'info');
      });
    }
    
    function saveSettings() {
      const apiKey = apiKeyInput.value.trim();
      const selectedModel = modelSelect.value;
      const maxRecordsValue = parseInt(maxRecords.value) || defaultSettings.maxRecords;
      let patterns = defaultSettings.extractionPatterns;
      let prompt = systemPrompt.value.trim();
      
      // Validate extraction patterns JSON
      try {
        if (extractionPatterns.value.trim()) {
          JSON.parse(extractionPatterns.value);
          patterns = extractionPatterns.value;
        }
      } catch (e) {
        showStatus(`Error in extraction patterns: ${e.message}`, 'error');
        debugLog('JSON parse error in extraction patterns: ' + e.message, 'error');
        return;
      }
      
      // Set default system prompt if empty
      if (!prompt) {
        prompt = defaultSettings.systemPrompt;
      }
      
      // Save OpenAI settings
      chrome.storage.local.set({
        openaiApiKey: apiKey,
        openaiModel: selectedModel,
        extractionPatterns: patterns,
        maxRecords: maxRecordsValue,
        systemPrompt: prompt,
        debugMode: enableDebug.checked,
        showDebugConsole: showConsole.checked
      });
      
      // Save ServiceNow credentials
      const snSettings = {
        enabled: enableSN.checked
      };
      
      if (enableSN.checked) {
        const instance = instanceInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!instance || !username || !password) {
          showStatus('Please complete all ServiceNow credential fields', 'error');
          debugLog('Incomplete ServiceNow credentials', 'error');
          return;
        }
        
        snSettings.instance = instance;
        snSettings.username = username;
        snSettings.password = password;
      }
      
      chrome.storage.local.set({ snCredentials: snSettings }, () => {
        showStatus('Settings saved successfully!', 'success');
        debugLog('Settings saved successfully', 'info');
      });
    }
    
    function resetSettings() {
      if (confirm('Are you sure you want to reset all settings to defaults?')) {
        // Reset dropdown and textarea values
        modelSelect.value = defaultSettings.openaiModel;
        extractionPatterns.value = defaultSettings.extractionPatterns;
        maxRecords.value = defaultSettings.maxRecords;
        systemPrompt.value = defaultSettings.systemPrompt;
        
        // Don't reset the API key or ServiceNow credentials
        
        // Reset debug settings
        enableDebug.checked = defaultSettings.debugMode;
        showConsole.checked = defaultSettings.showDebugConsole;
        
        if (!enableDebug.checked) {
          debugOptions.classList.add('hidden');
        }
        
        if (!showConsole.checked) {
          debugConsoleContainer.classList.add('hidden');
        }
        
        // Save the reset settings
        chrome.storage.local.set({
          openaiModel: defaultSettings.openaiModel,
          extractionPatterns: defaultSettings.extractionPatterns,
          maxRecords: defaultSettings.maxRecords,
          systemPrompt: defaultSettings.systemPrompt,
          debugMode: defaultSettings.debugMode,
          showDebugConsole: defaultSettings.showDebugConsole
        }, () => {
          showStatus('Settings reset to defaults.', 'success');
          debugLog('Settings reset to defaults', 'info');
        });
      }
    }
    
    function showStatus(message, type) {
      statusMessage.textContent = message;
      statusMessage.className = 'status-message ' + type;
      statusMessage.style.display = 'block';
      
      // Hide the message after 3 seconds
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
      
      debugLog('Status: ' + message + ' (' + type + ')', type);
    }
    
    function testServiceNowConnection() {
      // Get ServiceNow credentials
      const instance = instanceInput.value.trim();
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      
      // Validate fields
      if (!instance || !username || !password) {
        showTestResult('Please fill in all ServiceNow credential fields', 'error');
        debugLog('Incomplete ServiceNow credentials for connection test', 'error');
        return;
      }
      
      // Show loading
      showLoading('Testing connection...');
      debugLog('Testing ServiceNow connection to ' + instance + '.service-now.com', 'info');
      
      // Build the URL to test (using a simple sys_user table query with limit=1)
      const url = `https://${instance}.service-now.com/api/now/table/sys_user?sysparm_limit=1`;
      
      // Create Basic Auth header
      const basicAuth = 'Basic ' + btoa(`${username}:${password}`);
      
      // Set up timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Make the request
      fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': basicAuth,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        hideLoading();
        
        debugLog('ServiceNow response status: ' + response.status, 'info');
        
        if (response.ok) {
          showTestResult('✅ Connection successful! Your ServiceNow credentials are valid.', 'success');
          debugLog('ServiceNow connection test successful', 'info');
        } else if (response.status === 401) {
          showTestResult('❌ Authentication failed. Please check your username and password.', 'error');
          debugLog('ServiceNow authentication failed', 'error');
        } else if (response.status === 404) {
          showTestResult('❌ Instance not found. Please check your instance name.', 'error');
          debugLog('ServiceNow instance not found: ' + instance, 'error');
        } else {
          showTestResult(`❌ Connection failed with status: ${response.status}. Please check your credentials.`, 'error');
          debugLog('ServiceNow connection failed with status: ' + response.status, 'error');
        }
        
        return response.json().catch(() => null); // Try to parse JSON but don't fail if it's not valid
      })
      .catch(error => {
        clearTimeout(timeoutId);
        hideLoading();
        
        if (error.name === 'AbortError') {
          showTestResult('❌ Connection timed out. Please check your instance name and network connection.', 'error');
          debugLog('ServiceNow connection test timed out', 'error');
        } else {
          showTestResult(`❌ Connection error: ${error.message}`, 'error');
          debugLog('ServiceNow connection error: ' + error.message, 'error');
        }
      });
    }
    
    function showTestResult(message, type) {
      testResult.textContent = message;
      testResult.className = 'test-result ' + type;
      testResult.style.display = 'block';
      
      // Don't auto-hide success messages
      if (type !== 'success') {
        // Hide the message after 5 seconds
        setTimeout(() => {
          testResult.style.display = 'none';
        }, 5000);
      }
    }
    
    function showLoading(message) {
      processingMessage.textContent = message;
      loadingOverlay.classList.remove('hidden');
      debugLog('Loading: ' + message, 'info');
    }
    
    function hideLoading() {
      loadingOverlay.classList.add('hidden');
      debugLog('Loading hidden', 'info');
    }
    
    // Debug functions
    function debugLog(message, level = 'info') {
      const timestamp = new Date().toLocaleTimeString();
      const logObj = {
        timestamp,
        message,
        level
      };
      
      // Add to logs array
      debugLogs.push(logObj);
      
      // Limit the number of logs stored
      if (debugLogs.length > 100) {
        debugLogs.shift();
      }
      
      // Update the console if visible
      if (showConsole.checked && debugConsoleContainer.classList.contains('hidden') === false) {
        appendDebugMessage(logObj);
      }
      
      // Also log to browser console if debug mode is enabled
      if (enableDebug.checked) {
        const consoleMethod = level === 'error' ? console.error : 
                            level === 'warn' ? console.warn : 
                            console.log;
        consoleMethod(`[${timestamp}] ${message}`);
      }
    }
    
    function updateDebugConsole() {
      debugConsole.innerHTML = '';
      debugLogs.forEach(log => {
        appendDebugMessage(log);
      });
    }
    
    function appendDebugMessage(log) {
      const msgElement = document.createElement('div');
      msgElement.className = `debug-message ${log.level}`;
      msgElement.textContent = `[${log.timestamp}] ${log.message}`;
      debugConsole.appendChild(msgElement);
      
      // Scroll to the latest message
      debugConsole.scrollTop = debugConsole.scrollHeight;
    }
  });