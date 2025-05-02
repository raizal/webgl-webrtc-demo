import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as wrtc from 'wrtc';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class WebRTCService {
  private readonly logger = new Logger(WebRTCService.name);
  private readonly peerConnections = new Map<string, RTCPeerConnection>();
  private readonly videosDir = join(process.cwd(), 'public', 'videos');

  async verifyVideoExists(filename: string): Promise<string> {
    const videoPath = join(this.videosDir, filename);
    
    // Check if the file exists
    try {
      await fs.promises.access(videoPath, fs.constants.F_OK);
      return videoPath;
    } catch (error) {
      this.logger.error(`Video file not found: ${videoPath}`);
      throw new NotFoundException(`Video file ${filename} not found`);
    }
  }

  async createPeerConnection(clientId: string): Promise<RTCPeerConnection> {
    // Close any existing connection for this client
    this.closeConnection(clientId);
    
    // Create a new connection
    const peerConnection = new wrtc.RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    });
    
    // Store the connection
    this.peerConnections.set(clientId, peerConnection);
    
    return peerConnection;
  }

  async setupLoopedVideoStream(
    peerConnection: RTCPeerConnection,
    videoPath: string
  ): Promise<void> {
    // This is a simplified implementation
    // In a real-world scenario, you would set up a media stream from the video file
    // using something like ffmpeg or a media processing library
    
    // For simplicity, we'll create a dummy video track
    const videoTrack = this.createDummyVideoTrack();
    const audioTrack = this.createDummyAudioTrack();
    
    // Create a MediaStream with these tracks
    const mediaStream = new wrtc.MediaStream([videoTrack, audioTrack]);
    
    // Add tracks to the peer connection
    mediaStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, mediaStream);
    });
  }

  private createDummyVideoTrack(): MediaStreamTrack {
    // Create a canvas element to generate a video stream
    const { VideoFrame } = wrtc.nonstandard;
    const width = 640;
    const height = 480;
    
    // This is a simplified implementation using wrtc's nonstandard API
    const frame = new VideoFrame({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4)
    });
    
    // In a real implementation, you would stream actual video content
    const track = frame.createTrack();
    return track;
  }

  private createDummyAudioTrack(): MediaStreamTrack {
    // Create a silent audio track
    const { RTCAudioSource } = wrtc.nonstandard;
    const audioSource = new RTCAudioSource();
    const track = audioSource.createTrack();
    return track;
  }

  async createOffer(peerConnection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return offer;
  }

  async setRemoteDescription(
    clientId: string, 
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    const peerConnection = this.peerConnections.get(clientId);
    if (!peerConnection) {
      throw new Error(`No peer connection found for client ${clientId}`);
    }
    
    await peerConnection.setRemoteDescription(
      new wrtc.RTCSessionDescription(description)
    );
  }

  closeConnection(clientId: string): void {
    const peerConnection = this.peerConnections.get(clientId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(clientId);
      this.logger.log(`Closed peer connection for client ${clientId}`);
    }
  }
} 