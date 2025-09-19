import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { SpeakerOffIcon, SpeakerLoudIcon } from '@radix-ui/react-icons';
import {
  Peer, User, ClientJoinedEvent, RoomClientsEvent,
  ClientDisconnectedEvent, WebRTCOfferEvent, WebRTCAnswerEvent,
  WebRTCIceCandidateEvent, StreamStatusChangedEvent
} from '../types/rtc';

// Extended HTMLVideoElement interface to include captureStream
interface HTMLVideoElementWithCapture extends HTMLVideoElement {
  captureStream(): MediaStream;
  mozCaptureStream(): MediaStream;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const WebRTC: React.FC = () => {
  const query = useQuery();
  const qRoomID = query.get('room');
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [roomId, setRoomId] = useState<string>(qRoomID || '');
  const [username, setUsername] = useState<string>(localStorage.getItem('username') || '');
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
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
    const newSocket = io(import.meta.env.VITE_PUBLIC_URL || 'http://localhost:3000');
    
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
      // Set up peer connection with specific options
      const peerConnection = new RTCPeerConnection({
        ...ICE_SERVERS,
        // These options can help with audio connectivity
        iceTransportPolicy: 'all',
        rtcpMuxPolicy: 'require',
        bundlePolicy: 'max-bundle'
      });
      
      // Add local stream tracks to the connection if available
      if (localStreamRef.current) {
        console.log(`Adding ${localStreamRef.current.getTracks().length} tracks to peer connection with ${peerId}`);
        
        // Log track details before adding
        localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
          console.log(`Adding track to ${peerId}: ${track.kind}, ${track.label}, enabled: ${track.enabled}`);
          // Make sure all tracks are enabled
          track.enabled = true;
          peerConnection.addTrack(track, localStreamRef.current!);
        });
      } else {
        console.warn(`No local stream available when creating peer connection with ${peerId}`);
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
      
      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);
      };
      
      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log(`Received track from ${peerId}, kind: ${event.track.kind}, enabled: ${event.track.enabled}`);
        const videoElement = videoRefs.current.get(peerId);
        if (videoElement) {
          // Ensure we're not muting the remote stream
          videoElement.muted = false;
          videoElement.volume = 1.0;
          
          // Log incoming audio tracks
          const stream = event.streams[0];
          console.log(`Remote stream has ${stream.getAudioTracks().length} audio tracks`);
          stream.getAudioTracks().forEach(track => {
            console.log(`Remote audio track: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}`);
            // Ensure audio tracks are enabled
            track.enabled = true;
          });
          
          videoElement.srcObject = stream;
          
          // Try to play - might need user interaction
          videoElement.play().catch(err => {
            console.warn('Could not autoplay remote video, may need user interaction', err);
          });
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
      setErrorMessage("Can't connect to negotiator");
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
        // Request access to camera and microphone with specific constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
        });
        
        // Check if audio track was obtained
        const audioTracks = stream.getAudioTracks();
        console.log(`Camera stream has ${audioTracks.length} audio tracks`);
        
        if (audioTracks.length === 0) {
          console.warn('No audio track in camera stream - might be a permissions issue');
          showNotification('Audio track not available, check microphone permissions', 'warning');
        } else {
          audioTracks.forEach(track => {
            console.log(`Audio track from camera: ${track.label}, enabled: ${track.enabled}`);
            track.enabled = true; // Always enable for remote clients
          });
        }
        
        // Store the stream
        localStreamRef.current = stream;
        
        // Display stream in the video element - always muted locally
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true; // Always mute local preview to prevent echo
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
        console.log('Starting file stream with file:', localFile.name);
        
        // Create hidden video element for the file if it doesn't exist
        if (!fileVideoRef.current) {
          const videoElement = document.createElement('video') as HTMLVideoElementWithCapture;
          videoElement.style.display = 'none';
          videoElement.setAttribute('crossorigin', 'anonymous');
          document.body.appendChild(videoElement);
          fileVideoRef.current = videoElement;
        }
        
        // Create object URL for the file
        const objectUrl = URL.createObjectURL(localFile);
        console.log('Created object URL for file:', objectUrl);
        
        // Set source on the hidden video element
        fileVideoRef.current.src = objectUrl;
        fileVideoRef.current.muted = false; // Don't mute the source - needed for proper capture
        fileVideoRef.current.volume = 1.0;
        fileVideoRef.current.controls = false;
        fileVideoRef.current.loop = true; // Loop the video
        
        console.log('Waiting for video metadata to load...');
        
        // Wait for metadata to load
        await new Promise<void>((resolve) => {
          if (fileVideoRef.current) {
            fileVideoRef.current.onloadedmetadata = () => {
              console.log('Video metadata loaded, duration:', fileVideoRef.current?.duration);
              resolve();
            };
            
            if (fileVideoRef.current.readyState >= 2) {
              console.log('Video already has metadata, duration:', fileVideoRef.current.duration);
              resolve();
            }
          }
        });
        
        console.log('Attempting to play video file...');
        
        // Try to play the video - might need user interaction
        try {
          await fileVideoRef.current.play();
          console.log('Video playback started successfully');
        } catch (err) {
          console.warn('Autoplay prevented. Waiting for user interaction:', err);
          showNotification('Click anywhere to enable audio from file', 'warning');
          
          // Wait for user interaction
          await new Promise<void>(resolve => {
            const enableAudio = async () => {
              try {
                await fileVideoRef.current?.play();
                console.log('Video playback started after user interaction');
                document.removeEventListener('click', enableAudio);
                document.removeEventListener('touchstart', enableAudio);
                resolve();
              } catch (err) {
                console.error('Still could not play video after user interaction:', err);
              }
            };
            
            document.addEventListener('click', enableAudio, { once: true });
            document.addEventListener('touchstart', enableAudio, { once: true });
          });
        }
        
        // Give a short time for playback to actually start
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Attempting to capture stream from video...');
        
        // Capture the stream with both video and audio
        let stream: MediaStream;
        try {
          // Try different captureStream methods depending on browser
          if (typeof fileVideoRef.current.captureStream === 'function') {
            stream = fileVideoRef.current.captureStream();
            console.log('Used standard captureStream');
          } else if (typeof fileVideoRef.current.mozCaptureStream === 'function') {
            stream = fileVideoRef.current.mozCaptureStream();
            console.log('Used Firefox mozCaptureStream');
          } else {
            throw new Error('Video capture is not supported in this browser');
          }
          
          // Check if we got audio tracks
          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();
          
          console.log(`Captured stream has ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
          
          // Make sure video tracks are enabled
          videoTracks.forEach(track => {
            console.log(`Video track: ${track.label}, initially enabled: ${track.enabled}`);
            track.enabled = true;
            console.log(`Video track enabled status now: ${track.enabled}`);
          });
          
          if (videoTracks.length === 0) {
            console.warn('No video tracks captured from file - trying to fix');
            showNotification('Video capture issue - try a different file format', 'warning');
          }
          
          if (audioTracks.length === 0) {
            console.warn('No audio tracks in the captured stream - attempting alternative capture');
            
            // If no audio tracks, try a different approach with AudioContext
            // This helps in some browsers that don't properly capture audio with captureStream
            try {
              const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              const source = audioContext.createMediaElementSource(fileVideoRef.current);
              const destination = audioContext.createMediaStreamDestination();
              source.connect(destination);
              
              // Also connect to audio output so we can monitor locally if needed
              // source.connect(audioContext.destination);
              
              // Add audio tracks from audio context
              const audioStream = destination.stream;
              console.log(`AudioContext stream has ${audioStream.getAudioTracks().length} tracks`);
              
              // Add audio tracks to the main stream
              audioStream.getAudioTracks().forEach(track => {
                console.log('Adding audio track from AudioContext:', track.label);
                stream.addTrack(track);
              });
              
              // Recheck audio tracks
              console.log(`After AudioContext, stream has ${stream.getAudioTracks().length} audio tracks`);
            } catch (audioErr) {
              console.error('Failed to create audio context fallback:', audioErr);
            }
          }
          
          // Log details about tracks we captured
          stream.getTracks().forEach(track => {
            console.log(`Track in captured stream: ${track.kind}, ${track.label}, enabled: ${track.enabled}`);
            // Make sure all tracks are enabled
            track.enabled = true;
          });
        } catch (captureErr) {
          console.error('Failed to capture stream from video:', captureErr);
          showNotification('Failed to capture stream from video file', 'error');
          throw captureErr;
        }
        
        // Apply the stream to the visible video element (always muted locally)
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true; // Mute local preview
          console.log('Applied stream to local video preview (muted)');
        }
        
        // Store the stream for later use with peer connections
        localStreamRef.current = stream;
      }
      
      // Add local stream to all existing peer connections
      if (localStreamRef.current) {
        // Print detailed track information before sending
        console.log('===== LOCAL STREAM DETAILS BEFORE SENDING TO PEERS =====');
        localStreamRef.current.getTracks().forEach(track => {
          console.log(`Track: ${track.kind}, label: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
        });
        
        try {
          // Store current peers info to recreate them
          const peersToRecreate: {id: string, username: string, streamActive: boolean}[] = [];
          
          // First, collect peers information and close connections
          peers.forEach(peer => {
            peersToRecreate.push({
              id: peer.id,
              username: peer.username,
              streamActive: peer.streamActive
            });
            
            console.log(`Closing existing connection with ${peer.username}`);
            peer.connection.close();
          });
          
          // Clear the peer map
          setPeers(new Map());
          
          // Short timeout to ensure state updates
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Now recreate each peer connection with the new stream
          peersToRecreate.forEach(peer => {
            console.log(`Recreating connection with ${peer.username}`);
            createPeerConnection(peer.id, peer.username, peer.streamActive);
          });
        } catch (error) {
          console.error('Error recreating peer connections:', error);
          showNotification('Error connecting to other participants. Try rejoining the room.', 'error');
        }
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
          track.enabled = isMuted; // Toggle enabled state for remote clients
        });
        setIsMuted(!isMuted);
        showNotification(`Audio for remote clients ${isMuted ? 'enabled' : 'disabled'}`, isMuted ? 'success' : 'warning');
      } else {
        showNotification('No audio tracks available to control', 'error');
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
        <div className="flex justify-start items-center flex-row mb-6">
          <h1 className="flex-1 text-white text-2xl md:text-3xl font-semibold text-center">
            Peer-to-Peer WebRTC Video Conference
          </h1>
        </div>
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

              <div>
                <label htmlFor="username" className="block text-white mb-2">Your Name</label>
                <input
                  id="username"
                  ref={usernameInputRef}
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    localStorage.setItem('username', e.target.value);
                  }}
                  className="w-full p-2 rounded bg-gray-700 text-white"
                  placeholder="Enter your username"
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
                  className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-900 transition-colors cursor-pointer"
                >
                  Leave
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
              
              <div className="mb-4 flex flex-col items-center">
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
              
              <div className="flex flex-wrap gap-3 justify-center">
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
                    <div className="absolute bottom-2 right-2">
                    {isStreaming && (
                      <button 
                        onClick={toggleMicrophone}
                        className={`px-2 py-2 text-white transition-colors`}
                      >
                        {isMuted ? <SpeakerOffIcon className="w-4 h-4" /> : <SpeakerLoudIcon className="w-4 h-4" />}
                      </button>
                    )}
                    </div>
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
      </div>
    </div>
  );
};

function useQuery() {
  const { search } = useLocation();

  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default WebRTC; 