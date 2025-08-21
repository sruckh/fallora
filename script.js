const form = document.getElementById('generate-form');
const imageContainer = document.getElementById('image-container');
const generatedImage = document.getElementById('generated-image');
const downloadLink = document.getElementById('download-link');
const generateButton = form.querySelector('button');
const errorMessage = document.getElementById('error-message');
const loraContainer = document.getElementById('lora-container');
const addLoraBtn = document.getElementById('add-lora');
const loadingOverlay = document.getElementById('loading-overlay');

// Seed controls
const seedInput = document.getElementById('seed');
const seedSlider = document.getElementById('seed-slider');
const randomSeedBtn = document.getElementById('random-seed');

function showError(message) {
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

async function generateImage(baseModel, loras, prompt, resolution, seed) {
  try {
    console.log(`Generating image with base model: ${baseModel}`);
    console.log(`LoRAs:`, loras);
    console.log(`Prompt: ${prompt}`);
    console.log(`Resolution: ${resolution}`);
    console.log(`Seed: ${seed}`);
    
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
        seed: seed
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
  const entries = loraContainer.querySelectorAll('.lora-entry');
  const loras = [];
  
  entries.forEach(entry => {
    const model = entry.querySelector('.lora-model').value.trim();
    const weightValue = entry.querySelector('.lora-weight').value;
    const weight = parseFloat(weightValue) || 1.0;
    
    // Round to hundredths place to ensure proper precision
    const roundedWeight = Math.round(weight * 100) / 100;
    
    if (model) {
      loras.push({ model, weight: roundedWeight });
    }
  });
  
  return loras;
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
  
  const formData = new FormData(form);
  const baseModel = formData.get('base-model');
  const prompt = formData.get('prompt');
  const resolution = formData.get('resolution');
  const seed = parseInt(formData.get('seed'));
  const loras = collectLoraData();

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

  // UI updates - show loading overlay
  generateButton.disabled = true;
  loadingOverlay.classList.add('show');
  imageContainer.style.display = 'none';
  errorMessage.style.display = 'none';

  try {
    const result = await generateImage(baseModel, loras, prompt, resolution, seed);
    
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
    generateButton.disabled = false;
    loadingOverlay.classList.remove('show');
  }
});

// Initialize the interface
document.addEventListener('DOMContentLoaded', () => {
  updateRemoveButtons();
});