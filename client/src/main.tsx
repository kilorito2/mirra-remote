import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { takeTokenFromLocation } from './net/credentials';
import './styles.css';

// Antes de cualquier otra cosa: el token sale de la barra de direcciones y del historial.
const token = takeTokenFromLocation();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App token={token} />
    </StrictMode>,
  );
}
