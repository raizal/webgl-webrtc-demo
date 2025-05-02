import React, { useState, useEffect, useRef, RefObject } from 'react';
import VideoControls from './VideoControls';
import WebGLRenderer from './WebGLRenderer';
import useVideoState from '../../hooks/useVideoState';
import { PlayIcon, CrossCircledIcon } from '@radix-ui/react-icons';

interface VideoPlayerProps {
  src: string;
  watermarkUrl?: string;
  width?: number;
  height?: number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  watermarkUrl,
  width = 1280,
  height = 720
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    isPlaying,
    isMuted,
    currentTime,
    duration,
    volume,
    isFullscreen,
    togglePlay,
    toggleMute,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleVolumeChange,
    handleSeek,
    toggleFullscreen,
    resetVideo: _
  } = useVideoState(videoRef, containerRef);

  // Handle hover state for controls
  useEffect(() => {
    let timeout: number | null = null;

    if (isPlaying && isHovering) {
      setShowControls(true);
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    } else if (!isPlaying) {
      setShowControls(true);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isPlaying, isHovering]);

  // Handle loading state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleError = () => {
      setError('Failed to load video. Please try again.');
      setIsLoading(false);
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('error', handleError);
    };
  }, []);

  const retryLoadVideo = () => {
    const video = videoRef.current;
    if (video) {
      setError(null);
      setIsLoading(true);
      video.load();
      video.play().catch(() => {
        // Silent catch for autoplay restrictions
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-0 pb-[56.25%] bg-black rounded-lg overflow-hidden shadow-xl"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <video
        ref={videoRef}
        src={src}
        className="hidden"
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onVolumeChange={() => {
          handleVolumeChange(videoRef.current?.volume || 0);
        }}
      />

      {/* WebGL Canvas */}
      {videoRef.current && <WebGLRenderer
        videoRef={videoRef as RefObject<HTMLVideoElement>}
        canvasRef={canvasRef as RefObject<HTMLCanvasElement>}
        isPlaying={isPlaying}
        width={width}
        height={height}
        watermarkUrl={watermarkUrl}
        currentTime={currentTime}
      />}

      {/* Loading Indicator */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 z-10">
          <div className="h-16 w-16 rounded-full border-4 border-white border-t-transparent animate-spin"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 z-20">
          <CrossCircledIcon className="text-red-500 w-16 h-16 mb-4" />
          <p className="text-white text-center mb-4 max-w-md px-4">{error}</p>
          <button
            onClick={retryLoadVideo}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 transition-colors text-white rounded-md flex items-center"
          >
            <PlayIcon className="w-4 h-4 mr-2" /> Try Again
          </button>
        </div>
      )}

      {/* Click to play/pause */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={togglePlay}
      >
        {/* Initial play button shown only when not playing and not in error state */}
        {!isPlaying && !isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              className="w-20 h-20 rounded-full bg-black bg-opacity-50 flex items-center justify-center hover:bg-opacity-70 transition-all transform hover:scale-105"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
            >
              <PlayIcon className="w-10 h-10 text-white fill-white" />
            </button>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 z-20 ${(showControls || !isPlaying) ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
      >
        {videoRef.current && <VideoControls
          videoRef={videoRef as RefObject<HTMLVideoElement>}
          isPlaying={isPlaying}
          isMuted={isMuted}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isFullscreen={isFullscreen}
          onPlayPause={togglePlay}
          onMute={toggleMute}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleFullscreen={toggleFullscreen}
        />}
      </div>
    </div>
  );
};

export default VideoPlayer;