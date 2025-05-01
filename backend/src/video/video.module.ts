import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { WebRTCGateway } from './webrtc.gateway';
import { WebRTCController } from './webrtc.controller';
import { WebRTCService } from './webrtc.service';

@Module({
  controllers: [VideoController, WebRTCController],
  providers: [VideoService, WebRTCGateway, WebRTCService]
})
export class VideoModule {}
