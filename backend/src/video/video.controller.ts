import { Controller, Get, Headers, Param, Res, Header, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { VideoService } from './video.service';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get(':filename')
  async streamVideo(
    @Param('filename') filename: string,
    @Headers('range') range: string,
    @Res() res: Response,
  ) {
    try {
      const { stream, headers, status } = await this.videoService.getVideoStream(
        filename,
        range,
      );

      // Set the response headers
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }

      // Set the response status
      res.status(status);

      // Pipe the file stream to the response
      stream.pipe(res);
    } catch (error) {
      console.error('Error streaming video:', error);
      res.status(HttpStatus.NOT_FOUND).send('Video not found');
    }
  }
}
