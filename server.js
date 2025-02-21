//console.log('Happy developing ✨')

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const multer = require("multer");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(cors());

// const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Connect to MongoDB (For case tracking & lawyer recommendations)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

// Case Schema
const CaseSchema = new mongoose.Schema({
    userId: String,
    caseNumber: String,
    status: String,
    lawyerAssigned: String
});
const Case = mongoose.model("Case", CaseSchema);

// Lawyer Schema
const LawyerSchema = new mongoose.Schema({
    name: String,
    expertise: String,
    location: String,
    rating: Number
});
const Lawyer = mongoose.model("Lawyer", LawyerSchema);

// 📌  Chatbot API using Hugging Face LLM (Legal Q&A)
// app.post("/chat", async (req, res) => {
//     const { message } = req.body;

//     try {
//         const response = await axios.post(
//             "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct",
//             { inputs: message },
//             { headers: { Authorization: `Bearer ${HF_API_KEY}` } }
//         );

//         res.json({ reply: response.data[0].generated_text });
//     } catch (error) {
//         res.status(500).json({ error: "Error processing request" });
//     }
// });

// 📌  Case Status Tracking
app.get("/case/:caseNumber", async (req, res) => {
    const { caseNumber } = req.params;

    try {
        const caseData = await Case.findOne({ caseNumber });
        if (!caseData) return res.status(404).json({ message: "Case not found" });

        res.json(caseData);
    } catch (error) {
        res.status(500).json({ error: "Database error" });
    }
});

// 📌 Lawyer Recommendations
app.get("/lawyers", async (req, res) => {
    const { expertise, location } = req.query;

    try {
        const lawyers = await Lawyer.find({ expertise: new RegExp(expertise, "i"), location: new RegExp(location, "i") });
        res.json(lawyers);
    } catch (error) {
        res.status(500).json({ error: "Database error" });
    }
});

// 📌  Legal Document Analysis
const upload = multer({ dest: "uploads/" });

// Legal Document Analysis API (Accepts PDFs)
app.post("/analyze-legal-doc", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Uploaded file is not a valid PDF" });
    }

    try {
        // 1️⃣ Extract text from the PDF
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await pdfParse(dataBuffer);
        const extractedText = data.text.trim();

        if (!extractedText) {
            return res.status(400).json({ error: "Empty or unreadable PDF" });
        }

        // 2️⃣ Send extracted text to Gemini API
        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GOOGLE_API_KEY}`,
            {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: `Analyze this legal document and provide a summary:\n\n${extractedText}` }]
                    }
                ]
            },
            { headers: { "Content-Type": "application/json" } }
        );

        // 3️⃣ Get AI analysis response
        const analysis = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No valid response from Gemini.";

        res.json({ analysis });

    } catch (error) {
        console.error("Error processing document:", error.response?.data || error.message);
        res.status(500).json({ error: "Error analyzing document" });
    }
});



// Google Gemini (Alternative AI for General Legal Q&A)
app.post("/gemini-chat", async (req, res) => {
    const { message } = req.body;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: message // Ensure "text" field is correctly populated
                            }
                        ]
                    }
                ]
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        // Extract and send the response
        const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
        res.json({ reply });

    } catch (error) {
        console.error("Gemini API Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Error fetching response from Gemini" });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
