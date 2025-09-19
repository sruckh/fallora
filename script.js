const form = document.getElementById('generate-form');
const generateButton = form.querySelector('button');
const loraContainer = document.getElementById('lora-container');
const addLoraBtn = document.getElementById('add-lora');
const loadingOverlay = document.getElementById('loading-overlay');
const baseModelSelect = document.getElementById('base-model');
const loraContainerDynamic = document.getElementById('lora-container-dynamic');
const loraContainerStatic = document.getElementById('lora-container-static');
const imageHistory = document.getElementById('image-history');
const clearHistoryBtn = document.getElementById('clear-history');

// Seed controls
const seedInput = document.getElementById('seed');
const seedSlider = document.getElementById('seed-slider');
const randomSeedBtn = document.getElementById('random-seed');

function showError(message) {
  console.error("Showing error:", message);
  const event = new CustomEvent('show-alert', { detail: { message, type: 'error' } });
  window.dispatchEvent(event);
}

function showSuccess(message) {
  console.log("Showing success:", message);
  const event = new CustomEvent('show-alert', { detail: { message, type: 'success' } });
  window.dispatchEvent(event);
}

async function generateImage(baseModel, loras, prompt, resolution, seed, negativePrompt) {
  try {
    console.log(`Generating image with base model: ${baseModel}`);
    console.log(`LoRAs:`, loras);
    console.log(`Prompt: ${prompt}`);
    console.log(`Resolution: ${resolution}`);
    console.log(`Seed: ${seed}`);
    console.log(`Negative Prompt: ${negativePrompt}`);
    
    // Submit job to generate endpoint
    const submitResponse = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base_model: baseModel,
        loras: loras,
        prompt: prompt,
        resolution: resolution,
        seed: seed,
        negative_prompt: negativePrompt
      })
    });

    if (!submitResponse.ok) {
      const errorData = await submitResponse.json();
      throw new Error(errorData.error || `HTTP error! status: ${submitResponse.status}`);
    }

    const submitResult = await submitResponse.json();
    const jobId = submitResult.job_id;
    
    console.log(`Job submitted with ID: ${jobId}`);
    
    // Poll for job completion
    let attempts = 0;
    const maxAttempts = 180; // 30 seconds * 6 = 3 minutes max wait time
    const pollInterval = 5000; // Poll every 5 seconds
    
    while (attempts < maxAttempts) {
      console.log(`Polling job status (attempt ${attempts + 1}/${maxAttempts})...`);
      
      const statusResponse = await fetch(`/api/job/${jobId}`);
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to check job status: ${statusResponse.status}`);
      }
      
      const statusResult = await statusResponse.json();
      console.log('Job status:', statusResult.status);
      
      if (statusResult.status === 'completed') {
        console.log('Job completed successfully');
        return statusResult.result;
      } else if (statusResult.status === 'failed') {
        throw new Error(statusResult.error || 'Job failed');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;
    }
    
    // If we get here, the job timed out
    throw new Error('Job timed out - please try again');
    
  } catch (error) {
    console.error('API Error:', error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

// LoRA management functions
function addLoraEntry() {
  const loraEntry = document.createElement('div');
  loraEntry.className = 'lora-entry flex items-center gap-2';
  loraEntry.innerHTML = `
    <input type="text" class="lora-model flex-grow bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="LoRA model (e.g., character-style-lora)" required>
    <input type="number" class="lora-weight w-24 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Weight" min="0" max="2" step="0.01" value="1.00">
    <button type="button" class="remove-lora text-red-500 hover:text-red-400">×</button>
  `;
  
  // Add remove functionality
  const removeBtn = loraEntry.querySelector('.remove-lora');
  removeBtn.addEventListener('click', () => {
    loraEntry.remove();
    updateRemoveButtons();
  });
  
  loraContainer.appendChild(loraEntry);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const entries = loraContainer.querySelectorAll('.lora-entry');
  entries.forEach((entry, index) => {
    const removeBtn = entry.querySelector('.remove-lora');
    removeBtn.style.display = entries.length > 1 ? 'block' : 'none';
  });
}

function collectLoraData() {
  const baseModel = baseModelSelect.value;
  if (baseModel === 'fal-ai/wan/v2.2-a14b/text-to-image/lora') {
    // WAN model requires high and low LoRAs, but HTML elements may not exist
    const lowLoraElement = document.getElementById('lora-low');
    const highLoraElement = document.getElementById('lora-high');

    const lowLora = lowLoraElement ? lowLoraElement.value.trim() : '';
    const highLora = highLoraElement ? highLoraElement.value.trim() : '';

    const loras = [];
    if (lowLora) {
        loras.push({ model: lowLora, transformer: 'low' });
    }
    if (highLora) {
        loras.push({ model: highLora, transformer: 'high' });
    }
    return loras;
  } else {
    const entries = loraContainer.querySelectorAll('.lora-entry');
    const loras = [];
    
    entries.forEach(entry => {
      const modelInput = entry.querySelector('.lora-model');
      const weightValue = entry.querySelector('.lora-weight').value;
      const weight = parseFloat(weightValue) || 1.0;
      
      // Round to hundredths place to ensure proper precision
      const roundedWeight = Math.round(weight * 100) / 100;
      
      // Check if this is a Civitai LoRA
      if (entry.dataset.isCivitai === 'true') {
        const civitaiName = entry.dataset.civitaiName;
        const isStyle = entry.dataset.isStyle === 'true';
        loras.push({ 
          model: civitaiName, // Use the actual name for backend processing
          weight: roundedWeight,
          is_civitai: true,
          civitai_name: civitaiName,
          is_style: isStyle
        });
      } else {
        const model = modelInput.value.trim();
        if (model) {
          loras.push({ model, weight: roundedWeight });
        }
      }
    });
    
    return loras;
  }
}

// Seed functionality
function generateRandomSeed() {
  return Math.floor(Math.random() * 2147483638) + 1;
}

function syncSeedInputs(value) {
  const seedValue = Math.max(1, Math.min(2147483638, parseInt(value) || 1));
  seedInput.value = seedValue;
  seedSlider.value = seedValue;
  return seedValue;
}

function validateSeed(value) {
  const seed = parseInt(value);
  return !isNaN(seed) && seed >= 1 && seed <= 2147483638;
}

// Event listeners
addLoraBtn.addEventListener('click', addLoraEntry);

// Seed event listeners
seedInput.addEventListener('input', (e) => {
  if (validateSeed(e.target.value)) {
    syncSeedInputs(e.target.value);
  }
});

seedSlider.addEventListener('input', (e) => {
  syncSeedInputs(e.target.value);
});

randomSeedBtn.addEventListener('click', () => {
  const randomSeed = generateRandomSeed();
  syncSeedInputs(randomSeed);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log("Form submitted");
  
  const formData = new FormData(form);
  const baseModel = formData.get('base-model');
  const prompt = formData.get('prompt');
  const resolution = formData.get('resolution');
  const seed = parseInt(formData.get('seed'));
  const negativePrompt = formData.get('negative-prompt');
  const loras = collectLoraData();

  console.log("Collected data:", { baseModel, prompt, resolution, seed, negativePrompt, loras });

  // Validation
  if (!baseModel || !prompt) {
    showError('Please fill in all required fields.');
    return;
  }

  if (loras.length === 0) {
    showError('Please specify at least one LoRA model.');
    return;
  }

  // Check for unselected styles in dropdowns
  const civitaiLoraSelect = document.getElementById('civitai-lora-select');
  const styleLoraSelect = document.getElementById('style-lora-select');

  if (civitaiLoraSelect && civitaiLoraSelect.value && !civitaiLoraSelect.disabled) {
    const selectedCivitai = civitaiLoraSelect.value;
    const hasCivitaiInList = loras.some(lora =>
      lora.is_civitai && lora.civitai_name === selectedCivitai && !lora.is_style
    );
    if (!hasCivitaiInList) {
      showError(`You have selected "${selectedCivitai}" in the Civitai LoRAs dropdown but haven't added it to your LoRA list. Did you mean to include this LoRA?`);
      return;
    }
  }

  if (styleLoraSelect && styleLoraSelect.value && !styleLoraSelect.disabled) {
    const selectedStyle = styleLoraSelect.value;
    const hasStyleInList = loras.some(lora =>
      lora.is_civitai && lora.civitai_name === selectedStyle && lora.is_style
    );
    if (!hasStyleInList) {
      showError(`You have selected "${selectedStyle}" in the Style LoRAs dropdown but haven't added it to your LoRA list. Did you mean to include this style LoRA?`);
      return;
    }
  }

  if (!validateSeed(seed)) {
    showError('Seed must be an integer between 1 and 2,147,483,638.');
    return;
  }

  console.log("Validation passed");

  // UI updates - show loading overlay
  generateButton.disabled = true;
  loadingOverlay.classList.add('show');

  try {
    console.log("Calling generateImage function");
    const result = await generateImage(baseModel, loras, prompt, resolution, seed, negativePrompt);
    console.log("generateImage function returned:", result);

    if (result.images && result.images.length > 0) {
      const imageUrl = result.images[0].url;

      // Save to history
      saveToHistory({
        imageUrl,
        baseModel,
        loras,
        prompt,
        resolution,
        seed,
        negativePrompt
      });

      showSuccess('Image generated successfully!');
    } else {
      throw new Error('No images returned from API');
    }
    
  } catch (error) {
    console.error('Generation error:', error);
    showError(error.message);
  } finally {
    console.log("Finally block executed");
    generateButton.disabled = false;
    loadingOverlay.classList.remove('show');
  }
});

// Initialize the interface
document.addEventListener('DOMContentLoaded', async () => {
  console.log("DOM content loaded");
  updateRemoveButtons();
  
  // Style LoRA functionality
  const styleLoraSelect = document.getElementById('style-lora-select');
  const styleLoraWeight = document.getElementById('style-lora-weight');
  const addStyleLoraBtn = document.getElementById('add-style-lora');
  const styleSection = document.getElementById('style-section');

  // Initialize controls as disabled
  styleLoraWeight.disabled = true;
  addStyleLoraBtn.disabled = true;

  async function loadStyleLoras(baseModel = null) {
    try {
      if (!baseModel) return;

      const response = await fetch(`/api/civitai-loras?base_model=${encodeURIComponent(baseModel)}&category=style`);
      if (!response.ok) {
        throw new Error(`Failed to load Style LoRAs: ${response.status}`);
      }

      const data = await response.json();

      if (!data.available) {
        console.log('Style LoRAs not available - token not configured');
        hideStyleSection();
        return;
      }

      // Clear existing options except the first one
      while (styleLoraSelect.children.length > 1) {
        styleLoraSelect.removeChild(styleLoraSelect.lastChild);
      }

      // If no LoRAs available for this model
      if (!data.loras || Object.keys(data.loras).length === 0) {
        console.log(`No Style LoRAs available for ${baseModel}`);
        hideStyleSection();
        return;
      }

      // Show section and populate dropdown
      showStyleSection();
      Object.entries(data.loras).forEach(([name, id]) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        styleLoraSelect.appendChild(option);
      });

      console.log(`Style LoRAs loaded for ${baseModel}:`, Object.keys(data.loras));

    } catch (error) {
      console.error('Failed to load Style LoRAs:', error);
      hideStyleSection();
    }
  }

  function showStyleSection() {
    console.log("Showing style section");
    if (styleSection) {
      styleSection.classList.remove('hidden');
    }
  }

  function hideStyleSection() {
    console.log("Hiding style section");
    if (styleSection) {
      styleSection.classList.add('hidden');
    }
    // Reset controls
    styleLoraSelect.value = '';
    styleLoraWeight.value = '1.00';
    styleLoraWeight.disabled = true;
    addStyleLoraBtn.disabled = true;
  }

  function updateStyleForBaseModel() {
    const selectedBaseModel = baseModelSelect.value;
    const isFluxModel = ['fal-ai/flux-lora', 'fal-ai/flux-kontext-lora', 'fal-ai/qwen-image'].includes(selectedBaseModel);
    
    if (isFluxModel) {
      loadStyleLoras(selectedBaseModel);
    } else {
      hideStyleSection();
    }
  }

  function enableStyleControls() {
    const selectedLora = styleLoraSelect.value;
    const isSelected = selectedLora !== '';
    
    // Enable weight input immediately when a LoRA is selected
    styleLoraWeight.disabled = !isSelected;
    // Keep add button disabled until user interacts with weight
    addStyleLoraBtn.disabled = !isSelected;
    
    if (isSelected) {
      styleLoraWeight.focus();
    }
  }

  function addStyleLoraToList() {
    const selectedLora = styleLoraSelect.value;
    const weight = parseFloat(styleLoraWeight.value) || 1.0;
    
    if (!selectedLora) {
      showError('Please select a Style LoRA first.');
      return;
    }
    
    // Create a new LoRA entry with Style data
    const loraEntry = document.createElement('div');
    loraEntry.className = 'lora-entry flex items-center gap-2';
    loraEntry.innerHTML = `
      <input type="text" class="lora-model flex-grow bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" value="🎭 ${selectedLora}" readonly>
      <input type="number" class="lora-weight w-24 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" min="0" max="2" step="0.01" value="${weight.toFixed(2)}">
      <button type="button" class="remove-lora text-red-500 hover:text-red-400">×</button>
    `;
    
    // Store Civitai metadata
    loraEntry.dataset.isCivitai = 'true';
    loraEntry.dataset.civitaiName = selectedLora;
    loraEntry.dataset.isStyle = 'true';
    
    // Add remove functionality
    const removeBtn = loraEntry.querySelector('.remove-lora');
    removeBtn.addEventListener('click', () => {
      loraEntry.remove();
      updateRemoveButtons();
    });
    
    loraContainer.appendChild(loraEntry);
    updateRemoveButtons();
    
    // Reset Style selection
    styleLoraSelect.value = '';
    styleLoraWeight.value = '1.00';
    styleLoraWeight.disabled = true;
    addStyleLoraBtn.disabled = true;

    showSuccess(`Added Style LoRA: ${selectedLora}`);
  }

  // Style LoRA event listeners
  styleLoraSelect.addEventListener('change', enableStyleControls);
  addStyleLoraBtn.addEventListener('click', addStyleLoraToList);

  // Civitai LoRA functionality
  const civitaiLoraSelect = document.getElementById('civitai-lora-select');
  const civitaiLoraWeight = document.getElementById('civitai-lora-weight');
  const addCivitaiLoraBtn = document.getElementById('add-civitai-lora');
  const civitaiSection = document.getElementById('civitai-section');

  // Initialize controls as disabled
  civitaiLoraWeight.disabled = true;
  addCivitaiLoraBtn.disabled = true;

  let baseModelMapping = {}; // Store the base model to category mapping

  async function loadCivitaiLoras(baseModel = null) {
    try {
      let url = '/api/civitai-loras';
      if (baseModel) {
        url += `?base_model=${encodeURIComponent(baseModel)}&category=flux`;
      }

      const response = await fetch(url);
      console.log("Civitai LoRAs API response:", response);
      if (!response.ok) {
        throw new Error(`Failed to load Civitai LoRAs: ${response.status}`);
      }

      const data = await response.json();
      console.log("Civitai LoRAs API data:", data);

      if (!data.available) {
        console.log('Civitai LoRAs not available - token not configured');
        hideCivitaiSection();
        return;
      }

      // Store base model mapping for future reference
      if (data.base_model_mapping) {
        baseModelMapping = data.base_model_mapping;
      }
      
      // Clear existing options except the first one
      while (civitaiLoraSelect.children.length > 1) {
        civitaiLoraSelect.removeChild(civitaiLoraSelect.lastChild);
      }
      
      // If no base model specified or no LoRAs available for this model
      if (!baseModel || !data.loras || Object.keys(data.loras).length === 0) {
        if (baseModel) {
          console.log(`No Civitai LoRAs available for ${baseModel}`);
          hideCivitaiSection();
        }
        return;
      }
      
      // Show section and populate dropdown
      showCivitaiSection();
      Object.keys(data.loras).forEach(loraName => {
        const option = document.createElement('option');
        option.value = loraName;
        option.textContent = loraName;
        civitaiLoraSelect.appendChild(option);
      });
      
      console.log(`Civitai LoRAs loaded for ${baseModel}:`, Object.keys(data.loras));
      
    } catch (error) {
      console.error('Failed to load Civitai LoRAs:', error);
      hideCivitaiSection();
    }
  }

  function showCivitaiSection() {
    console.log("Showing civitai section");
    if (civitaiSection) {
      civitaiSection.classList.remove('hidden');
    }
  }

  function hideCivitaiSection() {
    console.log("Hiding civitai section");
    if (civitaiSection) {
      civitaiSection.classList.add('hidden');
    }
    // Reset controls
    civitaiLoraSelect.value = '';
    civitaiLoraWeight.value = '1.00';
    civitaiLoraWeight.disabled = true;
    addCivitaiLoraBtn.disabled = true;
  }

  function updateCivitaiForBaseModel() {
    const selectedBaseModel = baseModelSelect.value;
    const hasCompatibleLoras = baseModelMapping[selectedBaseModel];
    
    if (hasCompatibleLoras) {
      loadCivitaiLoras(selectedBaseModel);
    } else {
      hideCivitaiSection();
    }
  }

  function enableCivitaiControls() {
    const selectedLora = civitaiLoraSelect.value;
    const isSelected = selectedLora !== '';
    
    // Enable weight input immediately when a LoRA is selected
    civitaiLoraWeight.disabled = !isSelected;
    // Keep add button disabled until user interacts with weight
    addCivitaiLoraBtn.disabled = !isSelected;
    
    if (isSelected) {
      civitaiLoraWeight.focus();
    }
  }

  function addCivitaiLoraToList() {
    const selectedLora = civitaiLoraSelect.value;
    const weight = parseFloat(civitaiLoraWeight.value) || 1.0;
    
    if (!selectedLora) {
      showError('Please select a Civitai LoRA first.');
      return;
    }
    
    // Create a new LoRA entry with Civitai data
    const loraEntry = document.createElement('div');
    loraEntry.className = 'lora-entry flex items-center gap-2';
    loraEntry.innerHTML = `
      <input type="text" class="lora-model flex-grow bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" value="🎨 ${selectedLora}" readonly>
      <input type="number" class="lora-weight w-24 bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" min="0" max="2" step="0.01" value="${weight.toFixed(2)}">
      <button type="button" class="remove-lora text-red-500 hover:text-red-400">×</button>
    `;
    
    // Store Civitai metadata
    loraEntry.dataset.isCivitai = 'true';
    loraEntry.dataset.civitaiName = selectedLora;
    loraEntry.dataset.isStyle = 'false';
    
    // Add remove functionality
    const removeBtn = loraEntry.querySelector('.remove-lora');
    removeBtn.addEventListener('click', () => {
      loraEntry.remove();
      updateRemoveButtons();
    });
    
    loraContainer.appendChild(loraEntry);
    updateRemoveButtons();
    
    // Reset Style selection
    styleLoraSelect.value = '';
    styleLoraWeight.value = '1.00';
    styleLoraWeight.disabled = true;
    addStyleLoraBtn.disabled = true;
    
    showSuccess(`Added Civitai LoRA: ${selectedLora}`);
  }

  // Event listeners for Civitai functionality
  civitaiLoraSelect.addEventListener('change', enableCivitaiControls);
  addCivitaiLoraBtn.addEventListener('click', addCivitaiLoraToList);

  // Base model change event listener (defined here so functions are available)
  baseModelSelect.addEventListener('change', (e) => {
    const isWanLora = e.target.value === 'fal-ai/wan/v2.2-a14b/text-to-image/lora';

    // Only update display if elements exist (prevent null reference errors)
    if (loraContainerDynamic) {
      loraContainerDynamic.style.display = isWanLora ? 'none' : 'block';
    }
    if (loraContainerStatic) {
      loraContainerStatic.style.display = isWanLora ? 'block' : 'none';
    }

    // Update input requirements if elements exist
    if (loraContainerDynamic) {
      const dynamicInputs = loraContainerDynamic.querySelectorAll('input');
      dynamicInputs.forEach(input => input.required = !isWanLora);
    }
    if (loraContainerStatic) {
      const staticInputs = loraContainerStatic.querySelectorAll('input');
      staticInputs.forEach(input => input.required = isWanLora);
    }

    // Update Civitai LoRAs based on selected base model
    updateCivitaiForBaseModel();

    // Update Style LoRAs based on selected base model
    updateStyleForBaseModel();
  });

  // Load base model mapping first
  await loadCivitaiLoras(); // This loads the mapping

  // Then trigger base model change to set up Civitai and Style for default model
  baseModelSelect.dispatchEvent(new Event('change'));
  enableCivitaiControls();
  enableStyleControls();

  // Load history on page load
  loadHistory();

  // Add clear history button listener
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }
});

// Local Storage Functions
function saveToHistory(imageData) {
  try {
    let history = JSON.parse(localStorage.getItem('fallora-history') || '[]');

    // Add timestamp and unique ID
    imageData.id = Date.now();
    imageData.timestamp = new Date().toISOString();

    // Add to beginning of array (newest first)
    history.unshift(imageData);

    // Limit to 50 images max
    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    localStorage.setItem('fallora-history', JSON.stringify(history));
    loadHistory();
  } catch (error) {
    console.error('Failed to save to history:', error);
  }
}

function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem('fallora-history') || '[]');
    displayHistory(history);
  } catch (error) {
    console.error('Failed to load history:', error);
    displayHistory([]);
  }
}

function displayHistory(history) {
  if (!imageHistory) return;

  if (history.length === 0) {
    imageHistory.innerHTML = `
      <div class="text-gray-500 text-center py-8">
        <p>No images generated yet</p>
        <p class="text-sm">Your generated images will appear here</p>
      </div>
    `;
    return;
  }

  imageHistory.innerHTML = history.map(item => createImageCard(item)).join('');
}

function createImageCard(item) {
  const date = new Date(item.timestamp);
  const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

  const lorasInfo = item.loras.map(lora => {
    const weight = lora.weight || 1.0;
    const name = lora.civitai_name || lora.model || 'Unknown';
    const icon = lora.is_civitai ? (lora.is_style ? '🎭' : '🎨') : '🤖';
    return `${icon} ${name} (${weight})`;
  }).join('<br>');

  return `
    <div class="image-card bg-gray-700 rounded-lg overflow-hidden" data-prompt="${item.prompt.replace(/"/g, '&quot;')}">
      <div class="relative group">
        <img src="${item.imageUrl}" alt="Generated Image" class="w-full h-48 object-contain" onclick="openFullscreen('${item.imageUrl}')">
        <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-200 flex items-center justify-center gap-2">
          <button onclick="event.stopPropagation(); handleDownloadClick(this, '${item.imageUrl}')" class="opacity-0 group-hover:opacity-100 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm transition-opacity duration-200">
            Download
          </button>
          <button onclick="event.stopPropagation(); openFullscreen('${item.imageUrl}')" class="opacity-0 group-hover:opacity-100 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-opacity duration-200">
            View
          </button>
        </div>
      </div>
      <div class="p-3">
        <div class="text-xs text-gray-400 mb-2">${formattedDate}</div>
        <div class="text-sm mb-2 line-clamp-2">${item.prompt}</div>
        <div class="text-xs text-gray-500">
          <div class="font-medium mb-1">LoRAs:</div>
          ${lorasInfo}
        </div>
        <div class="text-xs text-gray-600 mt-2">
          ${item.resolution} • Seed: ${item.seed}
        </div>
      </div>
    </div>
  `;
}

function clearHistory() {
  if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
    localStorage.removeItem('fallora-history');
    loadHistory();
    showSuccess('History cleared');
  }
}

// Handle download click - simple download without prompt parsing
window.handleDownloadClick = function(button, imageUrl) {
  try {
    const prompt = 'fallora-image'; // Simple fallback name

    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Downloading...';
    button.disabled = true;

    // Create filename from prompt
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 30).trim() || 'fallora-image';
    const filename = `${cleanPrompt}-${Date.now()}.png`;

    // Fetch and download
    fetch(imageUrl, {
      mode: 'cors',
      cache: 'no-cache'
    })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Reset button
      button.textContent = originalText;
      button.disabled = false;
    })
    .catch(error => {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank');
      button.textContent = originalText;
      button.disabled = false;
    });
  } catch (error) {
    console.error('Download error:', error);
    // Fallback: open in new tab
    window.open(imageUrl, '_blank');
  }
}

// Download image function that properly handles external URLs
window.downloadImage = async function(imageUrl) {
  try {
    // Show loading state on the specific button
    const downloadBtns = document.querySelectorAll('button');
    const clickedBtn = Array.from(downloadBtns).find(btn =>
      btn.textContent === 'Download' && btn.onclick && btn.onclick.toString().includes(imageUrl)
    );

    if (clickedBtn) {
      const originalText = clickedBtn.textContent;
      clickedBtn.textContent = 'Downloading...';
      clickedBtn.disabled = true;

      // Reset after operation
      const resetButton = () => {
        clickedBtn.textContent = originalText;
        clickedBtn.disabled = false;
      };

      // Fetch the image as a blob
      const response = await fetch(imageUrl, {
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);

      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `fallora-generated-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      resetButton();
    }
  } catch (error) {
    console.error('Download failed:', error);
    alert('Download failed. The image URL might not support cross-origin requests.');

    // Fallback - try opening in new tab
    window.open(imageUrl, '_blank');
  }
}

// Fullscreen view functions
window.openFullscreen = function(imageUrl) {
  const modal = document.getElementById('fullscreen-modal');
  const fullscreenImage = document.getElementById('fullscreen-image');
  fullscreenImage.src = imageUrl;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

window.closeFullscreen = function(event) {
  if (event) {
    event.stopPropagation();
  }
  const modal = document.getElementById('fullscreen-modal');
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';
}