import { Injectable, Logger } from '@nestjs/common';
import * as wrtc from 'wrtc';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class WebRTCService {
  private readonly logger = new Logger(WebRTCService.name);
  private readonly videosDir = join(process.cwd(), 'public', 'videos');
  private activeConnections = new Map<string, RTCPeerConnection>();

  async verifyVideoExists(filename: string): Promise<string> {
    const videoPath = join(this.videosDir, filename);
    
    try {
      await fs.promises.access(videoPath, fs.constants.F_OK);
      return videoPath;
    } catch (error) {
      this.logger.error(`Video not found: ${filename}`);
      throw new Error('Video not found');
    }
  }

  async createPeerConnection(clientId: string): Promise<RTCPeerConnection> {
    // Create a new WebRTC peer connection
    const peerConnection = new wrtc.RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    });
    
    // Store the connection
    this.activeConnections.set(clientId, peerConnection);
    
    return peerConnection;
  }

  async createOffer(peerConnection: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return peerConnection.localDescription || offer;
  }

  async setRemoteDescription(clientId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConnection = this.activeConnections.get(clientId);
    
    if (!peerConnection) {
      throw new Error('Peer connection not found');
    }
    
    await peerConnection.setRemoteDescription(new wrtc.RTCSessionDescription(answer));
  }

  async setupLoopedVideoStream(peerConnection: RTCPeerConnection, videoPath: string): Promise<void> {
    try {
      // Note: This is a simplified placeholder
      // In a real application, you would use:
      // 1. Node.js bindings for ffmpeg or similar to read and decode video
      // 2. Create appropriate MediaStream and MediaStreamTrack objects
      // 3. Implement the loop functionality by restarting playback on end
      
      // Create a media stream for the video
      const mediaStream = new wrtc.MediaStream();
      
      // Log that this is a placeholder implementation
      this.logger.log('Setting up looped video stream (placeholder implementation)');
      this.logger.log('For actual implementation, use ffmpeg bindings or a media server');
      
      // In a real implementation, you would:
      // - Create a video track from the file
      // - Add it to the media stream
      // - Handle looping by monitoring the end event
      
      // For now, just create a simulated track
      this.logger.log(`Video path: ${videoPath}`);
      
      // Add the stream to the peer connection
      // In a real implementation, you would add actual tracks
      // This is just a placeholder for the structure
      peerConnection.addTransceiver('video', {
        direction: 'sendonly'
      });
    } catch (error) {
      this.logger.error('Error setting up video stream:', error);
      throw error;
    }
  }

  closeConnection(clientId: string): void {
    const peerConnection = this.activeConnections.get(clientId);
    
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (error) {
        this.logger.error(`Error closing peer connection: ${error.message}`);
      } finally {
        this.activeConnections.delete(clientId);
      }
    }
  }

  getActiveConnections(): string[] {
    return Array.from(this.activeConnections.keys());
  }
} 