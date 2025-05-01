# Video Streaming Backend

A simple Python Flask server that streams video files with byte-range support.

## Features

- Serves video files via `/video` endpoint
- Supports byte-range requests for efficient streaming
- Simulates real video streaming with chunked responses

## Setup

1. Create a virtual environment (optional but recommended):
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Place your video files in the `videos` directory (will be created on first run)

4. Generate a sample video (requires ffmpeg):
   ```
   python generate_sample_video.py
   ```
   Options:
   - `--output` or `-o`: Set the output path (default: videos/sample.mp4)
   - `--duration` or `-d`: Set the video duration in seconds (default: 10)
   - `--size` or `-s`: Set the video size as WIDTHxHEIGHT (default: 640x480)

## Usage

1. Start the server:
   ```
   python app.py
   ```

2. The server will run at http://localhost:5000

3. Access videos via:
   - http://localhost:5000/video?file=your_video.mp4
   - Default video: http://localhost:5000/video (serves sample.mp4)

## API

### GET /video

Parameters:
- `file` (optional): Name of the video file to stream (default: sample.mp4)

Response:
- Video stream with appropriate mime type
- Supports byte-range requests for seeking
- Returns 404 if the requested video doesn't exist 