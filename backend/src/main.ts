import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Enable CORS
  app.enableCors();
  
  // Serve static files from the public directory
  app.useStaticAssets(join(process.cwd(), 'public'));
  // Serve the SPA for the video-conference route
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/video-conference',
  });
  
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
