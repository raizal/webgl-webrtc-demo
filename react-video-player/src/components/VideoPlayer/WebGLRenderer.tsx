import React, { useEffect, useRef, useState } from 'react';
import { setupWebGL, renderVideoFrame } from '../../utils/webgl';

interface WebGLRendererProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isPlaying: boolean;
  width: number;
  height: number;
  watermarkUrl?: string; // URL for the watermark image
}

const WebGLRenderer: React.FC<WebGLRendererProps> = ({
  videoRef,
  canvasRef,
  isPlaying,
  width,
  height,
  watermarkUrl
}) => {
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const fontTextureRef = useRef<WebGLTexture | null>(null);
  const watermarkTextureRef = useRef<WebGLTexture | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const fpsUniformLocationRef = useRef<WebGLUniformLocation | null>(null);
  const fontTextureLocationRef = useRef<WebGLUniformLocation | null>(null);
  const watermarkTextureLocationRef = useRef<WebGLUniformLocation | null>(null);
  const watermarkSizeLocationRef = useRef<WebGLUniformLocation | null>(null);
  const hasWatermarkLocationRef = useRef<WebGLUniformLocation | null>(null);
  const requestRef = useRef<number | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [isWebGLInitialized, setIsWebGLInitialized] = useState<boolean>(false);
  
  // FPS calculation references
  const frameCountRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const fpsIntervalRef = useRef<number | null>(null);

  // Initialize WebGL context
  useEffect(() => {
    if (!canvasRef.current) return;
    
    let isActive = true;
    
    const initWebGL = async () => {
      const webglSetup = await setupWebGL(canvasRef.current!, watermarkUrl);
      
      if (!isActive) return; // Cancel if component unmounted
      
      if (!webglSetup.gl || !webglSetup.program || !webglSetup.texture) {
        console.error('Failed to initialize WebGL');
        return;
      }
      
      glRef.current = webglSetup.gl;
      programRef.current = webglSetup.program;
      textureRef.current = webglSetup.texture;
      fontTextureRef.current = webglSetup.fontTexture;
      watermarkTextureRef.current = webglSetup.watermarkTexture;
      fpsUniformLocationRef.current = webglSetup.fpsUniformLocation;
      fontTextureLocationRef.current = webglSetup.fontTextureLocation;
      watermarkTextureLocationRef.current = webglSetup.watermarkTextureLocation;
      watermarkSizeLocationRef.current = webglSetup.watermarkSizeLocation;
      hasWatermarkLocationRef.current = webglSetup.hasWatermarkLocation;
      
      setIsWebGLInitialized(true);
    };
    
    initWebGL();
    
    return () => {
      isActive = false;
      
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      
      if (glRef.current) {
        if (textureRef.current) {
          glRef.current.deleteTexture(textureRef.current);
        }
        
        if (fontTextureRef.current) {
          glRef.current.deleteTexture(fontTextureRef.current);
        }
        
        if (watermarkTextureRef.current) {
          glRef.current.deleteTexture(watermarkTextureRef.current);
        }
      }
      
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
      }
    };
  }, [watermarkUrl]);

  // Initialize FPS counter
  useEffect(() => {
    frameCountRef.current = 0;
    lastTimeRef.current = performance.now();
    
    // Update FPS every second
    fpsIntervalRef.current = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      setFps(Math.round((frameCountRef.current * 1000) / elapsed));
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }, 1000);
    
    return () => {
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
      }
    };
  }, []);

  // Handle animation frame for rendering
  useEffect(() => {
    if (!isWebGLInitialized || !videoRef.current || !glRef.current || !programRef.current || !textureRef.current) return;
    
    let animationFrameId: number;
    
    const render = () => {
      if (videoRef.current && glRef.current && programRef.current && textureRef.current) {
        if (videoRef.current.readyState >= 2) {
          renderVideoFrame(
            glRef.current,
            programRef.current,
            textureRef.current,
            videoRef.current,
          );
          // Count frame for FPS calculation
          frameCountRef.current++;
        }
      }
      
      animationFrameId = requestAnimationFrame(render);
      requestRef.current = animationFrameId;
    };
    
    if (isPlaying) {
      render();
    } else if (glRef.current && programRef.current && textureRef.current && videoRef.current) {
      // When paused, still render the current frame with FPS
      renderVideoFrame(
        glRef.current,
        programRef.current,
        textureRef.current,
        videoRef.current,
      );
    }
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, fps, isWebGLInitialized]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
};

export default WebGLRenderer;