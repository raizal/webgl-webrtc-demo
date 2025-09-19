
export interface Peer {
  id: string;
  username: string;
  connection: RTCPeerConnection;
  streamActive: boolean;
  iceCandidateBuffer: RTCIceCandidateInit[]; // Buffer to store ICE candidates
}

export interface User {
  socketId: string;
  username: string;
  streamActive: boolean;
}

export interface ClientJoinedEvent {
  client: User;
  roomId: string;
}

export interface RoomClientsEvent {
  clients: User[];
  roomId: string;
}

export interface ClientDisconnectedEvent {
  socketId: string;
  roomId: string;
}

export interface WebRTCOfferEvent {
  offer: RTCSessionDescriptionInit;
  from: string;
  roomId: string;
}

export interface WebRTCAnswerEvent {
  answer: RTCSessionDescriptionInit;
  from: string;
  roomId: string;
}

export interface WebRTCIceCandidateEvent {
  candidate: RTCIceCandidateInit;
  from: string;
  roomId: string;
}

export interface StreamStatusChangedEvent {
  socketId: string;
  streamActive: boolean;
  roomId: string;
}