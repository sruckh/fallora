import os
import requests
import json
from flask import Flask, request, jsonify, send_from_directory, redirect, Response, render_template_string
from flask_cors import CORS
import traceback
import time
import uuid
import threading
from datetime import datetime

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
    "fal-ai/qwen-image": "https://fal.run/fal-ai/qwen-image"
}

# In-memory job store for async image generation
JOB_STORE = {}
JOB_LOCK = threading.Lock()

def process_image_generation(job_id, base_model, loras, prompt, resolution, seed, negative_prompt):
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
        
        # Get the appropriate fal.ai endpoint
        endpoint_url = FAL_ENDPOINTS.get(base_model)
        if not endpoint_url:
            raise Exception(f'Unsupported model: {base_model}')
            
        print(f"Job {job_id}: Using endpoint: {endpoint_url}")
        print(f"Job {job_id}: LoRAs: {loras}")
        print(f"Job {job_id}: Resolution: {width}x{height}")
        print(f"Job {job_id}: Seed: {seed}")
        print(f"Job {job_id}: Prompt: {prompt}")
        print(f"Job {job_id}: Negative Prompt: {negative_prompt}")
        
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
                    'model': base_model,
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
        
        base_model = data.get('base_model')
        loras = data.get('loras', [])
        prompt = data.get('prompt')
        resolution = data.get('resolution', '512x512')
        seed = data.get('seed')
        negative_prompt = data.get('negative_prompt')
        
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
                    'negative_prompt': negative_prompt
                }
            }
        
        # Start background thread to process the image generation
        thread = threading.Thread(
            target=process_image_generation,
            args=(job_id, base_model, loras, prompt, resolution, seed, negative_prompt)
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)