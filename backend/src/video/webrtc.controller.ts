import { Controller, Get, Param, Post, Body, HttpStatus, HttpException } from '@nestjs/common';
import { VideoService } from './video.service';
import * as fs from 'fs';
import { join } from 'path';

@Controller('webrtc')
export class WebRTCController {
  private readonly videosDir = join(process.cwd(), 'public', 'videos');
  
  constructor(private readonly videoService: VideoService) {}

  @Get('videos')
  async getAvailableVideos() {
    try {
      // Check if videos directory exists
      if (!fs.existsSync(this.videosDir)) {
        return { videos: [] };
      }
      
      // Get list of video files
      const files = fs.readdirSync(this.videosDir);
      const videoFiles = files.filter(file => {
        const extension = file.split('.').pop();
        return extension ? ['mp4', 'webm', 'ogg', 'mov'].includes(extension.toLowerCase()) : false;
      });
      
      return { videos: videoFiles };
    } catch (error) {
      throw new HttpException('Failed to get video list', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('info/:filename')
  async getVideoInfo(@Param('filename') filename: string) {
    try {
      const videoPath = join(this.videosDir, filename);
      
      // Check if file exists
      if (!fs.existsSync(videoPath)) {
        throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
      }
      
      // Get file stats
      const stats = fs.statSync(videoPath);
      
      return {
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get video info', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('stream-loop')
  async initiateLoopedStream(@Body() body: { filename: string; room?: string }) {
    try {
      const { filename, room = 'default-room' } = body;
      const videoPath = join(this.videosDir, filename);
      
      // Check if file exists
      if (!fs.existsSync(videoPath)) {
        throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
      }
      
      // Return connection information
      // The actual WebRTC connection will be established via the WebSocket gateway
      return {
        status: 'ready',
        roomId: room,
        video: filename,
        instructions: 'Connect to WebSocket and send "stream-video" message with this roomId and filename'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to initiate stream', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
} 