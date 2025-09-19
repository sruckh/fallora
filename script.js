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

// Reference image controls
const referenceToggle = document.getElementById('reference-toggle');
const uploadArea = document.getElementById('upload-area');
const referenceUpload = document.getElementById('reference-upload');
const referencePreview = document.getElementById('reference-preview');
const referenceImage = document.getElementById('reference-image');
const aiAnalysisSection = document.getElementById('ai-analysis-section');
const attributesSection = document.getElementById('attributes-section');
const referenceStatus = document.getElementById('reference-status');
const analyzeImageBtn = document.getElementById('analyze-image');
const aiSuggestedPrompt = document.getElementById('ai-suggested-prompt');
const useAiPromptBtn = document.getElementById('use-ai-prompt');
const appendAiPromptBtn = document.getElementById('append-ai-prompt');
const clearReferenceBtn = document.getElementById('clear-reference');

// Reference image state
let currentReferenceImageUrl = null;
let referenceMode = false;

// Initialize reference image functionality
function initializeReferenceImage() {
    // Reference mode toggle
    if (referenceToggle) {
        referenceToggle.addEventListener('change', handleReferenceToggle);
    }

    // File upload handling
    if (referenceUpload) {
        referenceUpload.addEventListener('change', handleFileSelect);
    }

    // Drag and drop handling
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('click', () => referenceUpload.click());
    }

    // AI analysis button
    if (analyzeImageBtn) {
        analyzeImageBtn.addEventListener('click', handleImageAnalysis);
    }

    // AI prompt buttons
    if (useAiPromptBtn) {
        useAiPromptBtn.addEventListener('click', useAiPrompt);
    }
    if (appendAiPromptBtn) {
        appendAiPromptBtn.addEventListener('click', appendAiPrompt);
    }

    // Clear reference button
    if (clearReferenceBtn) {
        clearReferenceBtn.addEventListener('click', removeReferenceImage);
    }

    // Physical attributes change handlers
    const hairColorSelect = document.getElementById('hair-color');
    const hairStyleSelect = document.getElementById('hair-style');
    const eyeColorSelect = document.getElementById('eye-color');

    if (hairColorSelect) hairColorSelect.addEventListener('change', updatePhysicalAttributesPrompt);
    if (hairStyleSelect) hairStyleSelect.addEventListener('change', updatePhysicalAttributesPrompt);
    if (eyeColorSelect) eyeColorSelect.addEventListener('change', updatePhysicalAttributesPrompt);
}

// Handle reference mode toggle
function handleReferenceToggle() {
    referenceMode = referenceToggle.checked;
    const referencePanel = document.getElementById('reference-panel');

    if (referencePanel) {
        referencePanel.style.display = referenceMode ? 'block' : 'none';
    }

    // Update reference status display - show/hide the status div and update content
    const statusDiv = document.getElementById('reference-status');
    if (statusDiv) {
        if (referenceMode) {
            statusDiv.classList.remove('hidden');
            statusDiv.innerHTML = `
                <div class="flex items-center gap-2 mb-3">
                    <span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Active</span>
                    <span class="text-sm text-gray-400">Reference mode enabled</span>
                </div>
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span class="text-sm text-green-400">Your character will be placed in the reference scene</span>
                </div>
                <button type="button" id="clear-reference" class="text-xs text-red-400 hover:text-red-300 mt-2">
                    Clear Reference
                </button>
            `;
        } else {
            statusDiv.classList.add('hidden');
        }
    }

    // Update base model if reference mode is enabled and no image uploaded yet
    if (referenceMode && !currentReferenceImageUrl) {
        const baseModelSelect = document.getElementById('base-model');
        if (baseModelSelect && baseModelSelect.value !== 'fal-ai/flux-pro/v1/depth') {
            baseModelSelect.value = 'fal-ai/flux-pro/v1/depth';
            // Trigger change event to update LoRA sections
            baseModelSelect.dispatchEvent(new Event('change'));
        }
    }
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('border-blue-500', 'bg-blue-50');
}

// Handle drag leave
function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
}

// Handle file drop
function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('border-blue-500', 'bg-blue-50');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
}

// Handle file select
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// Handle file upload
async function handleFileUpload(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('Please select an image file');
        return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
        showError('Image file must be less than 10MB');
        return;
    }

    const formData = new FormData();
    formData.append('reference_image', file);

    const originalUploadContent = uploadArea.innerHTML;
    uploadArea.innerHTML = '<div class="text-blue-600">Uploading...</div>';

    try {
        const response = await fetch('/api/upload-reference', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            currentReferenceImageUrl = result.image_url;
            // Store in localStorage as backup
            localStorage.setItem('falLoRA_referenceImageUrl', result.image_url);
            displayReferenceImage(result.image_url, file.name);
            showSuccess('Reference image uploaded successfully');

            console.log('Reference image uploaded, URL set to:', currentReferenceImageUrl);

            // Enable reference mode if not already enabled
            if (!referenceMode) {
                referenceToggle.checked = true;
                handleReferenceToggle();
            }
        } else {
            showError(result.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showError('Upload failed: ' + error.message);
    } finally {
        uploadArea.innerHTML = originalUploadContent;
    }
}

// Display reference image
function displayReferenceImage(imageUrl, filename) {
    if (referencePreview && referenceImage) {
        referenceImage.src = imageUrl;
        referenceImage.alt = filename || 'Reference Image';
        referencePreview.style.display = 'block';
        uploadArea.style.display = 'none';

        // Show AI analysis and attributes sections
        if (aiAnalysisSection) aiAnalysisSection.style.display = 'block';
        if (attributesSection) attributesSection.style.display = 'block';
    }
}

// Remove reference image
function removeReferenceImage() {
    currentReferenceImageUrl = null;
    localStorage.removeItem('falLoRA_referenceImageUrl');

    if (referencePreview && uploadArea) {
        referencePreview.style.display = 'none';
        uploadArea.style.display = 'block';
    }

    // Hide AI analysis and attributes sections
    if (aiAnalysisSection) aiAnalysisSection.style.display = 'none';
    if (attributesSection) attributesSection.style.display = 'none';

    // Clear AI analysis
    if (aiSuggestedPrompt) {
        aiSuggestedPrompt.value = '';
    }

    // Reset physical attributes
    const hairColorSelect = document.getElementById('hair-color');
    const hairStyleSelect = document.getElementById('hair-style');
    const eyeColorSelect = document.getElementById('eye-color');

    if (hairColorSelect) hairColorSelect.value = '';
    if (hairStyleSelect) hairStyleSelect.value = '';
    if (eyeColorSelect) eyeColorSelect.value = '';

    // Reset file input
    if (referenceUpload) {
        referenceUpload.value = '';
    }
}

// Handle image analysis with z.ai GLM-4.5v
async function handleImageAnalysis() {
    if (!currentReferenceImageUrl) {
        showError('Please upload a reference image first');
        return;
    }

    if (!analyzeImageBtn || !aiSuggestedPrompt) return;

    const originalText = analyzeImageBtn.textContent;
    analyzeImageBtn.textContent = 'Analyzing...';
    analyzeImageBtn.disabled = true;

    try {
        // Collect physical attributes
        const physicalAttributes = {};
        const skinColor = document.getElementById('skin-color')?.value;
        const hairColor = document.getElementById('hair-color')?.value;
        const hairStyle = document.getElementById('hair-style')?.value;
        const eyeColor = document.getElementById('eye-color')?.value;

        if (skinColor) physicalAttributes.skin_color = skinColor;
        if (hairColor) physicalAttributes.hair_color = hairColor;
        if (hairStyle) physicalAttributes.hair_style = hairStyle;
        if (eyeColor) physicalAttributes.eye_color = eyeColor;

        const requestBody = {
            image_url: currentReferenceImageUrl
        };

        // Only include physical_attributes if there are any selected
        if (Object.keys(physicalAttributes).length > 0) {
            requestBody.physical_attributes = physicalAttributes;
        }

        const response = await fetch('/api/analyze-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.success) {
            aiSuggestedPrompt.value = result.suggested_prompt;
            showSuccess('Image analysis completed');
        } else {
            showError(result.error || 'Analysis failed');
        }
    } catch (error) {
        console.error('Analysis error:', error);
        showError('Analysis failed: ' + error.message);
    } finally {
        analyzeImageBtn.textContent = originalText;
        analyzeImageBtn.disabled = false;
    }
}

// Use AI prompt (replace current prompt)
function useAiPrompt() {
    if (!aiSuggestedPrompt) return;

    const aiPrompt = aiSuggestedPrompt.value.trim();
    if (!aiPrompt) {
        showError('No AI analysis available to use');
        return;
    }

    const promptInput = document.getElementById('prompt');
    if (promptInput) {
        promptInput.value = combineWithPhysicalAttributes(aiPrompt);
        showSuccess('AI prompt applied');
    }
}

// Append AI prompt to current prompt
function appendAiPrompt() {
    if (!aiSuggestedPrompt) return;

    const aiPrompt = aiSuggestedPrompt.value.trim();
    if (!aiPrompt) {
        showError('No AI analysis available to append');
        return;
    }

    const promptInput = document.getElementById('prompt');
    if (promptInput) {
        const currentPrompt = promptInput.value.trim();
        const combinedPrompt = combineWithPhysicalAttributes(aiPrompt);

        if (currentPrompt) {
            promptInput.value = currentPrompt + ', ' + combinedPrompt;
        } else {
            promptInput.value = combinedPrompt;
        }
        showSuccess('AI prompt appended');
    }
}

// Update physical attributes prompt
function updatePhysicalAttributesPrompt() {
    // This function is called when physical attribute dropdowns change
    // We don't need to do anything special here as the combination
    // happens in combineWithPhysicalAttributes when applying prompts
}

// Combine prompt with physical attributes (simplified - backend handles overrides)
function combineWithPhysicalAttributes(basePrompt) {
    // The backend now handles physical attribute overrides in the system prompt
    // This function is kept for compatibility but no longer needs complex logic
    return basePrompt;
}

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

async function generateImage(baseModel, loras, prompt, resolution, seed, negativePrompt, referenceImageUrl = null) {
  try {
    console.log(`Generating image with base model: ${baseModel}`);
    console.log(`LoRAs:`, loras);
    console.log(`Prompt: ${prompt}`);
    console.log(`Resolution: ${resolution}`);
    console.log(`Seed: ${seed}`);
    console.log(`Negative Prompt: ${negativePrompt}`);
    console.log(`Reference Mode: ${referenceMode}`);
    console.log(`Reference Image URL: ${referenceImageUrl}`);

    // Switch to flux-control-lora-depth model when reference mode is enabled AND reference image is provided
    let actualModel = baseModel;
    if (referenceImageUrl && referenceMode) {
      actualModel = 'fal-ai/flux-control-lora-depth';
      console.log(`Switching model from ${baseModel} to ${actualModel} for reference image generation (Enable checkbox: ${referenceMode})`);
    } else if (referenceImageUrl && !referenceMode) {
      console.log(`Reference image available but Enable checkbox is unchecked (${referenceMode}) - using ${baseModel}`);
    }

    // Prepare request body
    const requestBody = {
      base_model: actualModel,
      loras: loras,
      prompt: prompt,
      resolution: resolution,
      seed: seed,
      negative_prompt: negativePrompt
    };

    // Add reference image URL if provided AND reference mode is enabled
    if (referenceImageUrl && referenceMode) {
      requestBody.reference_image_url = referenceImageUrl;
      console.log(`Adding reference image URL to request: ${referenceImageUrl} (Enable checkbox: ${referenceMode})`);
    } else if (referenceImageUrl && !referenceMode) {
      console.log(`Reference image available but Enable checkbox is unchecked (${referenceMode}) - not adding to request`);
    }

    // Submit job to generate endpoint
    const submitResponse = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
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
    console.log("=== DEBUG currentReferenceImageUrl ===");
    console.log("currentReferenceImageUrl value:", currentReferenceImageUrl);
    console.log("referenceMode value:", referenceMode);

    // Recovery mechanism: check localStorage if currentReferenceImageUrl is null
    if (!currentReferenceImageUrl && referenceMode) {
        const stored = localStorage.getItem('falLoRA_referenceImageUrl');
        if (stored) {
            console.log("Recovering reference image URL from localStorage:", stored);
            currentReferenceImageUrl = stored;
        }
    }

    console.log("Final currentReferenceImageUrl:", currentReferenceImageUrl);
    console.log("====================================");

    // Apply physical attributes to the prompt if any are selected
    const finalPrompt = combineWithPhysicalAttributes(prompt);
    console.log("Original prompt:", prompt);
    console.log("Final prompt with physical attributes:", finalPrompt);
    const result = await generateImage(baseModel, loras, finalPrompt, resolution, seed, negativePrompt, currentReferenceImageUrl);
    console.log("generateImage function returned:", result);

    if (result.images && result.images.length > 0) {
      const imageUrl = result.images[0].url;

      // Save to history
      saveToHistory({
        imageUrl,
        baseModel,
        loras,
        prompt: finalPrompt,
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

  // Initialize reference image functionality
  initializeReferenceImage();
  
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

// Help System Functions
const helpModal = document.getElementById('help-modal');
const helpButton = document.getElementById('help-button');
const helpContent = document.getElementById('help-content');

// Help content data
const helpContentData = {
  'getting-started': `
    <h1>🚀 Getting Started with falLoRA</h1>

    <h2>What is falLoRA?</h2>
    <p>falLoRA is a powerful character image generator that uses LoRA (Low-Rank Adaptation) models with fal.ai's infrastructure to create stunning character artwork.</p>

    <h2>Quick Start Workflow</h2>
    <ol>
      <li><strong>Select Base Model:</strong> Choose from FLUX, WAN, or Qwen models</li>
      <li><strong>Choose Resolution:</strong> Pick the output size for your image</li>
      <li><strong>Add LoRA Models:</strong> Select character or style LoRAs to influence the generation</li>
      <li><strong>Write Your Prompt:</strong> Describe the character you want to create</li>
      <li><strong>Generate:</strong> Click "Generate Image" and watch the AI work its magic</li>
    </ol>

    <h2>Essential Concepts</h2>
    <ul>
      <li><strong>Base Models:</strong> The foundation AI model that generates the image</li>
      <li><strong>LoRA Models:</strong> Specialized models that add specific characters, styles, or concepts</li>
      <li><strong>Weights:</strong> Control how much influence each LoRA has (0.0 to 2.0)</li>
      <li><strong>Seed:</strong> A number that controls randomness - use the same seed for reproducible results</li>
    </ul>

    <h2>First Generation Example</h2>
    <pre>Base Model: fal-ai/flux-lora
Resolution: 1080x1080
LoRA: anime-character-style (Weight: 1.0)
Prompt: "A beautiful young woman with long silver hair, glowing blue eyes, wearing elegant fantasy armor"
Seed: 42</pre>

    <blockquote>💡 <strong>Pro Tip:</strong> Start with the default settings and experiment with one change at a time to understand how each parameter affects your results.</blockquote>
  `,

  'core-features': `
    <h1>🎯 Core Features</h1>

    <h2>Base Models</h2>
    <ul>
      <li><strong>fal-ai/flux-lora:</strong> Best for general character generation, supports most LoRAs</li>
      <li><strong>fal-ai/flux-kontext-lora:</strong> Enhanced contextual understanding</li>
      <li><strong>fal-ai/wan/v2.2-a14b:</strong> High-quality anime and character art</li>
      <li><strong>fal-ai/qwen-image:</strong> Versatile model with good prompt following</li>
      <li><strong>fal-ai/flux-pro/v1/depth:</strong> Used for reference image mode with depth control</li>
    </ul>

    <h2>Physical Attributes System</h2>
    <p>Override AI detection with specific physical characteristics:</p>
    <ul>
      <li><strong>Race/Skin Color:</strong> Specify ethnicity for consistent character representation</li>
      <li><strong>Hair Color & Style:</strong> Control hair appearance precisely</li>
      <li><strong>Eye Color:</strong> Set eye color for character consistency</li>
    </ul>

    <blockquote>💡 Set these attributes BEFORE analyzing the reference image for best results.</blockquote>

    <h2>Resolution Options</h2>
    <p>Choose from pre-configured social media sizes:</p>
    <ul>
      <li><strong>Instagram:</strong> Square (1080x1080), Stories (1080x1920), Landscape (1080x566)</li>
      <li><strong>Twitter/X:</strong> Posts (720x720, 1280x720), Header (1500x500)</li>
      <li><strong>Facebook:</strong> Various sizes including cover photos and feed posts</li>
      <li><strong>Standard:</strong> AI-optimized sizes like 512x512, 1024x1024</li>
    </ul>

    <h2>Seed Control</h2>
    <p>Use seeds to maintain consistency across generations:</p>
    <ul>
      <li><strong>Fixed Seed:</strong> Same prompt + same seed = identical image</li>
      <li><strong>Random Seed:</strong> Click "Random" for variations</li>
      <li><strong>Seed Slider:</strong> Fine-tune results by adjusting seed values</li>
    </ul>

    <h2>Prompt Engineering</h2>
    <p>Write effective prompts with these elements:</p>
    <ul>
      <li><strong>Subject:</strong> "A beautiful young woman", "An elderly wizard"</li>
      <li><strong>Appearance:</strong> "long silver hair", "glowing blue eyes"</li>
      <li><strong>Clothing:</strong> "elegant fantasy armor", "flowing red dress"</li>
      <li><strong>Setting:</strong> "in a mystical forest", "on a spaceship bridge"</li>
      <li><strong>Style:</strong> "anime style", "photorealistic", "oil painting"</li>
    </ul>
  `,

  'reference-images': `
    <h1>🖼️ Reference Images</h1>

    <h2>What is Reference Mode?</h2>
    <p>Reference Mode allows you to upload an image that the AI will use as a scene template. Your character will be integrated into this scene while maintaining the composition, lighting, and atmosphere.</p>

    <h2>How to Use Reference Images</h2>
    <ol>
      <li><strong>Enable Reference Mode:</strong> Toggle the switch in the Reference Mode panel</li>
      <li><strong>Upload Image:</strong> Drag and drop or click to upload a reference image</li>
      <li><strong>Set Physical Attributes:</strong> Optionally specify race, hair, and eye color</li>
      <li><strong>Analyze Scene:</strong> Click "Analyze Image" for AI-generated scene description</li>
      <li><strong>Generate:</strong> Create your character integrated into the reference scene</li>
    </ol>

    <h2>Physical Attributes Override</h2>
    <p>When using reference images, you can override the AI's automatic detection:</p>
    <ul>
      <li><strong>Race/Skin Color:</strong> Ensure consistent ethnicity across generations</li>
      <li><strong>Hair Color & Style:</strong> Control character appearance precisely</li>
      <li><strong>Eye Color:</strong> Set specific eye color for the character</li>
    </ul>

    <blockquote>💡 Set these BEFORE clicking "Analyze Image" for best results.</blockquote>

    <h2>AI Scene Analysis</h2>
    <p>Click "Analyze Image" to automatically generate a scene description:</p>
    <ul>
      <li><strong>Scene Detection:</strong> Identifies environment, lighting, and mood</li>
      <li><strong>Character Placement:</strong> Suggests where your character will be positioned</li>
      <li><strong>Style Matching:</strong> Analyzes artistic style and composition</li>
    </ul>

    <p>You can then:</p>
    <ul>
      <li><strong>Use AI Description:</strong> Replace your prompt entirely with the AI analysis</li>
      <li><strong>Append to Prompt:</strong> Add the scene description to your existing prompt</li>
    </ul>

    <h2>Smart Cropping (Coming Soon)</h2>
    <p>Future updates will include interactive cropping tools to help you frame the perfect composition before generation.</p>

    <h2>Best Practices</h2>
    <ul>
      <li>Use high-quality reference images with clear compositions</li>
      <li>Ensure good lighting and contrast in your reference images</li>
      <li>Simple backgrounds work better than complex scenes</li>
      <li>Set physical attributes before analysis for consistent character appearance</li>
    </ul>
  `,

  'loras': `
    <h1>🎭 LoRA Models</h1>

    <h2>What are LoRAs?</h2>
    <p>LoRA (Low-Rank Adaptation) models are specialized AI models that add specific characters, styles, or concepts to base models. They allow you to generate specific characters or artistic styles without training a full model from scratch.</p>

    <h2>Types of LoRAs Available</h2>

    <h3>🎨 Curated Civitai LoRAs</h3>
    <p>Pre-selected character LoRAs from Civitai, optimized for quality:</p>
    <ul>
      <li><strong>Character-Specific:</strong> Named characters from games, anime, media</li>
      <li><strong>Quality Curated:</strong> Hand-picked for consistency and reliability</li>
      <li><strong>Auto-Configured:</strong> Weights and settings optimized for each LoRA</li>
    </ul>

    <h3>🎭 Style LoRAs</h3>
    <p>Artistic style LoRAs that change the visual appearance:</p>
    <ul>
      <li><strong>Art Styles:</strong> Oil painting, watercolor, pixel art, etc.</li>
      <li><strong>Rendering Styles:</strong> 3D render, sketch, cel-shaded</li>
      <li><strong>Photography Styles:</strong> Portrait, landscape, cinematic</li>
    </ul>

    <h3>🤖 Custom LoRAs</h3>
    <p>Use your own LoRA models by entering the URL:</p>
    <ul>
      <li><strong>Hugging Face:</strong> Models hosted on Hugging Face</li>
      <li><strong>Civitai:</strong> Direct URLs to Civitai model files</li>
      <li><strong>Custom Hosting:</strong> Any publicly accessible .safetensors file</li>
    </ul>

    <h2>Working with LoRA Weights</h2>
    <p>Weights control how much influence a LoRA has on the final image:</p>
    <ul>
      <li><strong>0.0 - 0.5:</strong> Subtle influence, good for light styling</li>
      <li><strong>0.8 - 1.2:</strong> Standard strength, balanced results</li>
      <li><strong>1.3 - 2.0:</strong> Strong influence, character will be very prominent</li>
    </ul>

    <blockquote>💡 Start with weight 1.0 and adjust up or down based on results. Higher weights don't always mean better results.</blockquote>

    <h2>Combining Multiple LoRAs</h2>
    <p>You can use multiple LoRAs together for unique combinations:</p>
    <ul>
      <li><strong>Character + Style:</strong> Combine a character LoRA with an art style</li>
      <li><strong>Multiple Characters:</strong> Blend different character traits</li>
      <li><strong>Style Stacking:</strong> Layer multiple artistic styles</li>
    </ul>

    <h2>LoRA Compatibility</h2>
    <ul>
      <li><strong>FLUX Models:</strong> Work with most FLUX-compatible LoRAs</li>
      <li><strong>WAN Models:</strong> Specialized for anime-style LoRAs</li>
      <li><strong>Qwen:</strong> Limited LoRA support, best for custom models</li>
    </ul>

    <h2>Adding LoRAs</h2>
    <ol>
      <li>Select a LoRA from the dropdown menus</li>
      <li>Adjust the weight (default is 1.0)</li>
      <li>Click the "+" button to add to your LoRA list</li>
      <li>Repeat to add multiple LoRAs</li>
    </ol>
  `,

  'generation': `
    <h1>⚡ Generation Process</h1>

    <h2>Complete Workflow</h2>
    <ol>
      <li><strong>Setup Base Configuration</strong>
        <ul>
          <li>Choose your base model</li>
          <li>Select output resolution</li>
          <li>Set seed value (optional)</li>
        </ul>
      </li>
      <li><strong>Configure LoRAs</strong>
        <ul>
          <li>Add character LoRAs from Civitai collection</li>
          <li>Add style LoRAs for artistic effects</li>
          <li>Adjust weights for each LoRA</li>
        </ul>
      </li>
      <li><strong>Write Prompts</strong>
        <ul>
          <li>Main prompt: Describe your character and scene</li>
          <li>Negative prompt: Describe what to avoid</li>
          <li>Use reference image analysis (optional)</li>
        </ul>
      </li>
      <li><strong>Generate & Review</strong>
        <ul>
          <li>Click "Generate Image"</li>
          <li>Wait for AI processing (watch the neural network animation)</li>
          <li>Review results in the history panel</li>
        </ul>
      </li>
    </ol>

    <h2>Prompt Writing Guide</h2>
    <h3>Effective Prompt Structure</h3>
    <pre>Subject + Appearance + Clothing + Setting + Style + Quality</pre>

    <h3>Example Prompts</h3>
    <ul>
      <li><strong>Basic:</strong> "A beautiful young woman with long silver hair, blue eyes"</li>
      <li><strong>Detailed:</strong> "A stunning young woman with flowing silver hair that catches the light, piercing sapphire blue eyes, wearing intricate elven armor with glowing runes, standing in an ancient forest with beams of sunlight filtering through the canopy, fantasy art style, highly detailed, digital painting"</li>
      <li><strong>Style-Specific:</strong> "Anime girl with pink twintails, wearing a school uniform, holding a magical staff, cherry blossoms falling around her, Studio Ghibli style, vibrant colors"</li>
    </ul>

    <h3>Negative Prompts</h3>
    <p>Use negative prompts to avoid unwanted elements:</p>
    <pre>ugly, deformed, blurry, low quality, distorted face, extra limbs, text, signature, watermark</pre>

    <h2>Generation History</h2>
    <p>All generated images are automatically saved to your browser's local storage:</p>
    <ul>
      <li><strong>Automatic Saving:</strong> Every image is stored locally</li>
      <li><strong>Metadata Included:</strong> Prompts, LoRAs, settings, and timestamps</li>
      <li><strong>Quick Actions:</strong> Download, view fullscreen, or regenerate</li>
      <li><strong>Clear History:</strong> Remove all history with one click</li>
    </ul>

    <h2>Download Options</h2>
    <ul>
      <li><strong>Direct Download:</strong> Save images directly to your device</li>
      <li><strong>Fullscreen View:</strong> Examine images in detail before downloading</li>
      <li><strong>Automatic Naming:</strong> Files are named using prompt keywords</li>
    </ul>

    <h2>Performance Tips</h2>
    <ul>
      <li><strong>Start Simple:</strong> Begin with basic prompts and gradually add complexity</li>
      <li><strong>Use Reference Images:</strong> They help guide composition and lighting</li>
      <li><strong>Experiment with Seeds:</strong> Small changes can create interesting variations</li>
      <li><strong>Batch Generation:</strong> Generate multiple images with different seeds</li>
    </ul>
  `,

  'troubleshooting': `
    <h1>🔧 Troubleshooting</h1>

    <h2>Common Issues & Solutions</h2>

    <h3>❌ Generation Fails</h3>
    <ul>
      <li><strong>Problem:</strong> "Generation failed" error message</li>
      <li><strong>Cause:</strong> Server issues, invalid LoRA URLs, or service downtime</li>
      <li><strong>Solution:</strong>
        <ul>
          <li>Check your internet connection</li>
          <li>Verify LoRA URLs are correct and accessible</li>
          <li>Try a different base model</li>
          <li>Wait a few minutes and try again</li>
        </ul>
      </li>
    </ul>

    <h3>🐢 Slow Generation</h3>
    <ul>
      <li><strong>Problem:</strong> Generation takes too long</li>
      <li><strong>Cause:</strong> High server load, complex prompts, multiple LoRAs</li>
      <li><strong>Solution:</strong>
        <ul>
          <li>Reduce the number of LoRAs</li>
          <li>Simplify your prompt</li>
          <li>Try during off-peak hours</li>
          <li>Use lower resolutions for testing</li>
        </ul>
      </li>
    </ul>

    <h3>🎭 Poor Character Recognition</h3>
    <ul>
      <li><strong>Problem:</strong> Generated character doesn't match the LoRA character</li>
      <li><strong>Cause:</strong> Low weight, incompatible model, conflicting LoRAs</li>
      <li><strong>Solution:</strong>
        <ul>
          <li>Increase LoRA weight (try 1.2-1.5)</li>
          <li>Use compatible base models (check LoRA description)</li>
          <li>Reduce conflicting LoRAs</li>
          <li>Add character name to prompt</li>
        </ul>
      </li>
    </ul>

    <h3>🖼️ Reference Image Issues</h3>
    <ul>
      <li><strong>Problem:</strong> Reference mode not working</li>
      <li><strong>Cause:</strong> Invalid image format, size limits, depth model issues</li>
      <li><strong>Solution:</strong>
        <ul>
          <li>Use PNG, JPG under 10MB</li>
          <li>Ensure reference toggle is enabled</li>
          <li>Try FLUX-PRO depth model</li>
          <li>Check image is clear and well-lit</li>
        </ul>
      </li>
    </ul>

    <h3>🎨 Style Not Applied</h3>
    <ul>
      <li><strong>Problem:</strong> Style LoRA not affecting the output</li>
      <li><strong>Cause:</strong> Weight too low, style conflicts, model incompatibility</li>
      <li><strong>Solution:</strong>
        <ul>
          <li>Increase style weight (try 1.0-1.3)</li>
          <li>Add style keywords to prompt</li>
          <li>Remove conflicting style LoRAs</li>
          <li>Use FLUX models for best style support</li>
        </ul>
      </li>
    </ul>

    <h3>💾 History Not Saving</h3>
    <ul>
      <li><strong>Problem:</strong> Generated images not appearing in history</li>
      <li><strong>Cause:</strong> Browser storage disabled, private browsing mode</li>
      <li><strong>Solution:</strong>
        <ul>
          <li>Enable local storage in browser settings</li>
          <li>Exit private browsing mode</li>
          <li>Check browser storage permissions</li>
          <li>Try downloading images immediately</li>
        </ul>
      </li>
    </ul>

    <h2>🔍 Getting Help</h2>

    <h3>Debug Information</h3>
    <p>If you encounter persistent issues, check:</p>
    <ul>
      <li>Browser console for error messages (F12 → Console)</li>
      <li>Network tab for failed API requests</li>
      <li>Browser compatibility (Chrome/Firefox/Safari recommended)</li>
    </ul>

    <h3>Best Practices for Success</h3>
    <ul>
      <li><strong>Start Simple:</strong> Test with one LoRA at a time</li>
      <li><strong>Use Quality LoRAs:</strong> Stick to curated Civitai collection when starting</li>
      <li><strong>Clear Browser Cache:</strong> If interface becomes unresponsive</li>
      <li><strong>Update Browser:</strong> Ensure you're using a modern browser</li>
    </ul>

    <h3>Report Issues</h3>
    <p>If problems persist, note:</p>
    <ul>
      <li>Browser and version</li>
      <li>Error messages from console</li>
      <li>Steps to reproduce the issue</li>
      <li>Screenshots of the problem</li>
    </ul>
  `,

  'shortcuts': `
    <h1>⌨️ Keyboard Shortcuts</h1>

    <h2>Global Shortcuts</h2>
    <table>
      <tr><td><kbd>F1</kbd></td><td>Toggle Help Modal</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close current modal/dialog</td></tr>
      <tr><td><kbd>Ctrl/Cmd + Enter</kbd></td><td>Submit generation form</td></tr>
    </table>

    <h2>Navigation Shortcuts</h2>
    <table>
      <tr><td><kbd>Tab</kbd></td><td>Move to next interactive element</td></tr>
      <tr><td><kbd>Shift + Tab</kbd></td><td>Move to previous interactive element</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Toggle checkboxes/buttons</td></tr>
    </table>

    <h2>Form Shortcuts</h2>
    <table>
      <tr><td><kbd>Ctrl/Cmd + S</kbd></td><td>Save/download current image (when available)</td></tr>
      <tr><td><kbd>R</kbd></td><td>Generate random seed</td></tr>
      <tr><td><kbd>↑/↓</kbd></td><td>Adjust seed value when focused</td></tr>
      <tr><td><kbd>+/−</kbd></td><td>Adjust LoRA weights when focused</td></tr>
    </table>

    <h2>Modal Shortcuts</h2>
    <table>
      <tr><td><kbd>←/→</kbd></td><td>Navigate help tabs</td></tr>
      <tr><td><kbd>1-7</kbd></td><td>Jump to help sections (1=Getting Started, 2=Core Features, etc.)</td></tr>
      <tr><td><kbd>Home/End</kbd></td><td>Scroll to top/bottom of help content</td></tr>
    </table>

    <h2>Advanced Tips</h2>

    <h3>Seed Control</h3>
    <ul>
      <li>Click the seed number input field</li>
      <li>Use arrow keys for fine adjustments (±1)</li>
      <li>Hold Shift + arrow keys for larger jumps (±10)</li>
      <li>Type directly for precise values</li>
    </ul>

    <h3>Quick LoRA Management</h3>
    <ul>
      <li>Tab to navigate between LoRA inputs</li>
      <li>Enter to confirm weight changes</li>
      <li>Delete/Backspace to remove LoRA entries (when focused)</li>
    </ul>

    <h3>Efficient Workflow</h3>
    <ul>
      <li><kbd>Tab</kbd> through form fields quickly</li>
      <li><kbd>Enter</kbd> to submit when on last field</li>
      <li><kbd>F1</kbd> anytime you need help</li>
      <li><kbd>Esc</kbd> to close dialogs and continue working</li>
    </ul>

    <h2>Browser Compatibility</h2>
    <p>Shortcuts work best in modern browsers:</p>
    <ul>
      <li><strong>Chrome/Edge:</strong> Full shortcut support</li>
      <li><strong>Firefox:</strong> Full shortcut support</li>
      <li><strong>Safari:</strong> Most shortcuts supported</li>
      <li><strong>Mobile:</strong> Limited keyboard shortcut support</li>
    </ul>

    <blockquote>💡 <strong>Pro Tip:</strong> Memorize <kbd>F1</kbd> for help and <kbd>Esc</kbd> to close dialogs - these two will handle most navigation needs!</blockquote>
  `
};

// Initialize help system
function initializeHelpSystem() {
  // Help button click
  if (helpButton) {
    helpButton.addEventListener('click', toggleHelpModal);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Load default section
  showHelpSection('getting-started');
}

// Toggle help modal
function toggleHelpModal() {
  if (!helpModal) return;

  const isVisible = helpModal.classList.contains('show');
  if (isVisible) {
    closeHelpModal();
  } else {
    openHelpModal();
  }
}

// Open help modal
function openHelpModal() {
  if (!helpModal) return;

  helpModal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // Focus first interactive element
  const firstTab = helpModal.querySelector('.help-tab');
  if (firstTab) {
    firstTab.focus();
  }
}

// Close help modal
function closeHelpModal() {
  if (!helpModal) return;

  helpModal.classList.remove('show');
  document.body.style.overflow = 'auto';
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
  // F1: Toggle help
  if (event.key === 'F1') {
    event.preventDefault();
    toggleHelpModal();
    return;
  }

  // Esc: Close modals
  if (event.key === 'Escape') {
    const helpModalVisible = helpModal && helpModal.classList.contains('show');
    const fullscreenModalVisible = document.getElementById('fullscreen-modal')?.classList.contains('show');

    if (helpModalVisible) {
      closeHelpModal();
    } else if (fullscreenModalVisible) {
      window.closeFullscreen(event);
    }
    return;
  }

  // Number keys 1-7 for help sections (only when help modal is open)
  if (helpModal && helpModal.classList.contains('show')) {
    const sections = ['getting-started', 'core-features', 'reference-images', 'loras', 'generation', 'troubleshooting', 'shortcuts'];
    const keyNum = parseInt(event.key);

    if (keyNum >= 1 && keyNum <= 7) {
      event.preventDefault();
      showHelpSection(sections[keyNum - 1]);
      return;
    }

    // Arrow keys for tab navigation
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      navigateHelpTabs(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    // Home/End for scrolling
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (helpContent) {
        helpContent.scrollTop = event.key === 'Home' ? 0 : helpContent.scrollHeight;
      }
      return;
    }
  }

  // Ctrl/Cmd + Enter: Submit form
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    const form = document.getElementById('generate-form');
    if (form && document.activeElement.tagName !== 'TEXTAREA') {
      event.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  }
}

// Show help section
function showHelpSection(sectionName) {
  if (!helpContent || !helpContentData[sectionName]) return;

  // Update content
  helpContent.innerHTML = helpContentData[sectionName];

  // Update tab states
  const tabs = document.querySelectorAll('.help-tab');
  tabs.forEach(tab => {
    if (tab.dataset.section === sectionName) {
      tab.classList.add('bg-purple-600', 'text-white');
      tab.classList.remove('text-gray-300', 'hover:bg-gray-700');
    } else {
      tab.classList.remove('bg-purple-600', 'text-white');
      tab.classList.add('text-gray-300', 'hover:bg-gray-700');
    }
  });

  // Scroll to top
  helpContent.scrollTop = 0;
}

// Navigate help tabs with arrow keys
function navigateHelpTabs(direction) {
  const tabs = Array.from(document.querySelectorAll('.help-tab'));
  const activeTab = tabs.find(tab => tab.classList.contains('bg-purple-600'));

  if (!activeTab) return;

  const currentIndex = tabs.indexOf(activeTab);
  const newIndex = (currentIndex + direction + tabs.length) % tabs.length;
  const newTab = tabs[newIndex];

  if (newTab) {
    showHelpSection(newTab.dataset.section);
    newTab.focus();
  }
}

// Global functions for HTML onclick handlers
window.showHelpSection = showHelpSection;
window.closeHelpModal = closeHelpModal;

// Initialize help system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeHelpSystem();
});