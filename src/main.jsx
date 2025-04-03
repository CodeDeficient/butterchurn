// src/main.jsx (or main.js)
import React from 'react'
import ReactDOM from 'react-dom/client'
import ButterchurnVisualizer from './App.jsx' // Import the component
// import './index.css' // You might want to remove default CSS imports

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ButterchurnVisualizer /> {/* Use the component here */}
  </React.StrictMode>,
)