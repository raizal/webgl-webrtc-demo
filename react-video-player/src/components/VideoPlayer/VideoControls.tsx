import React, { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon, SpeakerModerateIcon as VolumeIcon, SpeakerOffIcon as VolumeOffIcon, EnterFullScreenIcon as Maximize2Icon, ExitFullScreenIcon as Minimize2Icon } from '@radix-ui/react-icons';
import { formatTime } from '../../utils/timeFormat';

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isFullscreen: boolean;
  onPlayPause: () => void;
  onMute: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleFullscreen: () => void;
}

const VideoControls: React.FC<VideoControlsProps> = ({
  isPlaying,
  isMuted,
  currentTime,
  duration,
  volume,
  isFullscreen,
  onPlayPause,
  onMute,
  onSeek,
  onVolumeChange,
  onToggleFullscreen
}) => {
  const [isVolumeControlVisible, setIsVolumeControlVisible] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeControlRef = useRef<HTMLDivElement>(null);

  // Close volume control when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(event.target as Node)) {
        setIsVolumeControlVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const position = (e.clientX - rect.left) / rect.width;
    const seekTime = position * duration;
    onSeek(seekTime);
  };

  return (
    <div className="bg-gradient-to-t from-black to-transparent px-4 pt-16 pb-4">
      {/* Progress bar */}
      <div
        ref={progressRef}
        className="w-full h-2 bg-gray-700 bg-opacity-70 rounded-full cursor-pointer mb-4 group relative"
        onClick={handleProgressClick}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-2 bg-blue-500 rounded-full group-hover:h-3 transition-all"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        >
          <div className="w-4 h-4 bg-white rounded-full absolute right-0 top-1/2 transform -translate-y-1/2 scale-0 group-hover:scale-100 transition-transform"></div>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Play/Pause button */}
          <button
            onClick={onPlayPause}
            className="text-white hover:text-blue-400 transition-colors focus:outline-none"
          >
            {isPlaying ? (
              <PauseIcon className="w-6 h-6" />
            ) : (
              <PlayIcon className="w-6 h-6" />
            )}
          </button>

          {/* Volume control */}
          <div ref={volumeControlRef} className="relative">
            <button
              onClick={onMute}
              onMouseEnter={() => setIsVolumeControlVisible(true)}
              className="text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              {isMuted || volume === 0 ? (
                <VolumeOffIcon className="w-6 h-6" />
              ) : (
                <VolumeIcon className="w-6 h-6" />
              )}
            </button>

            {/* Volume slider */}
            {isVolumeControlVisible && (
              <div
                className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 bg-opacity-90 rounded-md p-3 shadow-lg"
                onMouseLeave={() => setIsVolumeControlVisible(false)}
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="w-24 h-1 appearance-none bg-gray-600 rounded-full outline-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${isMuted ? 0 : volume * 100}%, #4B5563 ${isMuted ? 0 : volume * 100}%, #4B5563 100%)`
                  }}
                />
              </div>
            )}
          </div>

          {/* Time display */}
          <div className="text-white text-sm font-medium">
            <span>{formatTime(currentTime)}</span>
            <span className="mx-1">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Fullscreen button */}
        <button
          onClick={onToggleFullscreen}
          className="text-white hover:text-blue-400 transition-colors focus:outline-none"
        >
          {isFullscreen ? (
            <Minimize2Icon className="w-5 h-5" />
          ) : (
            <Maximize2Icon className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default VideoControls;