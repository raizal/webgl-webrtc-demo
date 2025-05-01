import { Injectable, StreamableFile } from '@nestjs/common';
import { createReadStream, stat } from 'fs';
import { promisify } from 'util';
import { join } from 'path';

const statAsync = promisify(stat);

@Injectable()
export class VideoService {
  private readonly videosDir = join(process.cwd(), 'public', 'videos');

  async getVideoStream(videoName: string, range: string) {
    if (!videoName) {
      throw new Error('Video name is required');
    }

    const videoPath = join(this.videosDir, videoName);
    const { size } = await statAsync(videoPath);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
      const chunksize = end - start + 1;
      
      const stream = createReadStream(videoPath, { start, end });
      
      return {
        stream,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
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
          'Content-Type': 'video/mp4',
        },
        status: 200,
      };
    }
  }
}
