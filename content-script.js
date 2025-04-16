/**
 * ServiceNow Extractor Content Script
 * 
 * This script runs in the context of ServiceNow pages and extracts record data.
 */

// Debug mode flag - will be set from storage
let DEBUG_MODE = false;

// Initialize the extension when the content script loads
initializeExtractor();

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'extractRecords') {
    extractRecords(message.config);
    sendResponse({ status: 'started' });
  } else if (message.action === 'getSessionToken') {
    // New handler to get session token
    getSessionToken().then(token => {
      sendResponse({ success: true, token: token });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
  return true; // Keep the message channel open for async responses
});

// Initialize the extractor and load settings
async function initializeExtractor() {
  // Load settings
  try {
    const settings = await chrome.storage.local.get('enableDebug');
    DEBUG_MODE = settings.enableDebug || false;
    
    if (DEBUG_MODE) {
      console.log('ServiceNow Extractor initialized in debug mode');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  
  // Check if we're on a ServiceNow page
  if (isServiceNowPage()) {
    if (DEBUG_MODE) {
      console.log('ServiceNow page detected');
    }
  }
}

// Check if we're on a ServiceNow page
function isServiceNowPage() {
  return (
    window.location.hostname.includes('service-now.com') || 
    document.querySelector('meta[name="servicenow"]') !== null ||
    typeof window.g_ck !== 'undefined' ||
    document.querySelector('script[src*="nav_service_now"]') !== null
  );
}

// Get ServiceNow session token using multiple methods
async function getSessionToken() {
  // Method 1: Direct access to g_ck
  if (typeof window.g_ck !== 'undefined' && window.g_ck) {
    if (DEBUG_MODE) console.log('Found g_ck directly in window object');
    return window.g_ck;
  }
  
  // Method 2: Try to extract from any REST header (more reliable)
  try {
    // This new method checks document cookies directly
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith('glide_user_session=') || cookie.startsWith('JSESSIONID=')) {
        if (DEBUG_MODE) console.log('Found potential session identifier in cookies');
        
        // Now try to fetch a simple endpoint to get the actual token from response headers
        const testResponse = await fetch('/api/now/table/sys_user?sysparm_limit=1', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-UserToken': ''  // Empty to force the server to include the token in response
          }
        });
        
        // Check if we get a response with an X-UserToken header
        const userToken = testResponse.headers.get('X-UserToken');
        if (userToken) {
          if (DEBUG_MODE) console.log('Extracted token from response headers');
          return userToken;
        }
      }
    }
  } catch (error) {
    console.error('Error with session check:', error);
  }
  
  // Method 3: Inject script to get g_ck from page context
  try {
    const token = await injectAndGetSessionToken();
    if (token) {
      if (DEBUG_MODE) console.log('Found g_ck via script injection');
      return token;
    }
  } catch (error) {
    console.error('Error injecting script:', error);
  }
  
  // Method 4: Look for token in forms
  const tokenInput = document.querySelector('input[name="sysparm_ck"]');
  if (tokenInput && tokenInput.value) {
    if (DEBUG_MODE) console.log('Found token in sysparm_ck input');
    return tokenInput.value;
  }
  
  // Method 5: Try to extract from any ServiceNow REST API request
  const restToken = await extractTokenFromRESTRequest();
  if (restToken) {
    if (DEBUG_MODE) console.log('Extracted token from REST request');
    return restToken;
  }
  
  // Method 6: Check in cookies
  const glideSession = document.cookie.split('; ').find(row => row.startsWith('glide_session_token='));
  if (glideSession) {
    const token = glideSession.split('=')[1];
    if (DEBUG_MODE) console.log('Found token in cookies');
    return token;
  }
  
  // Add a clearer error message if all else fails
  throw new Error('Could not obtain ServiceNow session token. Please ensure you are logged in to ServiceNow, refresh the page, and try again.');
}

// Inject script into page to access g_ck in page context
function injectAndGetSessionToken() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Create a custom event to pass the token back to content script
        const tokenEvent = new CustomEvent('sn-token-event', { detail: { token: window.g_ck || '' } });
        document.dispatchEvent(tokenEvent);
      })();
    `;
    
    // Listen for the custom event from the injected script
    document.addEventListener('sn-token-event', function(event) {
      if (event.detail && event.detail.token) {
        resolve(event.detail.token);
      } else {
        reject(new Error('Token not found in page context'));
      }
    }, { once: true });
    
    // Add script to page
    document.head.appendChild(script);
    
    // Remove script after execution
    setTimeout(() => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, 100);
    
    // Set a timeout in case the event never fires
    setTimeout(() => {
      reject(new Error('Timeout getting token from page context'));
    }, 1000);
  });
}

// Attempt to extract token from any REST request the page makes
function extractTokenFromRESTRequest() {
  return new Promise((resolve) => {
    // Create a proxy for the native XMLHttpRequest
    const originalXHR = window.XMLHttpRequest;
    
    // Replace with our instrumented version
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      
      // Override the open method to intercept requests
      xhr.open = function() {
        const method = arguments[0];
        const url = arguments[1];
        
        // Check if this is a ServiceNow REST API request
        if (url && url.includes('/api/now/')) {
          // Intercept the send method to capture headers
          const originalSend = xhr.send;
          xhr.send = function() {
            // Get the X-UserToken header if present
            const token = xhr.getRequestHeader('X-UserToken');
            if (token) {
              resolve(token);
            }
            return originalSend.apply(this, arguments);
          };
        }
        
        return originalOpen.apply(this, arguments);
      };
      
      return xhr;
    };
    
    // Restore original after a short time
    setTimeout(() => {
      window.XMLHttpRequest = originalXHR;
      resolve(null); // Resolve with null if no token found
    }, 2000);
  });
}

// Main extraction function
async function extractRecords(config) {
  try {
    // Verify we're on a ServiceNow page
    if (!isServiceNowPage()) {
      throw new Error('Not a ServiceNow page.');
    }
    
    // Get session token with retry
    let sessionToken;
    try {
      sessionToken = await getSessionToken();
      if (!sessionToken) {
        throw new Error('Session token is empty');
      }
    } catch (error) {
      console.error('Failed to get session token:', error);
      
      // Wait and retry once more
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        sessionToken = await getSessionToken();
        if (!sessionToken) {
          throw new Error('Session token is empty after retry');
        }
      } catch (retryError) {
        throw new Error('ServiceNow session token (g_ck) not found. You might need to log in and refresh the page.');
      }
    }
    
    if (DEBUG_MODE) {
      console.log('Starting extraction with config:', config);
      console.log('Session token found:', sessionToken.substring(0, 5) + '...');
    }
    
    let recordIds = [];
    let currentTable = '';
    
    // Determine extraction type
    if (config.extractionType === 'current-page') {
      // Extract current record
      const currentId = getCurrentRecordSysId();
      if (!currentId) {
        throw new Error('Could not determine current record ID.');
      }
      
      currentTable = getCurrentTable();
      recordIds = [currentId];
      
      if (DEBUG_MODE) {
        console.log(`Extracting current record: ${currentId} from table: ${currentTable}`);
      }
    } else if (config.extractionType === 'list-view') {
      // Extract all records in the current list view
      currentTable = getCurrentTable();
      recordIds = getVisibleRecordIds();
      
      if (DEBUG_MODE) {
        console.log(`Found ${recordIds.length} records in list view of table: ${currentTable}`);
        console.log('First few record IDs:', recordIds.slice(0, 3));
      }
      
      if (recordIds.length === 0) {
        throw new Error('No records found in current list view. Make sure you are viewing a list of records.');
      }
    } else if (config.extractionType === 'query') {
      // Extract records based on custom query
      currentTable = config.queryTable;
      recordIds = await queryRecords(config.queryTable, config.queryFilter, config.queryLimit, sessionToken);
      
      if (DEBUG_MODE) {
        console.log(`Query returned ${recordIds.length} records from table: ${currentTable}`);
      }
    }
    
    // Send initial progress
    chrome.runtime.sendMessage({
      action: 'extractionProgress',
      percent: 0,
      recordCount: recordIds.length
    });
    
    // Extract records in batches
    const extractedRecords = [];
    
    for (let i = 0; i < recordIds.length; i += config.batchSize) {
      const batchIds = recordIds.slice(i, i + config.batchSize);
      
      if (DEBUG_MODE) {
        console.log(`Processing batch ${Math.floor(i/config.batchSize) + 1}/${Math.ceil(recordIds.length/config.batchSize)}`);
      }
      
      for (const sysId of batchIds) {
        const recordData = await fetchRecordData(currentTable, sysId, config.outputFormat, sessionToken);
        if (recordData) {
          extractedRecords.push(recordData);
        }
        
        // Update progress
        const progress = Math.round((extractedRecords.length / recordIds.length) * 100);
        chrome.runtime.sendMessage({
          action: 'extractionProgress',
          percent: progress,
          recordCount: extractedRecords.length
        });
        
        // Delay to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, config.requestDelay));
      }
    }
    
    // Store the extracted data
    chrome.storage.local.set({
      extractedData: {
        records: extractedRecords,
        format: config.outputFormat,
        table: currentTable,
        timestamp: new Date().toISOString()
      }
    });
    
    // Send final progress
    chrome.runtime.sendMessage({
      action: 'extractionProgress',
      percent: 100,
      recordCount: extractedRecords.length
    });
    
    if (DEBUG_MODE) {
      console.log(`Extraction complete. Extracted ${extractedRecords.length} records.`);
    }
    
  } catch (error) {
    console.error('Extraction error:', error);
    chrome.runtime.sendMessage({
      action: 'extractionError',
      error: error.message
    });
  }
}

// Get current record sys_id
function getCurrentRecordSysId() {
  // Try multiple methods to get the sys_id
  
  // Method 1: Get from URL
  const sysIdMatch = window.location.search.match(/[?&]sys_id=([^&]+)/);
  if (sysIdMatch && sysIdMatch[1]) {
    if (DEBUG_MODE) console.log('Found sys_id in URL:', sysIdMatch[1]);
    return sysIdMatch[1];
  }
  
  // Method 2: Get from g_form
  if (typeof window.g_form !== 'undefined' && window.g_form) {
    try {
      const sysId = window.g_form.getUniqueValue();
      if (sysId) {
        if (DEBUG_MODE) console.log('Found sys_id from g_form:', sysId);
        return sysId;
      }
    } catch (e) {
      if (DEBUG_MODE) console.log('Error getting sys_id from g_form:', e);
    }
  }
  
  // Method 3: Look for hidden input with sys_id
  const sysIdInput = document.querySelector('input[name="sys_id"]');
  if (sysIdInput && sysIdInput.value) {
    if (DEBUG_MODE) console.log('Found sys_id in form input:', sysIdInput.value);
    return sysIdInput.value;
  }
  
  // Method 4: Look for form data attribute
  const formElement = document.querySelector('form[data-record-id]');
  if (formElement && formElement.getAttribute('data-record-id')) {
    if (DEBUG_MODE) console.log('Found sys_id in form data attribute:', formElement.getAttribute('data-record-id'));
    return formElement.getAttribute('data-record-id');
  }
  
  if (DEBUG_MODE) console.log('Could not find sys_id');
  return null;
}

// Get current table
function getCurrentTable() {
  // Try multiple methods to get the table name
  
  // Method 1: Get from URL
  const tableMatch = window.location.pathname.match(/\/([a-zA-Z0-9_]+)\.do/);
  if (tableMatch && tableMatch[1]) {
    if (DEBUG_MODE) console.log('Found table in URL:', tableMatch[1]);
    return tableMatch[1];
  }
  
  // Method 2: Get from g_form
  if (typeof window.g_form !== 'undefined' && window.g_form) {
    try {
      const tableName = window.g_form.getTableName();
      if (tableName) {
        if (DEBUG_MODE) console.log('Found table from g_form:', tableName);
        return tableName;
      }
    } catch (e) {
      if (DEBUG_MODE) console.log('Error getting table from g_form:', e);
    }
  }
  
  // Method 3: Look for list header
  const listHeader = document.querySelector('.list_header_title');
  if (listHeader) {
    const headerText = listHeader.textContent.trim();
    if (DEBUG_MODE) console.log('Found potential table from list header:', headerText);
    return headerText;
  }
  
  // Method 4: Look for data-table attribute in list
  const listContainer = document.querySelector('[data-table]');
  if (listContainer && listContainer.getAttribute('data-table')) {
    if (DEBUG_MODE) console.log('Found table in data attribute:', listContainer.getAttribute('data-table'));
    return listContainer.getAttribute('data-table');
  }
  
  // Default fallback - extract from breadcrumbs or title
  const title = document.title;
  const titleMatch = title.match(/([a-zA-Z0-9_]+)(?: -|:|$)/);
  if (titleMatch && titleMatch[1]) {
    if (DEBUG_MODE) console.log('Extracted table from page title:', titleMatch[1]);
    return titleMatch[1].toLowerCase();
  }
  
  if (DEBUG_MODE) console.log('Could not determine table name, defaulting to "incident"');
  return 'incident'; // Default to a common table as fallback
}

// Get all sys_ids from the current list view - improved to handle different ServiceNow UI structures
function getVisibleRecordIds() {
  if (DEBUG_MODE) console.log('Looking for record IDs in list view...');
  
  // Try multiple selectors for different ServiceNow versions/UIs
  const sysIds = new Set();
  
  // Method 1: Standard list rows
  document.querySelectorAll('tr.list_row, tr[sys_id]').forEach(row => {
    const sysId = row.getAttribute('sys_id') || row.getAttribute('id')?.replace('row_', '');
    if (sysId && sysId.length > 10) { // Valid sys_ids are typically 32 chars
      sysIds.add(sysId);
    }
  });
  
  // Method 2: List v2/v3 cells with data attributes
  document.querySelectorAll('[data-list-row-id], [data-sys-id]').forEach(elem => {
    const sysId = elem.getAttribute('data-list-row-id') || elem.getAttribute('data-sys-id');
    if (sysId && sysId.length > 10) {
      sysIds.add(sysId);
    }
  });
  
  // Method 3: List item links
  document.querySelectorAll('a[href*="sys_id="]').forEach(link => {
    const sysIdMatch = link.getAttribute('href').match(/sys_id=([^&]+)/);
    if (sysIdMatch && sysIdMatch[1] && sysIdMatch[1].length > 10) {
      sysIds.add(sysIdMatch[1]);
    }
  });
  
  // Method 4: Hidden inputs in list forms
  document.querySelectorAll('input[name="sys_id"][type="hidden"]').forEach(input => {
    if (input.value && input.value.length > 10) {
      sysIds.add(input.value);
    }
  });
  
  // Method 5: Try getting list from ServiceNow global vars (for newest UI)
  try {
    if (window.NOW && window.NOW.listXMLExport && window.NOW.listXMLExport.getListIDs) {
      const nowIds = window.NOW.listXMLExport.getListIDs();
      if (nowIds && nowIds.length) {
        for (let i = 0; i < nowIds.length; i++) {
          if (nowIds[i] && nowIds[i].length > 10) {
            sysIds.add(nowIds[i]);
          }
        }
      }
    }
  } catch (e) {
    if (DEBUG_MODE) console.log('Error accessing NOW.listXMLExport:', e);
  }
  
  // Method 6: Try getting all rows via injected script
  injectGetAllRowsScript().then(ids => {
    if (ids && ids.length) {
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] && ids[i].length > 10) {
          sysIds.add(ids[i]);
        }
      }
    }
  }).catch(e => {
    if (DEBUG_MODE) console.log('Error with injected row script:', e);
  });
  
  // Convert Set to Array
  const uniqueSysIds = Array.from(sysIds);
  
  if (DEBUG_MODE) {
    console.log(`Found ${uniqueSysIds.length} record IDs with these methods`);
    
    // Debug UI structure if no records found
    if (uniqueSysIds.length === 0) {
      console.log('No records found. Debugging UI structure:');
      console.log('List rows found:', document.querySelectorAll('tr.list_row, tr[sys_id]').length);
      console.log('Data attributes found:', document.querySelectorAll('[data-list-row-id], [data-sys-id]').length);
      console.log('Links with sys_id found:', document.querySelectorAll('a[href*="sys_id="]').length);
      console.log('Hidden inputs found:', document.querySelectorAll('input[name="sys_id"][type="hidden"]').length);
      
      // Try to guess the structure by looking at the DOM
      const listTables = document.querySelectorAll('table.list_table, table.list_v2, table.list_v3');
      console.log('List tables found:', listTables.length);
      if (listTables.length > 0) {
        const firstTable = listTables[0];
        console.log('First list table rows:', firstTable.querySelectorAll('tr').length);
        console.log('First list table structure:', firstTable.innerHTML.substring(0, 500) + '...');
      }
    }
  }
  
  return uniqueSysIds;
}

// Inject script to get all row IDs from any ServiceNow list UI
function injectGetAllRowsScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          // Try different methods to get list rows
          let rowIds = [];
          
          // Method 1: Standard list object
          if (typeof g_list !== 'undefined' && g_list) {
            if (typeof g_list.getChecked === 'function') {
              // We can use g_list to get all rows
              const allRows = [];
              
              // This is a bit of a hack, but it works in many cases
              // Save the original alert function and replace it temporarily
              const originalAlert = window.alert;
              window.alert = function() {}; // Suppress alerts
              
              // Mark all rows as checked
              if (typeof GlideList2 !== 'undefined' && typeof GlideList2.checkAll === 'function') {
                GlideList2.checkAll(true);
              } else if (typeof g_list.checkAll === 'function') {
                g_list.checkAll(true);
              }
              
              // Get all checked rows
              const checkedRows = g_list.getChecked();
              
              // Uncheck all rows
              if (typeof GlideList2 !== 'undefined' && typeof GlideList2.checkAll === 'function') {
                GlideList2.checkAll(false);
              } else if (typeof g_list.checkAll === 'function') {
                g_list.checkAll(false);
              }
              
              // Restore original alert function
              window.alert = originalAlert;
              
              if (checkedRows && checkedRows.length) {
                rowIds = rowIds.concat(checkedRows);
              }
            }
          }
          
          // Method 2: GlideList2 objects (newer UI)
          if (typeof GlideList2 !== 'undefined') {
            // Find all list IDs
            const listIds = [];
            for (let prop in window) {
              if (prop.startsWith('g_list_') && window[prop] instanceof GlideList2) {
                listIds.push(prop);
              }
            }
            
            // Try to get rows from each list
            for (let i = 0; i < listIds.length; i++) {
              const list = window[listIds[i]];
              if (list && typeof list.getChecked === 'function') {
                // Same technique as above
                const originalAlert = window.alert;
                window.alert = function() {};
                
                try {
                  list.checkAll(true);
                  const checkedRows = list.getChecked();
                  list.checkAll(false);
                  
                  if (checkedRows && checkedRows.length) {
                    rowIds = rowIds.concat(checkedRows);
                  }
                } catch (e) {
                  // Ignore errors
                }
                
                window.alert = originalAlert;
              }
            }
          }
          
          // Method 3: NOW table API (newest UI)
          if (typeof NOW !== 'undefined' && NOW.listXMLExport && NOW.listXMLExport.getListIDs) {
            const nowIds = NOW.listXMLExport.getListIDs();
            if (nowIds && nowIds.length) {
              rowIds = rowIds.concat(nowIds);
            }
          }
          
          // Deduplicate
          const uniqueIds = [...new Set(rowIds)];
          
          // Create a custom event to pass the IDs back to content script
          const rowIdsEvent = new CustomEvent('sn-row-ids-event', { 
            detail: { rowIds: uniqueIds } 
          });
          document.dispatchEvent(rowIdsEvent);
        } catch (e) {
          // Send error event
          const errorEvent = new CustomEvent('sn-row-ids-error', { 
            detail: { error: e.message } 
          });
          document.dispatchEvent(errorEvent);
        }
      })();
    `;
    
    // Listen for the custom event from the injected script
    document.addEventListener('sn-row-ids-event', function(event) {
      if (event.detail && event.detail.rowIds) {
        resolve(event.detail.rowIds);
      } else {
        resolve([]);
      }
    }, { once: true });
    
    // Listen for error event
    document.addEventListener('sn-row-ids-error', function(event) {
      if (event.detail && event.detail.error) {
        reject(new Error(event.detail.error));
      } else {
        reject(new Error('Unknown error getting row IDs'));
      }
    }, { once: true });
    
    // Add script to page
    document.head.appendChild(script);
    
    // Remove script after execution
    setTimeout(() => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, 500);
    
    // Set a timeout in case the event never fires
    setTimeout(() => {
      resolve([]); // Resolve with empty array if events don't fire
    }, 2000);
  });
}

// Query records based on filter
async function queryRecords(table, filter, limit, sessionToken) {
  if (DEBUG_MODE) console.log(`Querying ${table} with filter: ${filter}, limit: ${limit}`);
  
  const url = `/api/now/table/${table}?sysparm_query=${encodeURIComponent(filter)}&sysparm_limit=${limit}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-UserToken': sessionToken
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.result || !Array.isArray(data.result)) {
      throw new Error('Invalid response format from ServiceNow API');
    }
    
    return data.result.map(record => record.sys_id);
  } catch (error) {
    console.error(`Error querying records:`, error);
    throw error;
  }
}

// Fetch a single record
async function fetchRecordData(table, sysId, format, sessionToken) {
  if (DEBUG_MODE) console.log(`Fetching ${format} data for ${table}.${sysId}`);
  
  const url = `/api/now/table/${table}/${sysId}?sysparm_display_value=all&sysparm_exclude_reference_link=true`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': format === 'xml' ? 'application/xml' : 'application/json',
        'X-UserToken': sessionToken
      }
    });
    
    if (!response.ok) {
      if (DEBUG_MODE) console.error(`Error fetching record ${sysId}: HTTP ${response.status}`);
      return null;
    }
    
    if (format === 'xml') {
      const xmlText = await response.text();
      return {
        sys_id: sysId,
        xml_data: xmlText
      };
    } else {
      const jsonData = await response.json();
      return jsonData.result;
    }
  } catch (error) {
    console.error(`Error fetching record ${sysId}:`, error);
    return null;
  }
}