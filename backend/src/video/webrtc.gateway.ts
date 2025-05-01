import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VideoService } from './video.service';
import { WebRTCService } from './webrtc.service';
import * as wrtc from 'wrtc';
import * as fs from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class WebRTCGateway {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WebRTCGateway.name);
  private readonly videosDir = join(process.cwd(), 'public', 'videos');

  constructor(
    private readonly videoService: VideoService,
    private readonly webrtcService: WebRTCService
  ) {}

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, room: string) {
    this.logger.log(`Client ${client.id} joining room: ${room}`);
    client.join(room);
    client.emit('room-joined', room);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, room: string) {
    this.logger.log(`Client ${client.id} leaving room: ${room}`);
    client.leave(room);
    
    // Clean up any peer connections
    this.webrtcService.closeConnection(client.id);
  }

  @SubscribeMessage('offer')
  handleOffer(client: Socket, data: { room: string; offer: RTCSessionDescriptionInit }) {
    this.logger.log(`Received offer from client ${client.id} in room ${data.room}`);
    client.to(data.room).emit('offer', {
      sdp: data.offer,
      offererId: client.id
    });
  }

  @SubscribeMessage('answer')
  handleAnswer(client: Socket, data: { room: string; answer: RTCSessionDescriptionInit; offererId: string }) {
    this.logger.log(`Received answer from client ${client.id} in room ${data.room}`);
    const targetSocket = this.server.sockets.sockets.get(data.offererId);
    if (targetSocket) {
      targetSocket.emit('answer', {
        sdp: data.answer,
        answererId: client.id
      });
    }
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(client: Socket, data: { room: string; candidate: RTCIceCandidateInit; targetId?: string }) {
    this.logger.log(`Received ICE candidate from client ${client.id}`);
    
    if (data.targetId) {
      // Direct to specific peer
      const targetSocket = this.server.sockets.sockets.get(data.targetId);
      if (targetSocket) {
        targetSocket.emit('ice-candidate', {
          candidate: data.candidate,
          from: client.id
        });
      }
    } else {
      // Broadcast to room
      client.to(data.room).emit('ice-candidate', {
        candidate: data.candidate,
        from: client.id
      });
    }
  }

  @SubscribeMessage('stream-video')
  async handleStreamVideo(client: Socket, data: { room: string; filename: string }) {
    const { filename, room } = data;
    this.logger.log(`Client ${client.id} requested to stream video ${filename} in room ${room}`);
    
    try {
      // Verify file exists
      const videoPath = await this.webrtcService.verifyVideoExists(filename);
      
      // Create a peer connection for server-side streaming
      const peerConnection = await this.webrtcService.createPeerConnection(client.id);

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          client.emit('ice-candidate', {
            candidate: event.candidate,
            from: 'server'
          });
        }
      };

      // Set up the looped video stream
      await this.webrtcService.setupLoopedVideoStream(peerConnection, videoPath);

      // Create and send offer
      const offer = await this.webrtcService.createOffer(peerConnection);
      client.emit('server-offer', { sdp: offer });

      // Announce to room that streaming has started
      this.server.to(room).emit('video-stream-started', { 
        filename,
        streamerId: client.id 
      });

    } catch (error) {
      this.logger.error(`Error streaming video: ${error.message}`, error.stack);
      client.emit('stream-error', { message: error.message });
    }
  }

  @SubscribeMessage('client-answer')
  async handleClientAnswer(client: Socket, data: { answer: RTCSessionDescriptionInit }) {
    try {
      this.logger.log(`Received answer from client ${client.id}`);
      await this.webrtcService.setRemoteDescription(client.id, data.answer);
      this.logger.log(`Set remote description for client ${client.id}`);
    } catch (error) {
      this.logger.error(`Error handling client answer: ${error.message}`, error.stack);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Clean up resources
    this.webrtcService.closeConnection(client.id);
  }
} 