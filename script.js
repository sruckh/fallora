const form = document.getElementById('generate-form');
const imageContainer = document.getElementById('image-container');
const generatedImage = document.getElementById('generated-image');
const downloadLink = document.getElementById('download-link');
const generateButton = form.querySelector('button');
const errorMessage = document.getElementById('error-message');
const loraContainer = document.getElementById('lora-container');
const addLoraBtn = document.getElementById('add-lora');
const loadingOverlay = document.getElementById('loading-overlay');
const baseModelSelect = document.getElementById('base-model');
const loraContainerDynamic = document.getElementById('lora-container-dynamic');
const loraContainerStatic = document.getElementById('lora-container-static');

// Seed controls
const seedInput = document.getElementById('seed');
const seedSlider = document.getElementById('seed-slider');
const randomSeedBtn = document.getElementById('random-seed');

function showError(message) {
  console.error("Showing error:", message);
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, 5000);
}

function showSuccess(message) {
  errorMessage.textContent = message;
  errorMessage.className = 'success-message';
  errorMessage.style.display = 'block';
  setTimeout(() => {
    errorMessage.style.display = 'none';
    errorMessage.className = 'error-message';
  }, 3000);
}

async function generateImage(baseModel, loras, prompt, resolution, seed, negativePrompt) {
  try {
    console.log(`Generating image with base model: ${baseModel}`);
    console.log(`LoRAs:`, loras);
    console.log(`Prompt: ${prompt}`);
    console.log(`Resolution: ${resolution}`);
    console.log(`Seed: ${seed}`);
    console.log(`Negative Prompt: ${negativePrompt}`);
    
    const response = await fetch('/api/generate', {
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

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('API Error:', error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

// LoRA management functions
function addLoraEntry() {
  const loraEntry = document.createElement('div');
  loraEntry.className = 'lora-entry';
  loraEntry.innerHTML = `
    <input 
      type="text" 
      class="lora-model" 
      placeholder="LoRA model (e.g., character-style-lora)" 
      required
    >
    <input 
      type="number" 
      class="lora-weight" 
      placeholder="Weight" 
      min="0" 
      max="2" 
      step="0.01" 
      value="1.00"
    >
    <button type="button" class="remove-lora">×</button>
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
    removeBtn.style.display = entries.length > 1 ? 'flex' : 'none';
  });
}

function collectLoraData() {
  const baseModel = baseModelSelect.value;
  if (baseModel === 'fal-ai/wan/v2.2-a14b/text-to-image/lora') {
    const lowLora = document.getElementById('lora-low').value.trim();
    const highLora = document.getElementById('lora-high').value.trim();
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
        loras.push({ 
          model: civitaiName, // Use the actual name for backend processing
          weight: roundedWeight,
          is_civitai: true,
          civitai_name: civitaiName
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

baseModelSelect.addEventListener('change', (e) => {
  const isWanLora = e.target.value === 'fal-ai/wan/v2.2-a14b/text-to-image/lora';
  
  loraContainerDynamic.style.display = isWanLora ? 'none' : 'block';
  loraContainerStatic.style.display = isWanLora ? 'block' : 'none';

  const dynamicInputs = loraContainerDynamic.querySelectorAll('input');
  dynamicInputs.forEach(input => input.required = !isWanLora);

  const staticInputs = loraContainerStatic.querySelectorAll('input');
  staticInputs.forEach(input => input.required = isWanLora);
  
  // Update Civitai LoRAs based on selected base model
  updateCivitaiForBaseModel();
});

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
  
  if (!validateSeed(seed)) {
    showError('Seed must be an integer between 1 and 2,147,483,638.');
    return;
  }

  console.log("Validation passed");

  // UI updates - show loading overlay
  generateButton.disabled = true;
  loadingOverlay.classList.add('show');
  imageContainer.style.display = 'none';
  errorMessage.style.display = 'none';

  try {
    console.log("Calling generateImage function");
    const result = await generateImage(baseModel, loras, prompt, resolution, seed, negativePrompt);
    console.log("generateImage function returned:", result);
    
    if (result.images && result.images.length > 0) {
      const imageUrl = result.images[0].url;
      
      // Display the image
      generatedImage.src = imageUrl;
      generatedImage.onload = () => {
        imageContainer.style.display = 'block';
      };
      
      // Setup download link to use proxy endpoint
      const filename = `${baseModel.replace(/[^a-zA-Z0-9]/g, '_')}_${resolution}_${Date.now()}.jpg`;
      downloadLink.href = `/api/download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`;
      downloadLink.style.display = 'inline-block';
      
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

// Civitai LoRA functionality
const civitaiLoraSelect = document.getElementById('civitai-lora-select');
const civitaiLoraWeight = document.getElementById('civitai-lora-weight');
const addCivitaiLoraBtn = document.getElementById('add-civitai-lora');
const civitaiSection = document.getElementById('civitai-lora-select').closest('.form-group');

let baseModelMapping = {}; // Store the base model to category mapping

async function loadCivitaiLoras(baseModel = null) {
  try {
    const url = baseModel ? `/api/civitai-loras?base_model=${encodeURIComponent(baseModel)}` : '/api/civitai-loras';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load Civitai LoRAs: ${response.status}`);
    }
    
    const data = await response.json();
    
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
  if (civitaiSection) {
    civitaiSection.style.display = 'block';
  }
}

function hideCivitaiSection() {
  if (civitaiSection) {
    civitaiSection.style.display = 'none';
  }
  // Reset controls
  civitaiLoraSelect.value = '';
  civitaiLoraWeight.value = '1.00';
  enableCivitaiControls();
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
  
  civitaiLoraWeight.disabled = !isSelected;
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
  loraEntry.className = 'lora-entry';
  loraEntry.innerHTML = `
    <input 
      type="text" 
      class="lora-model" 
      value="🎨 ${selectedLora}" 
      readonly
    >
    <input 
      type="number" 
      class="lora-weight" 
      min="0" 
      max="2" 
      step="0.01" 
      value="${weight.toFixed(2)}"
    >
    <button type="button" class="remove-lora">×</button>
  `;
  
  // Store Civitai metadata
  loraEntry.dataset.isCivitai = 'true';
  loraEntry.dataset.civitaiName = selectedLora;
  
  // Add remove functionality
  const removeBtn = loraEntry.querySelector('.remove-lora');
  removeBtn.addEventListener('click', () => {
    loraEntry.remove();
    updateRemoveButtons();
  });
  
  loraContainer.appendChild(loraEntry);
  updateRemoveButtons();
  
  // Reset Civitai selection
  civitaiLoraSelect.value = '';
  civitaiLoraWeight.value = '1.00';
  enableCivitaiControls();
  
  showSuccess(`Added Civitai LoRA: ${selectedLora}`);
}


// Event listeners for Civitai functionality
civitaiLoraSelect.addEventListener('change', enableCivitaiControls);
addCivitaiLoraBtn.addEventListener('click', addCivitaiLoraToList);

// Initialize the interface
document.addEventListener('DOMContentLoaded', async () => {
  console.log("DOM content loaded");
  updateRemoveButtons();
  
  // Load base model mapping first
  await loadCivitaiLoras(); // This loads the mapping
  
  // Then trigger base model change to set up Civitai for default model
  baseModelSelect.dispatchEvent(new Event('change'));
  enableCivitaiControls();
});