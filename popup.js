// Popup script entry point
console.log('[Extension Popup] popup.js loaded');
// Immediately hide loading overlay to prevent stuck state
document.addEventListener('DOMContentLoaded', function() {
  // Forcibly hide the loading overlay as the very first action
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }
  
  // Initialize the extension
  initializeExtension();
});

// Main initialization function
function initializeExtension() {
  // DOM Elements - Tabs and Panels
  const dataTab = document.getElementById('dataTab');
  const chatTab = document.getElementById('chatTab');
  const settingsTab = document.getElementById('settingsTab');
  
  const dataPanel = document.getElementById('dataPanel');
  const chatPanel = document.getElementById('chatPanel');
  const settingsPanel = document.getElementById('settingsPanel');
  
  // DOM Elements - Data Panel
  const extractBtn = document.getElementById('extractBtn');
  const formatSelect = document.getElementById('formatSelect');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');
  const extractedDataDisplay = document.getElementById('extractedData');
  const warningBanner = document.getElementById('warningBanner');
  const warningMessage = document.getElementById('warningMessage');
  const closeWarningBtn = document.getElementById('closeWarningBtn');
  
  const rawViewBtn = document.getElementById('rawViewBtn');
  const tableViewBtn = document.getElementById('tableViewBtn');
  const rawDataView = document.getElementById('rawDataView');
  const tableDataView = document.getElementById('tableDataView');
  const tableContainer = document.getElementById('tableContainer');
  const tableSelect = document.getElementById('tableSelect');
  
  // DOM Elements - ServiceNow Query Panel
  const tableInput = document.getElementById('tableInput');
  const limitInput = document.getElementById('limitInput');
  const queryInput = document.getElementById('queryInput');
  const queryBtn = document.getElementById('queryBtn');
  
  // DOM Elements - Chat Panel
  const chatHistory = document.getElementById('chatHistory');
  const userMessage = document.getElementById('userMessage');
  const sendBtn = document.getElementById('sendBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  
  // DOM Elements - Settings Panel
  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelSelect = document.getElementById('modelSelect');
  const enableSN = document.getElementById('enableSN');
  const snCredentials = document.getElementById('snCredentials');
  const instanceInput = document.getElementById('instanceInput');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsMessage = document.getElementById('settingsMessage');
  const testOpenAIBtn = document.getElementById('testOpenAIBtn');
  const testSNBtn = document.getElementById('testSNBtn');
  const snTestResult = document.getElementById('snTestResult');
  
  // DOM Elements - Loading and Progress
  const loadingOverlay = document.getElementById('loadingOverlay');
  const processingMessage = document.getElementById('processingMessage');
  const progressFill = document.getElementById('progressFill');
  const progressPercentage = document.getElementById('progressPercentage');

  // Global variables to store extracted data
  let currentExtractedData = {};
  let currentFormat = 'json';
  
  // Debug mode flag
  let debugMode = false;
  
  // Load debug settings
  chrome.storage.local.get(['debugMode'], (result) => {
    debugMode = result.debugMode === true;
    debugLog('Debug mode ' + (debugMode ? 'enabled' : 'disabled'));
  });
  
  // Add emergency escape keypress
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      hideLoading();
      debugLog('Loading canceled with Escape key');
    }
  });
  
  // Tab switching functionality
  if (dataTab) dataTab.addEventListener('click', () => {
    activateTab(dataTab, dataPanel);
  });
  
  if (chatTab) chatTab.addEventListener('click', () => {
    activateTab(chatTab, chatPanel);
  });
  
  if (settingsTab) settingsTab.addEventListener('click', () => {
    activateTab(settingsTab, settingsPanel);
  });

  function activateTab(tabButton, tabPanel) {
    try {
      // Deactivate all tabs
      [dataTab, chatTab, settingsTab].forEach(tab => {
        if (tab) tab.classList.remove('active');
      });
      
      [dataPanel, chatPanel, settingsPanel].forEach(panel => {
        if (panel) panel.classList.remove('active');
      });
      
      // Activate selected tab
      if (tabButton) tabButton.classList.add('active');
      if (tabPanel) tabPanel.classList.add('active');
      debugLog('Tab activated: ' + (tabButton ? tabButton.id : 'unknown'));
    } catch (error) {
      debugLog('Error in activateTab: ' + error.message, 'error');
      console.error("Error in activateTab:", error);
    }
  }

  // Data view switching functionality
  if (rawViewBtn) rawViewBtn.addEventListener('click', () => {
    rawViewBtn.classList.add('active');
    tableViewBtn.classList.remove('active');
    rawDataView.classList.add('active');
    tableDataView.classList.remove('active');
    debugLog('Switched to raw data view');
  });
  
  if (tableViewBtn) tableViewBtn.addEventListener('click', () => {
    rawViewBtn.classList.remove('active');
    tableViewBtn.classList.add('active');
    rawDataView.classList.remove('active');
    tableDataView.classList.add('active');
    renderTableView();
    debugLog('Switched to table data view');
  });

  // Toggle ServiceNow credentials visibility
  if (enableSN) enableSN.addEventListener('change', () => {
    if (enableSN.checked) {
      snCredentials.classList.remove('hidden');
    } else {
      snCredentials.classList.add('hidden');
    }
    debugLog('ServiceNow authentication ' + (enableSN.checked ? 'enabled' : 'disabled'));
  });

  // Close warning banner
  if (closeWarningBtn) closeWarningBtn.addEventListener('click', () => {
    warningBanner.classList.add('hidden');
    debugLog('Warning banner closed');
  });

  // Table select change handler
  if (tableSelect) tableSelect.addEventListener('change', () => {
    const selectedTable = tableSelect.value;
    renderSelectedTable(selectedTable);
    debugLog('Selected table: ' + selectedTable);
  });

  // Test OpenAI Connection
  if (testOpenAIBtn) testOpenAIBtn.addEventListener('click', () => {
    testOpenAIConnection();
  });

  // Test ServiceNow Connection
  if (testSNBtn) testSNBtn.addEventListener('click', () => {
    testServiceNowConnection();
  });

  // Data extraction functionality
  if (extractBtn) extractBtn.addEventListener('click', () => {
    showLoading("Initializing extraction...");
    updateProgress(5, "Starting data extraction");
    debugLog('Starting data extraction process');
    currentFormat = formatSelect.value;
    debugLog('Format selected: ' + currentFormat);
    
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        hideLoading();
        showWarning("Could not access the current tab");
        debugLog('Could not access current tab', 'error');
        return;
      }
      
      try {
      updateProgress(10, "Analyzing page structure");
      debugLog('Analyzing page structure');
      
      // Prepare to inject extraction script
      updateProgress(15, "Injecting extraction script into page");
      debugLog('Injecting extraction script');
      
      // Execute content script to extract data with incremental progress updates
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: extractDataFromPage,
        args: [currentFormat]
      }).then(results => {
        // Extraction script completed, now processing elements
        updateProgress(30, "Processing extracted elements");
        debugLog('Content script executed, processing results');
          
          if (!results || results.length === 0 || !results[0]) {
            hideLoading();
            showWarning("Failed to extract data from the page.");
            debugLog('No results returned from content script', 'error');
            return;
          }
          
          const extractedData = results[0].result;
          
          // Check if there was an error in extraction
          if (extractedData.error) {
            hideLoading();
            showWarning(`Extraction error: ${extractedData.error}`);
            debugLog('Extraction error: ' + extractedData.error, 'error');
            return;
          }
          
          // Evaluate data size for incremental progress
          updateProgress(50, "Organizing extracted data");
          const recordCount = getRecordCount(extractedData);
          debugLog(`Found ${recordCount} records in extracted data`);
          
          currentExtractedData = extractedData;
          
          // Process records with progress updates
          processExtractedDataWithProgress(extractedData, recordCount, 50, 85);
        }).catch(error => {
          hideLoading();
          showWarning(`Error executing script: ${error.message}`);
          debugLog('Script execution error: ' + error.message, 'error');
          console.error("Script execution error:", error);
        });
      } catch (error) {
        hideLoading();
        showWarning(`General error: ${error.message}`);
        debugLog('General extraction error: ' + error.message, 'error');
        console.error("General extraction error:", error);
      }
    });
  });

  // Process extracted data with progress updates
  function processExtractedDataWithProgress(data, recordCount, startProgress, endProgress) {
    debugLog('Processing extracted data with progress updates');
    
    // Check for large record count
    updateProgress(startProgress + 10, "Checking record count");
    debugLog('Checking record count and displaying warnings if needed');
    checkAndDisplayWarning(data);
    
    // Calculate progress increment based on record count
    const progressIncrement = (endProgress - startProgress) / (recordCount > 0 ? recordCount : 10);
    let currentProgress = startProgress + 10;
    
    // Update progress bar proportionally to data volume
    updateProgress(currentProgress, `Processing ${recordCount} records...`);
    debugLog(`Processing ${recordCount} records`);
    
    // Simulate processing progress
    const processInterval = setInterval(() => {
      currentProgress += progressIncrement * 10; // Process records in batches
      if (currentProgress >= endProgress) {
        currentProgress = endProgress;
        clearInterval(processInterval);
        
        // Final steps - save data and display
        updateProgress(85, "Preparing data for display");
        debugLog('Preparing data for display');
        
        // Save the extracted data
        updateProgress(95, "Saving extracted data");
        chrome.storage.local.set({ extractedData: data }, () => {
          debugLog('Data saved to storage');
          
          // Display the extracted data
          displayExtractedData(data);
          updateProgress(100, "Extraction complete");
          debugLog('Extraction process completed successfully');
          
          setTimeout(() => {
            hideLoading();
          }, 500);
        });
      } else {
        const recordsProcessed = Math.round(((currentProgress - startProgress) / (endProgress - startProgress)) * recordCount);
        updateProgress(currentProgress, `Processed ${recordsProcessed} of ${recordCount} records...`);
      }
    }, 200);
  }
  
  // Get record count from extractedData
  function getRecordCount(data) {
    let count = 0;
    
    if (data.result && Array.isArray(data.result)) {
      count += data.result.length;
    }
    
    if (data.listData && Array.isArray(data.listData)) {
      count += data.listData.length;
    }
    
    if (data.tables && Array.isArray(data.tables)) {
      data.tables.forEach(table => {
        if (table.rows && Array.isArray(table.rows)) {
          count += table.rows.length;
        }
      });
    }
    
    // Count other arrays of objects
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 
          key !== 'result' && key !== 'listData' && key !== 'tables') {
        count += value.length;
      }
    }
    
    return count || 10; // Minimum of 10 to ensure there's some progress animation
  }

  // ServiceNow Query functionality
  if (queryBtn) {
    queryBtn.addEventListener('click', async () => {
      // Validate table input
      const table = tableInput?.value.trim();
      if (!table) {
        showWarning('Please enter a table name');
        debugLog('ServiceNow query attempted without a table name', 'warn');
        return;
      }
      const limit = limitInput.value;
      const query = queryInput.value.trim();
      const format = formatSelect.value;

      showLoading('Connecting to ServiceNow...');
      updateProgress(10, 'Establishing connection');
      debugLog(`Starting ServiceNow query: ${table} (limit=${limit}, format=${format})`);
      if (query) debugLog(`Query: ${query}`);

      try {
        // Load credentials
        const credsResult = await new Promise(resolve =>
          chrome.storage.local.get(['snCredentials'], resolve)
        );
        const creds = credsResult.snCredentials;
        if (!creds || !creds.enabled || !creds.instance || !creds.username || !creds.password) {
          throw new Error('ServiceNow credentials not found or incomplete. Please configure them in settings.');
        }

        updateProgress(20, 'Authenticating with ServiceNow');
        debugLog('Authenticating with ServiceNow');

        // Build request URL
        let url = `https://${creds.instance}.service-now.com/api/now/table/${table}`;
        const paramsObj = new URLSearchParams();
        if (limit) paramsObj.append('sysparm_limit', limit);
        if (query) paramsObj.append('sysparm_query', query);
        if (format) paramsObj.append('format', format);
        url += `?${paramsObj.toString()}`;

        updateProgress(30, 'Sending query to ServiceNow');
        debugLog('Sending query to ServiceNow');

        // Perform fetch
        const basicAuth = 'Basic ' + btoa(`${creds.username}:${creds.password}`);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': basicAuth,
            'Content-Type': 'application/json',
            'Accept': format === 'xml' ? 'application/xml' : 'application/json'
          }
        });

        updateProgress(40, `Received response: HTTP ${response.status}`);
        debugLog(`ServiceNow response status: ${response.status}`);

        if (!response.ok) {
          let errMsg = `HTTP error ${response.status}`;
          try {
            const errData = await response.json();
            if (errData.error?.message) errMsg = errData.error.message;
          } catch {}
          throw new Error(`ServiceNow API error: ${errMsg}`);
        }

        // Parse response
        let data;
        if (format === 'xml') {
          const xmlText = await response.text();
          data = { xmlData: xmlText, format: 'xml' };
          debugLog('Parsed XML response');
        } else {
          data = await response.json();
          data.format = 'json';
          debugLog(`Parsed JSON response with ${Array.isArray(data.result) ? data.result.length : 0} records`);
        }

        // Warning for large data sets
        if (data.result && Array.isArray(data.result) && data.result.length > 200) {
          const warnMsg = `Warning: The data contains ${data.result.length} records, which may exceed the context window limit.`;
          showWarning(warnMsg);
          debugLog(warnMsg, 'warn');
        }

        // Process and display results with progress
        const recordCount = getRecordCount(data);
        processQueryResponseWithProgress(data, recordCount, 50, 95);
      } catch (error) {
        hideLoading();
        showWarning(error.message || 'Error running query');
        debugLog('ServiceNow query error: ' + error.message, 'error');
        console.error('ServiceNow query error:', error);
      }
    });
  }
  
  // Process query response with progress updates
  function processQueryResponseWithProgress(data, recordCount, startProgress, endProgress) {
    debugLog('Processing query response with progress updates');
    
    // Calculate progress increment based on record count
    const progressIncrement = (endProgress - startProgress) / (recordCount > 0 ? recordCount : 10);
    let currentProgress = startProgress;
    
    // Update progress bar proportionally to data volume
    updateProgress(currentProgress, `Processing ${recordCount} records...`);
    
    // Process records with visual feedback
    const processInterval = setInterval(() => {
      currentProgress += progressIncrement * 5; // Process records in batches
      if (currentProgress >= endProgress) {
        currentProgress = endProgress;
        clearInterval(processInterval);
        
        // Save to storage
        updateProgress(95, "Saving query results");
        debugLog('Saving query results to storage');
        
        chrome.storage.local.set({ extractedData: data }, () => {
          displayExtractedData(data);
          updateProgress(100, "Query complete");
          debugLog('ServiceNow query completed successfully');
          
          setTimeout(() => {
            hideLoading();
          }, 500);
        });
      } else {
        const recordsProcessed = Math.round(((currentProgress - startProgress) / (endProgress - startProgress)) * recordCount);
        updateProgress(currentProgress, `Processed ${recordsProcessed} of ${recordCount} records...`);
      }
    }, 100);
  }

  // Download button
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    if (!currentExtractedData || Object.keys(currentExtractedData).length === 0) {
      showWarning('No data to download');
      debugLog('Download attempted with no data', 'warn');
      return;
    }
    
    let content, filename, mimeType;
    
    if (currentFormat === 'xml') {
      // For XML, we might already have XML string
      if (typeof currentExtractedData.xmlData === 'string') {
        content = currentExtractedData.xmlData;
      } else {
        // Convert JSON to XML (simple conversion)
        try {
          content = jsonToXml(currentExtractedData);
          debugLog('Converted JSON to XML for download');
        } catch (error) {
          showWarning(`Error converting to XML: ${error.message}`);
          debugLog('Error converting to XML: ' + error.message, 'error');
          return;
        }
      }
      filename = 'extracted_data.xml';
      mimeType = 'application/xml';
    } else {
      // For JSON
      try {
        content = JSON.stringify(currentExtractedData, null, 2);
        debugLog('Prepared JSON data for download');
      } catch (error) {
        showWarning(`Error stringifying JSON: ${error.message}`);
        debugLog('Error stringifying JSON: ' + error.message, 'error');
        return;
      }
      filename = 'extracted_data.json';
      mimeType = 'application/json';
    }
    
    // Create download link
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    try {
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }).then(() => {
        debugLog(`Download initiated: ${filename}`);
      }).catch(error => {
        showWarning(`Download failed: ${error.message}`);
        debugLog('Download failed: ' + error.message, 'error');
      });
    } catch (error) {
      showWarning(`Download error: ${error.message}`);
      debugLog('Download error: ' + error.message, 'error');
      console.error("Download error:", error);
    }
  });

  // Clear data button
  if (clearDataBtn) clearDataBtn.addEventListener('click', () => {
    chrome.storage.local.set({ extractedData: {} }, () => {
      currentExtractedData = {};
      extractedDataDisplay.textContent = "No data extracted yet.";
      tableContainer.innerHTML = "Select a table to view";
      tableSelect.innerHTML = "";
      tableSelect.classList.add('hidden');
      debugLog('Data cleared');
    });
  });

  // Chat functionality
  if (sendBtn) sendBtn.addEventListener('click', () => {
    sendMessage();
  });
  
  if (userMessage) userMessage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "clearChat" }, (response) => {
      chatHistory.innerHTML = '';
      debugLog('Chat history cleared');
    });
  });

  // Settings functionality
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;
    
    if (!apiKey) {
      showSettingsMessage("Please enter an API key", "error");
      debugLog('Missing API key in settings', 'error');
      return;
    }
    
    // Save OpenAI settings
    chrome.storage.local.set({ 
      openaiApiKey: apiKey,
      openaiModel: selectedModel
    });
    debugLog('OpenAI settings saved');
    
    // Save ServiceNow credentials if enabled
    const snSettings = {
      enabled: enableSN.checked
    };
    
    if (enableSN.checked) {
      if (!instanceInput.value || !usernameInput.value || !passwordInput.value) {
        showSettingsMessage("Please complete all ServiceNow credential fields", "error");
        debugLog('Incomplete ServiceNow credentials', 'error');
        return;
      }
      
      snSettings.instance = instanceInput.value.trim();
      snSettings.username = usernameInput.value.trim();
      snSettings.password = passwordInput.value.trim();
      debugLog('ServiceNow credentials saved');
    }
    
    chrome.storage.local.set({ snCredentials: snSettings }, () => {
      showSettingsMessage("Settings saved successfully!", "success");
      debugLog('All settings saved successfully');
    });
  });

  // Load saved data on popup open
  try {
    loadSavedData();
    loadChatHistory();
    loadSettings();
  } catch (error) {
    console.error("Error loading initial data:", error);
    debugLog('Error loading initial data: ' + error.message, 'error');
  }

  // Test OpenAI API Connection
  function testOpenAIConnection() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showSettingsMessage("Please enter an API key", "error");
      debugLog('Missing API key for test', 'error');
      return;
    }
    
    showLoading('Testing OpenAI connection...', false);
    debugLog('Testing OpenAI API connection');
    
    fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        hideLoading();
        showSettingsMessage("✅ OpenAI connection successful!", "success");
        debugLog('OpenAI connection test successful', 'info');
      } else {
        response.json().then(data => {
          hideLoading();
          showSettingsMessage(`❌ OpenAI connection failed: ${data.error?.message || response.statusText}`, "error");
          debugLog('OpenAI connection test failed: ' + (data.error?.message || response.statusText), 'error');
        }).catch(error => {
          hideLoading();
          showSettingsMessage(`❌ OpenAI connection failed: ${response.status} ${response.statusText}`, "error");
          debugLog('OpenAI connection test failed with status: ' + response.status, 'error');
        });
      }
    })
    .catch(error => {
      hideLoading();
      showSettingsMessage(`❌ OpenAI connection error: ${error.message}`, "error");
      debugLog('OpenAI connection error: ' + error.message, 'error');
    });
  }

  // Test ServiceNow Connection
  function testServiceNowConnection() {
    // Get ServiceNow credentials
    const instance = instanceInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    // Validate fields
    if (!instance || !username || !password) {
      snTestResult.textContent = 'Please fill in all ServiceNow credential fields';
      snTestResult.className = 'test-result error';
      snTestResult.style.display = 'block';
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        snTestResult.style.display = 'none';
      }, 5000);
      
      debugLog('Incomplete ServiceNow credentials for connection test', 'error');
      return;
    }
    
    // Show loading
    showLoading('Testing ServiceNow connection...', false);
    debugLog('Testing ServiceNow connection to ' + instance + '.service-now.com', 'info');
    
    // Build the URL to test (using a simple sys_user table query with limit=1)
    const url = `https://${instance}.service-now.com/api/now/table/sys_user?sysparm_limit=1`;
    
    // Create Basic Auth header
    const basicAuth = 'Basic ' + btoa(`${username}:${password}`);
    
    // Make the request
    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    .then(response => {
      hideLoading();
      
      debugLog('ServiceNow response status: ' + response.status, 'info');
      
      if (response.ok) {
        snTestResult.textContent = '✅ Connection successful! Your ServiceNow credentials are valid.';
        snTestResult.className = 'test-result success';
        debugLog('ServiceNow connection test successful', 'info');
      } else if (response.status === 401) {
        snTestResult.textContent = '❌ Authentication failed. Please check your username and password.';
        snTestResult.className = 'test-result error';
        debugLog('ServiceNow authentication failed', 'error');
      } else if (response.status === 404) {
        snTestResult.textContent = '❌ Instance not found. Please check your instance name.';
        snTestResult.className = 'test-result error';
        debugLog('ServiceNow instance not found: ' + instance, 'error');
      } else {
        snTestResult.textContent = `❌ Connection failed with status: ${response.status}. Please check your credentials.`;
        snTestResult.className = 'test-result error';
        debugLog('ServiceNow connection failed with status: ' + response.status, 'error');
      }
      
      snTestResult.style.display = 'block';
      
      // Don't auto-hide success messages
      if (!response.ok) {
        // Hide the message after 5 seconds
        setTimeout(() => {
          snTestResult.style.display = 'none';
        }, 5000);
      }
      
      return response.json().catch(() => null); // Try to parse JSON but don't fail if it's not valid
    })
    .catch(error => {
      hideLoading();
      
      snTestResult.textContent = `❌ Connection error: ${error.message}`;
      debugLog('ServiceNow connection error: ' + error.message, 'error');
      
      snTestResult.className = 'test-result error';
      snTestResult.style.display = 'block';
      
      // Hide the message after 5 seconds
      setTimeout(() => {
        snTestResult.style.display = 'none';
      }, 5000);
    });
  }

  // Helper functions
  function loadSavedData() {
    try {
      chrome.storage.local.get(['extractedData'], (result) => {
        if (chrome.runtime.lastError) {
          console.error("Error loading saved data:", chrome.runtime.lastError);
          debugLog('Error loading saved data: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (result.extractedData && Object.keys(result.extractedData).length > 0) {
          currentExtractedData = result.extractedData;
          debugLog('Loaded saved data');
          
          // Determine format
          if (result.extractedData.format === 'xml' || result.extractedData.xmlData) {
            currentFormat = 'xml';
            formatSelect.value = 'xml';
            debugLog('Data format: XML');
          } else {
            currentFormat = 'json';
            formatSelect.value = 'json';
            debugLog('Data format: JSON');
          }
          
          displayExtractedData(result.extractedData);
          checkAndDisplayWarning(result.extractedData);
        } else {
          debugLog('No saved data found');
        }
      });
    } catch (error) {
      console.error("Error in loadSavedData:", error);
      debugLog('Error in loadSavedData: ' + error.message, 'error');
    }
  }
  
  function displayExtractedData(data) {
    try {
      // Display in raw view
      if (currentFormat === 'xml' && data.xmlData) {
        extractedDataDisplay.textContent = data.xmlData;
        debugLog('Displayed XML data');
      } else {
        extractedDataDisplay.textContent = JSON.stringify(data, null, 2);
        debugLog('Displayed JSON data');
      }
      
      // Prepare table view data
      prepareTableView(data);
    } catch (error) {
      console.error("Error displaying data:", error);
      debugLog('Error displaying data: ' + error.message, 'error');
      extractedDataDisplay.textContent = "Error displaying data: " + error.message;
    }
  }
  
  function prepareTableView(data) {
    try {
      // Clear existing options
      tableSelect.innerHTML = '';
      tableSelect.classList.add('hidden');
      tableContainer.innerHTML = "Select a table to view";
      
      if (!data || typeof data !== 'object') {
        debugLog('No table data available');
        return;
      }
      
      // Find potential tables in the data
      const tables = [];
      
      // Check for ServiceNow list data
      if (data.listData && Array.isArray(data.listData) && data.listData.length > 0) {
        tables.push({ name: 'ListData', data: data.listData });
        debugLog(`Found ListData table with ${data.listData.length} records`);
      }
      
      // Check for ServiceNow API result
      if (data.result && Array.isArray(data.result) && data.result.length > 0) {
        tables.push({ name: 'QueryResult', data: data.result });
        debugLog(`Found QueryResult table with ${data.result.length} records`);
      }
      
      // Check for tables array
      if (data.tables && Array.isArray(data.tables) && data.tables.length > 0) {
        data.tables.forEach((table, index) => {
          if (table && table.rows && Array.isArray(table.rows) && table.rows.length > 0) {
            tables.push({ name: table.id || `Table_${index+1}`, data: table.rows });
            debugLog(`Found ${table.id || `Table_${index+1}`} with ${table.rows.length} records`);
          }
        });
      }
      
      // Check for nested properties that might be arrays of objects
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          // Only add if not already added
          if (!tables.find(t => t.name === key)) {
            tables.push({ name: key, data: value });
            debugLog(`Found ${key} array with ${value.length} objects`);
          }
        }
      }
      
      // If tables found, populate the select dropdown
      if (tables.length > 0) {
        tables.forEach(table => {
          const option = document.createElement('option');
          option.value = table.name;
          option.textContent = `${table.name} (${table.data.length} records)`;
          tableSelect.appendChild(option);
        });
        
        tableSelect.classList.remove('hidden');
        debugLog(`Added ${tables.length} tables to dropdown selector`);
        
        // Store the tables data for later use
        currentExtractedData._tables = tables;
        
        // Auto-render the first table
        renderSelectedTable(tables[0].name);
      } else {
        debugLog('No tables found in data');
      }
    } catch (error) {
      console.error("Error preparing table view:", error);
      debugLog('Error preparing table view: ' + error.message, 'error');
      tableContainer.innerHTML = "Error preparing table view: " + error.message;
    }
  }
  
  function renderTableView() {
    try {
      // Re-render the current selected table if available
      if (tableSelect.value) {
        renderSelectedTable(tableSelect.value);
      }
    } catch (error) {
      console.error("Error rendering table view:", error);
      debugLog('Error rendering table view: ' + error.message, 'error');
    }
  }
  
  function renderSelectedTable(tableName) {
    try {
      if (!currentExtractedData._tables) {
        debugLog('No table data available to render', 'warn');
        return;
      }
      
      const tableData = currentExtractedData._tables.find(t => t.name === tableName);
      if (!tableData || !tableData.data || !tableData.data.length) {
        tableContainer.innerHTML = "No data available for this table";
        debugLog('No data available for table: ' + tableName, 'warn');
        return;
      }
      
      debugLog(`Rendering table: ${tableName} with ${tableData.data.length} records`);
      
      // Create HTML table
      const table = document.createElement('table');
      table.className = 'data-table';
      
      // Create header row
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      // Get all possible column names from the data
      const columns = new Set();
      tableData.data.forEach(item => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach(key => columns.add(key));
        }
      });
      
      debugLog(`Table has ${columns.size} columns`);
      
      // Add header cells
      columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        headerRow.appendChild(th);
      });
      
      thead.appendChild(headerRow);
      table.appendChild(thead);
      
      // Create table body
      const tbody = document.createElement('tbody');
      
      // Add data rows
      tableData.data.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        
        const row = document.createElement('tr');
        
        columns.forEach(column => {
          const cell = document.createElement('td');
          const value = item[column];
          
          // Format cell content based on value type
          if (value === null || value === undefined) {
            cell.textContent = '';
          } else if (typeof value === 'object') {
            try {
              cell.textContent = JSON.stringify(value);
            } catch (e) {
              cell.textContent = '[Object]';
              debugLog(`Error stringifying cell value in row ${index}, column ${column}: ${e.message}`, 'warn');
            }
          } else {
            cell.textContent = String(value);
          }
          
          row.appendChild(cell);
        });
        
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      tableContainer.innerHTML = '';
      tableContainer.appendChild(table);
      debugLog(`Table ${tableName} rendered successfully`);
    } catch (error) {
      console.error("Error rendering selected table:", error);
      debugLog('Error rendering selected table: ' + error.message, 'error');
      tableContainer.innerHTML = "Error rendering table: " + error.message;
    }
  }
  
  function loadChatHistory() {
    try {
      chrome.storage.local.get(['chatHistory'], (result) => {
        if (chrome.runtime.lastError) {
          console.error("Error loading chat history:", chrome.runtime.lastError);
          debugLog('Error loading chat history: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (result.chatHistory && result.chatHistory.length > 0) {
          // Render chat history
          chatHistory.innerHTML = '';
          result.chatHistory.forEach(message => {
            if (message.role === 'user' || message.role === 'assistant') {
              appendMessage(message.role, message.content);
            }
          });
          debugLog(`Loaded chat history with ${result.chatHistory.length} messages`);
        } else {
          debugLog('No chat history found');
        }
      });
    } catch (error) {
      console.error("Error in loadChatHistory:", error);
      debugLog('Error in loadChatHistory: ' + error.message, 'error');
    }
  }
  
  function loadSettings() {
    try {
      chrome.storage.local.get(['openaiApiKey', 'openaiModel', 'snCredentials'], (result) => {
        if (chrome.runtime.lastError) {
          console.error("Error loading settings:", chrome.runtime.lastError);
          debugLog('Error loading settings: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (result.openaiApiKey) {
          apiKeyInput.value = result.openaiApiKey;
          debugLog('API key loaded');
        }
        
        if (result.openaiModel) {
          modelSelect.value = result.openaiModel;
          debugLog('Model preference loaded: ' + result.openaiModel);
        }
        
        if (result.snCredentials) {
          enableSN.checked = result.snCredentials.enabled;
          
          if (result.snCredentials.enabled) {
            snCredentials.classList.remove('hidden');
            debugLog('ServiceNow credentials loaded (enabled)');
            
            if (result.snCredentials.instance) {
              instanceInput.value = result.snCredentials.instance;
            }
            
            if (result.snCredentials.username) {
              usernameInput.value = result.snCredentials.username;
            }
            
            if (result.snCredentials.password) {
              passwordInput.value = result.snCredentials.password;
            }
          } else {
            debugLog('ServiceNow credentials loaded (disabled)');
          }
        }
        
        debugLog('Settings loaded successfully');
      });
    } catch (error) {
      console.error("Error in loadSettings:", error);
      debugLog('Error in loadSettings: ' + error.message, 'error');
    }
  }
  
  function sendMessage() {
    try {
      const message = userMessage.value.trim();
      if (!message) return;
      // Add user message to chat
      appendMessage('user', message);
      debugLog('User message sent: ' + (message.length > 30 ? message.substring(0, 30) + '...' : message));
      // Clear input
      userMessage.value = '';
      // Create assistant placeholder
      const assistantElem = appendMessage('assistant', 'AI is typing...');
      debugLog('Assistant typing placeholder added');
      // Send to background script for API call
      console.log('[Chat] Sending request to background script:', message);
      chrome.runtime.sendMessage(
        { action: 'openaiChat', message: message },
        (response) => {
          console.log('[Chat] Response from background script:', response);
          if (!response) {
            console.error('[Chat] No response received from background script');
            if (assistantElem) {
              assistantElem.classList.add('error');
              const errBody = assistantElem.querySelector('.message-body');
              if (errBody) errBody.textContent = 'No response received from extension backend. Please check the console for errors.';
            }
            debugLog('No response received from extension backend', 'error');
            return;
          }
          if (response.error) {
            console.error('[Chat] OpenAI error:', response.error);
            if (assistantElem) {
              assistantElem.classList.add('error');
              const errBody = assistantElem.querySelector('.message-body');
              if (errBody) errBody.textContent = `Error: ${response.error}`;
            }
            debugLog('OpenAI error: ' + response.error, 'error');
          } else if (response.reply) {
            if (assistantElem) {
              const body = assistantElem.querySelector('.message-body');
              if (body) body.textContent = response.reply;
            }
            debugLog('Added AI response to chat');
          } else {
            console.error('[Chat] Empty response from AI');
            if (assistantElem) {
              assistantElem.classList.add('error');
              const errBody = assistantElem.querySelector('.message-body');
              if (errBody) errBody.textContent = 'Received empty response from AI';
            }
            debugLog('Empty response from AI', 'error');
          }
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      debugLog('Error sending message: ' + error.message, 'error');
      appendMessage('error', `Error sending message: ${error.message}`);
    }
  }
  
  function appendMessage(role, content) {
    try {
      const messageElement = document.createElement('div');
      messageElement.classList.add('chat-message', role);
      
      const header = document.createElement('div');
      header.classList.add('message-header');
      header.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'System';
      
      const body = document.createElement('div');
      body.classList.add('message-body');
      body.textContent = content;
      
      messageElement.appendChild(header);
      messageElement.appendChild(body);
      
      chatHistory.appendChild(messageElement);
      
      // Scroll to bottom
      chatHistory.scrollTop = chatHistory.scrollHeight;
    } catch (error) {
      console.error("Error appending message:", error);
      debugLog('Error appending message: ' + error.message, 'error');
    }
  }
  
  function showSettingsMessage(message, type) {
    try {
      settingsMessage.textContent = message;
      settingsMessage.className = 'settings-message ' + type;
      
      debugLog('Settings message: ' + message + ' (' + type + ')', type === 'error' ? 'error' : 'info');
      
      // Clear the message after 3 seconds
      setTimeout(() => {
        settingsMessage.textContent = "";
        settingsMessage.className = 'settings-message';
      }, 3000);
    } catch (error) {
      console.error("Error showing settings message:", error);
      debugLog('Error showing settings message: ' + error.message, 'error');
    }
  }
  
  function checkAndDisplayWarning(data) {
    try {
      // Check for large data sets
      let showWarningMsg = null;
      
      // Check for large array of records
      if (data.result && Array.isArray(data.result) && data.result.length > 200) {
        showWarningMsg = `Warning: The data contains ${data.result.length} records, which may exceed the context window limit of GPT-4.1.`;
        debugLog(`Warning: Large result set (${data.result.length} records)`, 'warn');
      } else if (data.listData && Array.isArray(data.listData) && data.listData.length > 200) {
        showWarningMsg = `Warning: The data contains ${data.listData.length} records, which may exceed the context window limit of GPT-4.1.`;
        debugLog(`Warning: Large list data (${data.listData.length} records)`, 'warn');
      }
      
      // Check for large JSON string
      try {
        const dataStr = JSON.stringify(data);
        const sizeInKB = Math.round(dataStr.length / 1024);
        if (dataStr.length > 100000) {
          showWarningMsg = `Warning: The extracted data is very large (${sizeInKB} KB), which may exceed the context window limit of GPT-4.1.`;
          debugLog(`Warning: Large data size (${sizeInKB} KB)`, 'warn');
        }
      } catch (error) {
        console.error("Error stringifying data for warning check:", error);
        debugLog('Error checking data size: ' + error.message, 'error');
      }
      
      if (showWarningMsg) {
        showWarning(showWarningMsg);
      } else {
        warningBanner.classList.add('hidden');
      }
    } catch (error) {
      console.error("Error checking and displaying warning:", error);
      debugLog('Error checking data size for warnings: ' + error.message, 'error');
    }
  }
  
  function showWarning(message) {
    try {
      warningMessage.textContent = message;
      warningBanner.classList.remove('hidden');
      debugLog('Warning displayed: ' + message, 'warn');
    } catch (error) {
      console.error("Error showing warning:", error);
      debugLog('Error showing warning: ' + error.message, 'error');
    }
  }
  
  function updateProgress(percent, message = null) {
    try {
      // Update progress bar
      if (progressFill) {
        progressFill.style.width = `${percent}%`;
      }
      
      // Update percentage text
      if (progressPercentage) {
        progressPercentage.textContent = `${Math.round(percent)}%`;
      }
      
      // Update message if provided
      if (message && processingMessage) {
        processingMessage.textContent = message;
        debugLog(`Progress: ${percent}% - ${message}`);
      }
    } catch (error) {
      console.error("Error updating progress:", error);
      debugLog('Error updating progress: ' + error.message, 'error');
    }
  }
  
  function showLoading(message = "Processing...", showProgress = true) {
    try {
      if (processingMessage) processingMessage.textContent = message;
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');
      
      // Show or hide progress based on parameter
      if (progressFill && progressPercentage) {
        const progressContainer = document.querySelector('.progress-container');
        if (progressContainer) {
          if (showProgress) {
            progressContainer.style.display = 'block';
            // Reset progress bar
            updateProgress(0);
          } else {
            progressContainer.style.display = 'none';
          }
        }
      }
      
      debugLog('Loading shown: ' + message + (showProgress ? ' with progress' : ' without progress'));
    } catch (error) {
      console.error("Error showing loading:", error);
      debugLog('Error showing loading: ' + error.message, 'error');
    }
  }
  
  function hideLoading() {
    try {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      debugLog('Loading hidden');
    } catch (error) {
      console.error("Error hiding loading:", error);
      debugLog('Error hiding loading: ' + error.message, 'error');
    }
  }
  
  // Debug functionality
  function debugLog(message, level = 'info') {
    if (!debugMode) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const prefix = level === 'error' ? '❌ ' : 
                  level === 'warn' ? '⚠️ ' : 
                  '🔹 ';
    
    // Log to console
    const consoleMethod = level === 'error' ? console.error : 
                         level === 'warn' ? console.warn : 
                         console.log;
    consoleMethod(`[${timestamp}] ${prefix}${message}`);
    
    // Send to background page for potential logging
    try {
      chrome.runtime.sendMessage({
        action: "logDebug",
        message: message,
        level: level,
        timestamp: timestamp
      });
    } catch (e) {
      // Silent fail - don't want to cause issues if messaging fails
    }
  }
  
  // XML conversion helper
  function jsonToXml(json) {
    try {
      // Simple JSON to XML conversion
      let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
      
      function parseObject(obj, parentName) {
        let xmlStr = '';
        
        for (const [key, value] of Object.entries(obj)) {
          if (value === null || value === undefined) {
            xmlStr += `<${key}></${key}>\n`;
          } else if (typeof value === 'object') {
            if (Array.isArray(value)) {
              xmlStr += `<${key}>\n`;
              value.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                  xmlStr += `<item>\n${parseObject(item, 'item')}</item>\n`;
                } else {
                  xmlStr += `<item>${escapeXml(item)}</item>\n`;
                }
              });
              xmlStr += `</${key}>\n`;
            } else {
              xmlStr += `<${key}>\n${parseObject(value, key)}</${key}>\n`;
            }
          } else {
            xmlStr += `<${key}>${escapeXml(value)}</${key}>\n`;
          }
        }
        
        return xmlStr;
      }
      
      function escapeXml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;");
      }
      
      xml += `<root>\n${parseObject(json, 'root')}</root>`;
      return xml;
    } catch (error) {
      console.error("Error converting JSON to XML:", error);
      debugLog('Error converting JSON to XML: ' + error.message, 'error');
      return `<?xml version="1.0" encoding="UTF-8" ?>\n<root>\n<e>${error.message}</e>\n</root>`;
    }
  }
}

// This function will be injected into the page to extract data
function extractDataFromPage(format) {
  // ServiceNow specific extraction - modify as needed
  try {
    let extractedData = {
      format: format || 'json'
    };
    
    // Track extracted record count for progress reporting
    let recordsExtracted = 0;
    
    // Extract data from ServiceNow
    if (window.location.href.includes('service-now.com')) {
      // Try to get form data if on a form
      try {
        const formElements = document.querySelectorAll('.form-group input, .form-group select, .form-group textarea');
        
        if (formElements.length > 0) {
          extractedData.formData = {};
          formElements.forEach(element => {
            if (element.id && element.value) {
              extractedData.formData[element.id] = element.value;
              recordsExtracted++;
            }
          });
          console.log(`Extracted ${Object.keys(extractedData.formData).length} form fields`);
        }
      } catch (formError) {
        console.error("Error extracting form data:", formError);
      }
      
      // Try to get list data if on a list
      try {
        const listElements = document.querySelectorAll('table.list_table tr');
        if (listElements.length > 0) {
          extractedData.listData = [];
          
          // Get headers
          const headers = [];
          const headerRow = document.querySelector('table.list_table tr.list_header');
          if (headerRow) {
            const headerCells = headerRow.querySelectorAll('th');
            headerCells.forEach(cell => {
              headers.push(cell.textContent.trim());
            });
            console.log(`Found list table with ${headers.length} columns`);
          }
          
          // Get rows
          const dataRows = document.querySelectorAll('table.list_table tr.list_row');
          dataRows.forEach((row, rowIndex) => {
            const rowData = {};
            const cells = row.querySelectorAll('td');
            cells.forEach((cell, index) => {
              if (headers[index]) {
                rowData[headers[index]] = cell.textContent.trim();
              }
            });
            extractedData.listData.push(rowData);
            recordsExtracted++;
            
            // Log progress for large tables
            if (dataRows.length > 100 && rowIndex % 50 === 0) {
              console.log(`Extracted ${rowIndex + 1} of ${dataRows.length} list rows`);
            }
          });
          console.log(`Extracted ${extractedData.listData.length} list rows`);
        }
      } catch (listError) {
        console.error("Error extracting list data:", listError);
      }
      
      // Try to get ALL tables on the page
      try {
        const allTables = document.querySelectorAll('table');
        if (allTables.length > 0) {
          extractedData.tables = [];
          console.log(`Found ${allTables.length} tables on page`);
          
          allTables.forEach((table, tableIndex) => {
            try {
              if (!table) return;
              
              const tableData = {
                id: table.id || `table_${tableIndex}`,
                rows: []
              };
              
              // Get headers
              const headers = [];
              const headerRow = table.querySelector('tr:first-child');
              if (headerRow) {
                const headerCells = headerRow.querySelectorAll('th, td');
                headerCells.forEach(cell => {
                  headers.push(cell.textContent.trim());
                });
                console.log(`Table ${tableIndex + 1} has ${headers.length} columns`);
              }
              
              // Get rows (skip the header row)
              const dataRows = table.querySelectorAll('tr:not(:first-child)');
              dataRows.forEach((row, rowIndex) => {
                const rowData = {};
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                  if (headers[index]) {
                    rowData[headers[index]] = cell.textContent.trim();
                  } else {
                    rowData[`column_${index}`] = cell.textContent.trim();
                  }
                });
                
                // Only add non-empty rows
                if (Object.keys(rowData).length > 0) {
                  tableData.rows.push(rowData);
                  recordsExtracted++;
                }
                
                // Log progress for large tables
                if (dataRows.length > 200 && rowIndex % 100 === 0) {
                  console.log(`Table ${tableIndex + 1}: Processed ${rowIndex + 1} of ${dataRows.length} rows`);
                }
              });
              
              // Only add tables with data
              if (tableData.rows.length > 0) {
                extractedData.tables.push(tableData);
                console.log(`Table ${tableIndex + 1} has ${tableData.rows.length} rows of data`);
              }
            } catch (tableError) {
              console.error(`Error processing table ${tableIndex}:`, tableError);
            }
          });
          
          // Remove tables array if empty
          if (extractedData.tables.length === 0) {
            delete extractedData.tables;
          } else {
            console.log(`Successfully extracted ${extractedData.tables.length} tables`);
          }
        }
      } catch (tablesError) {
        console.error("Error extracting tables:", tablesError);
      }
    } else {
      // Generic data extraction for non-ServiceNow pages
      extractedData.title = document.title;
      extractedData.url = window.location.href;
      extractedData.metaTags = {};
      
      // Extract meta tags
      try {
        document.querySelectorAll('meta').forEach(meta => {
          if (meta.name && meta.content) {
            extractedData.metaTags[meta.name] = meta.content;
          }
        });
        console.log(`Extracted ${Object.keys(extractedData.metaTags).length} meta tags`);
      } catch (metaError) {
        console.error("Error extracting meta tags:", metaError);
      }
      
      // Extract main text content
      try {
        const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
        const paragraphs = mainContent.querySelectorAll('p');
        
        if (paragraphs.length > 0) {
          extractedData.textContent = Array.from(paragraphs)
            .map(p => p.textContent.trim())
            .filter(text => text.length > 0)
            .join('\n\n');
          console.log(`Extracted text content from ${paragraphs.length} paragraphs`);
        }
      } catch (textError) {
        console.error("Error extracting text content:", textError);
      }
      
      // Extract all tables on the page
      try {
        const allTables = document.querySelectorAll('table');
        if (allTables.length > 0) {
          extractedData.tables = [];
          console.log(`Found ${allTables.length} tables on page`);
          
          allTables.forEach((table, tableIndex) => {
            try {
              const tableData = {
                id: table.id || `table_${tableIndex}`,
                rows: []
              };
              
              // Get headers
              const headers = [];
              const headerRow = table.querySelector('tr:first-child');
              if (headerRow) {
                const headerCells = headerRow.querySelectorAll('th, td');
                headerCells.forEach(cell => {
                  headers.push(cell.textContent.trim());
                });
                console.log(`Table ${tableIndex + 1} has ${headers.length} columns`);
              }
              
              // Get rows (skip the header row)
              const dataRows = table.querySelectorAll('tr:not(:first-child)');
              dataRows.forEach((row, rowIndex) => {
                const rowData = {};
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                  if (headers[index]) {
                    rowData[headers[index]] = cell.textContent.trim();
                  } else {
                    rowData[`column_${index}`] = cell.textContent.trim();
                  }
                });
                
                // Only add non-empty rows
                if (Object.keys(rowData).length > 0) {
                  tableData.rows.push(rowData);
                  recordsExtracted++;
                }
                
                // Log progress for large tables
                if (dataRows.length > 200 && rowIndex % 100 === 0) {
                  console.log(`Table ${tableIndex + 1}: Processed ${rowIndex + 1} of ${dataRows.length} rows`);
                }
              });
              
              // Only add tables with data
              if (tableData.rows.length > 0) {
                extractedData.tables.push(tableData);
                console.log(`Table ${tableIndex + 1} has ${tableData.rows.length} rows of data`);
              }
            } catch (tableError) {
              console.error(`Error processing table ${tableIndex}:`, tableError);
            }
          });
          
          // Remove tables array if empty
          if (extractedData.tables.length === 0) {
            delete extractedData.tables;
          } else {
            console.log(`Successfully extracted ${extractedData.tables.length} tables`);
          }
        }
      } catch (tablesError) {
        console.error("Error extracting tables:", tablesError);
      }
    }
    
    // Add record count for progress reporting
    extractedData._recordCount = recordsExtracted;
    console.log(`Total records extracted: ${recordsExtracted}`);
    
    // Convert to XML if requested
    if (format === 'xml') {
      try {
        console.log('Converting data to XML format');
        // Simple JSON to XML conversion
        function jsonToXml(obj) {
          let xml = '<?xml version="1.0" encoding="UTF-8" ?>\n';
          
          function parseObject(obj, name) {
            let xmlStr = '';
            
            if (Array.isArray(obj)) {
              obj.forEach((item, index) => {
                const itemName = name.endsWith('s') ? name.slice(0, -1) : 'item';
                if (typeof item === 'object' && item !== null) {
                  xmlStr += `<${itemName}>\n${parseObject(item, itemName)}</${itemName}>\n`;
                } else {
                  xmlStr += `<${itemName}>${escapeXml(item)}</${itemName}>\n`;
                }
              });
              return xmlStr;
            } else if (typeof obj === 'object' && obj !== null) {
              for (const [key, value] of Object.entries(obj)) {
                if (value === null) {
                  xmlStr += `<${key}></${key}>\n`;
                } else if (typeof value === 'object') {
                  xmlStr += `<${key}>\n${parseObject(value, key)}</${key}>\n`;
                } else {
                  xmlStr += `<${key}>${escapeXml(value)}</${key}>\n`;
                }
              }
              return xmlStr;
            } else {
              return escapeXml(obj);
            }
          }
          
          
          function escapeXml(unsafe) {
            if (unsafe === null || unsafe === undefined) return '';
            return String(unsafe)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&apos;");
          }
          
          xml += `<data>\n${parseObject(obj, 'data')}</data>`;
          console.log('XML conversion complete');
          return xml;
        }
        
        const xmlData = jsonToXml(extractedData);
        extractedData = {
          xmlData: xmlData,
          format: 'xml',
          originalData: extractedData,  // Keep the original JSON for reference
          _recordCount: recordsExtracted
        };
      } catch (xmlError) {
        console.error("Error converting to XML:", xmlError);
        // Fall back to JSON
        extractedData.format = 'json';
        extractedData.xmlError = xmlError.message;
      }
    }
    
    return extractedData;
  } catch (error) {
    console.error("Extraction error:", error);
    return { 
      error: error.message, 
      format: format || 'json',
      stack: error.stack
    };
  }
}