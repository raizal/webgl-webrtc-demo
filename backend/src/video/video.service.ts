import { Injectable } from '@nestjs/common';
import { createReadStream, stat } from 'fs';
import { promisify } from 'util';
import { extname, join } from 'path';

const statAsync = promisify(stat);

@Injectable()
export class VideoService {
  private readonly videosDir = join(process.cwd(), 'public', 'videos');

  async getVideoStream(videoName: string, range: string) {
    if (!videoName) {
      throw new Error('Video name is required');
    }

    const videoPath = join(this.videosDir, videoName);
    const contentType = this.getContentType(extname(videoPath));
    const { size } = await statAsync(videoPath);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

      // Validate range
      if (isNaN(start) || isNaN(end) || start >= size || end >= size) {
        return {
          stream: createReadStream(videoPath),
          headers: {
            'Content-Range': `bytes */${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
            'Content-Length': size,
          },
          status: 416, // Range Not Satisfiable
        };
      }

      const chunksize = end - start + 1;

      const stream = createReadStream(videoPath, { start, end });
      
      return {
        stream,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          // Explicitly prevent caching to avoid 304 responses
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        status: 206, // Partial Content
      };
    } else {
      // Full video without range
      const stream = createReadStream(videoPath);
      
      return {
        stream,
        headers: {
          'Content-Length': size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          // Prevent caching of full video
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        status: 200,
      };
    }
  }

  private getContentType(extension: string): string {
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
    };
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}
