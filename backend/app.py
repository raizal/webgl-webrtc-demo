from flask import Flask, request, Response, send_file
import os
import re

app = Flask(__name__)

VIDEO_PATH = "videos"  # Directory to store video files

@app.route('/')
def index():
    return "Video Streaming Server"

@app.route('/video')
def video():
    # Get video filename from query parameter or use a default
    video_name = request.args.get('file', 'sample.mp4')
    video_path = os.path.join(VIDEO_PATH, video_name)
    
    # Check if the video file exists
    if not os.path.exists(video_path):
        return Response("Video not found", status=404)
    
    # Get file size
    file_size = os.path.getsize(video_path)
    
    # Handle range request
    range_header = request.headers.get('Range', None)
    
    if range_header:
        byte_start, byte_end = 0, None
        
        # Parse the range header
        match = re.search(r'(\d+)-(\d*)', range_header)
        groups = match.groups() if match else None
        
        if groups:
            byte_start = int(groups[0])
            byte_end = int(groups[1]) if groups[1] else file_size - 1
        
        if byte_end is None:
            byte_end = file_size - 1
            
        length = byte_end - byte_start + 1
        
        # Create a partial response
        resp = Response(
            status=206,
            mimetype='video/mp4',
            content_type='video/mp4',
            direct_passthrough=True
        )
        
        resp.headers.add('Content-Range', f'bytes {byte_start}-{byte_end}/{file_size}')
        resp.headers.add('Accept-Ranges', 'bytes')
        resp.headers.add('Content-Length', str(length))
        
        # Open the file and seek to the starting position
        f = open(video_path, 'rb')
        f.seek(byte_start)
        
        # Create a generator to stream the file content
        def generate():
            remaining = length
            chunk_size = 8192  # 8KB chunks
            
            while remaining > 0:
                chunk_size = min(chunk_size, remaining)
                data = f.read(chunk_size)
                if not data:
                    break
                remaining -= len(data)
                yield data
            
            f.close()
        
        return resp.response(generate())
    
    # If no range header, serve the full file
    return send_file(video_path, mimetype='video/mp4')

if __name__ == '__main__':
    # Create videos directory if it doesn't exist
    os.makedirs(VIDEO_PATH, exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000) 