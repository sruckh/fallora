import os
import requests
import json
import base64
from flask import Flask, request, jsonify, send_from_directory, redirect, Response, render_template_string
from flask_cors import CORS
import traceback
import time
import uuid
import threading
from datetime import datetime
from PIL import Image
import io

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# fal.ai API configuration
FAL_KEY = os.environ.get("FAL_KEY")
if not FAL_KEY:
    print("ERROR: FAL_KEY environment variable not set!")

# Civitai API configuration
CIVITAI_TOKEN = os.environ.get("CIVITAI_TOKEN")
if not CIVITAI_TOKEN:
    print("WARNING: CIVITAI_TOKEN environment variable not set - Civitai LoRAs will not be available")

# z.ai API configuration
Z_AI_API_KEY = os.environ.get("Z_AI_API_KEY")
Z_AI_BASE_URL = os.environ.get("Z_AI_BASE_URL", "https://api.z.ai/api/paas/v4")
Z_AI_MODEL = os.environ.get("Z_AI_MODEL", "glm-4.5v")
if not Z_AI_API_KEY:
    print("WARNING: Z_AI_API_KEY environment variable not set - AI image analysis will not be available")

# Reference image configuration
REFERENCE_IMAGE_DIR = os.environ.get("REFERENCE_IMAGE_DIR", "/tmp/fallora_uploads")
MAX_REFERENCE_IMAGE_SIZE = int(os.environ.get("MAX_REFERENCE_IMAGE_SIZE", "10485760"))  # 10MB

# Create upload directory if it doesn't exist
os.makedirs(REFERENCE_IMAGE_DIR, exist_ok=True)

# Civitai curated LoRA models organized by base model compatibility
CIVITAI_LORAS = {
    # FLUX models (flux-lora only - other models have different LoRA compatibility)
    "flux": {
        "Authentic Portrait Photography": "2125186",
        "Natural Realism": "2061874",
        "Unflux Realism": "1354203",
        "XLabs Flux Realism": "706528",
        "Facebook Quality Photos": "1046073",
        "Detailed Perfection style": "931225",
        "Photorealistic Skin": "1301668",
        "Cinematic Shot": "857668",
        "Realistic Amplifier for UltraReal Fine-Tune": "1351520",
        "FLUX -– Polyhedron_all": "812320"
    },
    
    # Style LoRAs - work across multiple models
    "style": {
        "Mythic Fantasy": "753053",
        "Anime art": "1376386",
        "Definitive Disney Studios": "738866",
        "Illustration Concept": "1619213",
        "Hyperdetailed Colored Pencil": "1753222",
        "Flat Colour Anime": "838667",
        "Disney Renaissance Style": "825954",
        "3D Render Style": "830009",
        "Comic Book Page": "841525",
        "Art Nouveau": "1838680",
        "Watercolor painting": "1782702",
        "Storyboard Sketch": "869189",
        "Glass Sculptures": "2187894",
        "30s Technicolor Movie": "1937944",
        "Cinematic Photography": "805067",
        "Chiaroscuro": "820532",
        "1950's (Technicolor)": "820451",
        "Cinematic \"color grading\"": "1633830"
    },
    
    "wan": {
        # Future wan-specific LoRAs can be added here
    }
}

# Map base models to their Civitai LoRA categories
BASE_MODEL_TO_CIVITAI = {
    "fal-ai/flux-lora": ["flux", "style"],
    "fal-ai/flux-kontext-lora": ["flux", "style"],
    "fal-ai/qwen-image": ["flux", "style"]
    # wan models: Different architecture, no Civitai LoRA compatibility
}

# fal.ai LoRA endpoints
FAL_ENDPOINTS = {
    "fal-ai/flux-lora": "https://fal.run/fal-ai/flux-lora",
    "fal-ai/flux-kontext-lora": "https://fal.run/fal-ai/flux-kontext-lora/text-to-image",
    "fal-ai/wan/v2.2-a14b/text-to-image/lora": "https://fal.run/fal-ai/wan/v2.2-a14b/text-to-image/lora",
    "fal-ai/qwen-image": "https://fal.run/fal-ai/qwen-image",
    "fal-ai/flux-pro/v1/depth": "https://fal.run/fal-ai/flux-pro/v1/depth",
    "fal-ai/flux-general": "https://fal.run/fal-ai/flux-general",
    "fal-ai/flux-control-lora-depth": "https://fal.run/fal-ai/flux-control-lora-depth/image-to-image"
}

# In-memory job store for async image generation
JOB_STORE = {}
JOB_LOCK = threading.Lock()

def clean_ai_prompt(raw_prompt):
    """Clean up AI-generated prompt by removing artifacts and box markers"""
    import re

    # Remove box markers
    cleaned = re.sub(r'<\|begin_of_box\|>|<\|end_of_box\|>', '', raw_prompt)

    # Remove any remaining template brackets with content like [Subject: details]
    cleaned = re.sub(r'\[([^\]]+)\]', r'\1', cleaned)

    # Clean up extra whitespace
    cleaned = ' '.join(cleaned.split())

    return cleaned.strip()

def process_image_generation(job_id, base_model, loras, prompt, resolution, seed, negative_prompt, reference_image_url=None):
    """Background function to process image generation"""
    try:
        with JOB_LOCK:
            JOB_STORE[job_id]['status'] = 'processing'
            JOB_STORE[job_id]['updated_at'] = datetime.now()
        
        # This is the same logic from the original generate_image function
        # but extracted into a background function
        
        # Check if we have at least one valid LoRA with proper weight validation
        valid_loras = []
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            for lora in loras:
                if lora.get("model", "").strip():
                    lora_path = lora["model"].strip()
                    
                    # Handle Civitai LoRAs
                    if lora.get("is_civitai", False):
                        civitai_name = lora.get("civitai_name", "")
                        is_style = lora.get("is_style", False)
                        
                        # Determine which category to look in based on is_style flag
                        category = "style" if is_style else "flux"
                        
                        # Check if this category is supported for this base model
                        civitai_categories = BASE_MODEL_TO_CIVITAI.get(base_model, [])
                        if category not in civitai_categories:
                            raise Exception(f'{category.title()} LoRAs not supported for {base_model}')
                        
                        # Get the model ID from the specific category
                        if civitai_name in CIVITAI_LORAS.get(category, {}) and CIVITAI_TOKEN:
                            model_id = CIVITAI_LORAS[category][civitai_name]
                            lora_path = f"https://civitai.com/api/download/models/{model_id}?token={CIVITAI_TOKEN}"
                        else:
                            raise Exception(f'Civitai LoRA not available for {base_model}: {civitai_name}')
                    
                    valid_loras.append({
                        "path": lora_path,
                        "scale": 1,
                        "transformer": lora["transformer"]
                    })
        else:
            for lora in loras:
                if lora.get("model", "").strip():
                    weight = lora.get("weight", 1.0)
                    lora_path = lora["model"].strip()
                    
                    # Handle Civitai LoRAs
                    if lora.get("is_civitai", False):
                        civitai_name = lora.get("civitai_name", "")
                        is_style = lora.get("is_style", False)
                        
                        # Determine which category to look in based on is_style flag
                        category = "style" if is_style else "flux"
                        
                        # Check if this category is supported for this base model
                        civitai_categories = BASE_MODEL_TO_CIVITAI.get(base_model, [])
                        if category not in civitai_categories:
                            raise Exception(f'{category.title()} LoRAs not supported for {base_model}')
                        
                        # Get the model ID from the specific category
                        if civitai_name in CIVITAI_LORAS.get(category, {}) and CIVITAI_TOKEN:
                            model_id = CIVITAI_LORAS[category][civitai_name]
                            lora_path = f"https://civitai.com/api/download/models/{model_id}?token={CIVITAI_TOKEN}"
                        else:
                            raise Exception(f'Civitai LoRA not available for {base_model}: {civitai_name}')
                    
                    # Ensure weight is a number between 0 and 2
                    try:
                        weight = float(weight)
                        weight = max(0.0, min(2.0, weight))
                        # Round to hundredths place
                        weight = round(weight, 2)
                        valid_loras.append({
                            "path": lora_path,
                            "scale": weight
                        })
                    except (ValueError, TypeError):
                        raise Exception(f'Invalid weight value for LoRA: {lora.get("model", "unknown")}')
                    
        if not valid_loras:
            raise Exception('At least one LoRA model is required.')
            
        # For wan model, require both high and low LoRAs
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            transformers = [lora.get("transformer") for lora in valid_loras]
            if "high" not in transformers or "low" not in transformers:
                raise Exception('wan/v2.2-a14b model requires both high and low LoRAs')
            if len(valid_loras) != 2:
                raise Exception('wan/v2.2-a14b model requires exactly 2 LoRAs (high and low)')
            
        # Validate seed
        if seed is not None:
            if not isinstance(seed, int) or seed < 1 or seed > 2147483638:
                raise Exception('Seed must be an integer between 1 and 2,147,483,638.')
            
        if not FAL_KEY:
            raise Exception('Server configuration error: FAL_KEY not configured')
            
        # Parse resolution
        try:
            width, height = map(int, resolution.split('x'))
        except ValueError:
            raise Exception('Invalid resolution format. Use WIDTHxHEIGHT (e.g., 512x512)')
        
        # Determine which endpoint to use based on reference image presence
        actual_model = base_model
        if reference_image_url and base_model in ["fal-ai/flux-lora", "fal-ai/flux-kontext-lora"]:
            # Switch to FLUX Control LoRA Depth for reference image mode
            actual_model = "fal-ai/flux-control-lora-depth"
            print(f"Job {job_id}: Reference image detected, switching to FLUX Control LoRA Depth")

        # Get the appropriate fal.ai endpoint
        endpoint_url = FAL_ENDPOINTS.get(actual_model)
        if not endpoint_url:
            raise Exception(f'Unsupported model: {actual_model}')

        print(f"Job {job_id}: Using endpoint: {endpoint_url}")
        print(f"Job {job_id}: Model: {actual_model}")
        print(f"Job {job_id}: LoRAs: {loras}")
        print(f"Job {job_id}: Resolution: {width}x{height}")
        print(f"Job {job_id}: Seed: {seed}")
        print(f"Job {job_id}: Prompt: {prompt}")
        print(f"Job {job_id}: Negative Prompt: {negative_prompt}")
        print(f"Job {job_id}: Reference Image: {reference_image_url}")
        
        # Prepare fal.ai request payload
        payload = {
            "prompt": prompt,
            "image_size": {
                "width": width,
                "height": height
            },
            "num_inference_steps": 30,  # Flux default
            "guidance_scale": 3.5,      # Flux default
            "num_images": 1,
            "enable_safety_checker": False,
            "has_nsfw_concepts": True
        }
        
        # Add seed if provided
        if seed is not None:
            payload["seed"] = seed

        # Add negative prompt if provided
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        
        # Add LoRA configuration based on model type
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            # Override payload for wan model to match fal.ai documentation
            payload = {
                "prompt": prompt,
                "loras": valid_loras,
                "image_size": {
                    "width": width,
                    "height": height
                },
                "num_inference_steps": 27,  # wan default per docs
                "guidance_scale": 3.5,      # wan default per docs
                "guidance_scale_2": 4,      # wan default per docs
                "shift": 2,                 # wan default per docs
                "enable_safety_checker": False
            }
            
            # Add seed if provided
            if seed is not None:
                payload["seed"] = seed

            # Add negative prompt if provided
            if negative_prompt:
                payload["negative_prompt"] = negative_prompt

        elif base_model in ["fal-ai/flux-lora", "fal-ai/flux-kontext-lora"]:
            # FLUX LoRA format
            payload["loras"] = valid_loras
        elif base_model == "fal-ai/qwen-image":
            # Qwen LoRA format with different settings
            payload["loras"] = valid_loras
            # Qwen-specific parameters
            payload["guidance_scale"] = 2.5
            payload["num_inference_steps"] = 50
        elif actual_model == "fal-ai/flux-control-lora-depth":
            # FLUX Control LoRA Depth format (reference image mode with LoRA support)
            if reference_image_url:
                # Convert relative URL to full URL for fal.ai
                if reference_image_url.startswith('/api/reference-images/'):
                    # Convert to absolute URL (fal.ai needs accessible URL)
                    reference_image_url = f"https://fallora.gemneye.info{reference_image_url}"

                # Required parameters for flux-control-lora-depth API
                payload["image_url"] = reference_image_url  # Color reference image
                payload["control_lora_image_url"] = reference_image_url  # Depth control image (same image)
                payload["control_lora_strength"] = 0.8  # Optional: strength of style control
                payload["strength"] = 0.85  # Optional: image transformation intensity (default: 0.85)

            # Add LoRAs
            payload["loras"] = valid_loras

            # FLUX Control LoRA Depth specific parameters
            payload["guidance_scale"] = 3.5
            payload["num_inference_steps"] = 28
        elif base_model == "fal-ai/flux-pro/v1/depth":
            # FLUX Pro depth format (legacy support - no LoRA compatibility)
            if reference_image_url:
                # Convert relative URL to full URL for fal.ai
                if reference_image_url.startswith('/api/reference-images/'):
                    # Convert to absolute URL (fal.ai needs accessible URL)
                    reference_image_url = f"https://fallora.gemneye.info{reference_image_url}"
                payload["control_image_url"] = reference_image_url
            # Note: FLUX Pro depth does NOT support LoRAs
            # FLUX Pro depth specific parameters
            payload["guidance_scale"] = 3.5
            payload["num_inference_steps"] = 28

        # Make request to fal.ai (increased timeout for async processing)
        headers = {
            "Authorization": f"Key {FAL_KEY}",
            "Content-Type": "application/json"
        }
        
        print(f"Job {job_id}: Sending payload to fal.ai: {json.dumps(payload, indent=2)}")
        
        response = requests.post(endpoint_url, headers=headers, json=payload, timeout=300)  # 5 minute timeout
        
        print(f"Job {job_id}: fal.ai response status: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"fal.ai API error: {response.status_code}"
            try:
                error_data = response.json()
                error_msg += f" - {error_data.get('detail', 'Unknown error')}"
            except:
                error_msg += f" - {response.text}"
            print(f"Job {job_id}: Error: {error_msg}")
            raise Exception(error_msg)
            
        result = response.json()
        print(f"Job {job_id}: fal.ai result keys: {result.keys()}")
        
        # Extract image URL from fal.ai response
        # wan model returns 'image' object, other models return 'images' array
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            image_data = result.get('image')
            if not image_data:
                raise Exception('No image generated')
            image_url = image_data.get('url')
        else:
            images = result.get('images', [])
            if not images:
                raise Exception('No images generated')
            image_url = images[0].get('url')

        if not image_url:
            raise Exception('No image URL in response')

        # Update job with success result
        with JOB_LOCK:
            JOB_STORE[job_id]['status'] = 'completed'
            JOB_STORE[job_id]['result'] = {
                'images': [{'url': image_url}],
                'metadata': {
                    'model': actual_model,  # Use actual model (might be switched for reference mode)
                    'original_model': base_model,  # Track original model selection
                    'reference_mode': bool(reference_image_url),  # Track if reference mode was used
                    'loras': loras,
                    'resolution': resolution,
                    'generation_time': result.get('timings', {})
                }
            }
            JOB_STORE[job_id]['updated_at'] = datetime.now()
        
        print(f"Job {job_id}: Completed successfully")
            
    except Exception as e:
        print(f"Job {job_id}: Error processing: {e}")
        with JOB_LOCK:
            JOB_STORE[job_id]['status'] = 'failed'
            JOB_STORE[job_id]['error'] = str(e)
            JOB_STORE[job_id]['updated_at'] = datetime.now()

@app.route('/')
def serve_index():
    return send_from_directory(app.root_path, 'index.html')

@app.route('/favicon.ico')
def serve_favicon():
    return send_from_directory(app.root_path, 
                             'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/favicon.svg')
def serve_favicon_svg():
    return send_from_directory(app.root_path, 
                             'favicon.svg', mimetype='image/svg+xml')

@app.route('/style.css')
def serve_css():
    return send_from_directory(app.root_path, 
                             'style.css', mimetype='text/css')

@app.route('/script.js')
def serve_js():
    return send_from_directory(app.root_path, 
                             'script.js', mimetype='application/javascript')

@app.route('/api/generate', methods=['POST'])
def submit_generation_job():
    """Submit an async image generation job"""
    try:
        data = request.get_json()

        # Debug logging to see what's being received
        app.logger.error(f"=== DEBUG /api/generate request ===")
        app.logger.error(f"Raw request data keys: {list(data.keys())}")
        app.logger.error(f"Raw request data: {data}")
        app.logger.error(f"=========================================")

        base_model = data.get('base_model')
        loras = data.get('loras', [])
        prompt = data.get('prompt')
        resolution = data.get('resolution', '512x512')
        seed = data.get('seed')
        negative_prompt = data.get('negative_prompt')
        reference_image_url = data.get('reference_image_url')

        app.logger.error(f"Extracted reference_image_url: {reference_image_url}")
        
        if not all([base_model, prompt]):
            return jsonify({'error': 'base_model and prompt are required.'}), 400
        
        if not loras:
            return jsonify({'error': 'At least one LoRA model is required.'}), 400
            
        # Validate seed
        if seed is not None:
            if not isinstance(seed, int) or seed < 1 or seed > 2147483638:
                return jsonify({'error': 'Seed must be an integer between 1 and 2,147,483,638.'}), 400
            
        if not FAL_KEY:
            return jsonify({'error': 'Server configuration error: FAL_KEY not configured'}), 500
            
        # Validate resolution format
        try:
            width, height = map(int, resolution.split('x'))
        except ValueError:
            return jsonify({'error': 'Invalid resolution format. Use WIDTHxHEIGHT (e.g., 512x512)'}), 400
        
        # Get the appropriate fal.ai endpoint
        endpoint_url = FAL_ENDPOINTS.get(base_model)
        if not endpoint_url:
            return jsonify({'error': f'Unsupported model: {base_model}'}), 400
        
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Store job in memory with pending status
        with JOB_LOCK:
            JOB_STORE[job_id] = {
                'status': 'pending',
                'created_at': datetime.now(),
                'updated_at': datetime.now(),
                'params': {
                    'base_model': base_model,
                    'loras': loras,
                    'prompt': prompt,
                    'resolution': resolution,
                    'seed': seed,
                    'negative_prompt': negative_prompt,
                    'reference_image_url': reference_image_url
                }
            }
        
        # Start background thread to process the image generation
        thread = threading.Thread(
            target=process_image_generation,
            args=(job_id, base_model, loras, prompt, resolution, seed, negative_prompt, reference_image_url)
        )
        thread.daemon = True
        thread.start()
        
        print(f"Job {job_id}: Submitted for async processing")
        
        # Return job ID immediately to avoid Cloudflare timeout
        return jsonify({
            'job_id': job_id,
            'status': 'pending',
            'message': 'Image generation job submitted successfully'
        })
        
    except Exception as e:
        print(f"Error submitting job: {e}")
        print(traceback.format_exc())
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/job/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """Get the status of an image generation job"""
    with JOB_LOCK:
        job = JOB_STORE.get(job_id)
    
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    response = {
        'job_id': job_id,
        'status': job['status'],
        'created_at': job['created_at'].isoformat(),
        'updated_at': job['updated_at'].isoformat()
    }
    
    if job['status'] == 'completed':
        response['result'] = job['result']
    elif job['status'] == 'failed':
        response['error'] = job['error']
    
    return jsonify(response)

@app.route('/api/models', methods=['GET'])
def get_available_models():
    """Return available fal.ai LoRA models"""
    return jsonify({
        'models': list(FAL_ENDPOINTS.keys()),
        'endpoints': FAL_ENDPOINTS
    })

@app.route('/api/civitai-loras', methods=['GET'])
def get_civitai_loras():
    """Return available Civitai LoRA models for a specific base model"""
    base_model = request.args.get('base_model')
    category = request.args.get('category')  # 'flux' or 'style'
    
    if not CIVITAI_TOKEN:
        return jsonify({
            'loras': {},
            'available': False,
            'message': 'Civitai token not configured'
        })
    
    if not base_model:
        # Return all categories for initial load
        return jsonify({
            'loras': CIVITAI_LORAS,
            'available': True,
            'base_model_mapping': BASE_MODEL_TO_CIVITAI
        })
    
    # Get LoRA categories for specific base model
    civitai_categories = BASE_MODEL_TO_CIVITAI.get(base_model)
    if not civitai_categories:
        return jsonify({
            'loras': {},
            'available': True,
            'message': f'No Civitai LoRAs available for {base_model}'
        })
    
    # If category is specified, return only that category
    if category:
        if category not in civitai_categories:
            return jsonify({
                'loras': {},
                'available': True,
                'message': f'No {category} LoRAs available for {base_model}'
            })
        compatible_loras = CIVITAI_LORAS.get(category, {})
        return jsonify({
            'loras': compatible_loras,
            'available': True,
            'category': category,
            'base_model': base_model
        })
    
    # Return all compatible categories (for backward compatibility)
    all_loras = {}
    for cat in civitai_categories:
        all_loras.update(CIVITAI_LORAS.get(cat, {}))
    
    return jsonify({
        'loras': all_loras,
        'available': True,
        'categories': civitai_categories,
        'base_model': base_model
    })



@app.route('/api/download', methods=['GET'])
def download_image():
    """Proxy download with forced download headers"""
    image_url = request.args.get('url')
    filename = request.args.get('filename', 'generated_image.jpg')
    
    if not image_url:
        return jsonify({'error': 'URL parameter required'}), 400
    
    try:
        # Fetch the image
        response = requests.get(image_url, stream=True, timeout=30)
        response.raise_for_status()
        
        # Create a response with download headers
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        return Response(
            generate(),
            headers={
                'Content-Type': response.headers.get('Content-Type', 'image/jpeg'),
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': response.headers.get('Content-Length', '')
            }
        )
    except Exception as e:
        return jsonify({'error': f'Download failed: {str(e)}'}), 500

@app.route('/api/upload-reference', methods=['POST'])
def upload_reference_image():
    """Upload and store reference image"""
    try:
        if 'reference_image' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['reference_image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Validate file type
        if not file.content_type.startswith('image/'):
            return jsonify({'error': 'File must be an image'}), 400

        # Read and validate file size
        file_data = file.read()
        if len(file_data) > MAX_REFERENCE_IMAGE_SIZE:
            return jsonify({'error': f'File too large. Maximum size is {MAX_REFERENCE_IMAGE_SIZE // (1024*1024)}MB'}), 400

        # Validate image format with PIL
        try:
            image = Image.open(io.BytesIO(file_data))
            image.verify()  # Verify it's a valid image
        except Exception:
            return jsonify({'error': 'Invalid image file'}), 400

        # Generate unique filename
        file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(REFERENCE_IMAGE_DIR, unique_filename)

        # Save file
        with open(file_path, 'wb') as f:
            f.write(file_data)

        # Generate public URL (assuming we serve from /api/reference-images/)
        image_url = f"/api/reference-images/{unique_filename}"

        return jsonify({
            'success': True,
            'filename': unique_filename,
            'image_url': image_url,
            'file_size': len(file_data)
        })

    except Exception as e:
        print(f"Error uploading reference image: {e}")
        print(traceback.format_exc())
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/reference-images/<filename>')
def serve_reference_image(filename):
    """Serve uploaded reference images"""
    try:
        return send_from_directory(REFERENCE_IMAGE_DIR, filename)
    except Exception as e:
        return jsonify({'error': 'Image not found'}), 404

@app.route('/api/crop-reference', methods=['POST'])
def crop_reference_image():
    """Generate cropped version of reference image based on user framing"""
    try:
        data = request.get_json()

        # Validate required parameters
        source_url = data.get('source_url')
        offset_x = data.get('offset_x', 0)
        offset_y = data.get('offset_y', 0)
        scale = data.get('scale', 1.0)
        target_width = data.get('target_width', 1080)
        target_height = data.get('target_height', 1080)

        if not source_url:
            return jsonify({'error': 'source_url is required'}), 400

        # Extract filename from source_url
        if source_url.startswith('/api/reference-images/'):
            filename = source_url.replace('/api/reference-images/', '')
        else:
            return jsonify({'error': 'Invalid source_url format'}), 400

        source_path = os.path.join(REFERENCE_IMAGE_DIR, filename)
        if not os.path.exists(source_path):
            return jsonify({'error': 'Source image not found'}), 404

        # Open and process the image
        with Image.open(source_path) as img:
            # Convert to RGB if necessary
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Calculate crop parameters
            orig_width, orig_height = img.size

            # Calculate the visible portion of the image based on scale
            visible_width = orig_width / scale
            visible_height = orig_height / scale

            # Calculate crop box (centered on offset)
            # Offset is from center, so convert to top-left coordinates
            crop_left = (orig_width / 2) - (visible_width / 2) - offset_x
            crop_top = (orig_height / 2) - (visible_height / 2) - offset_y
            crop_right = crop_left + visible_width
            crop_bottom = crop_top + visible_height

            # Ensure crop bounds are within image
            crop_left = max(0, crop_left)
            crop_top = max(0, crop_top)
            crop_right = min(orig_width, crop_right)
            crop_bottom = min(orig_height, crop_bottom)

            # Crop the image
            cropped_img = img.crop((crop_left, crop_top, crop_right, crop_bottom))

            # Resize to target dimensions
            final_img = cropped_img.resize((target_width, target_height), Image.Resampling.LANCZOS)

            # Generate unique filename for cropped version
            crop_filename = f"crop_{uuid.uuid4()}.jpg"
            crop_path = os.path.join(REFERENCE_IMAGE_DIR, crop_filename)

            # Save cropped image
            final_img.save(crop_path, 'JPEG', quality=95)

            # Generate URL for cropped image
            cropped_url = f"/api/reference-images/{crop_filename}"

            print(f"Cropped image generated: {crop_filename}")
            print(f"Original: {orig_width}x{orig_height}, Crop: {crop_left},{crop_top},{crop_right},{crop_bottom}")
            print(f"Scale: {scale}, Offset: {offset_x},{offset_y}, Target: {target_width}x{target_height}")

            return jsonify({
                'success': True,
                'cropped_url': cropped_url,
                'crop_filename': crop_filename,
                'crop_params': {
                    'scale': scale,
                    'offset_x': offset_x,
                    'offset_y': offset_y,
                    'target_width': target_width,
                    'target_height': target_height
                }
            })

    except Exception as e:
        print(f"Error cropping reference image: {e}")
        print(traceback.format_exc())
        return jsonify({'error': f'Crop failed: {str(e)}'}), 500

@app.route('/api/analyze-image', methods=['POST'])
def analyze_reference_image():
    """Analyze reference image with z.ai GLM-4.5v"""
    print("=== ANALYZE IMAGE FUNCTION CALLED ===", flush=True)
    try:
        print(f"Z_AI_API_KEY exists: {bool(Z_AI_API_KEY)}", flush=True)
        if not Z_AI_API_KEY:
            return jsonify({'error': 'AI analysis not available - Z_AI_API_KEY not configured'}), 503

        data = request.get_json()
        image_url = data.get('image_url')

        # Get physical attributes for override
        physical_attributes = data.get('physical_attributes', {})

        if not image_url:
            return jsonify({'error': 'image_url is required'}), 400

        # Convert relative URL to file path
        if image_url.startswith('/api/reference-images/'):
            filename = image_url.split('/')[-1]
            file_path = os.path.join(REFERENCE_IMAGE_DIR, filename)

            if not os.path.exists(file_path):
                return jsonify({'error': 'Reference image not found'}), 404

            # Read and encode image as base64
            with open(file_path, 'rb') as f:
                image_data = f.read()
            image_base64 = base64.b64encode(image_data).decode('utf-8')
        else:
            # Handle external URLs by downloading
            try:
                response = requests.get(image_url, timeout=30)
                response.raise_for_status()
                image_base64 = base64.b64encode(response.content).decode('utf-8')
            except Exception as e:
                return jsonify({'error': f'Failed to download image: {str(e)}'}), 400

        # Build physical attributes override string
        physical_attributes_text = ""
        if physical_attributes:
            attributes = []
            if physical_attributes.get('skin_color'):
                attributes.append(f"Ethnicity: {physical_attributes['skin_color']}")
            if physical_attributes.get('hair_color'):
                attributes.append(f"Hair: {physical_attributes['hair_color']}")
            if physical_attributes.get('hair_style'):
                attributes.append(f"Hair Style: {physical_attributes['hair_style']}")
            if physical_attributes.get('eye_color'):
                attributes.append(f"Eyes: {physical_attributes['eye_color']}")

            if attributes:
                physical_attributes_text = "PHYSICAL ATTRIBUTES OVERRIDE - Use these exact characteristics: " + ", ".join(attributes) + ". "

        # Analyze with z.ai GLM-4.5v (following official docs format)
        expert_prompt = """You are an expert AI Image Prompt Engineer. Analyze this image and create a detailed ultrarealistic photography prompt in 150 words or less.

""" + physical_attributes_text + """If physical attributes are specified above, you MUST use those exact characteristics for the subject. Otherwise, describe what you see.

Return ONLY the final prompt with this structure (replace ALL brackets with actual content):

An ultrarealistic, cinematic photograph of a [describe subject: age, ethnicity, gender, hair, eyes] at [location]. The atmosphere is [mood] during [time of day] with [lighting description].

The subject is dressed in [clothing and accessories] and has a [facial expression] while in a [pose]. Pay meticulous attention to realistic [skin details].

The composition is framed from a [camera angle] perspective. The environment features [foreground], [midground], and [background elements]. The lighting casts [lighting effects] and the scene has [colors, materials, textures].

Photographic Style: Shot on a [camera] with [lens], aperture [f-stop] for [depth of field effect]. Style: [photography genre/reference].

Realism Enhancers: masterpiece, 8k, UHD, sharp focus, professional photography, high detail, photorealistic, intricate detail, physically-based rendering, accurate anatomy, detailed textures.

CRITICAL: Fill in ALL brackets with specific details. Return ONLY the final prompt, no box markers, no explanations."""

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    },
                    {
                        "type": "text",
                        "text": expert_prompt
                    }
                ]
            }
        ]

        try:
            print(f"Sending request to z.ai: {Z_AI_BASE_URL}/chat/completions")
            print(f"Model: {Z_AI_MODEL}")
            print(f"Messages structure: {len(messages)} messages")

            response = requests.post(
                f"{Z_AI_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {Z_AI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": Z_AI_MODEL,
                    "messages": messages,
                    "max_tokens": 200,
                    "thinking": {
                        "type": "disabled"
                    }
                },
                timeout=30
            )

            print(f"z.ai response status: {response.status_code}")

            if response.status_code != 200:
                error_msg = f"z.ai API error: {response.status_code}"
                try:
                    error_data = response.json()
                    print(f"z.ai error data: {error_data}")
                    error_msg += f" - {error_data.get('error', {}).get('message', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                print(f"z.ai API Error: {error_msg}")
                return jsonify({'error': error_msg}), 500

        except Exception as e:
            print(f"Exception calling z.ai API: {str(e)}")
            return jsonify({'error': f'Failed to call z.ai API: {str(e)}'}), 500

        # Parse response with error handling
        try:
            print(f"Raw response text length: {len(response.text)}", flush=True)
            print(f"Response content type: {response.headers.get('content-type', 'unknown')}", flush=True)
            result = response.json()
            print(f"Successfully parsed JSON response", flush=True)
            print(f"z.ai response structure: {result.keys()}", flush=True)
            print(f"Full z.ai response: {result}", flush=True)
        except Exception as json_error:
            print(f"ERROR: Failed to parse z.ai response as JSON: {json_error}", flush=True)
            print(f"Raw response text: {response.text[:1000]}...", flush=True)
            return jsonify({'error': f'Invalid JSON response from z.ai: {str(json_error)}'}), 500

        # Extract prompt with error handling (thinking disabled, so content should be in standard field)
        try:
            message = result.get('choices', [{}])[0].get('message', {})
            raw_prompt = message.get('content', '') or message.get('reasoning_content', '')
            print(f"Raw prompt: '{raw_prompt[:100]}...'", flush=True)

            if not raw_prompt:
                print("ERROR: No content found in z.ai response", flush=True)
                return jsonify({'error': 'No response from AI analysis'}), 500

            # Clean up the prompt (remove box markers and any remaining brackets)
            suggested_prompt = clean_ai_prompt(raw_prompt)
            print(f"Cleaned prompt: '{suggested_prompt[:100]}...'", flush=True)

            return jsonify({
                'success': True,
                'suggested_prompt': suggested_prompt.strip()
            })
        except Exception as extract_error:
            print(f"ERROR: Failed to extract prompt from response: {extract_error}", flush=True)
            print(f"Response structure for debugging: {result}", flush=True)
            return jsonify({'error': f'Failed to extract AI response: {str(extract_error)}'}), 500

    except Exception as e:
        print(f"Error analyzing image: {e}")
        print(traceback.format_exc())
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)