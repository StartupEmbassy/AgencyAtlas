import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY debe estar definido en las variables de entorno');
}

interface ImageAnalysisResult {
    success: boolean;
    name?: string;
    confidence?: number;
}

export async function analyzeImage(imageUrl: string): Promise<ImageAnalysisResult> {
    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.XAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "grok-beta",
                messages: [
                    {
                        role: "system",
                        content: "Eres un asistente especializado en detectar nombres de inmobiliarias en imágenes. Debes responder en formato JSON con la siguiente estructura: {\"success\": boolean, \"name\": string | null, \"confidence\": number | null}. La confianza debe ser un número entre 0 y 1."
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analiza esta imagen y devuelve un JSON con el nombre de la inmobiliaria si lo encuentras. Si no encuentras ningún nombre, devuelve success: false."
                            },
                            {
                                type: "image",
                                image_url: imageUrl
                            }
                        ]
                    }
                ],
                max_tokens: 150
            })
        });

        if (!response.ok) {
            throw new Error(`Error en la API: ${response.statusText}`);
        }

        const data = await response.json();
        const result = data.choices[0]?.message?.content?.trim();

        try {
            // Intentar parsear la respuesta como JSON
            const parsedResult = JSON.parse(result);
            return {
                success: parsedResult.success,
                name: parsedResult.name,
                confidence: parsedResult.confidence
            };
        } catch (e) {
            // Si no podemos parsear el JSON, asumimos que no se encontró nombre
            return {
                success: false
            };
        }
    } catch (error) {
        console.error('Error analyzing image:', error);
        return {
            success: false
        };
    }
} 