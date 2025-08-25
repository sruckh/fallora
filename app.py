import os
import requests
import json
from flask import Flask, request, jsonify, send_from_directory, redirect, Response, render_template_string
from flask_cors import CORS
import traceback
import time

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# fal.ai API configuration
FAL_KEY = os.environ.get("FAL_KEY")
if not FAL_KEY:
    print("ERROR: FAL_KEY environment variable not set!")

# fal.ai LoRA endpoints
FAL_ENDPOINTS = {
    "fal-ai/flux-lora": "https://fal.run/fal-ai/flux-lora",
    "fal-ai/flux-kontext-lora": "https://fal.run/fal-ai/flux-kontext-lora/text-to-image", 
    "fal-ai/wan/v2.2-a14b/text-to-image/lora": "https://fal.run/fal-ai/wan/v2.2-a14b/text-to-image/lora",
    "fal-ai/qwen-image": "https://fal.run/fal-ai/qwen-image"
}

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
def generate_image():
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
            
        # Check if we have at least one valid LoRA with proper weight validation
        valid_loras = []
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            for lora in loras:
                if lora.get("model", "").strip():
                    valid_loras.append({
                        "path": lora["model"].strip(),
                        "scale": 1,
                        "transformer": lora["transformer"]
                    })
        else:
            for lora in loras:
                if lora.get("model", "").strip():
                    weight = lora.get("weight", 1.0)
                    # Ensure weight is a number between 0 and 2
                    try:
                        weight = float(weight)
                        weight = max(0.0, min(2.0, weight))
                        # Round to hundredths place
                        weight = round(weight, 2)
                        valid_loras.append({
                            "path": lora["model"].strip(),
                            "scale": weight
                        })
                    except (ValueError, TypeError):
                        return jsonify({'error': f'Invalid weight value for LoRA: {lora.get("model", "unknown")}'}), 400
                    
        if not valid_loras:
            return jsonify({'error': 'At least one LoRA model is required.'}), 400
            
        # For wan model, require both high and low LoRAs
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            transformers = [lora.get("transformer") for lora in valid_loras]
            if "high" not in transformers or "low" not in transformers:
                return jsonify({'error': 'wan/v2.2-a14b model requires both high and low LoRAs'}), 400
            if len(valid_loras) != 2:
                return jsonify({'error': 'wan/v2.2-a14b model requires exactly 2 LoRAs (high and low)'}), 400
            
        # Validate seed
        if seed is not None:
            if not isinstance(seed, int) or seed < 1 or seed > 2147483638:
                return jsonify({'error': 'Seed must be an integer between 1 and 2,147,483,638.'}), 400
            
        if not FAL_KEY:
            return jsonify({'error': 'Server configuration error: FAL_KEY not configured'}), 500
            
        # Parse resolution
        try:
            width, height = map(int, resolution.split('x'))
        except ValueError:
            return jsonify({'error': 'Invalid resolution format. Use WIDTHxHEIGHT (e.g., 512x512)'}), 400
        
        # Get the appropriate fal.ai endpoint
        endpoint_url = FAL_ENDPOINTS.get(base_model)
        if not endpoint_url:
            return jsonify({'error': f'Unsupported model: {base_model}'}), 400
            
        print(f"Using endpoint: {endpoint_url}")
        print(f"LoRAs: {loras}")
        print(f"Resolution: {width}x{height}")
        print(f"Seed: {seed}")
        print(f"Prompt: {prompt}")
        print(f"Negative Prompt: {negative_prompt}")
        
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
            
        # Make request to fal.ai
        headers = {
            "Authorization": f"Key {FAL_KEY}",
            "Content-Type": "application/json"
        }
        
        print(f"Sending payload to fal.ai: {json.dumps(payload, indent=2)}")
        
        response = requests.post(endpoint_url, headers=headers, json=payload, timeout=60)
        
        print(f"fal.ai response status: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"fal.ai API error: {response.status_code}"
            try:
                error_data = response.json()
                error_msg += f" - {error_data.get('detail', 'Unknown error')}"
            except:
                error_msg += f" - {response.text}"
            print(f"Error: {error_msg}")
            return jsonify({'error': error_msg}), 500
            
        result = response.json()
        print(f"fal.ai result keys: {result.keys()}")
        
        # Extract image URL from fal.ai response
        # wan model returns 'image' object, other models return 'images' array
        if base_model == "fal-ai/wan/v2.2-a14b/text-to-image/lora":
            image_data = result.get('image')
            if not image_data:
                return jsonify({'error': 'No image generated'}), 500
            image_url = image_data.get('url')
        else:
            images = result.get('images', [])
            if not images:
                return jsonify({'error': 'No images generated'}), 500
            image_url = images[0].get('url')
            
        if not image_url:
            return jsonify({'error': 'No image URL in response'}), 500
            
        return jsonify({
            'images': [{'url': image_url}],
            'metadata': {
                'model': base_model,
                'loras': loras,
                'resolution': resolution,
                'generation_time': result.get('timings', {})
            }
        })
        
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timeout - image generation took too long'}), 504
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return jsonify({'error': f'Network error: {str(e)}'}), 500
    except Exception as e:
        print(f"Error generating image: {e}")
        print(traceback.format_exc())
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/models', methods=['GET'])
def get_available_models():
    """Return available fal.ai LoRA models"""
    return jsonify({
        'models': list(FAL_ENDPOINTS.keys()),
        'endpoints': FAL_ENDPOINTS
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