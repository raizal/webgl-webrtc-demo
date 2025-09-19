import './App.css'
import { RouterProvider } from 'react-router-dom'
import router from './router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const isProduction = import.meta.env.VITE_PRODUCT_ENV === 'production';
if (isProduction) {
  // Disable console logging in production
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  console.debug = () => {};
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
