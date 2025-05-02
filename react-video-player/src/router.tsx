import { createBrowserRouter } from 'react-router-dom'
import App from './pages/main'
import WebRTC from './pages/WebRTC'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />
  },
  {
    path: '/video-conference',
    element: <WebRTC />
  }
]);

export default router;