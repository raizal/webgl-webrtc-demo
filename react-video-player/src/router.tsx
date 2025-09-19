import { createBrowserRouter } from 'react-router-dom'
import WebRTC from './pages/WebRTC'

const router = createBrowserRouter([
  {
    path: '/',
    element: <WebRTC />
  }
]);

export default router;