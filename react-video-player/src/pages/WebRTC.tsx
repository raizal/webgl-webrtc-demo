import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

// Extended HTMLVideoElement interface to include captureStream
interface HTMLVideoElementWithCapture extends HTMLVideoElement {
  captureStream(): MediaStream;
  mozCaptureStream(): MediaStream;
}

interface Peer {
  id: string;
  username: string;
  connection: RTCPeerConnection;
  streamActive: boolean;
  iceCandidateBuffer: RTCIceCandidateInit[]; // Buffer to store ICE candidates
}

interface User {
  socketId: string;
  username: string;
  streamActive: boolean;
}

interface ClientJoinedEvent {
  client: User;
  roomId: string;
}

interface RoomClientsEvent {
  clients: User[];
  roomId: string;
}

interface ClientDisconnectedEvent {
  socketId: string;
  roomId: string;
}

interface WebRTCOfferEvent {
  offer: RTCSessionDescriptionInit;
  from: string;
  roomId: string;
}

interface WebRTCAnswerEvent {
  answer: RTCSessionDescriptionInit;
  from: string;
  roomId: string;
}

interface WebRTCIceCandidateEvent {
  candidate: RTCIceCandidateInit;
  from: string;
  roomId: string;
}

interface StreamStatusChangedEvent {
  socketId: string;
  streamActive: boolean;
  roomId: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const WebRTC: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [roomId, setRoomId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [roomClients, setRoomClients] = useState<User[]>([]);
  const [streamType, setStreamType] = useState<'camera' | 'video' | 'file'>('camera');
  const [videoUrl, setVideoUrl] = useState<string>('http://localhost:3000/video/sample.mp4');
  const [localFile, setLocalFile] = useState<File | null>(null);
  
  const localVideoRef = useRef<HTMLVideoElementWithCapture>(null);
  const fileVideoRef = useRef<HTMLVideoElementWithCapture>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
  const roomInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const videoUrlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    
    newSocket.on('connect', () => {
      console.log('Connected to socket server');
      setSocket(newSocket);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from socket server');
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Handle when a new client joins the room
    socket.on('clientJoined', ({ client, roomId: room }: ClientJoinedEvent) => {
      console.log(`Client joined: ${client.socketId} in room ${room}`);
      console.log('Room clients:', roomClients);
      console.log('Socket ID:', socket.id);
      
      // Show a notification when someone joins
      const notificationElement = document.createElement('div');
      notificationElement.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
      notificationElement.textContent = `${client.username} joined the room`;
      document.body.appendChild(notificationElement);
      
      // Remove the notification after 3 seconds
      setTimeout(() => {
        notificationElement.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => {
          document.body.removeChild(notificationElement);
        }, 300);
      }, 3000);
      
      console.log('adding peer connection?', room === roomId && client.socketId !== socket.id);

      if (room === roomId && client.socketId !== socket.id) {
        setRoomClients(prev => [...prev, client]);
        // Create a peer connection for the new client
        createPeerConnection(client.socketId, client.username, client.streamActive);
      }
    });

    // Handle room clients list when joining a room
    socket.on('roomClients', ({ clients, roomId: room }: RoomClientsEvent) => {
      console.log('Room clients received:', clients);
      if (room === roomId) {
        // Update our local state with all room clients
        setRoomClients(clients);
        
        // Show notification about the number of participants
        if (clients.length > 1) {
          showNotification(`Room has ${clients.length} participants`, 'success');
        }
        
        // Create peer connections for all existing clients
        clients.forEach(client => {
          if (client.socketId !== socket.id) {
            createPeerConnection(client.socketId, client.username, client.streamActive);
          }
        });
      }
    });

    // Handle client disconnection
    socket.on('clientDisconnected', ({ socketId, roomId: room }: ClientDisconnectedEvent) => {
      console.log(`Client disconnected: ${socketId} from room ${room}`);
      if (room === roomId) {
        // Find the username before removing
        const client = roomClients.find(c => c.socketId === socketId);
        const username = client?.username || 'Someone';
        
        // Show notification
        showNotification(`${username} left the room`, 'warning');
        
        // Remove peer
        setPeers(prev => {
          const newPeers = new Map(prev);
          const peer = newPeers.get(socketId);
          if (peer) {
            peer.connection.close();
            newPeers.delete(socketId);
          }
          return newPeers;
        });
        
        // Update room clients
        setRoomClients(prev => prev.filter(client => client.socketId !== socketId));
      }
    });

    // Handle incoming WebRTC offers
    socket.on('offer', async ({ offer, from, roomId: room }: WebRTCOfferEvent) => {
      console.log(`Received offer from ${from} in room ${room}`);
      if (room === roomId) {
        const peer = peers.get(from);
        if (peer) {
          try {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Process any buffered ICE candidates now that we have a remote description
            if (peer.iceCandidateBuffer.length > 0) {
              console.log(`Processing ${peer.iceCandidateBuffer.length} buffered ICE candidates for ${from}`);
              for (const candidate of peer.iceCandidateBuffer) {
                await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
              }
              // Clear the buffer
              peer.iceCandidateBuffer = [];
            }
            
            const answer = await peer.connection.createAnswer();
            await peer.connection.setLocalDescription(answer);
            
            socket.emit('answer', {
              answer,
              to: from,
              roomId: room
            });
          } catch (error) {
            console.error('Error handling offer:', error);
          }
        }
      }
    });

    // Handle incoming WebRTC answers
    socket.on('answer', async ({ answer, from, roomId: room }: WebRTCAnswerEvent) => {
      console.log(`Received answer from ${from} in room ${room}`);
      if (room === roomId) {
        const peer = peers.get(from);
        if (peer) {
          try {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
            
            // Process any buffered ICE candidates now that we have a remote description
            if (peer.iceCandidateBuffer.length > 0) {
              console.log(`Processing ${peer.iceCandidateBuffer.length} buffered ICE candidates for ${from}`);
              for (const candidate of peer.iceCandidateBuffer) {
                await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
              }
              // Clear the buffer
              peer.iceCandidateBuffer = [];
            }
          } catch (error) {
            console.error('Error handling answer:', error);
          }
        }
      }
    });

    // Handle incoming ICE candidates
    socket.on('iceCandidate', ({ candidate, from, roomId: room }: WebRTCIceCandidateEvent) => {
      console.log(`Received ICE candidate from ${from} in room ${room}`);
      if (room === roomId) {
        const peer = peers.get(from);
        if (peer) {
          try {
            const connection = peer.connection;
            
            // Check if we can add the ICE candidate immediately
            if (connection.remoteDescription) {
              connection.addIceCandidate(new RTCIceCandidate(candidate))
                .catch(err => console.error('Error adding ICE candidate:', err));
            } else {
              // Buffer the ICE candidate for later
              console.log(`Buffering ICE candidate from ${from} (remote description not set yet)`);
              peer.iceCandidateBuffer.push(candidate);
            }
          } catch (error) {
            console.error('Error handling ICE candidate:', error);
          }
        }
      }
    });

    // Handle stream status changes
    socket.on('streamStatusChanged', ({ socketId, streamActive, roomId: room }: StreamStatusChangedEvent) => {
      console.log(`Stream status changed for ${socketId}: ${streamActive} in room ${room}`);
      if (room === roomId) {
        // Find username for the client
        const client = roomClients.find(c => c.socketId === socketId);
        const username = client?.username || 'Someone';
        
        // Show notification
        if (streamActive) {
          showNotification(`${username} started streaming`);
        } else {
          showNotification(`${username} stopped streaming`, 'warning');
        }
        
        setRoomClients(prev => 
          prev.map(client => 
            client.socketId === socketId 
              ? { ...client, streamActive } 
              : client
          )
        );
      }
    });

    return () => {
      socket.off('clientJoined');
      socket.off('roomClients');
      socket.off('clientDisconnected');
      socket.off('offer');
      socket.off('answer');
      socket.off('iceCandidate');
      socket.off('streamStatusChanged');
    };
  }, [socket, roomId, peers, roomClients]);

  // Create a peer connection
  const createPeerConnection = (peerId: string, peerUsername: string, peerStreamActive: boolean) => {
    try {
      const peerConnection = new RTCPeerConnection(ICE_SERVERS);
      
      // Add local stream tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
          peerConnection.addTrack(track, localStreamRef.current!);
        });
      }
      
      // Handle ICE candidate
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('iceCandidate', {
            candidate: event.candidate,
            to: peerId,
            roomId
          });
        }
      };
      
      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log(`Received track from ${peerId}`);
        const videoElement = videoRefs.current.get(peerId);
        if (videoElement) {
          videoElement.srcObject = event.streams[0];
        }
      };
      
      // Initialize connection
      peerConnection.onnegotiationneeded = async () => {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          
          if (socket) {
            socket.emit('offer', {
              offer,
              to: peerId,
              roomId
            });
          }
        } catch (error) {
          console.error('Error creating offer:', error);
        }
      };
      
      // Store the peer with an empty ICE candidate buffer
      setPeers(prev => {
        const newPeers = new Map(prev);
        newPeers.set(peerId, {
          id: peerId,
          username: peerUsername,
          connection: peerConnection,
          streamActive: peerStreamActive,
          iceCandidateBuffer: []
        });
        return newPeers;
      });
      
      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      return null;
    }
  };

  // Join a room - enhance with loading state
  const [isJoining, setIsJoining] = useState(false);
  
  const joinRoom = () => {
    if (!socket) {
      setErrorMessage('Socket connection not established');
      return;
    }
    
    if (!roomId.trim()) {
      setErrorMessage('Please enter a room ID');
      return;
    }
    
    if (!username.trim()) {
      setErrorMessage('Please enter a username');
      return;
    }
    
    // Set joining state to show loading
    setIsJoining(true);
    
    // Join the room
    socket.emit('joinRoom', { roomId, username });
    
    // Display connected clients by marking as in room
    setIsInRoom(true);
    setErrorMessage('');
    
    // Reset joining state after a short delay
    setTimeout(() => {
      setIsJoining(false);
      
      // Automatically start streaming after joining
      // startLocalStream();
    }, 500);
  };

  // Leave the room
  const leaveRoom = () => {
    if (!socket || !isInRoom) return;
    
    // Stop streaming if active
    if (isStreaming) {
      stopLocalStream();
    }
    
    // Close all peer connections
    peers.forEach(peer => {
      peer.connection.close();
    });
    
    // Clear peers
    setPeers(new Map());
    
    // Leave the room
    socket.emit('leaveRoom', { roomId });
    setIsInRoom(false);
    setRoomClients([]);
  };

  // Modify changeStreamType to handle file selection
  const changeStreamType = (type: 'camera' | 'video' | 'file') => {
    if (isStreaming) {
      stopLocalStream();
    }
    
    setStreamType(type);
    
    // If changing to file type, open file picker
    if (type === 'file' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        setLocalFile(file);
        showNotification(`Video file selected: ${file.name}`, 'success');
      } else {
        showNotification('Please select a video file', 'error');
      }
    }
  };

  // Modify startLocalStream to properly handle audio in local files
  const startLocalStream = async () => {
    try {
      if (streamType === 'camera') {
        // Request access to camera and microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        
        // Mute audio based on state
        stream.getAudioTracks().forEach((track: MediaStreamTrack) => {
          track.enabled = !isMuted;
        });
        
        // Store the stream
        localStreamRef.current = stream;
        
        // Display stream in the video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } else if (streamType === 'video') {
        // Use video element as source
        if (localVideoRef.current) {
          localVideoRef.current.src = videoUrl;
          
          // Make sure we handle the loadedmetadata event before trying to capture the stream
          await new Promise<void>((resolve) => {
            if (localVideoRef.current) {
              if (localVideoRef.current.readyState >= 2) { // HAVE_CURRENT_DATA or higher
                resolve();
              } else {
                localVideoRef.current.onloadedmetadata = () => resolve();
              }
            }
          });
          
          await localVideoRef.current.play();
          
          // Different browsers have different captureStream methods
          let stream: MediaStream;
          if (typeof localVideoRef.current.captureStream === 'function') {
            stream = localVideoRef.current.captureStream();
          } else if (typeof localVideoRef.current.mozCaptureStream === 'function') {
            // Firefox implementation
            stream = localVideoRef.current.mozCaptureStream();
          } else {
            throw new Error('Video capture is not supported in this browser');
          }
          
          // Mute audio based on state
          stream.getAudioTracks().forEach((track: MediaStreamTrack) => {
            track.enabled = !isMuted;
          });
          
          // Store the stream
          localStreamRef.current = stream;
        }
      } else if (streamType === 'file' && localFile) {
        // Create hidden video element for the file if it doesn't exist
        if (!fileVideoRef.current) {
          const videoElement = document.createElement('video') as HTMLVideoElementWithCapture;
          videoElement.style.display = 'none';
          document.body.appendChild(videoElement);
          fileVideoRef.current = videoElement;
        }
        
        // Create object URL for the file
        const objectUrl = URL.createObjectURL(localFile);
        
        // Set source and play the video
        fileVideoRef.current.src = objectUrl;
        fileVideoRef.current.muted = false; // Changed: Don't mute the source video
        fileVideoRef.current.volume = 1.0; // Ensure volume is up
        fileVideoRef.current.controls = false; // No need for controls on hidden element
        
        // Make sure we handle the loadedmetadata event
        await new Promise<void>((resolve) => {
          if (fileVideoRef.current) {
            if (fileVideoRef.current.readyState >= 2) {
              resolve();
            } else {
              fileVideoRef.current.onloadedmetadata = () => resolve();
            }
          }
        });
        
        // Enable audio by requesting user interaction first if needed
        try {
          await fileVideoRef.current.play();
        } catch (err) {
          console.log('Browser requires user interaction before audio playback', err);
          showNotification('Click anywhere on the page to enable audio', 'warning');
          
          // Add one-time listener for user interaction
          const enableAudio = async () => {
            try {
              await fileVideoRef.current?.play();
              document.removeEventListener('click', enableAudio);
              document.removeEventListener('touchstart', enableAudio);
            } catch (err) {
              console.error('Still could not play audio after user interaction', err);
            }
          };
          
          document.addEventListener('click', enableAudio, { once: true });
          document.addEventListener('touchstart', enableAudio, { once: true });
        }
        
        // Debug logs for audio tracks
        console.log('File type:', localFile.type);
        
        // Explicitly wait a small amount of time for the video to start playing
        // This helps ensure audio tracks are available
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Capture the stream based on browser support
        let stream: MediaStream;
        if (typeof fileVideoRef.current.captureStream === 'function') {
          stream = fileVideoRef.current.captureStream();
        } else if (typeof fileVideoRef.current.mozCaptureStream === 'function') {
          stream = fileVideoRef.current.mozCaptureStream();
        } else {
          throw new Error('Video capture is not supported in this browser');
        }
        
        // Log audio tracks for debugging
        console.log('Stream audio tracks:', stream.getAudioTracks().length);
        
        // If no audio tracks found, try setting a higher volume
        if (stream.getAudioTracks().length === 0) {
          console.warn('No audio tracks detected in the file stream');
          showNotification('This file may not have audio or your browser blocked it', 'warning');
        }
        
        // Copy to visible video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true; // Mute the local preview to avoid echo
        }
        
        // Handle audio based on mute state in a way that preserves existing tracks
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((track: MediaStreamTrack) => {
          track.enabled = !isMuted; // Set according to mute state
        });
        
        // Store the stream
        localStreamRef.current = stream;
      }
      
      // Add local stream to all existing peer connections
      if (localStreamRef.current) {
        peers.forEach(peer => {
          // Log how many tracks we're sending for debugging
          console.log('Sending tracks to peer:', localStreamRef.current!.getTracks().length);
          localStreamRef.current!.getTracks().forEach((track: MediaStreamTrack) => {
            console.log('Adding track to peer connection:', track.kind, track.label, track.enabled);
            peer.connection.addTrack(track, localStreamRef.current!);
          });
        });
      }
      
      setIsStreaming(true);
      setErrorMessage('');
      
      // Notify others about stream status
      if (socket && isInRoom) {
        socket.emit('toggleStream', { streamActive: true, roomId });
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setErrorMessage(`Failed to stream media: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup streams
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Revoke object URLs if created for files
      if (fileVideoRef.current && fileVideoRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(fileVideoRef.current.src);
      }
      
      // Remove hidden video element if created
      if (fileVideoRef.current && document.body.contains(fileVideoRef.current)) {
        document.body.removeChild(fileVideoRef.current);
      }
    };
  }, []);

  // Modify stopLocalStream to clean up object URLs
  const stopLocalStream = () => {
    if (localStreamRef.current) {
      // Stop all tracks in the stream
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      
      // Remove stream from video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      // Clean up file video if it exists
      if (fileVideoRef.current) {
        fileVideoRef.current.pause();
        if (fileVideoRef.current.src.startsWith('blob:')) {
          URL.revokeObjectURL(fileVideoRef.current.src);
          fileVideoRef.current.src = '';
        }
      }
      
      setIsStreaming(false);
      
      // Notify others about stream status
      if (socket && isInRoom) {
        socket.emit('toggleStream', { streamActive: false, roomId });
      }
    }
  };

  // Also update the toggleMicrophone function to work better with file streams
  const toggleMicrophone = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      
      if (audioTracks.length > 0) {
        audioTracks.forEach(track => {
          track.enabled = isMuted;
        });
        setIsMuted(!isMuted);
        showNotification(`Microphone ${isMuted ? 'unmuted' : 'muted'}`, isMuted ? 'success' : 'warning');
      } else {
        showNotification('No audio tracks available to mute/unmute', 'error');
      }
    }
  };

  // Add this function to show room activity notifications
  const showNotification = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    const bgColor = 
      type === 'success' ? 'bg-green-600' : 
      type === 'warning' ? 'bg-yellow-600' : 
      'bg-red-600';
    
    const notificationElement = document.createElement('div');
    notificationElement.className = `fixed top-4 right-4 ${bgColor} text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity`;
    notificationElement.textContent = message;
    document.body.appendChild(notificationElement);
    
    // Remove the notification after 3 seconds
    setTimeout(() => {
      notificationElement.classList.add('opacity-0');
      setTimeout(() => {
        if (document.body.contains(notificationElement)) {
          document.body.removeChild(notificationElement);
        }
      }, 300);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 md:p-8">
      {/* Hidden file input for video file upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="video/*"
        className="hidden"
      />
      
      <div className="w-full max-w-5xl">
        <h1 className="text-white text-2xl md:text-3xl font-semibold mb-6 text-center">
          WebRTC Video Conference
        </h1>
        
        {!isInRoom ? (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
            <h2 className="text-white text-xl mb-4">Join a Room</h2>
            
            {errorMessage && (
              <div className="bg-red-500 text-white p-3 rounded mb-4">
                {errorMessage}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-white mb-2">Username</label>
                <input
                  id="username"
                  ref={usernameInputRef}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-2 rounded bg-gray-700 text-white"
                  placeholder="Enter your username"
                  disabled={isJoining}
                />
              </div>
              
              <div>
                <label htmlFor="roomId" className="block text-white mb-2">Room ID</label>
                <input
                  id="roomId"
                  ref={roomInputRef}
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full p-2 rounded bg-gray-700 text-white"
                  placeholder="Enter a room ID"
                  disabled={isJoining}
                />
              </div>
              
              <button
                onClick={joinRoom}
                disabled={isJoining}
                className={`w-full p-2 ${isJoining ? 'bg-blue-500' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded transition-colors flex justify-center items-center`}
              >
                {isJoining ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Joining Room...
                  </>
                ) : (
                  'Join Room'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-white text-xl">Room: {roomId}</h2>
                <button
                  onClick={leaveRoom}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Leave Room
                </button>
              </div>
              
              {/* Connected Users List with indicator if still loading */}
              <div className="mb-4 border border-gray-700 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-white text-lg">
                    Participants ({roomClients.length})
                  </h3>
                  {isJoining && (
                    <span className="flex items-center text-yellow-400 text-sm">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Connecting...
                    </span>
                  )}
                </div>
                
                {roomClients.length === 0 ? (
                  <div className="py-3 text-center text-gray-400">
                    Waiting for participants to join...
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-700">
                    {roomClients.map(client => (
                      <li key={client.socketId} className="py-2 flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-2 ${client.streamActive ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                          <span className="text-white">
                            {client.username} 
                            {client.socketId === socket?.id && ' (You)'}
                          </span>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-300">
                          {client.streamActive ? 'Streaming' : 'Not Streaming'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              
              {errorMessage && (
                <div className="bg-red-500 text-white p-3 rounded mb-4">
                  {errorMessage}
                </div>
              )}
              
              <div className="mb-4">
                <h3 className="text-white text-lg mb-2">Stream Settings</h3>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="camera"
                      checked={streamType === 'camera'}
                      onChange={() => changeStreamType('camera')}
                      className="text-blue-600"
                    />
                    <label htmlFor="camera" className="text-white">Use Camera</label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="file"
                      checked={streamType === 'file'}
                      onChange={() => changeStreamType('file')}
                      className="text-blue-600"
                    />
                    <label htmlFor="file" className="text-white">Stream Local File</label>
                  </div>
                </div>
                
                {streamType === 'video' && (
                  <div className="mt-2">
                    <input
                      ref={videoUrlInputRef}
                      type="text"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="w-full p-2 rounded bg-gray-700 text-white"
                      placeholder="Enter video URL"
                    />
                  </div>
                )}
                
                {streamType === 'file' && (
                  <div className="mt-2 flex items-center">
                    <span className="text-white mr-2">
                      {localFile ? `Selected: ${localFile.name}` : 'No file selected'}
                    </span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Browse...
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-3">
                {!isStreaming ? (
                  <button 
                    onClick={startLocalStream}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  >
                    Start Streaming
                  </button>
                ) : (
                  <button 
                    onClick={stopLocalStream}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Stop Streaming
                  </button>
                )}
                
                {isStreaming && (
                  <button 
                    onClick={toggleMicrophone}
                    className={`px-4 py-2 ${isMuted ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded transition-colors`}
                  >
                    {isMuted ? 'Unmute Audio' : 'Mute Audio'}
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
              <h2 className="text-white text-xl mb-4">Video Streams</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Local stream */}
                <div className="bg-gray-900 p-3 rounded-lg">
                  <h3 className="text-white text-lg mb-2">Your Stream (You)</h3>
                  <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
                    <video 
                      ref={localVideoRef}
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover"
                    />
                    {!isStreaming && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
                        <p className="text-white">Stream off</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Remote streams */}
                {roomClients.filter(client => client.socketId !== socket?.id).map(client => (
                  <div key={client.socketId} className="bg-gray-900 p-3 rounded-lg">
                    <h3 className="text-white text-lg mb-2">{client.username}</h3>
                    <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
                      <video
                        ref={(el: HTMLVideoElement | null) => {
                          if (el) videoRefs.current.set(client.socketId, el);
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      {!client.streamActive && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70">
                          <p className="text-white">Stream off</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-6 flex justify-center">
          <Link 
            to="/" 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default WebRTC; 