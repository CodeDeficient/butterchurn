const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const PORT = 3000; // Same port as the diagnostics log server

// Enable CORS for the client-side origin
app.use(cors({
    origin: 'http://localhost:5173', // Vite dev server
    methods: ['POST'],
    allowedHeaders: ['Content-Type']
}));

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Start the server
app.listen(PORT, () => {
    // 
});
