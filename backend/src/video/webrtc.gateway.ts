import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VideoService } from './video.service';
import { WebRTCService } from './webrtc.service';
import * as wrtc from 'wrtc';
import * as fs from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';

interface RoomClient {
  socketId: string;
  username: string;
  streamActive: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class WebRTCGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WebRTCGateway.name);
  private readonly videosDir = join(process.cwd(), 'public', 'videos');
  private rooms: Map<string, RoomClient[]> = new Map();

  constructor(
    private readonly videoService: VideoService,
    private readonly webrtcService: WebRTCService
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Find and remove the client from any rooms
    this.rooms.forEach((clients, roomId) => {
      const updated = clients.filter(c => c.socketId !== client.id);
      if (updated.length !== clients.length) {
        this.rooms.set(roomId, updated);
        
        // Notify other clients about the disconnection
        this.server.to(roomId).emit('clientDisconnected', { socketId: client.id, roomId });
        
        // If room is empty, delete it
        if (updated.length === 0) {
          this.rooms.delete(roomId);
          this.logger.log(`Room ${roomId} deleted because it's empty`);
        }
      }
    });
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; username: string }
  ) {
    const { roomId, username } = data;
    
    // Join the socket.io room
    client.join(roomId);
    
    // Add client to our room tracking
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, []);
    }
    
    const roomClient: RoomClient = {
      socketId: client.id,
      username,
      streamActive: false
    };
    
    const roomClients = this.rooms.get(roomId);
    if (roomClients) {
      roomClients.push(roomClient);
    
      // Notify everyone in the room about the new client
      this.server.to(roomId).emit('clientJoined', { client: roomClient, roomId });
      
      // Send the new client information about all existing clients in the room
      client.emit('roomClients', { clients: roomClients, roomId });
      
      this.logger.log(`Client ${client.id} joined room ${roomId} as ${username}`);
      return { success: true, roomId, clients: roomClients };
    }
    
    return { success: false, roomId, error: 'Failed to join room' };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    const { roomId } = data;
    
    client.leave(roomId);
    
    if (this.rooms.has(roomId)) {
      const clients = this.rooms.get(roomId);
      if (clients) {
        const updated = clients.filter(c => c.socketId !== client.id);
        
        if (updated.length === 0) {
          this.rooms.delete(roomId);
          this.logger.log(`Room ${roomId} deleted because it's empty`);
        } else {
          this.rooms.set(roomId, updated);
          
          // Notify others about client leaving
          this.server.to(roomId).emit('clientDisconnected', { socketId: client.id, roomId });
        }
      }
    }
    
    this.logger.log(`Client ${client.id} left room ${roomId}`);
    return { success: true, roomId };
  }

  @SubscribeMessage('offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { offer: any; to: string; roomId: string }
  ) {
    const { offer, to, roomId } = data;
    
    // Forward the offer to the specific client
    this.server.to(to).emit('offer', {
      offer,
      from: client.id,
      roomId
    });
    
    this.logger.log(`Forwarded offer from ${client.id} to ${to} in room ${roomId}`);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { answer: any; to: string; roomId: string }
  ) {
    const { answer, to, roomId } = data;
    
    // Forward the answer to the specific client
    this.server.to(to).emit('answer', {
      answer,
      from: client.id,
      roomId
    });
    
    this.logger.log(`Forwarded answer from ${client.id} to ${to} in room ${roomId}`);
  }

  @SubscribeMessage('iceCandidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { candidate: any; to: string; roomId: string }
  ) {
    const { candidate, to, roomId } = data;
    
    // Forward the ICE candidate to the specific client
    this.server.to(to).emit('iceCandidate', {
      candidate,
      from: client.id,
      roomId
    });
    
    this.logger.debug(`Forwarded ICE candidate from ${client.id} to ${to} in room ${roomId}`);
  }

  @SubscribeMessage('toggleStream')
  handleToggleStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { streamActive: boolean; roomId: string }
  ) {
    const { streamActive, roomId } = data;
    
    if (this.rooms.has(roomId)) {
      const clients = this.rooms.get(roomId);
      if (clients) {
        const clientIndex = clients.findIndex(c => c.socketId === client.id);
        
        if (clientIndex !== -1) {
          clients[clientIndex].streamActive = streamActive;
          
          // Notify everyone in the room about the stream status change
          this.server.to(roomId).emit('streamStatusChanged', {
            socketId: client.id,
            streamActive,
            roomId
          });
          
          this.logger.log(`Client ${client.id} ${streamActive ? 'activated' : 'deactivated'} stream in room ${roomId}`);
        }
      }
    }
    
    return { success: true, streamActive, roomId };
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
} 