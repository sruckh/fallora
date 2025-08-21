# falLoRA - Character LoRA Generator

🎨 Generate character images using Hugging Face LoRA models via fal.ai API

## Features

- **Multiple LoRA Models**: Support for flux-lora, flux-kontext-lora, wan-lora, and qwen-image
- **Social Media Dimensions**: 36+ resolution options for all major platforms  
- **Interactive Seed Control**: Reproducible results with slider and random generation
- **Decimal Precision**: LoRA weights to hundredths place (0.00-2.00)
- **Professional UI**: Loading overlay, forced downloads, responsive design
- **Docker Ready**: Containerized deployment with shared network support

## Quick Start

### 1. Clone Repository
```bash
git clone git@github.com:sruckh/fallora.git
cd fallora
```

### 2. Setup Environment Variables
Create a `.env` file with your API keys:
```bash
# .env file (keep this file local, never commit)
FAL_KEY=your_fal_api_key_here
HF_TOKEN=your_hugging_face_token_here
```

### 3. Load Environment and Run
```bash
# Load environment variables
source .env

# Build and run with Docker
./start.sh
```

### 4. Access Application
- **Local**: http://localhost:5000 (if running locally)
- **Docker Network**: `fallora-app:5000` on shared_net

## API Keys Required

- **FAL_KEY**: Get from [fal.ai](https://fal.ai) for LoRA model access
- **HF_TOKEN**: Get from [Hugging Face](https://huggingface.co) for model downloads

## Supported Models

1. **fal-ai/flux-lora**: General purpose FLUX LoRA model
2. **fal-ai/flux-kontext-lora**: Context-aware FLUX LoRA model  
3. **fal-ai/wan-lora**: WAN v2.2-a14b LoRA model
4. **fal-ai/qwen-image**: Qwen vision model with LoRA support

## Development

### Project Structure
```
falLoRA/
├── app.py              # Flask backend
├── index.html          # Frontend interface  
├── script.js           # Client-side logic
├── style.css           # Styling
├── Dockerfile          # Container config
├── start.sh            # Build & run script
├── requirements.txt    # Python dependencies
└── .env               # API keys (local only)
```

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Run Flask directly
python app.py
```

## Docker Deployment

The application runs in a Docker container with:
- **Network**: shared_net (for NPM integration)
- **Port**: 5000 (internal)
- **Environment**: FAL_KEY and HF_TOKEN from host

## Security

- API keys stored in environment variables
- `.env` file excluded from Git via `.gitignore`  
- No hardcoded credentials in repository
- GitHub push protection prevents accidental key commits

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add your API keys to local `.env` file
4. Test your changes
5. Submit a pull request

## License

MIT License - see LICENSE file for details