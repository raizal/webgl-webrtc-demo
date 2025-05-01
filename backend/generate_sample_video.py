#!/usr/bin/env python3
"""
This script generates a sample video file for testing the streaming server.
Requires ffmpeg to be installed on your system.
"""

import os
import subprocess
import argparse

def generate_sample_video(output_path="videos/sample.mp4", duration=10, size="640x480"):
    """Generate a sample video using ffmpeg."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output file if it exists
        "-f", "lavfi",  # Use libavfilter virtual input
        "-i", f"testsrc=duration={duration}:size={size}:rate=30",  # Test video source
        "-c:v", "libx264",  # H.264 codec
        "-pix_fmt", "yuv420p",  # Pixel format
        "-movflags", "faststart",  # Optimize for web streaming
        output_path
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print(f"Sample video generated at {output_path}")
    except subprocess.CalledProcessError:
        print("Error: Failed to generate video. Make sure ffmpeg is installed.")
    except FileNotFoundError:
        print("Error: ffmpeg not found. Please install ffmpeg.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a sample video for testing")
    parser.add_argument("--output", "-o", default="videos/sample.mp4", help="Output path")
    parser.add_argument("--duration", "-d", type=int, default=10, help="Duration in seconds")
    parser.add_argument("--size", "-s", default="640x480", help="Video size (WIDTHxHEIGHT)")
    
    args = parser.parse_args()
    generate_sample_video(args.output, args.duration, args.size) 