import React from 'react';
import { formatTime } from '../../utils/timeFormat';

interface VideoOverlayProps {
  currentTime: number;
  watermark?: string;
  isVisible: boolean;
}

const VideoOverlay: React.FC<VideoOverlayProps> = ({
  currentTime,
  watermark,
  isVisible
}) => {
  return (
    <div className={`absolute inset-0 pointer-events-none ${!isVisible ? 'opacity-0' : ''}`}>
      {/* HTML Watermark (fallback if WebGL watermark fails) */}
      {watermark && (
        <div className="absolute top-4 right-4 opacity-70">
          <img 
            src={watermark} 
            alt="Watermark" 
            className="max-w-[128px] max-h-[128px] object-contain"
          />
        </div>
      )}

      {/* Timestamp (top-left) */}
      <div className="absolute top-4 left-4 text-white text-sm font-medium px-2 py-1 bg-black bg-opacity-30 rounded">
        {formatTime(currentTime)}
      </div>
    </div>
  );
};

export default VideoOverlay;