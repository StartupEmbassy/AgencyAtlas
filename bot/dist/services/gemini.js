"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImage = analyzeImage;
const generative_ai_1 = require("@google/generative-ai");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
// Configurar clientes
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new groq_sdk_1.default();
async function analyzeWithGemini(imageUrl) {
    try {
        // Obtener la imagen
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Error al obtener la imagen: ${imageResponse.statusText}`);
        }
        const imageData = await imageResponse.arrayBuffer();
        // Crear el modelo
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        // Analizar la imagen con reintentos
        let attempts = 0;
        const maxAttempts = 3;
        let lastError;
        while (attempts < maxAttempts) {
            try {
                const result = await model.generateContent([
                    {
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: Buffer.from(imageData).toString("base64")
                        }
                    },
                    `Analyze this real estate agency image and provide ONLY a JSON object with this exact format:
                    {
                        "name": "the business name if visible (be very specific, this is critical)",
                        "qr_data": "any QR code content if present",
                        "web_url": "any website URL visible in the image",
                        "validation_score": number from 0-100 indicating how clearly this is a real estate agency,
                        "validation_reasons": ["list", "of", "reasons"],
                        "condition_score": number from 0-100 indicating the condition of the property,
                        "objects_detected": ["list", "of", "objects", "like", "storefront", "sign", "etc"],
                        "phone_numbers": ["list", "of", "phone", "numbers", "found"],
                        "emails": ["list", "of", "email", "addresses", "found"],
                        "business_hours": "business hours if visible (in text format)",
                        "confidence": number from 0-1 indicating confidence in business name detection
                    }`
                ]);
                const response_text = result.response.text();
                const jsonMatch = response_text.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    throw new Error("No se encontró JSON en la respuesta");
                }
                const analysis = JSON.parse(jsonMatch[0]);
                analysis.provider = 'gemini';
                return analysis;
            }
            catch (error) {
                lastError = error;
                attempts++;
                if (error?.status === 500) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
                    continue;
                }
                throw error;
            }
        }
        throw new Error(`Servicio no disponible después de ${maxAttempts} intentos. Último error: ${lastError?.message || 'Desconocido'}`);
    }
    catch (error) {
        throw error;
    }
}
async function analyzeWithGroq(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Error al obtener la imagen: ${response.statusText}`);
        }
        const imageBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Analyze this real estate agency image and provide ONLY a JSON object with this exact format:
                            {
                                "name": "the business name if visible (be very specific, this is critical)",
                                "qr_data": "any QR code content if present",
                                "web_url": "any website URL visible in the image",
                                "validation_score": number from 0-100 indicating how clearly this is a real estate agency,
                                "validation_reasons": ["list", "of", "reasons"],
                                "condition_score": number from 0-100 indicating the condition of the property,
                                "objects_detected": ["list", "of", "objects", "like", "storefront", "sign", "etc"],
                                "phone_numbers": ["list", "of", "phone", "numbers", "found"],
                                "emails": ["list", "of", "email", "addresses", "found"],
                                "business_hours": "business hours if visible (in text format)",
                                "confidence": number from 0-1 indicating confidence in business name detection
                            }`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            model: "llama-3.2-90b-vision-preview",
            temperature: 0.5,
            max_tokens: 1024,
            stream: false
        });
        const content = chatCompletion.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No se encontró JSON en la respuesta");
        }
        const analysis = JSON.parse(jsonMatch[0]);
        analysis.provider = 'groq';
        return analysis;
    }
    catch (error) {
        throw error;
    }
}
async function analyzeImage(imageUrl) {
    try {
        // Intentar primero con Gemini
        try {
            const geminiResult = await analyzeWithGemini(imageUrl);
            return geminiResult;
        }
        catch (geminiError) {
            console.log("Gemini falló, intentando con Groq:", geminiError.message);
            // Si Gemini falla, intentar con Groq
            try {
                const groqResult = await analyzeWithGroq(imageUrl);
                return groqResult;
            }
            catch (groqError) {
                console.error("Groq también falló:", groqError.message);
                throw groqError;
            }
        }
    }
    catch (error) {
        console.error("Error al analizar imagen:", error);
        return {
            error: true,
            error_type: 'ANALYSIS_ERROR',
            error_message: error?.message || 'Error desconocido al analizar la imagen',
            name: undefined,
            validation_score: 0,
            confidence: 0,
            provider: undefined
        };
    }
}
