"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImageWithGemini = analyzeImageWithGemini;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Cargar variables de entorno
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../../bot/.env') });
// Verificar API key
if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY debe estar definida en las variables de entorno');
}
// Inicializar el cliente de Gemini
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function analyzeImageWithGemini(imageUrl) {
    try {
        // Descargar la imagen
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error('Error al descargar la imagen');
        }
        const imageBytes = await imageResponse.arrayBuffer();
        // Obtener el modelo para análisis de imágenes
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        // Preparar el prompt
        const prompt = `Analiza esta imagen y busca específicamente el nombre de una agencia inmobiliaria o inmobiliaria.
Busca elementos como:
- Carteles o letreros con el nombre de la inmobiliaria
- Logos o branding con el nombre
- Texto en la fachada o escaparate que indique el nombre del negocio

Si encuentras el nombre, devuelve SOLO un objeto JSON con este formato exacto:
{"name": "NOMBRE_ENCONTRADO", "confidence": 0.9}

Si no encuentras ningún nombre de inmobiliaria, devuelve exactamente:
{"name": null, "confidence": 0}

NO incluyas ningún otro texto o explicación en tu respuesta, SOLO el JSON.`;
        // Crear la parte de imagen para la generación
        const imagePart = {
            inlineData: {
                data: Buffer.from(imageBytes).toString('base64'),
                mimeType: "image/jpeg"
            }
        };
        // Generar contenido
        const result = await model.generateContent([prompt, imagePart]);
        const textResult = await result.response.text();
        try {
            // Limpiar la respuesta de markdown
            const cleanJson = textResult
                .replace(/```json\n?/g, '') // Eliminar ```json
                .replace(/```\n?/g, '') // Eliminar ```
                .trim(); // Eliminar espacios en blanco
            // Intentar parsear la respuesta como JSON
            const jsonResponse = JSON.parse(cleanJson);
            if (jsonResponse.name) {
                return {
                    success: true,
                    name: jsonResponse.name,
                    confidence: jsonResponse.confidence || 0.8 // Default confidence si no se proporciona
                };
            }
            else {
                return {
                    success: true,
                    name: undefined,
                    confidence: 0
                };
            }
        }
        catch (error) {
            console.error("Error al parsear respuesta de Gemini:", error);
            return {
                success: false,
                error: {
                    code: 'PARSE_ERROR',
                    message: 'Error al parsear la respuesta del modelo'
                }
            };
        }
    }
    catch (error) {
        console.error("Error en analyzeImageWithGemini:", error);
        return {
            success: false,
            error: {
                code: 'API_ERROR',
                message: error instanceof Error ? error.message : 'Error desconocido'
            }
        };
    }
}
