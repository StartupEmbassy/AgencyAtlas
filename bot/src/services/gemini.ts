import { GoogleGenerativeAI } from "@google/generative-ai";

// Configurar el cliente de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ImageAnalysisResult {
    name?: string;
    qr_data?: string;
    web_url?: string;
    validation_score?: number;
    validation_reasons?: string[];
    condition_score?: number;
    image_quality?: any;
    objects_detected?: string[];
    phone_numbers?: string[];
    emails?: string[];
    business_hours?: string;
    confidence?: number;
}

export async function analyzeImageWithGemini(imageUrl: string): Promise<ImageAnalysisResult> {
    try {
        // Obtener la imagen
        const response = await fetch(imageUrl);
        const imageData = await response.arrayBuffer();

        // Crear el modelo
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        // Analizar la imagen
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
            }
            
            IMPORTANT:
            - If you see a business name, even if you're not 100% sure, include it with appropriate confidence
            - For objects_detected, focus on identifying if it's a storefront/facade/building
            - Extract ONLY valid phone numbers and email addresses
            - For business hours, format them clearly (e.g., "Mon-Fri: 9:00-18:00")
            - Return ONLY the JSON object, no other text`
        ]);

        const response_text = result.response.text();
        // Extraer el JSON de la respuesta
        const jsonMatch = response_text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No se encontró JSON en la respuesta");
        }

        const analysis: ImageAnalysisResult = JSON.parse(jsonMatch[0]);
        return analysis;

    } catch (error) {
        console.error("Error al analizar imagen con Gemini:", error);
        return {};
    }
} 